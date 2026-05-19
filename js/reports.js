import { state, CACHE_KEYS, $, pick, num, escapeHtml, formatDate, ensureSelectValue, normalizeStatus, saveCache, loadCache, getRows, apiFirst, uploadPhoto, renderStatusBadge, hoursSince } from './core.js';

function priorityBadge(priority) {
  const p = String(priority || '').trim();
  const cls = p === '긴급' ? 'priority-urgent' : p === '보통' ? 'priority-normal' : p === '낮음' ? 'priority-low' : 'muted';
  return `<span class="badge ${cls}">${escapeHtml(p || '-')}</span>`;
}
import { openModal, closeModal } from './ui.js';
import { loadDashboard } from './dashboard.js';

function ensureReportYearOptions() {
  const sel = $('rp-year-select');
  if (!sel || sel.options.length) return;
  const cur = new Date().getFullYear();
  const allOpt = document.createElement('option');
  allOpt.value = ''; allOpt.textContent = '전체년도';
  sel.appendChild(allOpt);
  for (let y = cur + 1; y >= cur - 3; y--) {
    const opt = document.createElement('option');
    opt.value = String(y); opt.textContent = `${y}년`;
    sel.appendChild(opt);
  }
  sel.value = String(cur);
}

export function addReportYear() {
  const sel = $('rp-year-select');
  if (!sel) return;
  const years = Array.from(sel.options).map((o) => num(o.value || 0)).filter(Boolean);
  const next = String((years.length ? Math.max(...years) : new Date().getFullYear()) + 1);
  if (Array.from(sel.options).some((o) => o.value === next)) return;
  const opt = document.createElement('option');
  opt.value = next; opt.textContent = `${next}년`;
  sel.insertBefore(opt, sel.options[1]); // 전체년도 바로 아래
  sel.value = next;
  renderReportBoard();
}

export async function loadReports() {
  ensureReportYearOptions();
  try {
    const response = await apiFirst(['report/list']);
    state.reports = getRows(response)
      .filter((row) => {
        const type = String(pick(row.report_type, '') || '').trim();
        const symptom = String(pick(row.symptom, row.title, '') || '').trim();
        // PM 정기점검 데이터 고장접수에서 제외
        if (type.includes('PM') || symptom.includes('정기점검')) return false;
        return true;
      })
      .map((row) => ({ ...row, status: normalizeStatus(row.status) }));
    saveCache(CACHE_KEYS.reports, state.reports);
    renderReportBoard();
  } catch (error) {
    state.reports = loadCache(CACHE_KEYS.reports, []);
    renderReportBoard();
    throw error;
  }
}

