import { state, CACHE_KEYS, EVAL_KEYS, $, num, pick, getRows, saveCache, loadCache, escapeHtml, formatDate, setConnection, apiFirst, showToast, hoursSince } from './core.js';
import { renderChart, renderMultiLineChart } from './ui.js';

export async function checkConn() {
  try {
    await apiFirst(['equipment/list']);
    setConnection(true, '서버 연결 정상');
    return true;
  } catch (error) {
    setConnection(false, `연결 실패: ${error.message}`);
    return false;
  }
}

export function saveConfig() {
  const input = $('cfg-base-url');
  state.baseUrl = (input?.value || '').trim().replace(/\/$/, '') || state.baseUrl;
  localStorage.setItem('baseUrl', state.baseUrl);
  showToast(`저장됨: ${state.baseUrl}`);
  apiFirst(['settings/save'], { method: 'POST', body: JSON.stringify({ base_url: state.baseUrl, key: 'base_url', value: state.baseUrl }) }).catch(() => {});
  checkConn();
}

export async function testConn() {
  const ok = await checkConn();
  showToast(ok ? '연결 성공' : '연결 실패');
}

export async function loadRemoteSettings() {
  try {
    const response = await apiFirst(['settings/get']);
    const data = response.data || response;
    const baseUrl = pick(data.base_url, data.value, data.webhook_url);
    if (baseUrl) {
      state.baseUrl = String(baseUrl).replace(/\/$/, '');
      localStorage.setItem('baseUrl', state.baseUrl);
    }
  } catch {}
}

const EVAL_OPTIONS = {
  '1-1': [[5,'5 : 조업율 95%이상'],[4,'4 : 80%이상'],[2,'2 : 60%이상'],[1,'1 : 60%미만']],
  '1-2': [[4,'4 : 교체시간 24시간이상 또는 예비기/대체기 없음'],[2,'2 : 1시간이상'],[1,'1 : 1시간미만']],
  '2-3': [[5,'5 : 치명고장'],[4,'4 : Line정지'],[2,'2 : 부분정지'],[1,'1 : 영향없음']],
  '2-4': [[5,'5 : 고객 Line정지'],[4,'4 : 고객생산조정'],[2,'2 : 비상재고사용'],[1,'1 : 후공정에 지장']],
  '3-5': [[5,'5 : 중대영향발생'],[4,'4 : 중대영향가능성'],[2,'2 : 영향 있음'],[1,'1 : 거의 없음']],
  '3-6': [[5,'5 : 고객에 중대불량'],[4,'4 : 품질불량의 유출'],[2,'2 : 영향 있음'],[1,'1 : 거의 없음']],
  '4-7': [[4,'4 : 50만원 이상'],[2,'2 : 30만원 이상'],[1,'1 : 10만원 이하']],
  '4-8': [[4,'4 : 100만원 이상'],[2,'2 : 50만원 이상'],[1,'1 : 10만원 이하']],
  '4-9': [[5,'5 : 70만원 이상'],[4,'4 : 70만원 이하'],[2,'2 : 50만원 이하'],[1,'1 : 10만원 이하']],
  '5-10': [[4,'4 : 인명에 직접 영향 있음'],[2,'2 : 가능성 있음'],[1,'1 : 없음']],
  '5-11': [[4,'4 : 지역에 심각한 영향 있음'],[2,'2 : 가능성 있음'],[1,'1 : 없음']],
};

export function renderEvaluationSelects() {
  EVAL_KEYS.forEach((key) => {
    const el = $(`eval-${key}`);
    if (!el || el.options.length > 1) return;
    (EVAL_OPTIONS[key] || [[0,'0점'],[1,'1점'],[2,'2점'],[3,'3점'],[4,'4점'],[5,'5점']]).forEach(([val, text]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = text;
      el.appendChild(opt);
    });
  });
}

export function calcTotalScore() {
  const total = EVAL_KEYS.reduce((sum, key) => sum + num($(`eval-${key}`)?.value), 0);
  const badge = $('form-total-score-badge');
  const grade = total >= 50 ? 'A' : total >= 40 ? 'B' : total >= 20 ? 'C' : 'D';
  if (badge) {
    badge.textContent = `${total}점 (${grade})`;
    badge.className = `badge grade-${grade}`;
  }
  return total;
}

