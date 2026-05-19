import { state, EVAL_KEYS, CACHE_KEYS, STATUS_COLORS, $, num, pick, escapeHtml, getRows, saveCache, loadCache, formatDate, renderPhotoThumb, renderStatusBadge, api, apiFirst, uploadPhoto, showToast, normalizeDriveUrl, driveImgFallback } from './core.js';
import { openModal, closeModal } from './ui.js';
import { loadDashboard, calcTotalScore } from './dashboard.js';

document.addEventListener('click', (e) => {
  const btn = e.target.closest('._qr-btn');
  if (btn) showQR(btn.dataset.qrCode, btn.dataset.qrName);
});

export async function loadEquipment() {
  try {
    const response = await apiFirst(['equipment/list']);
    state.equipment = getRows(response).map((row, i) => ({ ...row, _no: i + 1 }));
    saveCache(CACHE_KEYS.equipment, state.equipment);
    renderEquipFilters();
    filterEquipList();
  } catch (error) {
    state.equipment = loadCache(CACHE_KEYS.equipment, []);
    renderEquipFilters();
    filterEquipList();
    throw error;
  }
}

export function renderEquipFilters() {
  const select = $('eq-loc-filter');
  if (!select) return;
  const current = select.value;
  const locations = [...new Set(state.equipment.map((row) => pick(row.location, row.install_loc)).filter(Boolean))].sort();
  select.innerHTML = '<option value="">전체 위치</option>' + locations.map((loc) => `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`).join('');
  select.value = current;

  const statusSelect = $('eq-status-filter');
  if (statusSelect) {
    const currentStatus = statusSelect.value;
    const statuses = [...new Set(state.equipment.map((row) => pick(row.status, row.equip_status)).filter(Boolean))].sort();
    statusSelect.innerHTML = '<option value="">전체 상태</option>' + statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('');
    statusSelect.value = statuses.includes(currentStatus) ? currentStatus : '';
  }
}