export function renderReportBoard() {
  ensureReportYearOptions();
  const year = $('rp-year-select')?.value || '';
  const month = num($('rp-month-select')?.value || 0);
  const keyword = ($('rp-search')?.value || '').toLowerCase();

  const filtered = state.reports.filter((row) => {
    const dt = String(pick(row.report_dt, row.created_at, ''));
    if (year && !dt.startsWith(year)) return false;
    if (month) {
      const mm = dt.slice(5, 7);   // "YYYY-MM-..." → "MM" (MySQL datetime 문자열 직접 추출)
      if (!mm || parseInt(mm, 10) !== month) return false;
    }
    if (keyword) {
      const haystack = [pick(row.equip_code), pick(row.equip_name), pick(row.symptom, row.title), pick(row.location)].join(' ').toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });

  // 기간별 통계 카드 업데이트
  const total = filtered.length;
  const confirm = filtered.filter((row) => row.status === '확인중').length;
  const repair = filtered.filter((row) => row.status === '수리중').length;
  const done = filtered.filter((row) => row.status === '완료').length;
  const rate = total > 0 ? Math.round(done / total * 100) : 0;
  if ($('rp-stat-total')) $('rp-stat-total').textContent = total.toLocaleString();
  if ($('rp-stat-confirm')) $('rp-stat-confirm').textContent = confirm.toLocaleString();
  if ($('rp-stat-repair')) $('rp-stat-repair').textContent = repair.toLocaleString();
  if ($('rp-stat-done')) $('rp-stat-done').textContent = done.toLocaleString();
  if ($('rp-stat-rate')) $('rp-stat-rate').textContent = `${rate}%`;

  const delayRows = filtered.filter((row) => !String(row.status ?? '').includes('완료'));
  if ($('rp-delay-summary')) $('rp-delay-summary').textContent = `미처리 ${delayRows.length}건`;
  if ($('rp-delay-tbody')) $('rp-delay-tbody').innerHTML = delayRows.slice(0, 30).map((row) => {
    const isLate = pick(row.report_dt) && (Date.now() - new Date(pick(row.report_dt))) > 86400000;
    return `<tr style="${isLate ? 'background:#fff0f0' : ''}"><td>${escapeHtml(pick(row.equip_code))}</td><td>${escapeHtml(pick(row.equip_name, '-'))}</td><td>${escapeHtml(pick(row.location, '-'))}</td><td>${escapeHtml(pick(row.report_dt, '-'))}</td><td>${escapeHtml(hoursSince(pick(row.report_dt)))}</td><td>${escapeHtml(pick(row.symptom, row.title, '-'))}</td><td>${escapeHtml(pick(row.priority, '-'))}</td><td>${escapeHtml(pick(row.status, '-'))}</td><td>${escapeHtml(pick(row.reporter, '-'))}</td></tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:16px">미처리 건 없음</td></tr>';

  ['접수','확인중','수리중','완료'].forEach((status) => {
    const rows = filtered.filter((row) => row.status === status);
    const body = $(`k-${status}`);
    const badge = $(`k-cnt-${status}`);
    if (badge) badge.textContent = String(rows.length);
    if (body) {
      body.innerHTML = rows.map((row) => `
        <div class="kanban-card" onclick="openReportModal(${Number(pick(row.report_id, row.id, 0))})">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <div style="font-weight:800">${escapeHtml(pick(row.equip_code))}</div>
            ${priorityBadge(pick(row.priority, '-'))}
          </div>
          <div style="margin-top:6px;font-size:13px">${escapeHtml(pick(row.symptom, row.title, row.report_title))}</div>
          <div style="margin-top:8px;font-size:11px;color:var(--text3)">${escapeHtml(pick(row.location, '-'))} / ${escapeHtml(formatDate(pick(row.report_dt, row.created_at)))}</div>
        </div>`).join('') || '<div style="color:var(--text3);font-size:12px;padding:8px">없음</div>';
    }
  });
  $('badge-open').textContent = String(state.reports.filter((row) => !String(row.status ?? '').includes('완료')).length);
}

export function syncReportPhotoPreview() {
  const url = $('form-rep-photo-url').value || '';
  const img = $('rep-photo-previewimg');
  const ph = $('rep-photo-placeholder');
  const btn = $('btn-remove-rep-photo');
  if (url) { img.src = url; img.style.display = ''; ph.style.display = 'none'; btn.style.display = ''; }
  else { img.removeAttribute('src'); img.style.display = 'none'; ph.style.display = ''; btn.style.display = 'none'; }
}

export async function uploadReportPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  $('rep-photo-status').textContent = '업로드 중...';
  try {
    const url = await uploadPhoto(file);
    $('form-rep-photo-url').value = url || '';
    state.reportPhotoUrl = url || '';
    syncReportPhotoPreview();
    $('rep-photo-status').textContent = '업로드 완료';
  } catch (error) {
    $('rep-photo-status').textContent = `업로드 실패: ${error.message}`;
  }
}

export function removeReportPhoto() {
  $('form-rep-photo-url').value = '';
  state.reportPhotoUrl = '';
  syncReportPhotoPreview();
}

export function openReportModal(reportId) {
  const row = state.reports.find((item) => Number(pick(item.report_id, item.id, 0)) === Number(reportId));
  if (!row) return;
  $('modal-report-title').textContent = `고장 상세 #${reportId}`;
  $('modal-report-info').innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px">
      <tbody>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3);width:25%;white-space:nowrap">설비코드</td><td style="padding:8px 12px;font-weight:600">${escapeHtml(pick(row.equip_code, '-'))}</td><td style="padding:8px 12px;color:var(--text3);width:25%;white-space:nowrap">설비명</td><td style="padding:8px 12px">${escapeHtml(pick(row.equip_name, '-'))}</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">설치소</td><td style="padding:8px 12px">${escapeHtml(pick(row.location, '-'))}</td><td style="padding:8px 12px;color:var(--text3)">접수일시</td><td style="padding:8px 12px">${escapeHtml(pick(row.report_dt, row.created_at, '-'))}</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">유형</td><td style="padding:8px 12px">${escapeHtml(pick(row.report_type, '-'))}</td><td style="padding:8px 12px;color:var(--text3)">우선순위</td><td style="padding:8px 12px">${priorityBadge(pick(row.priority))}</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">상태</td><td style="padding:8px 12px">${renderStatusBadge(pick(row.status, '-'))}</td><td style="padding:8px 12px;color:var(--text3)">신고자</td><td style="padding:8px 12px">${escapeHtml(pick(row.reporter, '-'))}</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">라인 영향</td><td colspan="3" style="padding:8px 12px">${escapeHtml(pick(row.line_impact, '-'))}</td></tr>
        <tr><td style="padding:8px 12px;color:var(--text3)">증상</td><td colspan="3" style="padding:8px 12px;font-weight:600">${escapeHtml(pick(row.symptom, row.title, row.report_title, row.report_text, '-'))}</td></tr>
      </tbody>
    </table>`;
  $('act-report-id').value = pick(row.report_id, row.id);
  $('act-equip-code').value = pick(row.equip_code);
  ensureSelectValue('act-status', pick(row.status), '기존상태');
  $('act-tech').value = pick(row.technician);
  ensureSelectValue('act-cause', pick(row.cause_type, row.cause), '기존원인');
  $('act-detail').value = pick(row.action_detail);
  $('act-downtime').value = pick(row.downtime_min, row.downtime);
  ensureSelectValue('act-result', pick(row.result), '기존결과');
  ensureSelectValue('act-delay-type', pick(row.delay_type), '기존지연유형');
  $('act-delay-reason').value = pick(row.delay_reason);
  $('form-rep-photo-url').value = pick(row.photo_url, row.action_photo_url);
  syncReportPhotoPreview();
  openModal('modal-report');
}

export async function submitAction() {
  const payload = { report_id: num($('act-report-id').value), equip_code: $('act-equip-code').value, status: $('act-status').value, technician: $('act-tech').value.trim(), cause_type: $('act-cause').value, action_detail: $('act-detail').value.trim(), downtime_min: num($('act-downtime').value), result: $('act-result').value, delay_type: $('act-delay-type').value, delay_reason: $('act-delay-reason').value.trim(), photo_url: $('form-rep-photo-url').value.trim() };
  try {
    await apiFirst(['action/create'], { method: 'POST', body: JSON.stringify(payload) });
    closeModal('modal-report');
    await loadReports();
    if (state.currentPage === 'page-dashboard') await loadDashboard();
  } catch (error) { alert(`조치 저장 실패: ${error.message}`); }
}

// ── 신규 고장 접수 (관리자) ───────────────────────────────
export function openReportNewModal() {
  const sel = $('new-rep-equip');
  if (sel) {
    sel.innerHTML = '<option value="">-- 설비 선택 --</option>' +
      state.equipment.map((e) => {
        const code = escapeHtml(pick(e.equip_code, e.code));
        const name = escapeHtml(pick(e.equip_name, e.name));
        return `<option value="${code}">${code} — ${name}</option>`;
      }).join('');
  }
  $('new-rep-type').value = '전기';
  $('new-rep-priority').value = '보통';
  $('new-rep-symptom').value = '';
  $('new-rep-reporter').value = '';
  $('new-rep-photo-url').value = '';
  openModal('modal-report-new');
}

export async function submitNewReport() {
  const equip_code = $('new-rep-equip').value;
  const symptom = $('new-rep-symptom').value.trim();
  if (!equip_code) { alert('설비를 선택하세요.'); return; }
  if (!symptom) { alert('증상을 입력하세요.'); return; }
  const payload = {
    equip_code,
    report_type: $('new-rep-type').value,
    priority: $('new-rep-priority').value,
    symptom,
    reporter: $('new-rep-reporter').value.trim(),
    photo_url: $('new-rep-photo-url').value.trim(),
    status: '접수',
  };
  try {
    await apiFirst(['report/create'], { method: 'POST', body: JSON.stringify(payload) });
    closeModal('modal-report-new');
    await loadReports();
    if (state.currentPage === 'page-dashboard') await loadDashboard();
  } catch (error) { alert(`고장 접수 실패: ${error.message}`); }
}