export async function loadDashboard() {
  const [equipmentRes, statsRes, reportRes] = await Promise.allSettled([
    apiFirst(['equipment/list']),
    apiFirst(['stats/equipment']),
    apiFirst(['report/list']),
  ]);
  const equipment = equipmentRes.status === 'fulfilled' ? getRows(equipmentRes.value) : (state.equipment.length ? state.equipment : loadCache(CACHE_KEYS.equipment, []));
  const statsPayload = statsRes.status === 'fulfilled' ? statsRes.value : {};
  const reports = reportRes.status === 'fulfilled' ? getRows(reportRes.value) : (state.reports.length ? state.reports : loadCache(CACHE_KEYS.reports, []));
  if (equipment.length) { state.equipment = equipment; saveCache(CACHE_KEYS.equipment, equipment); }
  if (reports.length) { state.reports = reports; saveCache(CACHE_KEYS.reports, reports); }
  if (statsRes.status === 'fulfilled') saveCache(CACHE_KEYS.stats, statsPayload);

  const cachedStats = statsRes.status === 'fulfilled' ? statsPayload : loadCache(CACHE_KEYS.stats, {});
  const statsRows = getRows(cachedStats);
  const monthlyTrend = Array.isArray(cachedStats.monthly_trend) ? cachedStats.monthly_trend : [];
  const locationTrend = Array.isArray(cachedStats.by_location) ? cachedStats.by_location : [];
  const okCount = equipment.filter((r) => ['정상', '가동중'].includes(pick(r.status, r.equip_status))).length;
  const idleCount = equipment.filter((r) => pick(r.status, r.equip_status) === '유휴').length;
  const failCount = equipment.filter((r) => ['고장', '점검필요'].includes(pick(r.status, r.equip_status))).length;
  const openCount = reports.filter((r) => String(r.status ?? '').trim() !== '완료').length;

  $('ds-total').textContent = equipment.length.toLocaleString();
  $('ds-ok').textContent = okCount.toLocaleString();
  if ($('ds-idle')) $('ds-idle').textContent = idleCount.toLocaleString();
  $('ds-fail').textContent = failCount.toLocaleString();
  $('ds-open').textContent = openCount.toLocaleString();
  $('badge-open').textContent = openCount;
  $('badge-open').textContent = $('ds-open').textContent;

  const recentBody = $('ds-recent');
  if (recentBody) {
    recentBody.innerHTML = reports.slice(0, 6).map((row) => `
      <tr>
        <td>${escapeHtml(pick(row.location, '-'))}</td>
        <td>${escapeHtml(pick(row.report_id, row.id))}</td>
        <td>${escapeHtml(pick(row.equip_code))}</td>
        <td>${escapeHtml(pick(row.equip_name, '-'))}</td>
        <td>${escapeHtml(pick(row.symptom, row.title, row.report_title))}</td>
        <td>${escapeHtml(pick(row.priority, '-'))}</td>
        <td>${escapeHtml(pick(row.status, '-'))}</td>
        <td>${escapeHtml(pick(row.reporter, '-'))}</td>
        <td>${escapeHtml(formatDate(pick(row.report_dt, row.created_at)))}</td>
      </tr>`).join('') || '<tr><td colspan="9">데이터 없음</td></tr>';
  }

  const mttrTop = [...statsRows].sort((a, b) => num(b.mttr_min) - num(a.mttr_min)).slice(0, 8);
  const mtbfTop = [...statsRows].sort((a, b) => num(b.mtbf_day) - num(a.mtbf_day)).slice(0, 8);
  // 날짜 → YYYY-MM 정규화 (MySQL zero-padding 없는 형식 대응)
  const toYM = (r) => {
    const raw = pick(r.report_dt, r.created_at, '');
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d)) return String(raw).substring(0, 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  // 월별/라인별 — 동일 데이터(reports)로 계산
  (function buildMonthlyCharts() {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    // 전체 합산
    const monthlyCounts = months.map(m => reports.filter(r => toYM(r) === m).length);
    renderChart('ds-chart-monthly', 'line', months, monthlyCounts, '월별 고장');
    // 라인별 멀티라인
    const locCount = {};
    reports.forEach((r) => { const loc = pick(r.location, '미분류'); locCount[loc] = (locCount[loc] || 0) + 1; });
    const topLocs = Object.entries(locCount).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([l]) => l);
    const datasets = topLocs.map((loc) => ({
      label: loc,
      data: months.map((m) => reports.filter((r) => toYM(r) === m && pick(r.location, '미분류') === loc).length),
    }));
    renderMultiLineChart('ds-chart-location', months, datasets);
  })();
  renderChart('ds-chart-mtbf', 'bar', mtbfTop.map((r) => pick(r.equip_code)), mtbfTop.map((r) => num(r.mtbf_day)), '상위 MTBF(일)');
  renderChart('ds-chart-mttr', 'bar', mttrTop.map((r) => pick(r.equip_code)), mttrTop.map((r) => num(r.mttr_min)), '상위 MTTR(분)');
  const delayRows = reports.filter((r) => !String(r.status ?? '').includes('완료'));
  if ($('dash-delay-summary')) $('dash-delay-summary').textContent = `미처리 ${delayRows.length}건`;
  if ($('dash-delay-tbody')) $('dash-delay-tbody').innerHTML = delayRows.slice(0, 30).map((row) => {
    const isLate = row.report_dt && (Date.now() - new Date(row.report_dt)) > 300000;
    return `<tr style="${isLate ? 'background:#fee2e2;border-left:4px solid #ef4444;font-weight:600' : ''}"><td>${escapeHtml(pick(row.equip_code))}</td><td>${escapeHtml(pick(row.equip_name, '-'))}</td><td>${escapeHtml(pick(row.location, '-'))}</td><td>${escapeHtml(pick(row.report_dt, '-'))}</td><td>${escapeHtml(hoursSince(pick(row.report_dt)))}</td><td>${escapeHtml(pick(row.symptom, row.title, '-'))}</td><td>${escapeHtml(pick(row.priority, '-'))}</td><td>${escapeHtml(pick(row.status, '-'))}</td><td>${escapeHtml(pick(row.reporter, '-'))}</td></tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:16px">미처리 건 없음</td></tr>';
}