export function filterEquipList() {
  const keyword = ($('eq-search')?.value || '').toLowerCase();
  const loc = $('eq-loc-filter')?.value || '';
  const status = $('eq-status-filter')?.value || '';
  const tabMode = window._equipTabMode || '';

  const rows = state.equipment.filter((row) => {
    const code = String(pick(row.equip_code, row.code)).toLowerCase();
    const name = String(pick(row.equip_name, row.name)).toLowerCase();
    const rowLoc = pick(row.location, row.install_loc);
    const rowStatus = pick(row.status, row.equip_status);
    const isIdle = rowStatus === '유휴';
    if (tabMode === 'active' && isIdle) return false;
    if (tabMode === '유휴' && !isIdle) return false;
    return (!keyword || code.includes(keyword) || name.includes(keyword)) && (!loc || rowLoc === loc) && (!status || rowStatus === status);
  }).sort((a, b) => String(pick(a.equip_code, a.code)).localeCompare(String(pick(b.equip_code, b.code))));

  const activeCount = rows.filter((r) => pick(r.status, r.equip_status) !== '유휴').length;
  const idleCount = rows.filter((r) => pick(r.status, r.equip_status) === '유휴').length;

  const tbody = $('eq-tbody');
  if (tbody) {
    tbody.innerHTML = rows.map((row) => {
      const code = pick(row.equip_code, row.code);
      const statusText = pick(row.status, row.equip_status);
      const isIdle = statusText === '유휴';
      const cls = STATUS_COLORS[statusText] || 'good';
      const grade = pick(row.eval_grade, '-');
      const rowStyle = isIdle ? 'opacity:0.55;background:#f8f9fb' : '';
      return `
        <tr style="${rowStyle}">
          <td style="text-align:center;color:var(--text3);font-weight:600">${row._no || ''}</td>
          <td>${escapeHtml(pick(row.location, row.install_loc, '-'))}</td>
          <td><a href="#" onclick="openEquipDetail('${escapeHtml(code)}');return false;">${escapeHtml(code)}</a></td>
          <td>${escapeHtml(pick(row.equip_name, row.name))}${isIdle ? ' <span style="font-size:11px;color:#9ca3af">(유휴)</span>' : ''}</td>
          <td>${escapeHtml(pick(row.maker, row.manufacturer))}</td>
          <td>${escapeHtml(pick(row.manager, row.owner))}</td>
          <td><span class="badge ${cls}">${escapeHtml(statusText || '-')}</span></td>
          <td>${num(row.total_reports).toLocaleString()}</td>
          <td>${num(row.open_reports).toLocaleString()}</td>
          <td style="text-align:center">
            <input type="checkbox" ${num(pick(row.pm_yn, 0)) ? 'checked' : ''}
              title="${num(pick(row.pm_yn, 0)) ? '정기점검 대상 (클릭하여 해제)' : '정기점검 비대상 (클릭하여 설정)'}"
              style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary)"
              onchange="togglePMTarget('${escapeHtml(code)}', this.checked)">
          </td>
          <td><span class="badge grade-${escapeHtml(grade)}">${escapeHtml(grade)}</span></td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" onclick="openEquipDetail('${escapeHtml(code)}')">상세</button>
            <button class="btn btn-sm _qr-btn" style="margin-left:4px;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0" data-qr-code="${escapeHtml(code)}" data-qr-name="${escapeHtml(pick(row.equip_name,row.name))}">QR</button>
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="12">데이터 없음</td></tr>';
  }
  if ($('eq-count')) {
    $('eq-count').innerHTML = `가동 <strong>${activeCount}</strong>대 / 유휴 <strong style="color:var(--text3)">${idleCount}</strong>대 / 계 ${rows.length}대`;
  }
}

export async function togglePMTarget(equipCode, checked) {
  const row = state.equipment.find(r => pick(r.equip_code, r.code) === equipCode);
  if (!row) return;
  const prev = row.pm_yn;
  row.pm_yn = checked ? 1 : 0;
  filterEquipList(); // 즉시 UI 반영
  try {
    await api('equipment/upsert', { method: 'POST', body: JSON.stringify({ ...row, equip_code: equipCode, pm_yn: checked ? 1 : 0 }) });
    showToast(checked ? `${equipCode} 정기점검 대상으로 설정` : `${equipCode} 정기점검 비대상으로 설정`);
  } catch (e) {
    row.pm_yn = prev; // 실패 시 원복
    filterEquipList();
    showToast(`저장 실패: ${e.message}`, 'error');
  }
}

export async function openEquipDetail(equipCode) {
  try {
    const response = await apiFirst([`equipment/detail?equip_code=${encodeURIComponent(equipCode)}`, `breakdown/detail?equip_code=${encodeURIComponent(equipCode)}`]);
    const equipmentData = response.equipment || response.data?.equipment || response.equipment?.[0] || response.data || response;
    state.currentEquip = equipmentData;
    $('modal-equip-title').textContent = `${pick(equipmentData.equip_name, equipmentData.name, equipCode)} 상세`;
    const photoUrl = normalizeDriveUrl(pick(equipmentData.photo_url, equipmentData.image_url));
    $('modal-equip-info').innerHTML = `
      <div style="width:100%;max-height:280px;border:1px solid var(--border);border-radius:16px;background:var(--surface2);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:16px">
        ${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="설비 사진" onerror="driveImgFallback(this)" style="width:100%;max-height:280px;object-fit:contain">` : '<span style="font-size:14px;color:var(--text3);padding:40px">사진 없음</span>'}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tbody>
          <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3);width:30%;white-space:nowrap">설비코드</td><td style="padding:8px 12px;font-weight:600">${escapeHtml(pick(equipmentData.equip_code, equipCode))}</td><td style="padding:8px 12px;color:var(--text3);width:30%;white-space:nowrap">설비명</td><td style="padding:8px 12px;font-weight:600">${escapeHtml(pick(equipmentData.equip_name, equipmentData.name))}</td></tr>
          <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">위치</td><td style="padding:8px 12px">${escapeHtml(pick(equipmentData.location, equipmentData.install_loc, '-'))}</td><td style="padding:8px 12px;color:var(--text3)">상태</td><td style="padding:8px 12px">${renderStatusBadge(pick(equipmentData.status, equipmentData.equip_status))}</td></tr>
          <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">담당자</td><td style="padding:8px 12px">${escapeHtml(pick(equipmentData.manager, equipmentData.owner, '-'))}</td><td style="padding:8px 12px;color:var(--text3)">부서</td><td style="padding:8px 12px">${escapeHtml(pick(equipmentData.manager_dept, equipmentData.department, '-'))}</td></tr>
          <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">제작사</td><td style="padding:8px 12px">${escapeHtml(pick(equipmentData.manufacturer, equipmentData.maker, '-'))}</td><td style="padding:8px 12px;color:var(--text3)">자산번호</td><td style="padding:8px 12px">${escapeHtml(pick(equipmentData.asset_no, '-'))}</td></tr>
          <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">제조일</td><td style="padding:8px 12px">${escapeHtml(formatDate(pick(equipmentData.mfg_date, equipmentData.install_date)))}</td><td style="padding:8px 12px;color:var(--text3)">평가등급</td><td style="padding:8px 12px"><span class="badge">${escapeHtml(pick(equipmentData.eval_grade, '-'))}</span></td></tr>
          <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">다음 점검일</td><td style="padding:8px 12px">${escapeHtml(formatDate(pick(equipmentData.next_inspection_date, '-')))}</td><td style="padding:8px 12px;color:var(--text3)">업데이트일</td><td style="padding:8px 12px">${escapeHtml(formatDate(pick(equipmentData.updated_at)))}</td></tr>
          <tr><td style="padding:8px 12px;color:var(--text3)">사양</td><td colspan="3" style="padding:8px 12px">${escapeHtml(pick(equipmentData.spec, equipmentData.specification, '-'))}</td></tr>
        </tbody>
      </table>`;
    const history = getRows(response.history || equipmentData.history || response.report_history || []);
    state.equipHistory = history;
    $('modal-equip-history').innerHTML = history.map((row, idx) => `
      <tr style="cursor:pointer" onclick="openHistorySlideOver(${idx})" title="클릭하여 상세/조치 입력">
        <td>${escapeHtml(pick(row.report_id, '-'))}</td>
        <td>${escapeHtml(pick(row.report_type, '-'))}</td>
        <td>${escapeHtml(pick(row.report_dt, '-'))}</td>
        <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(pick(row.symptom, row.action_detail, row.title))}</td>
        <td>${renderPhotoThumb(pick(row.report_photo, row.photo_url))}</td>
        <td>${escapeHtml(pick(row.action_dt, '-'))}</td>
        <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(pick(row.action_detail, '-'))}</td>
        <td>${escapeHtml(pick(row.status, '-'))}</td>
        <td>${escapeHtml(pick(row.reporter, '-'))}</td>
      </tr>`).join('') || '<tr><td colspan="9">이력 없음</td></tr>';
    // 연결 스페어파트 로드
    try {
      const partsRes = await api(`equipment/spare-parts?equip_code=${encodeURIComponent(equipCode)}`);
      const parts = getRows(partsRes);
      $('modal-equip-parts').innerHTML = parts.map((p) => {
        const stock = num(pick(p.stock_qty, p.current_stock, 0));
        const safe = num(pick(p.safe_stock_qty, p.safe_stock, 0));
        const cls = stock < safe ? 'stock-low' : 'stock-ok';
        return `<tr>
          <td>${escapeHtml(pick(p.part_code, '-'))}</td>
          <td>${escapeHtml(pick(p.part_name, '-'))}</td>
          <td>${escapeHtml(pick(p.part_spec, p.spec, '-'))}</td>
          <td>${escapeHtml(pick(p.unit, '-'))}</td>
          <td class="${cls}">${stock.toLocaleString()}</td>
          <td>${safe.toLocaleString()}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6">연결된 파트 없음</td></tr>';
    } catch {
      $('modal-equip-parts').innerHTML = '<tr><td colspan="6">파트 조회 실패</td></tr>';
    }
    // 부속 설비 구성 로드
    try {
      const subRes = await api(`equipment/sub-items?equip_code=${encodeURIComponent(equipCode)}`);
      const subItems = getRows(subRes);
      $('modal-equip-subitems').innerHTML = subItems.map((item) => {
        const p = normalizeDriveUrl(pick(item.photo_url, ''));
        const validP = !!p;
        return `<tr>
          <td style="text-align:center">
            ${validP
              ? `<img src="${escapeHtml(p)}" onclick="openPhotoModal('${escapeHtml(p)}')" onerror="driveImgFallback(this)"
                   style="width:140px;height:140px;object-fit:cover;border-radius:10px;border:1px solid var(--border);cursor:zoom-in" />`
              : `<span style="color:var(--text3);font-size:11px">없음</span>`}
          </td>
          <td>${escapeHtml(item.sub_code)}</td>
          <td>${escapeHtml(item.sub_name)}</td>
          <td style="text-align:center">${num(item.quantity)}</td>
          <td style="color:var(--text3)">${escapeHtml(item.memo || '-')}</td>
        </tr>`;}).join('') || '<tr><td colspan="5">등록된 부속 설비 없음</td></tr>';
    } catch {
      $('modal-equip-subitems').innerHTML = '<tr><td colspan="5">부속 설비 조회 실패</td></tr>';
    }
    $('btn-equip-edit-mode').style.display = '';
    $('btn-equip-delete').style.display = '';
    const reportBtn = $('btn-open-report');
    if (reportBtn) reportBtn.href = `report.html?equip=${encodeURIComponent(equipCode)}`;
    openModal('modal-equip');
  } catch (error) {
    alert(`설비 상세 조회 실패: ${error.message}`);
  }
}

export function fillEquipForm(data = {}) {
  $('equip-form-title').textContent = data.equip_code ? '설비 정보 수정' : '신규 설비 등록';
  $('form-eq-code').value = pick(data.equip_code, data.code);
  $('form-eq-old-code').value = pick(data.equip_code, data.code);
  $('form-eq-name').value = pick(data.equip_name, data.name);
  $('form-eq-maker').value = pick(data.maker, data.manufacturer);
  $('form-eq-loc').value = pick(data.location, data.install_loc);
  $('form-eq-manager').value = pick(data.manager, data.owner);
  $('form-eq-dept').value = pick(data.manager_dept, data.department, data.dept);
  $('form-eq-asset').value = pick(data.asset_no, data.asset_number);
  $('form-eq-date').value = formatDate(pick(data.mfg_date, data.install_date)).replace(/-/g, '-');
  $('form-eq-spec').value = pick(data.spec, data.specification);
  const statusEl = $('form-eq-status');
  if (statusEl) { const sv = pick(data.status, data.equip_status, '정상'); statusEl.value = ['고장', '유휴'].includes(sv) ? sv : '정상'; }
  state.equipPhotoUrl = pick(data.photo_url, data.image_url);
  $('form-eq-photo-url').value = state.equipPhotoUrl;
  syncEquipPhotoPreview();
  EVAL_KEYS.forEach((key) => { const field = $(`eval-${key}`); if (field) field.value = pick(data[`eval_${key.replace('-', '_')}`], data[`score_${key.replace('-', '_')}`], '0'); });
  calcTotalScore();
}

export function openPhotoModal(url) {
  const overlay = $('modal-photo-view');
  const img = $('modal-photo-view-img');
  if (!overlay || !img || !url) return;
  img.src = url;
  overlay.classList.add('open');
}

export function openEquipForm() { fillEquipForm({}); loadEquipFormParts(''); loadEquipSubItems(''); openModal('modal-equip-form'); }
export function enableEditMode() {
  const equipCode = pick(state.currentEquip?.equip_code, state.currentEquip?.code, '');
  closeModal('modal-equip');
  fillEquipForm(state.currentEquip || {});
  loadEquipFormParts(equipCode);
  loadEquipSubItems(equipCode);
  openModal('modal-equip-form');
}

export async function loadEquipFormParts(equipCode) {
  // state.parts가 비어있으면 API에서 직접 로드
  if (!state.parts.length) {
    try {
      const res = await apiFirst(['spare-parts/master/list']);
      state.parts = getRows(res).map((row) => ({
        ...row,
        part_code: pick(row.part_code, row.code),
        part_name: pick(row.part_name, row.name),
        current_stock: num(pick(row.total_stock, row.current_stock, row.stock_qty, 0)),
      }));
    } catch {}
  }
  const sel = $('equip-form-part-select');
  if (sel) {
    sel.innerHTML = '<option value="">-- 파트 선택 --</option>' +
      state.parts.map((p) => {
        const id = num(pick(p.part_master_id, 0));
        const code = escapeHtml(pick(p.part_code, '-'));
        const name = escapeHtml(pick(p.part_name, '-'));
        return `<option value="${id}">${code} — ${name}</option>`;
      }).join('');
  }
  const listEl = $('equip-form-parts-list');
  if (!listEl) return;
  if (!equipCode) {
    listEl.innerHTML = '<span style="color:var(--text3);font-size:12px">저장 후 파트를 연결할 수 있습니다.</span>';
    return;
  }
  try {
    const res = await apiFirst([`equipment/spare-parts?equip_code=${encodeURIComponent(equipCode)}`]);
    const parts = getRows(res);
    if (!parts.length) { listEl.innerHTML = '<span style="color:var(--text3);font-size:12px">연결된 파트 없음</span>'; return; }
    listEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:4px 8px">파트코드</th><th style="text-align:left;padding:4px 8px">파트명</th><th style="padding:4px 8px">재고</th><th style="padding:4px 8px">안전재고</th></tr></thead>
      <tbody>${parts.map((p) => `<tr style="border-bottom:1px solid var(--border,#e5e7eb)"><td style="padding:4px 8px">${escapeHtml(pick(p.part_code, '-'))}</td><td style="padding:4px 8px">${escapeHtml(pick(p.part_name, '-'))}</td><td style="padding:4px 8px;text-align:center">${num(pick(p.stock_qty, 0))}</td><td style="padding:4px 8px;text-align:center">${num(pick(p.safe_stock_qty, 0))}</td></tr>`).join('')}</tbody>
    </table>`;
  } catch { listEl.innerHTML = '<span style="color:var(--text3);font-size:12px">파트 정보를 불러오지 못했습니다.</span>'; }
}

export async function addEquipFormPart() {
  const equipCode = $('form-eq-code')?.value?.trim();
  if (!equipCode) { showToast('설비코드를 먼저 입력하세요.', 'error'); return; }
  const partMasterId = num($('equip-form-part-select')?.value);
  if (!partMasterId) { showToast('파트를 선택하세요.', 'error'); return; }
  const stockQty = num($('equip-form-part-stock')?.value || 0);
  const safeStockQty = num($('equip-form-part-safe')?.value || 0);
  try {
    await apiFirst(['equipment/spare-parts/upsert'], { method: 'POST', body: JSON.stringify({ equip_code: equipCode, part_master_id: partMasterId, stock_qty: stockQty, safe_stock_qty: safeStockQty }) });
    showToast('✅ 파트 연결 완료');
    if ($('equip-form-part-select')) $('equip-form-part-select').value = '';
    if ($('equip-form-part-stock')) $('equip-form-part-stock').value = '';
    if ($('equip-form-part-safe')) $('equip-form-part-safe').value = '';
    await loadEquipFormParts(equipCode);
  } catch (error) { showToast(`파트 연결 실패: ${error.message}`, 'error'); }
}

export async function saveEquipment() {
  const totalScore = calcTotalScore();
  const eval_grade = totalScore >= 50 ? 'A' : totalScore >= 40 ? 'B' : totalScore >= 20 ? 'C' : 'D';
  const payload = {
    equip_code: $('form-eq-code').value.trim(), old_equip_code: $('form-eq-old-code').value.trim(), equip_name: $('form-eq-name').value.trim(), maker: $('form-eq-maker').value.trim(), manufacturer: $('form-eq-maker').value.trim(), location: $('form-eq-loc').value.trim(), manager: $('form-eq-manager').value.trim(), department: $('form-eq-dept').value.trim(), manager_dept: $('form-eq-dept').value.trim(), asset_no: $('form-eq-asset').value.trim(), install_date: $('form-eq-date').value, mfg_date: $('form-eq-date').value, spec: $('form-eq-spec').value.trim(), photo_url: $('form-eq-photo-url').value.trim(), status: $('form-eq-status')?.value || '정상', eval_total: totalScore, eval_grade,
  };
  EVAL_KEYS.forEach((key) => { payload[`eval_${key.replace('-', '_')}`] = num($(`eval-${key}`).value); });
  if (!payload.equip_code || !payload.equip_name) { alert('설비코드와 설비명은 필수입니다.'); return; }
  try {
    await api('equipment/upsert', { method: 'POST', body: JSON.stringify(payload) });
    closeModal('modal-equip-form');
    await loadEquipment();
    if (state.currentPage === 'page-dashboard') await loadDashboard();
  } catch (error) { alert(`설비 저장 실패: ${error.message}`); }
}

export function setEquipTab(tab) {
  const statusFilter = $('eq-status-filter');
  if (tab === 'active') {
    if (statusFilter) statusFilter.value = '';
    window._equipTabMode = 'active';
  } else {
    if (statusFilter) statusFilter.value = tab;
    window._equipTabMode = tab;
  }
  ['eq-tab-all', 'eq-tab-active', 'eq-tab-idle'].forEach((id) => {
    const btn = $(id);
    if (btn) btn.className = 'btn btn-sm btn-secondary';
  });
  const activeId = tab === '' ? 'eq-tab-all' : tab === 'active' ? 'eq-tab-active' : 'eq-tab-idle';
  const activeBtn = $(activeId);
  if (activeBtn) activeBtn.className = 'btn btn-sm btn-primary';
  filterEquipList();
}

export async function toggleEquipIdle() {
  const equip = state.currentEquip;
  if (!equip) return;
  const equipCode = pick(equip.equip_code, equip.code);
  const currentStatus = pick(equip.status, equip.equip_status, '정상');
  const newStatus = currentStatus === '유휴' ? '정상' : '유휴';
  if (!confirm(`"${equipCode}" 설비를 [${newStatus}] 상태로 변경하시겠습니까?`)) return;
  try {
    await api('equipment/upsert', {
      method: 'POST',
      body: JSON.stringify({ ...equip, status: newStatus, equip_status: newStatus }),
    });
    showToast(`✅ 상태 변경: ${currentStatus} → ${newStatus}`);
    closeModal('modal-equip');
    await loadEquipment();
  } catch (error) {
    showToast(`상태 변경 실패: ${error.message}`, 'error');
  }
}

export async function confirmDeleteEquip() {
  const equipCode = pick(state.currentEquip?.equip_code, state.currentEquip?.code);
  if (!equipCode || !confirm(`${equipCode} 설비를 폐기 처리하시겠습니까?`)) return;
  try {
    try { await api('equipment/delete', { method: 'POST', body: JSON.stringify({ equip_code: equipCode }) }); }
    catch { await api('equipment/discard', { method: 'POST', body: JSON.stringify({ equip_code: equipCode }) }); }
    closeModal('modal-equip');
    await loadEquipment();
  } catch (error) { alert(`설비 폐기 실패: ${error.message}`); }
}

export function syncEquipPhotoPreview() {
  const url = normalizeDriveUrl($('form-eq-photo-url').value || '');
  const img = $('equip-photo-previewimg');
  const ph = $('equip-photo-placeholder');
  const btn = $('btn-remove-equip-photo');
  if (url) { img.src = url; img.onerror = () => driveImgFallback(img); img.style.display = ''; ph.style.display = 'none'; btn.style.display = ''; }
  else { img.removeAttribute('src'); img.onerror = null; img.style.display = 'none'; ph.style.display = ''; btn.style.display = 'none'; }
}

export async function uploadEquipPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  $('equip-photo-status').textContent = '업로드 중...';
  try {
    const equipCode = $('form-eq-code')?.value?.trim() || 'UNKNOWN';
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `EQUIP_${equipCode}_${Date.now()}.${ext}`;
    const url = await uploadPhoto(file, fileName);
    $('form-eq-photo-url').value = url || '';
    state.equipPhotoUrl = url || '';
    syncEquipPhotoPreview();
    $('equip-photo-status').textContent = '업로드 완료';
  } catch (error) {
    $('equip-photo-status').textContent = `업로드 실패: ${error.message}`;
  }
}

export function removeEquipPhoto() {
  $('form-eq-photo-url').value = '';
  state.equipPhotoUrl = '';
  syncEquipPhotoPreview();
}

export function openHistorySlideOver(idx) {
  const row = (state.equipHistory || [])[idx];
  if (!row) return;
  const panel = document.getElementById('history-slideover');
  const bg = document.getElementById('history-slideover-bg');
  if (!panel || !bg) return;
  const rp = normalizeDriveUrl(pick(row.report_photo, row.photo_url));
  const ap = normalizeDriveUrl(pick(row.action_photo, ''));

  const photoSection = (rp || ap) ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:4px;text-align:center">📷 고장접수 사진</div>
        ${rp
          ? `<a href="${escapeHtml(rp)}" target="_blank" rel="noopener noreferrer">
               <img src="${escapeHtml(rp)}" onerror="driveImgFallback(this)" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;border:1px solid var(--border,#e5e7eb);display:block;" />
             </a>`
          : `<div style="width:100%;aspect-ratio:4/3;background:#f3f4f6;border-radius:10px;border:1px solid var(--border,#e5e7eb);display:flex;align-items:center;justify-content:center;font-size:11px;color:#9ca3af">없음</div>`}
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:4px;text-align:center">🔧 조치 사진</div>
        ${ap
          ? `<a href="${escapeHtml(ap)}" target="_blank" rel="noopener noreferrer">
               <img src="${escapeHtml(ap)}" onerror="driveImgFallback(this)" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;border:1px solid var(--border,#e5e7eb);display:block;" />
             </a>`
          : `<div style="width:100%;aspect-ratio:4/3;background:#f3f4f6;border-radius:10px;border:1px solid var(--border,#e5e7eb);display:flex;align-items:center;justify-content:center;font-size:11px;color:#9ca3af">없음</div>`}
      </div>
    </div>` : '';

  document.getElementById('so-info').innerHTML = `
    ${photoSection}
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tbody>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3);width:30%">접수 #</td><td style="padding:8px 12px;font-weight:700">${escapeHtml(pick(row.report_id,'-'))}</td><td style="padding:8px 12px;color:var(--text3)">유형</td><td style="padding:8px 12px">${escapeHtml(pick(row.report_type,'-'))}</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">접수일시</td><td style="padding:8px 12px">${escapeHtml(pick(row.report_dt,'-'))}</td><td style="padding:8px 12px;color:var(--text3)">상태</td><td style="padding:8px 12px">${renderStatusBadge(pick(row.status,'-'))}</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">신고자</td><td style="padding:8px 12px">${escapeHtml(pick(row.reporter,'-'))}</td><td style="padding:8px 12px;color:var(--text3)">처리일시</td><td style="padding:8px 12px">${escapeHtml(pick(row.action_dt,'-'))}</td></tr>
        <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text3)">증상</td><td colspan="3" style="padding:8px 12px;font-weight:600;white-space:pre-wrap">${escapeHtml(pick(row.symptom,'-'))}</td></tr>
        <tr><td style="padding:8px 12px;color:var(--text3)">조치내용</td><td colspan="3" style="padding:8px 12px;white-space:pre-wrap">${escapeHtml(pick(row.action_detail,'-'))}</td></tr>
      </tbody>
    </table>`;
  document.getElementById('so-report-id').value = pick(row.report_id, '');
  document.getElementById('so-equip-code').value = pick(row.equip_code, '');
  document.getElementById('so-status').value = pick(row.status, '');
  document.getElementById('so-tech').value = pick(row.technician, '');
  document.getElementById('so-detail').value = pick(row.action_detail, '');
  // 다운타임: 기존 값 있으면 그대로, 없으면 접수시각→현재 자동 계산
  const soDowntime = document.getElementById('so-downtime');
  const reportDt = pick(row.report_dt, '');
  soDowntime.dataset.reportDt = reportDt;
  const existingDt = num(pick(row.downtime_min, 0));
  if (existingDt > 0) {
    soDowntime.value = existingDt;
  } else if (reportDt) {
    const autoMin = Math.round((Date.now() - new Date(reportDt)) / 60000);
    soDowntime.value = autoMin > 0 ? autoMin : '';
  } else {
    soDowntime.value = '';
  }
  // 상태를 '완료'로 변경 시 다운타임 재계산 (빈 값일 때만)
  const soStatus = document.getElementById('so-status');
  if (soStatus) {
    soStatus.onchange = () => {
      if (soStatus.value === '완료') {
        const dt = document.getElementById('so-downtime');
        const rDt = dt.dataset.reportDt;
        if (rDt && (!dt.value || dt.value === '0')) {
          dt.value = Math.round((Date.now() - new Date(rDt)) / 60000);
        }
      }
    };
  }
  // 편집 폼 초기 숨김, 토글 버튼 복원
  const editSection = document.getElementById('so-edit-section');
  if (editSection) editSection.style.display = 'none';
  const toggleBtn = document.getElementById('so-edit-toggle-btn');
  if (toggleBtn) toggleBtn.style.display = '';
  bg.style.display = 'block';
  panel.style.display = 'block';
  requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; });
}

export function closeHistorySlideOver() {
  const panel = document.getElementById('history-slideover');
  const bg = document.getElementById('history-slideover-bg');
  if (panel) { panel.style.transform = 'translateX(100%)'; setTimeout(() => { panel.style.display = 'none'; }, 300); }
  if (bg) bg.style.display = 'none';
}

export async function submitHistoryAction() {
  const reportId = num(document.getElementById('so-report-id').value);
  const equipCode = document.getElementById('so-equip-code').value;
  const status = document.getElementById('so-status').value;
  const detail = document.getElementById('so-detail').value.trim();
  if (!reportId) { showToast('보고서 ID가 없습니다.', 'error'); return; }
  const payload = { report_id: reportId, equip_code: equipCode, status, technician: document.getElementById('so-tech').value.trim(), action_detail: detail, downtime_min: num(document.getElementById('so-downtime').value) };
  try {
    await apiFirst(['action/create', 'action/save'], { method: 'POST', body: JSON.stringify(payload) });
    if (status) await apiFirst(['report/update-status'], { method: 'PUT', body: JSON.stringify({ report_id: reportId, status }) });
    closeHistorySlideOver();
    showToast('✅ 저장 완료');
  } catch (error) { showToast(`저장 실패: ${error.message}`, 'error'); }
}

export function showQR(code, name) {
  const base = window.location.href.replace(/\/[^/]*$/, '/');
  const url = `${base}report.html?equip=${encodeURIComponent(code)}`;

  let overlay = document.getElementById('_qr_overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_qr_overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:32px 28px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.25);min-width:300px">
      <div style="font-size:13px;color:#64748b;margin-bottom:4px">${escapeHtml(code)}</div>
      <div style="font-size:17px;font-weight:700;margin-bottom:18px">${escapeHtml(name)}</div>
      <canvas id="_qr_canvas" style="border-radius:8px;display:block;margin:0 auto"></canvas>
      <div style="font-size:10px;color:#94a3b8;margin-top:10px;word-break:break-all">${url}</div>
      <div style="display:flex;gap:10px;margin-top:18px;justify-content:center">
        <button id="_qr_save_btn" style="padding:8px 18px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;font-size:13px">🖨️ 이미지 저장</button>
        <button onclick="document.getElementById('_qr_overlay').remove()" style="padding:8px 18px;border-radius:8px;border:none;background:#1d4ed8;color:#fff;cursor:pointer;font-size:13px">닫기</button>
      </div>
    </div>`;

  QRCode.toCanvas(document.getElementById('_qr_canvas'), url, { width: 260, margin: 2 }, () => {});

  document.getElementById('_qr_save_btn').onclick = () => {
    const a = document.createElement('a');
    a.download = `QR_${code}.png`;
    a.href = document.getElementById('_qr_canvas').toDataURL();
    a.click();
  };
}

export async function deleteHistoryReport() {
  const reportId = num(document.getElementById('so-report-id').value);
  if (!reportId) { showToast('보고서 ID가 없습니다.', 'error'); return; }
  if (!confirm(`고장 이력 #${reportId}을 삭제하시겠습니까?\n조치 이력도 함께 삭제됩니다.`)) return;
  try {
    await api('report/delete', { method: 'POST', body: JSON.stringify({ report_id: reportId }) });
    showToast('✅ 삭제 완료');
    closeHistorySlideOver();
    // 설비 상세 모달 이력 테이블 갱신
    const equipCode = document.getElementById('so-equip-code').value;
    if (equipCode) await openEquipDetail(equipCode);
  } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
}

export function exportEquipToCSV() {
  const rows = [['설비코드','설비명','제작사','위치','담당자','상태']].concat(state.equipment.map((row) => [pick(row.equip_code, row.code), pick(row.equip_name, row.name), pick(row.maker, row.manufacturer), pick(row.location, row.install_loc), pick(row.manager, row.owner), pick(row.status, row.equip_status)]));
  const csv = '\uFEFF' + rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `equipment_${formatDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── 부속 설비 구성 ────────────────────────────────────────────────

export async function loadEquipSubItems(equipCode) {
  const listEl = $('equip-form-subitems-list');
  if (!listEl) return;
  if (!equipCode) {
    listEl.innerHTML = '<span style="color:var(--text3);font-size:12px">저장 후 부속 설비를 등록할 수 있습니다.</span>';
    return;
  }
  try {
    const res = await api(`equipment/sub-items?equip_code=${encodeURIComponent(equipCode)}`);
    const items = getRows(res);
    if (!items.length) {
      listEl.innerHTML = '<span style="color:var(--text3);font-size:12px">등록된 부속 설비 없음</span>';
      return;
    }
    const noPhotoCount = items.filter(i => !normalizeDriveUrl(pick(i.photo_url, ''))).length;
    const warningBanner = noPhotoCount > 0
      ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#92400e">
           ⚠️ 사진 없는 항목 <strong>${noPhotoCount}건</strong> — 📷 버튼을 눌러 사진을 등록해주세요.
         </div>` : '';
    listEl.innerHTML = warningBanner + `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="padding:4px 8px">사진</th>
        <th style="text-align:left;padding:4px 8px">부속코드</th>
        <th style="text-align:left;padding:4px 8px">명칭</th>
        <th style="padding:4px 8px;text-align:center">수량</th>
        <th style="text-align:left;padding:4px 8px">비고</th>
        <th style="padding:4px 8px"></th>
      </tr></thead>
      <tbody>${items.map((item) => {
        const photo = normalizeDriveUrl(pick(item.photo_url, ''));
        const validPhoto = !!photo;
        const rowStyle = validPhoto ? '' : 'background:#fffbeb;border-left:3px solid #f59e0b';
        return `
        <tr style="border-bottom:1px solid var(--border,#e5e7eb);${rowStyle}">
          <td style="padding:4px 8px;text-align:center">
            ${validPhoto
              ? `<img src="${escapeHtml(photo)}" onclick="openPhotoModal('${escapeHtml(photo)}')" onerror="driveImgFallback(this)"
                   style="width:140px;height:140px;object-fit:cover;border-radius:10px;border:1px solid var(--border);cursor:zoom-in" />`
              : `<div>
                   <input type="file" id="sub-photo-input-${num(item.id)}" style="display:none" accept="image/*"
                     onchange="updateSubItemPhoto(${num(item.id)},'${escapeHtml(equipCode)}',this)" />
                   <button class="btn btn-sm" style="padding:2px 6px;font-size:11px;color:#92400e;background:#fef3c7;border-color:#f59e0b"
                     onclick="document.getElementById('sub-photo-input-${num(item.id)}').click()">📷 등록</button>
                 </div>`}
          </td>
          <td style="padding:4px 8px;font-weight:600">${escapeHtml(item.sub_code)}</td>
          <td style="padding:4px 8px">${escapeHtml(item.sub_name)}</td>
          <td style="padding:4px 8px;text-align:center">${num(item.quantity)}</td>
          <td style="padding:4px 8px;color:var(--text3)">${escapeHtml(item.memo || '-')}</td>
          <td style="padding:4px 8px">
            <button class="btn btn-sm" style="color:var(--red,#ef4444);border-color:var(--red,#ef4444);padding:2px 8px;font-size:11px"
              onclick="deleteEquipSubItem(${num(item.id)}, '${escapeHtml(equipCode)}')">삭제</button>
          </td>
        </tr>`;}).join('')}</tbody>
    </table>`;
  } catch {
    listEl.innerHTML = '<span style="color:var(--text3);font-size:12px">부속 설비 정보를 불러오지 못했습니다.</span>';
  }
}

export async function uploadSubItemPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  const label = $('form-sub-photo-label');
  if (label) label.textContent = '업로드 중...';
  try {
    const equipCode = $('form-eq-code')?.value?.trim() || 'UNKNOWN';
    const subCode = $('form-sub-code')?.value?.trim() || 'SUB';
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `SUB_${equipCode}_${subCode}_${Date.now()}.${ext}`;
    const formData = new FormData();
    formData.append('photo', new File([file], fileName, { type: file.type }));
    const result = await api('photo/upload-sub', { method: 'POST', body: formData });
    const url = pick(result.url, result.data?.[0]?.url, result.direct_url, '');
    if ($('form-sub-photo-url')) $('form-sub-photo-url').value = url;
    if (label) { label.textContent = '✅'; label.style.color = 'var(--green,#16a34a)'; }
  } catch (error) {
    if (label) label.textContent = '실패';
    showToast(`사진 업로드 실패: ${error.message}`, 'error');
  }
}

export async function addEquipSubItem() {
  const equipCode = $('form-eq-code')?.value?.trim();
  if (!equipCode) { showToast('설비코드를 먼저 입력하세요.', 'error'); return; }
  const subCode = $('form-sub-code')?.value?.trim();
  const subName = $('form-sub-name')?.value?.trim();
  if (!subCode || !subName) { showToast('부속코드와 명칭은 필수입니다.', 'error'); return; }
  const photoUrl = $('form-sub-photo-url')?.value?.trim() || '';
  const quantity = Math.max(1, num($('form-sub-qty')?.value || 1));
  const memo = $('form-sub-memo')?.value?.trim() || '';
  try {
    await api('equipment/sub-items/upsert', {
      method: 'POST',
      body: JSON.stringify({ equip_code: equipCode, sub_code: subCode, sub_name: subName, quantity, memo, photo_url: photoUrl }),
    });
    showToast('✅ 부속 설비 추가 완료');
    if ($('form-sub-code')) $('form-sub-code').value = '';
    if ($('form-sub-name')) $('form-sub-name').value = '';
    if ($('form-sub-qty')) $('form-sub-qty').value = '1';
    if ($('form-sub-memo')) $('form-sub-memo').value = '';
    if ($('form-sub-photo-url')) $('form-sub-photo-url').value = '';
    const label = $('form-sub-photo-label');
    if (label) { label.textContent = '없음'; label.style.color = ''; }
    await loadEquipSubItems(equipCode);
  } catch (error) { showToast(`부속 설비 추가 실패: ${error.message}`, 'error'); }
}

export async function deleteEquipSubItem(id, equipCode) {
  if (!confirm('이 부속 설비를 삭제하시겠습니까?')) return;
  try {
    await api('equipment/sub-items/delete', { method: 'POST', body: JSON.stringify({ id }) });
    showToast('🗑️ 삭제 완료');
    await loadEquipSubItems(equipCode);
  } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
}

export async function updateSubItemPhoto(id, equipCode, input) {
  const file = input.files?.[0];
  if (!file) return;
  // 버튼 텍스트를 업로드 중으로 변경
  const btn = input.parentElement?.querySelector('button');
  if (btn) btn.textContent = '업로드 중...';
  try {
    // 1. 사진 업로드
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `SUB_${equipCode}_${id}_${Date.now()}.${ext}`;
    const formData = new FormData();
    formData.append('photo', new File([file], fileName, { type: file.type }));
    const result = await api('photo/upload-sub', { method: 'POST', body: formData });
    const photoUrl = pick(result.url, result.data?.[0]?.url, result.direct_url, '');
    if (!photoUrl) throw new Error('업로드 URL 없음');
    // 2. 해당 행 DOM에서 기존 데이터 읽기 (tr > td 순서: 사진/부속코드/명칭/수량/비고/삭제)
    const tr = input.closest('tr');
    const cells = tr ? tr.querySelectorAll('td') : [];
    const subCode = cells[1]?.textContent?.trim() || '';
    const subName = cells[2]?.textContent?.trim() || '';
    const quantity = num(cells[3]?.textContent?.trim()) || 1;
    const memo = cells[4]?.textContent?.trim().replace(/^-$/, '') || '';
    // 3. 사진 URL 포함해 upsert
    await api('equipment/sub-items/upsert', {
      method: 'POST',
      body: JSON.stringify({ equip_code: equipCode, sub_code: subCode, sub_name: subName, quantity, memo, photo_url: photoUrl }),
    });
    showToast('✅ 사진 등록 완료');
    await loadEquipSubItems(equipCode);
  } catch (error) {
    if (btn) btn.textContent = '📷 등록';
    showToast(`사진 업로드 실패: ${error.message}`, 'error');
  }
}
