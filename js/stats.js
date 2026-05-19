import { state, CACHE_KEYS, $, num, pick, escapeHtml, formatDate, getRows, saveCache, loadCache, apiFirst } from './core.js';
import { renderChart, renderHBarChart, renderMultiLineChart } from './ui.js';

function topN(rows, keyFn, n = 10) {
  const map = {};
  rows.forEach(r => { const k = keyFn(r) || '미분류'; map[k] = (map[k] || 0) + 1; });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function renderCauseCharts(reports, line) {
  const filtered = line ? reports.filter(r => pick(r.location) === line) : reports;
  const mainTop = topN(filtered, r => {
    const g = pick(r.cause_group) || '미분류';
    const s = pick(r.cause)       || '미분류';
    return `${g} - ${s}`;
  });
  const subTop  = topN(filtered, r => pick(r.cause));
  renderHBarChart('chart-cause-main', mainTop.map(e => e[0]), mainTop.map(e => e[1]), '건수');
  renderHBarChart('chart-cause-sub',  subTop.map(e => e[0]),  subTop.map(e => e[1]),  '건수');
}

function renderEquipCauseTable(reports, line) {
  const filtered = line ? reports.filter(r => pick(r.location) === line) : reports;
  const map = {};
  filtered.forEach(r => {
    const loc  = pick(r.location)   || '미분류';
    const code = pick(r.equip_code) || '-';
    const main = pick(r.cause_group) || '미분류';
    const sub  = pick(r.cause)      || '미분류';
    const key  = `${loc}|${code}|${main}|${sub}`;
    if (!map[key]) map[key] = { loc, code, name: pick(r.equip_name) || '-', main, sub, count: 0 };
    map[key].count++;
  });
  const rows = Object.values(map).sort((a, b) => b.count - a.count);
  const tbody = $('equip-cause-tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.loc)}</td>
      <td>${escapeHtml(row.code)}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.main)}</td>
      <td>${escapeHtml(row.sub)}</td>
      <td style="text-align:center;font-weight:700">${row.count}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text2)">데이터 없음</td></tr>';
}

function populateLineFilter(reports) {
  const sel = $('stats-line-filter');
  if (!sel) return;
  const saved = sel.value;
  const lines = [...new Set(reports.map(r => pick(r.location)).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">전체 라인</option>' +
    lines.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  if (saved && lines.includes(saved)) sel.value = saved;
}

export async function loadStats() {
  const [statsRes, reportRes] = await Promise.allSettled([
    apiFirst(['stats/equipment', 'stats/dashboard']),
    apiFirst(['report/list', 'breakdown/list']),
  ]);
  const statsPayload = statsRes.status === 'fulfilled' ? statsRes.value : loadCache(CACHE_KEYS.stats, {});
  const reports = reportRes.status === 'fulfilled'
    ? getRows(reportRes.value)
    : (state.reports.length ? state.reports : loadCache(CACHE_KEYS.reports, []));

  const monthlyTrend = Array.isArray(statsPayload.monthly_trend) ? statsPayload.monthly_trend : [];
  const byLocation   = Array.isArray(statsPayload.by_location)   ? statsPayload.by_location   : [];
  const statsRows    = getRows(statsPayload);

  if (statsRes.status === 'fulfilled')   saveCache(CACHE_KEYS.stats,   statsPayload);
  if (reportRes.status === 'fulfilled')  saveCache(CACHE_KEYS.reports,  reports);

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
    renderChart('chart-monthly', 'line', months, monthlyCounts, '월별 건수');
    // 라인별 멀티라인
    const locCount = {};
    reports.forEach(r => { const loc = pick(r.location, '미분류'); locCount[loc] = (locCount[loc] || 0) + 1; });
    const topLocs = Object.entries(locCount).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([l]) => l);
    const datasets = topLocs.map(loc => ({
      label: loc,
      data: months.map(m => reports.filter(r => toYM(r) === m && pick(r.location, '미분류') === loc).length),
    }));
    renderMultiLineChart('chart-location', months, datasets);
  })();
  renderChart('chart-mtbf', 'bar', statsRows.map(r => pick(r.equip_code)), statsRows.map(r => {
    const b = num(r.total_breakdowns);
    if (b <= 0) return 0;
    const operatingDays = Math.max(0, 365 - num(r.total_downtime) / 1440);
    return operatingDays / b;
  }), '설비별 MTBF(일)');
  renderChart('chart-mttr', 'bar', statsRows.map(r => pick(r.equip_code)), statsRows.map(r => num(r.mttr_min)), '설비별 MTTR(분)');

  // MTBF/MTTR 테이블
  $('mtbf-tbody').innerHTML = statsRows.slice(0, 20).map(row => {
    const b = num(row.total_breakdowns);
    const d = num(row.total_downtime);
    const mtbf = b > 0 ? Math.max(0, 365 - d / 1440) / b : 0;
    return `<tr><td>${escapeHtml(pick(row.equip_code))}</td><td>${escapeHtml(pick(row.equip_name))}</td><td>${escapeHtml(pick(row.location, '미분류'))}</td><td>${b.toLocaleString()}</td><td>${d.toLocaleString()}</td><td>${mtbf.toFixed(1)}</td><td>${num(row.mttr_min).toFixed(1)}</td><td>${escapeHtml(formatDate(pick(row.last_fault_dt)))}</td></tr>`;
  }).join('') || '<tr><td colspan="8">데이터 없음</td></tr>';

  // 원인 분석 — 라인 필터 채우기 + 렌더
  populateLineFilter(reports);
  const sel = $('stats-line-filter');
  const line = sel?.value || '';
  renderCauseCharts(reports, line);
  renderEquipCauseTable(reports, line);

  // 필터 change 이벤트 (중복 바인딩 방지)
  if (sel && !sel._statsBound) {
    sel._statsBound = true;
    sel.addEventListener('change', () => {
      renderCauseCharts(reports, sel.value);
      renderEquipCauseTable(reports, sel.value);
    });
  }
}
