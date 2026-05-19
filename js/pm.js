import { state, CACHE_KEYS, $, num, pick, escapeHtml, getRows, saveCache, loadCache, api, apiFirst, isPlanned, ensureSelectValue, showToast, uploadPhoto } from './core.js';
import { openModal, closeModal } from './ui.js';

let selectedPMEquip = '';
let selectedPMPlanEquip = '';
let pmResultsMap = {};

export async function loadPMMasterList() {
  try {
    const response = await apiFirst(['pm/master/list?equip_code=']);
    state.pmMasters = getRows(response);
    saveCache(CACHE_KEYS.pmMasters, state.pmMasters);
    renderPMEquipList();
    renderPMMasterTable();
    renderPMItemsTable();
  } catch (error) {
    state.pmMasters = loadCache(CACHE_KEYS.pmMasters, []);
    renderPMEquipList();
    renderPMMasterTable();
    renderPMItemsTable();
    throw error;
  }
}

export function renderPMEquipList() {
  const panel = $('pm-equip-list');
  if (!panel) return;
  const keyword = ($('pm-equip-search')?.value || '').toLowerCase();
  const countMap = {};
  state.pmMasters.forEach((row) => {
    const code = pick(row.equip_code);
    if (code) countMap[code] = (countMap[code] || 0) + 1;
  });
  const list = state.equipment.filter((row) => {
    const code = String(pick(row.equip_code, row.code)).toLowerCase();
    const name = String(pick(row.equip_name, row.name)).toLowerCase();
    return !keyword || code.includes(keyword) || name.includes(keyword);
  });
  if ($('pm-equip-list-count')) $('pm-equip-list-count').textContent = `${list.length}개`;
  panel.innerHTML = list.map((row) => {
    const code = pick(row.equip_code, row.code);
    const name = pick(row.equip_name, row.name);
    const cnt = countMap[code] || 0;
    const isSelected = code === selectedPMEquip;
    return `<div onclick="selectPMEquip('${escapeHtml(code)}')" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);background:${isSelected ? 'var(--primary)' : 'transparent'};color:${isSelected ? '#fff' : 'inherit'};transition:background 0.15s">
      <div>
        <div style="font-size:12px;font-weight:700">${escapeHtml(code)}</div>
        <div style="font-size:11px;opacity:0.75">${escapeHtml(name)}</div>
      </div>
      ${cnt > 0 ? `<span class="badge" style="background:${isSelected ? 'rgba(255,255,255,0.3)' : 'var(--primary)'};color:#fff;margin-left:0">${cnt}</span>` : ''}
    </div>`;
  }).join('') || '<div style="padding:20px;color:var(--text3);font-size:13px;text-align:center">설비 없음</div>';
}

export function selectPMEquip(code) {
  selectedPMEquip = code;
  renderPMEquipList();
  renderPMMasterTable();
  const addBtn = $('pm-master-add-btn');
  const label = $('pm-master-selected-label');
  if (addBtn) addBtn.style.display = code ? '' : 'none';
  if (label) {
    const row = state.equipment.find((r) => pick(r.equip_code, r.code) === code);
    label.textContent = code ? `${code} — ${pick(row?.equip_name, row?.name, '')}` : '← 설비를 선택하세요';
    label.style.color = code ? 'var(--text)' : 'var(--text3)';
  }
}

export function renderPMMasterTable() {
  const INPUT_TYPE_LABELS = { 'PASS_FAIL': 'O/X', 'NUMBER': '수치' };
  const rows = state.pmMasters.filter((row) => !selectedPMEquip || pick(row.equip_code) === selectedPMEquip);
  const countEl = $('pm-master-count');
  if (countEl) countEl.textContent = `총 ${rows.length}개`;

  const thead = document.getElementById('pm-master-thead');
  if (thead) {
    thead.innerHTML = `<tr>
      <th style="width:36px;text-align:center;padding:4px 6px;font-size:11px">No.</th>
      <th style="padding:4px 10px;font-size:11px">점검 부위</th>
      <th style="padding:4px 10px;font-size:11px">점검 항목</th>
      <th style="padding:4px 10px;font-size:11px">점검 기준</th>
      <th style="width:60px;text-align:center;padding:4px 6px;font-size:11px">유형</th>
      <th style="width:130px;text-align:center;padding:4px 6px;font-size:11px">관리</th>
    </tr>`;
  }

  const tbody = $('pm-master-tbody');
  if (!tbody) return;

  const itemRows = rows.map((row, idx) => {
    const id = Number(pick(row.id, row.pm_master_id, 0));
    const inputType = pick(row.input_type, row.pm_type, row.type, 'PASS_FAIL');
    const itemName = escapeHtml(pick(row.item_name, row.check_item, row.item));
    return `<tr style="cursor:pointer" onclick="openPMResultHistory(${id},'${itemName}')">
      <td style="text-align:center;color:var(--text3);font-size:11px;padding:6px">${idx + 1}</td>
      <td style="padding:6px 10px;font-size:12px">${escapeHtml(pick(row.part_name, row.part, '—'))}</td>
      <td style="padding:6px 10px;font-size:12px;font-weight:600">${itemName}</td>
      <td style="padding:6px 10px;font-size:11px;color:var(--text2)">${escapeHtml(pick(row.criteria, '—'))}</td>
      <td style="text-align:center;padding:6px;font-size:11px">${escapeHtml(INPUT_TYPE_LABELS[inputType] || inputType)}</td>
      <td style="white-space:nowrap;text-align:center;padding:4px" onclick="event.stopPropagation()">
        <div style="display:flex;gap:4px;justify-content:center">
          <button class="btn btn-sm btn-secondary" onclick="editPMMasterItem(${id})">수정</button>
          <button class="btn btn-sm btn-danger" onclick="deletePMMasterItem(${id})">삭제</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // 인라인 추가 행 (설비 선택 시만 표시)
  const inlineRow = selectedPMEquip ? `<tr id="pm-inline-add-row" style="background:var(--surface2)">
    <td style="text-align:center;color:var(--text3);font-size:11px;padding:6px">+</td>
    <td style="padding:4px 6px"><input id="pm-new-part" class="form-control" placeholder="부위 (예: 구동부)" style="font-size:12px;padding:4px 6px;width:100%"></td>
    <td style="padding:4px 6px"><input id="pm-new-item" class="form-control" placeholder="항목명 *" style="font-size:12px;padding:4px 6px;width:100%"></td>
    <td style="padding:4px 6px"><input id="pm-new-criteria" class="form-control" placeholder="기준 (예: 누유 없을 것)" style="font-size:12px;padding:4px 6px;width:100%"></td>
    <td style="padding:4px 6px">
      <select id="pm-new-type" class="form-control" style="font-size:12px;padding:4px 6px">
        <option value="PASS_FAIL">O/X</option>
        <option value="NUMBER">수치</option>
      </select>
    </td>
    <td style="text-align:center;padding:4px">
      <button class="btn btn-sm btn-primary" onclick="saveInlineItem()">➕ 추가</button>
    </td>
  </tr>` : '';

  tbody.innerHTML = (itemRows || `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:24px">${selectedPMEquip ? '등록된 점검항목이 없습니다.' : '설비를 선택하세요.'}</td></tr>`) + inlineRow;
}

export async function savePMResultRow(pmMasterId, inputType, checkMonth) {
  if (!selectedPMEquip) { showToast('설비를 먼저 선택하세요.', 'warn'); return; }
  const m = Number(checkMonth.slice(5, 7));
  const valEl = document.getElementById(`pmr-val-${pmMasterId}-${m}`);
  const val = valEl?.value?.trim() || '';
  const memo = $('pm-remark')?.value?.trim() || '';
  if (!val) { showToast('점검 결과를 입력하세요.', 'warn'); return; }
  if (!memo) { showToast('점검 특이사항을 입력하세요. (필수)', 'warn'); $('pm-remark')?.focus(); return; }
  const isPF = inputType === 'PASS_FAIL';
  const row = state.pmMasters.find((r) => Number(pick(r.id, r.pm_master_id, 0)) === pmMasterId);
  const payload = {
    pm_master_id: pmMasterId,
    equip_code: selectedPMEquip,
    item_name: pick(row?.item_name, row?.check_item, ''),
    input_type: inputType,
    pass_fail: isPF ? val : '',
    value_num: isPF ? '' : Number(val),
    memo,
    check_month: checkMonth,
  };
  try {
    await apiFirst(['pm/checklist/submit'], { method: 'POST', body: JSON.stringify(payload) });
    await loadPMResultsForEquip(selectedPMEquip);
    // Auto P→D if this was a planned month
    const planRow = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMEquip);
    if (planRow && planRow[`m${m}`] === 'P') {
      planRow[`m${m}`] = 'D';
      const planPayload = { equip_code: selectedPMEquip, plan_year: $('pm-year-select').value };
      for (let mi = 1; mi <= 12; mi++) {
        planPayload[`m${mi}`] = planRow[`m${mi}`] || '0';
        planPayload[`m${mi}_date`] = planRow[`m${mi}_date`] || null;
      }
      await apiFirst(['pm/upsert-plan'], { method: 'POST', body: JSON.stringify(planPayload) });
      showToast(`✅ 저장 완료 — ${m}월 계획됨→완료됨`);
      await loadPMPlan();
    } else {
      showToast('✅ 실적 저장 완료');
    }
  } catch (error) {
    showToast(`실적 저장 실패: ${error.message}`, 'error');
  }
}

export async function saveRowResults(pmMasterId, inputType) {
  if (!selectedPMEquip) { showToast('설비를 먼저 선택하세요.', 'warn'); return; }
  const memo = $('pm-remark')?.value?.trim() || '';
  if (!memo) { showToast('점검 특이사항을 입력하세요. (필수)', 'warn'); $('pm-remark')?.focus(); return; }
  const year = $('pm-year-select')?.value || String(new Date().getFullYear());
  const isPF = inputType === 'PASS_FAIL';
  const row = state.pmMasters.find((r) => Number(pick(r.id, r.pm_master_id, 0)) === pmMasterId);
  const saves = [];
  for (let m = 1; m <= 12; m++) {
    const valEl = document.getElementById(`pmr-val-${pmMasterId}-${m}`);
    if (!valEl) continue;
    const val = valEl.value?.trim() || '';
    if (!val) continue;
    saves.push({
      pm_master_id: pmMasterId,
      equip_code: selectedPMEquip,
      item_name: pick(row?.item_name, row?.check_item, ''),
      input_type: inputType,
      pass_fail: isPF ? val : '',
      value_num: isPF ? '' : Number(val),
      memo,
      check_month: `${year}-${String(m).padStart(2, '0')}`,
    });
  }
  if (!saves.length) { showToast('입력된 실적이 없습니다.', 'warn'); return; }
  try {
    await Promise.all(saves.map((payload) => apiFirst(['pm/checklist/submit'], { method: 'POST', body: JSON.stringify(payload) })));
    await loadPMResultsForEquip(selectedPMEquip);
    const planRow = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMEquip);
    let didUpdate = false;
    if (planRow) {
      saves.forEach((s) => { const m = Number(s.check_month.slice(5, 7)); if (planRow[`m${m}`] === 'P') { planRow[`m${m}`] = 'D'; didUpdate = true; } });
    }
    if (didUpdate && planRow) {
      const planPayload = { equip_code: selectedPMEquip, plan_year: year };
      for (let mi = 1; mi <= 12; mi++) { planPayload[`m${mi}`] = planRow[`m${mi}`] || '0'; planPayload[`m${mi}_date`] = planRow[`m${mi}_date`] || null; }
      await apiFirst(['pm/upsert-plan'], { method: 'POST', body: JSON.stringify(planPayload) });
      await loadPMPlan();
    }
    showToast(`✅ ${saves.length}건 저장 완료`);
  } catch (error) { showToast(`저장 실패: ${error.message}`, 'error'); }
}

export function openPMMasterForm() {
  $('pm-master-edit-title').textContent = '📝 점검 항목 편집';
  $('pm-master-id').value = '';
  $('pm-master-equip-code').innerHTML = '<option value="">설비 선택</option>' + state.equipment.map((row) => `<option value="${escapeHtml(pick(row.equip_code, row.code))}">${escapeHtml(pick(row.equip_code, row.code))} — ${escapeHtml(pick(row.equip_name, row.name))}</option>`).join('');
  if (selectedPMEquip) $('pm-master-equip-code').value = selectedPMEquip;
  $('pm-master-part').value = '';
  $('pm-master-type').value = '';
  $('pm-master-item').value = '';
  $('pm-master-criteria').value = '';
  openModal('modal-pm-master-edit');
  // modal-pm-items 위에 올라오도록 z-index 강제 상향
  const editOverlay = $('modal-pm-master-edit');
  if (editOverlay) editOverlay.style.zIndex = '2100';
}

export function editPMMasterItem(id) {
  const row = state.pmMasters.find((item) => Number(pick(item.id, item.pm_master_id, 0)) === Number(id));
  if (!row) return;
  openPMMasterForm();
  $('pm-master-id').value = pick(row.id, row.pm_master_id);
  $('pm-master-equip-code').value = pick(row.equip_code);
  $('pm-master-part').value = pick(row.part_name, row.part);
  ensureSelectValue('pm-master-type', pick(row.input_type, row.pm_type, row.type), '기존유형');
  $('pm-master-item').value = pick(row.item_name, row.check_item, row.item);
  $('pm-master-criteria').value = pick(row.criteria);
  // criteria_photo
  const photoUrl = pick(row.criteria_photo, '');
  if ($('pm-master-photo-url')) $('pm-master-photo-url').value = photoUrl;
  const preview = $('pm-master-photo-preview');
  if (preview) preview.innerHTML = photoUrl ? `<img src="${escapeHtml(photoUrl)}" style="max-height:80px;border-radius:6px;border:1px solid var(--border)">` : '';
  if ($('pm-master-photo-status')) $('pm-master-photo-status').textContent = photoUrl ? '사진 등록됨' : '';
}

export async function savePMMasterItem() {
  const rowId = $('pm-master-id').value.trim();
  const payload = {
    id: rowId || undefined,
    equip_code: $('pm-master-equip-code').value,
    part_name: $('pm-master-part').value.trim(),
    input_type: $('pm-master-type').value,
    item_name: $('pm-master-item').value.trim(),
    criteria: $('pm-master-criteria').value.trim(),
    criteria_photo: $('pm-master-photo-url')?.value.trim() || '',
    sort_order: 0,
  };
  const path = rowId ? 'pm/master/update' : 'pm/master/create';
  try {
    await apiFirst([path], { method: 'POST', body: JSON.stringify(payload) });
    closeModal('modal-pm-master-edit');
    await loadPMMasterList();
  } catch (error) { alert(`점검 항목 저장 실패: ${error.message}`); }
}

export async function deletePMMasterItem(id) {
  if (!confirm('점검 항목을 삭제하시겠습니까?')) return;
  try {
    await apiFirst(['pm/master/delete'], { method: 'POST', body: JSON.stringify({ id }) });
    await loadPMMasterList();
  } catch (error) { alert(`점검 항목 삭제 실패: ${error.message}`); }
}

// ── 인라인 항목 추가 ──────────────────────────────────────────────────
export async function saveInlineItem() {
  if (!selectedPMEquip) { showToast('설비를 먼저 선택하세요.', 'warn'); return; }
  const item = $('pm-new-item')?.value.trim();
  if (!item) { showToast('점검 항목명을 입력하세요.', 'warn'); $('pm-new-item')?.focus(); return; }
  const payload = {
    equip_code: selectedPMEquip,
    part_name: $('pm-new-part')?.value.trim() || '',
    input_type: $('pm-new-type')?.value || 'PASS_FAIL',
    item_name: item,
    criteria: $('pm-new-criteria')?.value.trim() || '',
    sort_order: 0,
  };
  try {
    await apiFirst(['pm/master/create'], { method: 'POST', body: JSON.stringify(payload) });
    showToast('✅ 항목 추가 완료');
    await loadPMMasterList();
  } catch (error) { showToast(`항목 추가 실패: ${error.message}`, 'error'); }
}

// ── 다른 설비에서 복사 ────────────────────────────────────────────────
export function openCopyFromEquip() {
  if (!selectedPMEquip) { showToast('먼저 대상 설비를 선택하세요.', 'warn'); return; }
  const sources = [...new Set(
    state.pmMasters.map((r) => pick(r.equip_code)).filter((c) => c && c !== selectedPMEquip)
  )];
  const sel = $('copy-src-equip');
  if (sel) {
    sel.innerHTML = '<option value="">-- 원본 설비 선택 --</option>' + sources.map((code) => {
      const eq = state.equipment.find((r) => pick(r.equip_code, r.code) === code);
      const cnt = state.pmMasters.filter((r) => pick(r.equip_code) === code).length;
      return `<option value="${escapeHtml(code)}">${escapeHtml(code)} — ${escapeHtml(pick(eq?.equip_name, eq?.name, ''))} (${cnt}개)</option>`;
    }).join('');
  }
  if ($('copy-dst-label')) $('copy-dst-label').textContent = selectedPMEquip;
  if ($('copy-preview')) $('copy-preview').innerHTML = '';
  if ($('copy-status')) $('copy-status').textContent = '';
  openModal('modal-pm-copy');
}

export function previewCopyItems() {
  const src = $('copy-src-equip')?.value;
  const preview = $('copy-preview');
  if (!preview) return;
  if (!src) { preview.innerHTML = ''; return; }
  const items = state.pmMasters.filter((r) => pick(r.equip_code) === src);
  preview.innerHTML = `<div style="font-size:11px;color:var(--text3);padding:6px 8px;font-weight:700">복사될 항목 ${items.length}개</div>` +
    items.map((r, i) => `<div style="padding:5px 8px;font-size:12px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center">
      <span style="color:var(--text3);min-width:20px">${i + 1}</span>
      <span style="color:var(--text2);min-width:70px">${escapeHtml(pick(r.part_name, r.part, '—'))}</span>
      <span style="font-weight:600;flex:1">${escapeHtml(pick(r.item_name, r.check_item, ''))}</span>
      <span class="badge muted" style="font-size:10px">${pick(r.input_type, '') === 'NUMBER' ? '수치' : 'O/X'}</span>
    </div>`).join('') || '<div style="padding:12px;color:var(--text3);font-size:12px;text-align:center">항목 없음</div>';
}

export async function saveCopyFromEquip() {
  const src = $('copy-src-equip')?.value;
  if (!src) { showToast('원본 설비를 선택하세요.', 'warn'); return; }
  const items = state.pmMasters.filter((r) => pick(r.equip_code) === src);
  if (!items.length) { showToast('복사할 항목이 없습니다.', 'warn'); return; }
  if ($('copy-status')) $('copy-status').textContent = `복사 중... (${items.length}건)`;
  try {
    await Promise.all(items.map((row) => apiFirst(['pm/master/create'], {
      method: 'POST',
      body: JSON.stringify({
        equip_code: selectedPMEquip,
        part_name: pick(row.part_name, row.part, ''),
        input_type: pick(row.input_type, 'PASS_FAIL'),
        item_name: pick(row.item_name, row.check_item, ''),
        criteria: pick(row.criteria, ''),
        sort_order: 0,
      }),
    })));
    closeModal('modal-pm-copy');
    showToast(`✅ ${items.length}개 항목 복사 완료`);
    await loadPMMasterList();
  } catch (error) {
    if ($('copy-status')) $('copy-status').textContent = `복사 실패: ${error.message}`;
  }
}

export function ensureYearOptions() {
  const select = $('pm-year-select');
  if (!select || select.options.length) return;
  const year = new Date().getFullYear();
  for (let y = year - 1; y <= year + 3; y += 1) { const opt = document.createElement('option'); opt.value = String(y); opt.textContent = String(y); select.appendChild(opt); }
  select.value = String(year);
}

export function addNewYear() {
  const select = $('pm-year-select');
  const next = String(num(select.value, new Date().getFullYear()) + 1);
  const opt = document.createElement('option');
  opt.value = next; opt.textContent = next; select.appendChild(opt); select.value = next; loadPMPlan();
}

export function updateCheckMonthSelect(code) {
  const select = $('pm-check-month');
  if (!select) return;
  const year = $('pm-year-select')?.value || String(new Date().getFullYear());
  const planRow = state.pmPlans.find((r) => pick(r.equip_code) === code);
  const prev = select.value;
  select.innerHTML = '';
  if (!code || !planRow) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = '설비 선택 후 표시';
    select.appendChild(opt);
    return;
  }
  for (let m = 1; m <= 12; m++) {
    const status = planRow[`m${m}`] || '0';
    if (status === 'P') {
      const val = `${year}-${String(m).padStart(2, '0')}`;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = `${m}월 (계획됨)`;
      select.appendChild(opt);
    }
  }
  if (!select.options.length) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = '계획된 달 없음';
    select.appendChild(opt);
  } else if (prev && Array.from(select.options).some((o) => o.value === prev)) {
    select.value = prev;
  }
}

export async function loadPMPlan() {
  ensureYearOptions();
  const year = $('pm-year-select').value;
  try {
    const response = await apiFirst([`pm/list?year=${encodeURIComponent(year)}`]);
    state.pmPlans = getRows(response);
    saveCache(CACHE_KEYS.pmPlans, state.pmPlans);
  } catch (error) {
    state.pmPlans = loadCache(CACHE_KEYS.pmPlans, []);
    throw error;
  }
  renderPMPlanEquipList();
  renderPMPlanMonthGrid();
  renderPMOverviewTable();
  updateCheckMonthSelect(selectedPMPlanEquip);
}

export function renderPMPlanEquipList() {
  const panel = $('pm-plan-equip-list');
  if (!panel) return;
  const keyword = ($('pm-plan-equip-search')?.value || '').toLowerCase();
  const planMap = {};
  state.pmPlans.forEach((row) => { planMap[pick(row.equip_code)] = row; });
  const list = state.equipment.filter((row) => {
    const code = String(pick(row.equip_code, row.code)).toLowerCase();
    const name = String(pick(row.equip_name, row.name)).toLowerCase();
    return !keyword || code.includes(keyword) || name.includes(keyword);
  });
  if ($('pm-plan-equip-count')) $('pm-plan-equip-count').textContent = `${list.length}개`;
  panel.innerHTML = list.map((row) => {
    const code = pick(row.equip_code, row.code);
    const name = pick(row.equip_name, row.name);
    const no = row._no || '';
    const plan = planMap[code];
    const planMonths = plan
      ? Array.from({ length: 12 }, (_, i) => (plan[`m${i + 1}`] && plan[`m${i + 1}`] !== '0') ? String(i + 1) : null).filter(Boolean)
      : [];
    const badgeText = planMonths.length > 4
      ? `${planMonths.slice(0, 4).join(',')}+${planMonths.length - 4}월`
      : planMonths.length > 0 ? `${planMonths.join(',')}월` : '';
    const isSelected = code === selectedPMPlanEquip;
    return `<div onclick="selectPMPlanEquip('${escapeHtml(code)}')" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);background:${isSelected ? 'var(--primary)' : 'transparent'};color:${isSelected ? '#fff' : 'inherit'};transition:background 0.15s">
      <div>
        <div style="font-size:11px;opacity:0.6;margin-bottom:1px">No.${no}</div>
        <div style="font-size:12px;font-weight:700">${escapeHtml(code)}</div>
        <div style="font-size:11px;opacity:0.75">${escapeHtml(name)}</div>
      </div>
      ${badgeText ? `<span class="badge" style="background:${isSelected ? 'rgba(255,255,255,0.3)' : 'var(--primary)'};color:#fff;margin-left:0;font-size:11px">${badgeText}</span>` : ''}
    </div>`;
  }).join('') || '<div style="padding:20px;color:var(--text3);font-size:13px;text-align:center">설비 없음</div>';
}

export function selectPMPlanEquip(code) {
  selectedPMPlanEquip = code;
  selectedPMEquip = code;
  renderPMOverviewTable();
  if (code) openPMPlanSlideover(code); else closePMPlanSlideover();
  const saveBtn = $('pm-plan-save-btn');
  if (saveBtn) saveBtn.style.display = code ? '' : 'none';

  // 설비 액션 카드 업데이트
  const noHint = $('pm-no-equip-hint');
  const equipCard = $('pm-equip-card');
  if (noHint) noHint.style.display = code ? 'none' : '';
  if (equipCard) equipCard.style.display = code ? '' : 'none';
  if (code) {
    const row = state.equipment.find((r) => pick(r.equip_code, r.code) === code);
    if ($('pm-equip-card-code')) $('pm-equip-card-code').textContent = code;
    if ($('pm-equip-card-name')) $('pm-equip-card-name').textContent = pick(row?.equip_name, row?.name, '');
    const planRow = state.pmPlans.find((r) => pick(r.equip_code) === code);
    const icons = { 'P': '📅', 'D': '✅' };
    const planMonths = planRow
      ? Array.from({ length: 12 }, (_, i) => {
          const s = planRow[`m${i + 1}`];
          return (s && s !== '0') ? `${icons[s] || '⚪'}${i + 1}월` : null;
        }).filter(Boolean)
      : [];
    if ($('pm-equip-card-plan')) {
      $('pm-equip-card-plan').textContent = planMonths.length ? `PM: ${planMonths.join('  ')}` : 'PM 계획 없음';
    }
    // 항목 수 갱신
    const cnt = state.pmMasters.filter((r) => pick(r.equip_code) === code).length;
    if ($('pm-master-count')) $('pm-master-count').textContent = `총 ${cnt}개`;
  }

  updateCheckMonthSelect(code);
  renderPMMasterTable();
  if (code) loadPMResultsForEquip(code);
}

export function renderPMPlanMonthGrid() {
  const grid = $('pm-plan-month-grid');
  if (!grid) return;
  if (!selectedPMPlanEquip) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text3);padding:40px">설비를 선택하면 월별 계획이 표시됩니다.</div>';
    return;
  }
  const row = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMPlanEquip);
  const icons = { '0': '⚪', 'P': '📅', 'D': '✅' };
  const labels = { '0': '미계획', 'P': '계획됨', 'D': '완료됨' };
  grid.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const val = (row && row[`m${i + 1}`]) || '0';
    const icon = icons[val] || '⚪';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface2)">
      <span style="font-size:13px;font-weight:700">${i + 1}월</span>
      <button class="pm-status-btn" data-pm-plan-month="${i + 1}" data-status="${escapeHtml(val)}" onclick="cyclePMStatus(this)" title="${labels[val] || ''}" style="background:none;border:none;cursor:pointer;font-size:26px;padding:4px">${icon}</button>
      <span class="pm-edit-label" style="font-size:11px;color:var(--text3)">${labels[val] || '미계획'}</span>
    </div>`;
  }).join('');
}

export function renderPMOverviewTable() {
  const container = $('pm-overview-table');
  if (!container) return;
  const icons = { '0': '⚪', 'P': '📅', 'D': '✅' };
  const planMap = {};
  state.pmPlans.forEach((row) => { planMap[pick(row.equip_code)] = row; });
  const keyword = ($('pm-overview-search')?.value || '').toLowerCase();
  const rows = state.equipment.filter((row) => {
    if (num(pick(row.pm_yn, 0)) === 0) return false;
    if (!keyword) return true;
    const code = String(pick(row.equip_code, row.code)).toLowerCase();
    const name = String(pick(row.equip_name, row.name)).toLowerCase();
    return code.includes(keyword) || name.includes(keyword);
  });
  if (!rows.length) { container.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:13px;text-align:center">설비 데이터 없음</div>'; return; }
  const getPMCount = (plan) => plan ? Array.from({length:12},(_,i)=>plan[`m${i+1}`]).filter(v=>v&&v!=='0').length : 0;
  const cnt2 = rows.filter(r=>getPMCount(planMap[pick(r.equip_code,r.code)])>=2).length;
  const cnt1 = rows.filter(r=>getPMCount(planMap[pick(r.equip_code,r.code)])===1).length;
  const cnt0 = rows.length - cnt2 - cnt1;
  const header = `<div style="display:flex;align-items:center;gap:16px;padding:6px 14px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text2)">
    <span>전체 <strong>${rows.length}</strong>대</span>
    <span style="color:#388e3c">● 연2회↑ <strong>${cnt2}</strong>대</span>
    <span style="color:#f9a825">● 연1회 <strong>${cnt1}</strong>대</span>
    <span style="color:var(--text3)">○ 미계획 <strong>${cnt0}</strong>대</span>
  </div>`;
  const tableRows = rows.map((row, idx) => {
    const code = pick(row.equip_code, row.code);
    const name = pick(row.equip_name, row.name, '-');
    const loc = pick(row.location, '-');
    const no = row._no || idx + 1;
    const plan = planMap[code];
    const pmCount = getPMCount(plan);
    const isSelected = code === selectedPMPlanEquip;
    let rowBg = 'transparent';
    if (isSelected) rowBg = 'var(--primary)';
    else if (pmCount >= 2) rowBg = '#e8f5e9';
    else if (pmCount === 1) rowBg = '#fffde7';
    const rowColor = isSelected ? '#fff' : 'inherit';
    const cells = Array.from({length:12},(_,i)=>{
      const val = (plan&&plan[`m${i+1}`])||'0';
      const dateVal = (plan&&plan[`m${i+1}_date`]) || '';
      const dateLabel = (val === 'P' && dateVal) ? `<div style="font-size:9px;opacity:0.85;line-height:1.3;margin-top:1px">${dateVal.slice(5).replace('-','/')}</div>` : '';
      return `<td data-status="${escapeHtml(val)}" data-plan-date="${escapeHtml(dateVal)}" onclick="cyclePMOverviewCell('${escapeHtml(code)}',${i+1},this,event)" style="text-align:center;padding:3px 2px;border-bottom:1px solid var(--border);cursor:pointer;user-select:none">${icons[val]||'⚪'}${dateLabel}</td>`;
    }).join('');
    return `<tr onclick="selectPMPlanEquip('${escapeHtml(code)}')" data-equip-code="${escapeHtml(code)}" style="cursor:pointer;background:${rowBg};color:${rowColor}">
      <td style="text-align:center;padding:4px 6px;border-bottom:1px solid var(--border);font-size:11px;color:${isSelected?'rgba(255,255,255,0.7)':'var(--text3)'};min-width:32px">${no}</td>
      <td style="padding:4px 10px;border-bottom:1px solid var(--border);font-weight:700;font-size:11px">${escapeHtml(code)}</td>
      <td style="padding:4px 10px;border-bottom:1px solid var(--border);font-size:11px">${escapeHtml(name)}</td>
      <td style="padding:4px 10px;border-bottom:1px solid var(--border);font-size:11px;color:${isSelected?'inherit':'var(--text2)'}">${escapeHtml(loc)}</td>
      ${cells}
    </tr>`;
  }).join('');
  container.innerHTML = header + `<table style="width:100%;border-collapse:collapse;white-space:nowrap">
    <thead style="position:sticky;top:0;background:var(--surface2);z-index:2">
      <tr>
        <th style="padding:5px 6px;text-align:center;border-bottom:2px solid var(--border);font-size:11px;min-width:32px">No.</th>
        <th style="padding:5px 10px;text-align:left;border-bottom:2px solid var(--border);font-size:11px;min-width:90px">설비코드</th>
        <th style="padding:5px 10px;text-align:left;border-bottom:2px solid var(--border);font-size:11px;min-width:110px">설비명</th>
        <th style="padding:5px 10px;text-align:left;border-bottom:2px solid var(--border);font-size:11px;min-width:70px">설치소</th>
        ${Array.from({length:12},(_,i)=>`<th style="padding:5px 6px;text-align:center;border-bottom:2px solid var(--border);font-size:11px;min-width:36px">${i+1}월</th>`).join('')}
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>`;
}

export async function savePMSingleEquip() {
  if (!selectedPMPlanEquip) return;
  const planRow = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMPlanEquip) || {};
  const payload = { equip_code: selectedPMPlanEquip, plan_year: $('pm-year-select').value };
  for (let m = 1; m <= 12; m++) {
    payload[`m${m}`] = planRow[`m${m}`] || '0';
    payload[`m${m}_date`] = planRow[`m${m}_date`] || null;
  }
  try {
    await apiFirst(['pm/upsert-plan'], { method: 'POST', body: JSON.stringify(payload) });
    showToast('✅ 저장 완료');
    await loadPMPlan();
  } catch (error) { showToast(`저장 실패: ${error.message}`, 'error'); }
}

export function cyclePMStatus(btn) {
  const cycle = { '0': 'P', 'P': 'D', 'D': '0' };
  const icons = { '0': '⚪', 'P': '📅', 'D': '✅' };
  const labels = { '0': '미계획', 'P': '계획됨', 'D': '완료됨' };
  const current = btn.dataset.status || '0';
  const next = cycle[current] || '0';
  btn.dataset.status = next;
  btn.textContent = icons[next];
  btn.title = labels[next];
  const labelEl = btn.parentElement?.querySelector('.pm-edit-label');
  if (labelEl) labelEl.textContent = labels[next];

  // PM 계획 그리드(data-pm-plan-month)일 때만 state 즉시 반영 → 왼쪽 목록 배지 실시간 갱신
  const planMonth = btn.dataset.pmPlanMonth;
  if (planMonth && selectedPMPlanEquip) {
    let planRow = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMPlanEquip);
    if (!planRow) {
      planRow = { equip_code: selectedPMPlanEquip };
      state.pmPlans.push(planRow);
    }
    planRow[`m${planMonth}`] = next;
    renderPMPlanEquipList();
    renderPMOverviewTable();
  }
}

export async function saveAllPMResults() {
  if (!selectedPMEquip) { showToast('설비를 먼저 선택하세요.', 'warn'); return; }
  const year = $('pm-year-select')?.value || String(new Date().getFullYear());
  const saves = [];
  state.pmMasters.filter((r) => pick(r.equip_code) === selectedPMEquip).forEach((row) => {
    const id = Number(pick(row.id, row.pm_master_id, 0));
    const inputType = pick(row.input_type, row.pm_type, row.type, 'PASS_FAIL');
    const isPF = inputType === 'PASS_FAIL';
    for (let m = 1; m <= 12; m++) {
      const valEl = document.getElementById(`pmr-val-${id}-${m}`);
      if (!valEl) continue;
      const val = valEl.value?.trim() || '';
      if (!val) continue;
      const memo = $('pm-remark')?.value?.trim() || '';
      const checkMonth = `${year}-${String(m).padStart(2, '0')}`;
      saves.push({ id, row, inputType, isPF, val, memo, checkMonth, m, valEl });
    }
  });
  // 특이사항 미입력 월 검증
  if (saves.some((s) => !s.memo)) {
    showToast('점검 특이사항을 입력하세요. (필수)', 'warn');
    $('pm-remark')?.focus();
    return;
  }
  if (!saves.length) { showToast('입력된 실적이 없습니다.', 'warn'); return; }
  try {
    await Promise.all(saves.map(({ id, row, inputType, isPF, val, memo, checkMonth }) =>
      apiFirst(['pm/checklist/submit'], { method: 'POST', body: JSON.stringify({
        pm_master_id: id,
        equip_code: selectedPMEquip,
        item_name: pick(row.item_name, row.check_item, ''),
        input_type: inputType,
        pass_fail: isPF ? val : '',
        value_num: isPF ? '' : Number(val),
        memo,
        check_month: checkMonth,
      }) })
    ));
    saves.forEach(({ valEl }) => { if (valEl) valEl.value = ''; });
    if ($('pm-session-memo')) $('pm-session-memo').value = '';
    await loadPMResultsForEquip(selectedPMEquip);
    // Auto P→D for all saved months
    const planRow = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMEquip);
    const savedMonths = [...new Set(saves.map((s) => s.m))];
    let didUpdate = false;
    if (planRow) {
      savedMonths.forEach((m) => { if (planRow[`m${m}`] === 'P') { planRow[`m${m}`] = 'D'; didUpdate = true; } });
    }
    if (didUpdate && planRow) {
      const planPayload = { equip_code: selectedPMEquip, plan_year: $('pm-year-select').value };
      for (let m = 1; m <= 12; m++) {
        planPayload[`m${m}`] = planRow[`m${m}`] || '0';
        planPayload[`m${m}_date`] = planRow[`m${m}_date`] || null;
      }
      await apiFirst(['pm/upsert-plan'], { method: 'POST', body: JSON.stringify(planPayload) });
      showToast('✅ 전체 저장 완료 — 계획됨→완료됨 업데이트');
      await loadPMPlan();
    } else {
      showToast('✅ 전체 저장 완료');
    }
  } catch (error) { showToast(`저장 실패: ${error.message}`, 'error'); }
}

export function cyclePMOverviewCell(code, month, el, event) {
  if (event) event.stopPropagation();
  const cycle = { '0': 'P', 'P': 'D', 'D': '0' };
  const icons = { '0': '⚪', 'P': '📅', 'D': '✅' };
  const current = el.dataset.status || '0';
  const next = cycle[current] || '0';
  el.dataset.status = next;
  let planRow = state.pmPlans.find((r) => pick(r.equip_code) === code);
  if (!planRow) { planRow = { equip_code: code }; state.pmPlans.push(planRow); }
  planRow[`m${month}`] = next;
  if (next === 'P') {
    const today = new Date().toISOString().slice(0, 10);
    planRow[`m${month}_date`] = today;
    const short = today.slice(5).replace('-', '/');
    el.innerHTML = `📅<div style="font-size:9px;opacity:0.85;line-height:1.3;margin-top:1px">${short}</div>`;
    openPMPlanSlideover(code);
  } else {
    el.textContent = icons[next];
    planRow[`m${month}_date`] = null;
    // 슬라이드오버 열려있으면 갱신
    const panel = $('pm-plan-edit-slideover');
    if (panel && panel.style.transform === 'translateX(0px)') renderPMPlanSlideover(code);
  }
  if (selectedPMPlanEquip !== code) {
    selectedPMPlanEquip = code;
    selectedPMEquip = code;
    document.querySelectorAll('#pm-overview-table tr[data-equip-code]').forEach((tr) => {
      const isThis = tr.dataset.equipCode === code;
      tr.style.background = isThis ? 'var(--primary)' : '';
      tr.style.color = isThis ? '#fff' : '';
    });
    const saveBtn = $('pm-plan-save-btn');
    const masterLabel = $('pm-master-selected-label');
    const addBtn = $('pm-master-add-btn');
    const saveAllBtn = $('pm-master-save-all-btn');
    if (saveBtn) saveBtn.style.display = '';
    if (addBtn) addBtn.style.display = '';
    if (saveAllBtn) saveAllBtn.style.display = '';
    if (masterLabel) {
      const row = state.equipment.find((r) => pick(r.equip_code, r.code) === code);
      masterLabel.textContent = `${code} — ${pick(row?.equip_name, row?.name, '')}`;
      masterLabel.style.color = 'var(--text)';
    }
    renderPMMasterTable();
  }
}

export function openPMEdit(id) {
  const row = state.pmPlans.find((item) => pick(item.equip_code) === String(id));
  if (!row) return;
  state.pmEditTarget = row;
  $('pm-edit-title').textContent = `정기점검 계획 수정 - ${pick(row.equip_code)}`;
  $('pm-edit-info').innerHTML = `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;font-size:13px"><div><strong>설비코드</strong><div>${escapeHtml(pick(row.equip_code))}</div></div><div><strong>설비명</strong><div>${escapeHtml(pick(row.equip_name))}</div></div><div><strong>설치소</strong><div>${escapeHtml(pick(row.location, '-'))}</div></div><div><strong>평가등급</strong><div>${escapeHtml(pick(row.eval_grade, '-'))}</div></div></div>`;
  const icons = { '0': '⚪', 'P': '📅', 'D': '✅' };
  const labels = { '0': '미계획', 'P': '계획됨', 'D': '완료됨' };
  $('pm-month-grid').innerHTML = Array.from({ length: 12 }, (_, i) => {
    const val = row[`m${i + 1}`] || '0';
    const icon = icons[val] || '⚪';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2)">
      <span style="font-size:12px;font-weight:600">${i + 1}월</span>
      <button class="pm-status-btn" data-pm-edit-month="${i + 1}" data-status="${escapeHtml(val)}" onclick="cyclePMStatus(this)" title="${labels[val] || ''}" style="background:none;border:none;cursor:pointer;font-size:22px;padding:4px">${icon}</button>
      <span class="pm-edit-label" style="font-size:10px;color:var(--text3)">${labels[val] || '미계획'}</span>
    </div>`;
  }).join('');
  openModal('modal-pm-edit');
}

export async function savePMEditSingle() {
  if (!state.pmEditTarget) return;
  const payload = { equip_code: pick(state.pmEditTarget.equip_code), plan_year: $('pm-year-select').value };
  document.querySelectorAll('[data-pm-edit-month]').forEach((el) => {
    payload[`m${el.dataset.pmEditMonth}`] = el.dataset.status || '0';
  });
  try {
    await api('pm/upsert-plan', { method: 'POST', body: JSON.stringify(payload) });
    closeModal('modal-pm-edit');
    await loadPMPlan();
  } catch (error) { alert(`정기점검 계획 저장 실패: ${error.message}`); }
}

export async function savePMPlans() {
  const updates = {};
  document.querySelectorAll('#pm-tbody .pm-status-btn').forEach((el) => {
    const id = el.dataset.equipCode;
    if (!updates[id]) updates[id] = { equip_code: id, plan_year: $('pm-year-select').value };
    updates[id][`m${el.dataset.month}`] = el.dataset.status || '0';
  });
  try {
    await Promise.all(Object.values(updates).map((payload) => api('pm/upsert-plan', { method: 'POST', body: JSON.stringify(payload) })));
    alert('정기점검 계획 저장 완료');
  } catch (error) { alert(`일괄 저장 실패: ${error.message}`); }
}

export async function loadPMResultsForEquip(code) {
  try {
    const response = await apiFirst([`pm/result/list?equip_code=${encodeURIComponent(code)}`]);
    const rows = getRows(response);
    pmResultsMap = {};
    rows.forEach((row) => {
      const mid = Number(pick(row.pm_master_id, 0));
      if (!pmResultsMap[mid]) pmResultsMap[mid] = [];
      pmResultsMap[mid].push(row);
    });
    renderPMMasterTable();
    renderChecksheetHistory();
  } catch (_) {
    pmResultsMap = {};
  }
}

export function openPMResultHistory(pmMasterId, itemName) {
  const panel = $('pm-result-slideover');
  if (!panel) return;
  $('pm-result-slide-title').textContent = `실적 이력 — ${itemName}`;
  const results = pmResultsMap[pmMasterId] || [];
  const body = $('pm-result-slide-body');
  if (!results.length) {
    body.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px;font-size:13px">실적 이력이 없습니다.</div>';
  } else {
    body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead style="position:sticky;top:0;background:var(--surface2)">
        <tr>
          <th style="padding:8px 10px;border-bottom:2px solid var(--border);text-align:left">점검월</th>
          <th style="padding:8px 10px;border-bottom:2px solid var(--border);text-align:left">결과</th>
          <th style="padding:8px 10px;border-bottom:2px solid var(--border);text-align:left">담당자</th>
          <th style="padding:8px 10px;border-bottom:2px solid var(--border);text-align:left">점검일</th>
          <th style="padding:8px 10px;border-bottom:2px solid var(--border);text-align:left">메모</th>
        </tr>
      </thead>
      <tbody>${results.map((r) => {
        const pf = String(r.pass_fail || '');
        const isPass = pf === 'O' || pf === 'P';
        const val = r.input_type === 'PASS_FAIL'
          ? (pf ? `<span style="font-weight:900;color:${isPass ? '#16a34a' : '#ef4444'}">${isPass ? 'O' : 'X'}</span>` : '—')
          : `<span style="font-weight:700">${r.value_num ?? '—'}</span>`;
        const checkMonth = String(r.check_month || '').slice(0, 7) || '—';
        const inspectDate = String(r.inspect_date || r.created_at || '').slice(0, 10);
        return `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:7px 10px;color:var(--text2);white-space:nowrap;font-weight:600">${checkMonth}</td>
          <td style="padding:7px 10px">${val}</td>
          <td style="padding:7px 10px;color:var(--text2);white-space:nowrap">${escapeHtml(r.inspector || '—')}</td>
          <td style="padding:7px 10px;color:var(--text3);font-size:11px;white-space:nowrap">${inspectDate}</td>
          <td style="padding:7px 10px;color:var(--text2);font-size:11px">${escapeHtml(r.memo || '—')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }
  panel.style.transform = 'translateX(0)';
}

export function renderChecksheetHistory() {
  const panel = $('pm-checksheet-history');
  const body = $('pm-checksheet-history-body');
  if (!panel || !body) return;

  // Gather all results across all items for selected equip, group by check_month
  const byMonth = {};
  Object.values(pmResultsMap).flat().forEach((r) => {
    const mo = String(r.check_month || '').slice(0, 7);
    if (!mo) return;
    if (!byMonth[mo]) byMonth[mo] = { inspector: r.inspector || '', inspect_date: r.inspect_date || '', items: [] };
    byMonth[mo].items.push(r);
    // Update inspector/date from latest entry (preferring non-empty)
    if (r.inspector) byMonth[mo].inspector = r.inspector;
    if (r.inspect_date) byMonth[mo].inspect_date = r.inspect_date;
  });

  const months = Object.keys(byMonth).sort().reverse();
  if ($('pm-history-count')) $('pm-history-count').textContent = `총 ${months.length}회`;

  if (!months.length) {
    body.innerHTML = '<div style="text-align:center;color:var(--text3);padding:24px;font-size:12px">점검 이력이 없습니다.</div>';
    return;
  }

  body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead style="position:sticky;top:0;background:var(--surface2)">
      <tr>
        <th style="padding:7px 10px;text-align:left;font-size:11px">점검월</th>
        <th style="padding:7px 10px;text-align:left;font-size:11px">담당자</th>
        <th style="padding:7px 10px;text-align:left;font-size:11px">점검일</th>
        <th style="padding:7px 10px;text-align:center;font-size:11px">항목수</th>
        <th style="padding:7px 10px;text-align:center;font-size:11px"></th>
      </tr>
    </thead>
    <tbody>${months.map((mo) => {
      const g = byMonth[mo];
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 10px;font-weight:700;color:var(--primary)">${mo}</td>
        <td style="padding:8px 10px;color:var(--text2)">${escapeHtml(g.inspector || '—')}</td>
        <td style="padding:8px 10px;color:var(--text3);font-size:11px">${String(g.inspect_date || '').slice(0, 10) || '—'}</td>
        <td style="padding:8px 10px;text-align:center">${g.items.length}</td>
        <td style="padding:8px 10px;text-align:center">
          <button class="btn btn-sm btn-secondary" onclick="openChecksheetMonthDetail('${mo}')">상세보기</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

export function toggleChecksheetHistory() {
  const panel = $('pm-checksheet-history');
  if (!panel) return;
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : '';
  const btn = $('pm-history-btn');
  if (btn) btn.style.background = isVisible ? '#546e7a' : 'var(--primary)';
}

export function openChecksheetMonthDetail(checkMonth) {
  // Open the result slideover filtered to a specific check_month
  const panel = $('pm-result-slideover');
  if (!panel) return;
  $('pm-result-slide-title').textContent = `점검 상세 — ${checkMonth}`;
  const allResults = Object.values(pmResultsMap).flat().filter((r) => String(r.check_month || '').slice(0, 7) === checkMonth);
  const body = $('pm-result-slide-body');
  if (!allResults.length) {
    body.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px;font-size:13px">이력이 없습니다.</div>';
  } else {
    const inspector = allResults.find((r) => r.inspector)?.inspector || '—';
    const inspectDate = allResults.find((r) => r.inspect_date)?.inspect_date || '—';
    body.innerHTML = `<div style="padding:10px 14px;background:var(--surface2);margin-bottom:12px;border-radius:6px;font-size:12px;display:flex;gap:20px">
      <span>담당자: <strong>${escapeHtml(inspector)}</strong></span>
      <span>점검일: <strong>${String(inspectDate).slice(0, 10)}</strong></span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead style="position:sticky;top:0;background:var(--surface2)">
        <tr>
          <th style="padding:7px 10px;text-align:left">점검 부위</th>
          <th style="padding:7px 10px;text-align:left">점검 항목</th>
          <th style="padding:7px 10px;text-align:center">결과</th>
          <th style="padding:7px 10px;text-align:left">메모</th>
        </tr>
      </thead>
      <tbody>${allResults.map((r) => {
        const pf = String(r.pass_fail || '');
        const isPass = pf === 'O' || pf === 'P';
        const val = r.input_type === 'PASS_FAIL'
          ? `<span style="font-weight:900;font-size:14px;color:${isPass ? '#16a34a' : '#ef4444'}">${isPass ? 'O' : 'X'}</span>`
          : `<span style="font-weight:700">${r.value_num ?? '—'}</span>`;
        return `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:7px 10px;color:var(--text2)">${escapeHtml(r.part_name || '—')}</td>
          <td style="padding:7px 10px;font-weight:600">${escapeHtml(r.item_name || '—')}</td>
          <td style="padding:7px 10px;text-align:center">${val}</td>
          <td style="padding:7px 10px;color:var(--text2);font-size:11px">${escapeHtml(r.memo || '—')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }
  panel.style.transform = 'translateX(0)';
}

export function closePMResultHistory() {
  const panel = $('pm-result-slideover');
  if (panel) panel.style.transform = 'translateX(100%)';
}

export function setPMPlanDate(code, month, dateVal, el) {
  let planRow = state.pmPlans.find((r) => pick(r.equip_code) === code);
  if (!planRow) { planRow = { equip_code: code }; state.pmPlans.push(planRow); }
  planRow[`m${month}_date`] = dateVal || null;
  const shortDate = dateVal ? dateVal.slice(5).replace('-', '/') : '';
  el.innerHTML = shortDate
    ? `📅<div style="font-size:9px;opacity:0.85;line-height:1.3;margin-top:1px">${shortDate}</div>`
    : '📅';
}

// ── PM 계획 날짜 편집 슬라이드오버 (B안) ─────────────────────────────
function renderPMPlanSlideover(code) {
  const body = $('pm-plan-slide-body');
  const titleEl = $('pm-plan-slide-title');
  const yearEl = $('pm-plan-slide-year');
  if (!body) return;
  const year = $('pm-year-select')?.value || String(new Date().getFullYear());
  const equip = state.equipment.find((r) => pick(r.equip_code, r.code) === code);
  if (titleEl) titleEl.textContent = `${code} — ${pick(equip?.equip_name, equip?.name, '')}`;
  if (yearEl) yearEl.textContent = `${year}년 계획`;
  const planRow = state.pmPlans.find((r) => pick(r.equip_code) === code);
  const icons = { '0': '⚪', 'P': '📅', 'D': '✅' };
  const labels = { '0': '미계획', 'P': '계획됨', 'D': '완료됨' };
  body.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const status = planRow?.[`m${m}`] || '0';
    const dateVal = planRow?.[`m${m}_date`] || '';
    const color = status === 'P' ? '#1976d2' : status === 'D' ? '#388e3c' : 'var(--text3)';
    const dayVal = dateVal ? String(parseInt(dateVal.slice(8), 10)) : '';
    const mm = String(m).padStart(2, '0');
    const dateInput = status === 'P'
      ? `<div style="display:flex;align-items:center;gap:3px">
           <span style="font-size:11px;color:var(--text3)">${year}.${mm}.</span>
           <input type="number" id="ps-day-${m}" value="${escapeHtml(dayVal)}" min="1" max="31" placeholder="일"
                  style="width:48px;padding:2px 4px;font-size:12px;border:1px solid var(--border);border-radius:4px;text-align:center" />
           <span style="font-size:11px;color:var(--text3)">일</span>
         </div>`
      : `<span style="font-size:11px;color:var(--text3)">${dateVal ? dateVal.slice(5).replace('-', '/') : '—'}</span>`;
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:16px">${icons[status] || '⚪'}</span>
      <span style="font-weight:700;font-size:13px;width:28px;flex-shrink:0;color:${color}">${m}월</span>
      <span style="font-size:10px;color:${color};width:44px;flex-shrink:0">${labels[status] || '미계획'}</span>
      ${dateInput}
    </div>`;
  }).join('');
}

export function openPMPlanSlideover(code) {
  if (!code) return;
  renderPMPlanSlideover(code);
  const panel = $('pm-plan-edit-slideover');
  if (panel) panel.style.transform = 'translateX(0)';
}

export function closePMPlanSlideover() {
  const panel = $('pm-plan-edit-slideover');
  if (panel) panel.style.transform = 'translateX(100%)';
}

export function setPMPlanDateFromSlide(month, dateVal) {
  if (!selectedPMPlanEquip) return;
  let planRow = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMPlanEquip);
  if (!planRow) { planRow = { equip_code: selectedPMPlanEquip }; state.pmPlans.push(planRow); }
  planRow[`m${month}_date`] = dateVal || null;
  // 개요 테이블 셀 날짜 표시 갱신
  const tr = document.querySelector(`#pm-overview-table tr[data-equip-code="${CSS.escape(selectedPMPlanEquip)}"]`);
  if (tr) {
    const cells = tr.querySelectorAll('td[data-status]');
    const cell = cells[month - 1];
    if (cell && cell.dataset.status === 'P') {
      const short = dateVal ? dateVal.slice(5).replace('-', '/') : '';
      cell.innerHTML = short
        ? `📅<div style="font-size:9px;opacity:0.85;line-height:1.3;margin-top:1px">${short}</div>`
        : '📅';
    }
  }
}

export async function savePMPlanFromSlideover() {
  if (!selectedPMPlanEquip) { showToast('설비가 선택되지 않았습니다.', 'warn'); return; }
  const year = $('pm-year-select')?.value || String(new Date().getFullYear());
  let planRow = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMPlanEquip);
  if (!planRow) { planRow = { equip_code: selectedPMPlanEquip }; state.pmPlans.push(planRow); }
  // DOM에서 일 숫자 읽어 날짜 구성 (저장 버튼 누를 때 최신값 반영)
  for (let m = 1; m <= 12; m++) {
    const dayEl = document.getElementById(`ps-day-${m}`);
    if (dayEl && dayEl.value.trim()) {
      const dd = String(dayEl.value.trim()).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      planRow[`m${m}_date`] = `${year}-${mm}-${dd}`;
    }
  }
  const payload = { equip_code: selectedPMPlanEquip, plan_year: year };
  for (let m = 1; m <= 12; m++) {
    payload[`m${m}`] = planRow[`m${m}`] || '0';
    payload[`m${m}_date`] = planRow[`m${m}_date`] || null;
  }
  try {
    await apiFirst(['pm/upsert-plan'], { method: 'POST', body: JSON.stringify(payload) });
    showToast('✅ PM 계획 저장 완료');
    closePMPlanSlideover();
    await loadPMPlan();
  } catch (error) { showToast(`저장 실패: ${error.message}`, 'error'); }
}

// ── PM 점검 체크시트 모달 ──────────────────────────────────────────
export function openPMChecksheet() {
  if (!selectedPMEquip) { showToast('설비를 먼저 선택하세요.', 'warn'); return; }
  const year = $('pm-year-select')?.value || String(new Date().getFullYear());
  const equip = state.equipment.find((r) => pick(r.equip_code, r.code) === selectedPMEquip);
  const equipLabel = `${selectedPMEquip} — ${pick(equip?.equip_name, equip?.name, '')}`;
  if ($('pmc-equip-label')) $('pmc-equip-label').textContent = equipLabel;
  if ($('pmc-title')) $('pmc-title').textContent = `📋 PM 점검 체크시트 — ${selectedPMEquip}`;
  // 점검월 select: P 또는 D 상태인 달만
  const planRow = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMEquip);
  const monthSel = $('pmc-month');
  if (monthSel) {
    monthSel.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
      const status = planRow?.[`m${m}`] || '0';
      if (status === 'P' || status === 'D') {
        const opt = document.createElement('option');
        opt.value = `${year}-${String(m).padStart(2, '0')}`;
        opt.textContent = `${m}월 ${status === 'D' ? '(완료됨)' : '(계획됨)'}`;
        monthSel.appendChild(opt);
      }
    }
    if (!monthSel.options.length) {
      const opt = document.createElement('option'); opt.value = ''; opt.textContent = '계획된 달 없음';
      monthSel.appendChild(opt);
    }
  }
  // 오늘 날짜 기본값
  if ($('pmc-date')) $('pmc-date').value = new Date().toISOString().slice(0, 10);
  if ($('pmc-inspector')) $('pmc-inspector').value = '';
  if ($('pmc-memo')) $('pmc-memo').value = $('pm-remark')?.value || '';
  if ($('pmc-status')) $('pmc-status').textContent = '';
  // 점검항목 테이블 렌더
  const items = state.pmMasters.filter((r) => pick(r.equip_code) === selectedPMEquip);
  const tbody = $('pmc-tbody');
  if (tbody) {
    tbody.innerHTML = items.map((row, idx) => {
      const id = Number(pick(row.id, row.pm_master_id, 0));
      const inputType = pick(row.input_type, row.pm_type, 'PASS_FAIL');
      const isPF = inputType === 'PASS_FAIL';
      const criteriaPhoto = pick(row.criteria_photo, '');
      const criteriaPhotoHtml = criteriaPhoto
        ? ` <a href="${escapeHtml(criteriaPhoto)}" target="_blank" title="기준사진 보기" style="font-size:12px">🖼</a>`
        : '';
      const inputEl = isPF
        ? `<select id="pmc-val-${id}" style="width:80px;padding:3px;font-size:12px;border:1px solid var(--border);border-radius:4px"><option value="">-</option><option value="O">O (합격)</option><option value="X">X (불합격)</option></select>`
        : `<input type="number" id="pmc-val-${id}" placeholder="수치" style="width:80px;padding:3px 4px;font-size:12px;border:1px solid var(--border);border-radius:4px">`;
      return `<tr>
        <td style="text-align:center;font-size:11px;color:var(--text3)">${idx + 1}</td>
        <td style="font-size:12px;padding:6px 8px">${escapeHtml(pick(row.part_name, row.part, '-'))}</td>
        <td style="font-size:12px;font-weight:600;padding:6px 8px">${escapeHtml(pick(row.item_name, row.check_item, '-'))}${criteriaPhotoHtml}</td>
        <td style="font-size:11px;color:var(--text2);padding:6px 8px">${escapeHtml(pick(row.criteria, '-'))}</td>
        <td style="text-align:center;font-size:11px">${inputType === 'PASS_FAIL' ? 'O/X' : '수치'}</td>
        <td style="text-align:center;padding:4px">${inputEl}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">등록된 점검항목이 없습니다.</td></tr>';
  }
  openModal('modal-pm-checksheet');
}

export async function savePMChecksheet() {
  if (!selectedPMEquip) return;
  const checkMonth = $('pmc-month')?.value;
  const inspector = $('pmc-inspector')?.value.trim() || '';
  const inspectDate = $('pmc-date')?.value || null;
  const memo = $('pmc-memo')?.value.trim() || '';
  if (!checkMonth) { showToast('점검월을 선택하세요.', 'warn'); return; }
  if (!inspector) { showToast('담당자를 입력하세요.', 'warn'); $('pmc-inspector')?.focus(); return; }
  const year = $('pm-year-select')?.value || String(new Date().getFullYear());
  const items = state.pmMasters.filter((r) => pick(r.equip_code) === selectedPMEquip);
  const saves = [];
  items.forEach((row) => {
    const id = Number(pick(row.id, row.pm_master_id, 0));
    const inputType = pick(row.input_type, row.pm_type, 'PASS_FAIL');
    const isPF = inputType === 'PASS_FAIL';
    const valEl = document.getElementById(`pmc-val-${id}`);
    const val = valEl?.value?.trim() || '';
    if (!val) return;
    saves.push({
      pm_master_id: id,
      equip_code: selectedPMEquip,
      item_name: pick(row.item_name, row.check_item, ''),
      input_type: inputType,
      pass_fail: isPF ? val : '',
      value_num: isPF ? '' : Number(val),
      memo,
      check_month: checkMonth,
      inspector,
      inspect_date: inspectDate || null,
    });
  });
  if (!saves.length) { showToast('입력된 결과가 없습니다.', 'warn'); return; }
  if ($('pmc-status')) $('pmc-status').textContent = `저장 중... (${saves.length}건)`;
  try {
    await Promise.all(saves.map((payload) => apiFirst(['pm/checklist/submit'], { method: 'POST', body: JSON.stringify(payload) })));
    // Auto P→D
    const planRow = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMEquip);
    const m = Number(checkMonth.slice(5, 7));
    if (planRow && planRow[`m${m}`] === 'P') {
      planRow[`m${m}`] = 'D';
      const planPayload = { equip_code: selectedPMEquip, plan_year: year };
      for (let mi = 1; mi <= 12; mi++) { planPayload[`m${mi}`] = planRow[`m${mi}`] || '0'; planPayload[`m${mi}_date`] = planRow[`m${mi}_date`] || null; }
      await apiFirst(['pm/upsert-plan'], { method: 'POST', body: JSON.stringify(planPayload) });
    }
    closeModal('modal-pm-checksheet');
    await loadPMResultsForEquip(selectedPMEquip);
    await loadPMPlan();
    if ($('pm-remark') && memo) $('pm-remark').value = memo;
    showToast(`✅ ${saves.length}건 점검 기록 저장 완료`);
  } catch (error) {
    if ($('pmc-status')) $('pmc-status').textContent = `저장 실패: ${error.message}`;
  }
}

// ── PM 실적 입력 슬라이드오버 (B안) ──────────────────────────────────
export function openPMResultEntry(pmMasterId, inputType, monthKey, itemName) {
  const panel = $('pm-result-entry-slideover');
  if (!panel) return;
  const m = Number(monthKey.slice(5, 7));
  if ($('pre-slide-title')) $('pre-slide-title').textContent = itemName;
  if ($('pre-slide-month')) $('pre-slide-month').textContent = `${m}월 점검 실적 입력`;
  if ($('pre-slide-master-id')) $('pre-slide-master-id').value = pmMasterId;
  if ($('pre-slide-input-type')) $('pre-slide-input-type').value = inputType;
  if ($('pre-slide-month-key')) $('pre-slide-month-key').value = monthKey;
  // 공통 특이사항 프리필
  if ($('pre-slide-memo')) $('pre-slide-memo').value = $('pm-session-memo')?.value?.trim() || '';
  const inputArea = $('pre-slide-input-area');
  if (inputArea) {
    if (inputType === 'PASS_FAIL') {
      inputArea.innerHTML = `<div style="margin-bottom:4px;font-size:12px;font-weight:700;color:var(--text2)">점검 결과</div>
        <div style="display:flex;gap:12px;justify-content:center;margin:12px 0" id="pre-pf-btns">
          <button id="pre-btn-pass" onclick="setPMEntryResult('P')" style="font-size:32px;padding:14px 28px;border:2px solid var(--border);border-radius:12px;background:var(--surface2);cursor:pointer;transition:all 0.15s">⭕</button>
          <button id="pre-btn-fail" onclick="setPMEntryResult('F')" style="font-size:32px;padding:14px 28px;border:2px solid var(--border);border-radius:12px;background:var(--surface2);cursor:pointer;transition:all 0.15s">❌</button>
        </div>
        <input type="hidden" id="pre-slide-val" value="" />`;
    } else {
      inputArea.innerHTML = `<div style="margin-bottom:4px;font-size:12px;font-weight:700;color:var(--text2)">측정값</div>
        <input type="number" id="pre-slide-val" class="form-control" placeholder="수치 입력" style="font-size:18px;text-align:center;padding:10px" />`;
    }
  }
  panel.style.transform = 'translateX(0)';
}

export function setPMEntryResult(val) {
  const hidden = $('pre-slide-val');
  if (hidden) hidden.value = val;
  const passBtn = $('pre-btn-pass');
  const failBtn = $('pre-btn-fail');
  if (passBtn) { passBtn.style.borderColor = val === 'P' ? '#388e3c' : 'var(--border)'; passBtn.style.background = val === 'P' ? '#e8f5e9' : 'var(--surface2)'; }
  if (failBtn) { failBtn.style.borderColor = val === 'F' ? '#d32f2f' : 'var(--border)'; failBtn.style.background = val === 'F' ? '#ffebee' : 'var(--surface2)'; }
}

export function closePMResultEntry() {
  const panel = $('pm-result-entry-slideover');
  if (panel) panel.style.transform = 'translateX(100%)';
}

export async function savePMResultEntry() {
  const pmMasterId = Number($('pre-slide-master-id')?.value || 0);
  const inputType = $('pre-slide-input-type')?.value || 'PASS_FAIL';
  const checkMonth = $('pre-slide-month-key')?.value || '';
  const val = $('pre-slide-val')?.value?.trim() || '';
  const memo = $('pre-slide-memo')?.value?.trim() || '';
  if (!selectedPMEquip) { showToast('설비를 먼저 선택하세요.', 'warn'); return; }
  if (!val) { showToast('점검 결과를 입력하세요.', 'warn'); return; }
  if (!memo) { showToast('점검 특이사항을 입력하세요. (필수)', 'warn'); $('pre-slide-memo')?.focus(); return; }
  const m = Number(checkMonth.slice(5, 7));
  const isPF = inputType === 'PASS_FAIL';
  const row = state.pmMasters.find((r) => Number(pick(r.id, r.pm_master_id, 0)) === pmMasterId);
  try {
    await apiFirst(['pm/checklist/submit'], { method: 'POST', body: JSON.stringify({
      pm_master_id: pmMasterId,
      equip_code: selectedPMEquip,
      item_name: pick(row?.item_name, row?.check_item, ''),
      input_type: inputType,
      pass_fail: isPF ? val : null,
      value_num: isPF ? null : Number(val),
      memo,
      check_month: checkMonth,
    }) });
    // 공통 특이사항도 동기화
    if ($('pm-session-memo') && !$('pm-session-memo').value) $('pm-session-memo').value = memo;
    closePMResultEntry();
    await loadPMResultsForEquip(selectedPMEquip);
    const planRow = state.pmPlans.find((r) => pick(r.equip_code) === selectedPMEquip);
    if (planRow && planRow[`m${m}`] === 'P') {
      planRow[`m${m}`] = 'D';
      const planPayload = { equip_code: selectedPMEquip, plan_year: $('pm-year-select').value };
      for (let mi = 1; mi <= 12; mi++) {
        planPayload[`m${mi}`] = planRow[`m${mi}`] || '0';
        planPayload[`m${mi}_date`] = planRow[`m${mi}_date`] || null;
      }
      await apiFirst(['pm/upsert-plan'], { method: 'POST', body: JSON.stringify(planPayload) });
      showToast(`✅ 실적 저장 완료 — ${m}월 계획됨→완료됨`);
      await loadPMPlan();
    } else {
      showToast('✅ 실적 저장 완료');
    }
  } catch (error) { showToast(`실적 저장 실패: ${error.message}`, 'error'); }
}

// ── PM 항목관리 모달 ──────────────────────────────────────────────────
export function openPMItemsModal() {
  if (!selectedPMEquip) { showToast('설비를 먼저 선택하세요.', 'warn'); return; }
  const equip = state.equipment.find((r) => pick(r.equip_code, r.code) === selectedPMEquip);
  if ($('pmi-title')) $('pmi-title').textContent = `📋 항목관리 — ${selectedPMEquip} ${pick(equip?.equip_name, equip?.name, '')}`;
  if ($('pmi-new-part')) $('pmi-new-part').value = '';
  if ($('pmi-new-item')) $('pmi-new-item').value = '';
  if ($('pmi-new-criteria')) $('pmi-new-criteria').value = '';
  if ($('pmi-new-type')) $('pmi-new-type').value = 'PASS_FAIL';
  if ($('pmi-new-photo-url')) $('pmi-new-photo-url').value = '';
  if ($('pmi-add-status')) $('pmi-add-status').textContent = '';
  renderPMItemsTable();
  openModal('modal-pm-items');
}

export function renderPMItemsTable() {
  const tbody = $('pmi-tbody');
  if (!tbody) return;
  const INPUT_TYPE_LABELS = { 'PASS_FAIL': 'O/X', 'NUMBER': '수치' };
  const rows = state.pmMasters.filter((row) => !selectedPMEquip || pick(row.equip_code) === selectedPMEquip);
  if ($('pmi-count')) $('pmi-count').textContent = `총 ${rows.length}개`;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">${selectedPMEquip ? '등록된 점검항목이 없습니다.' : '설비를 선택하세요.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((row, idx) => {
    const id = Number(pick(row.id, row.pm_master_id, 0));
    const inputType = pick(row.input_type, row.pm_type, row.type, 'PASS_FAIL');
    const photoUrl = pick(row.criteria_photo, '');
    const photoCell = photoUrl
      ? `<div style="position:relative;display:inline-block">
           <a href="${escapeHtml(photoUrl)}" target="_blank" title="기준사진 보기">
             <img src="${escapeHtml(photoUrl)}" style="width:40px;height:32px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">
           </a>
           <button onclick="removePMItemPhoto(${id})" title="사진 삭제" style="position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:#ef4444;color:#fff;border:none;cursor:pointer;font-size:9px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center">✕</button>
         </div>`
      : `<label style="cursor:pointer;font-size:10px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface2)" title="사진 등록">
           📷<input type="file" accept="image/*" style="display:none" onchange="uploadAndUpdateItemPhoto(this,${id})">
         </label>`;
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="text-align:center;color:var(--text3);font-size:11px;padding:6px">${idx + 1}</td>
      <td style="padding:6px 10px;font-size:12px">${escapeHtml(pick(row.part_name, row.part, '—'))}</td>
      <td style="padding:6px 10px;font-size:12px;font-weight:600">${escapeHtml(pick(row.item_name, row.check_item, ''))}</td>
      <td style="padding:6px 10px;font-size:11px;color:var(--text2)">${escapeHtml(pick(row.criteria, '—'))}</td>
      <td style="text-align:center;font-size:11px;padding:6px">${escapeHtml(INPUT_TYPE_LABELS[inputType] || inputType)}</td>
      <td style="text-align:center;padding:6px">${photoCell}</td>
      <td style="text-align:center;padding:4px;white-space:nowrap">
        <div style="display:flex;gap:4px;justify-content:center">
          <button class="btn btn-sm btn-secondary" onclick="editPMMasterItem(${id})">수정</button>
          <button class="btn btn-sm btn-danger" onclick="deletePMItemInModal(${id})">삭제</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

export async function saveInlineItemModal() {
  if (!selectedPMEquip) { showToast('설비를 먼저 선택하세요.', 'warn'); return; }
  const item = $('pmi-new-item')?.value.trim();
  if (!item) { showToast('점검 항목명을 입력하세요.', 'warn'); $('pmi-new-item')?.focus(); return; }
  if ($('pmi-add-status')) $('pmi-add-status').textContent = '저장 중...';
  const payload = {
    equip_code: selectedPMEquip,
    part_name: $('pmi-new-part')?.value.trim() || '',
    input_type: $('pmi-new-type')?.value || 'PASS_FAIL',
    item_name: item,
    criteria: $('pmi-new-criteria')?.value.trim() || '',
    criteria_photo: $('pmi-new-photo-url')?.value.trim() || '',
    sort_order: 0,
  };
  try {
    await apiFirst(['pm/master/create'], { method: 'POST', body: JSON.stringify(payload) });
    ['pmi-new-part', 'pmi-new-item', 'pmi-new-criteria', 'pmi-new-photo-url'].forEach((id) => { if ($(id)) $(id).value = ''; });
    if ($('pmi-add-status')) $('pmi-add-status').textContent = '✅ 추가 완료';
    await loadPMMasterList();
  } catch (error) {
    if ($('pmi-add-status')) $('pmi-add-status').textContent = `실패: ${error.message}`;
  }
}

export async function deletePMItemInModal(id) {
  if (!confirm('점검 항목을 삭제하시겠습니까?')) return;
  try {
    await apiFirst(['pm/master/delete'], { method: 'POST', body: JSON.stringify({ id }) });
    await loadPMMasterList();
  } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
}

export async function uploadPMItemPhoto(input, targetId) {
  const file = input.files?.[0];
  if (!file) return;
  const statusEl = $('pm-master-photo-status') || $('pmi-add-status');
  if (statusEl) statusEl.textContent = '업로드 중...';
  try {
    const url = await uploadPhoto(file);
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.value = url || '';
    const preview = $('pm-master-photo-preview');
    if (preview && targetId === 'pm-master-photo-url') {
      preview.innerHTML = url ? `<img src="${escapeHtml(url)}" style="max-height:80px;border-radius:6px;border:1px solid var(--border)">` : '';
    }
    if ($('pm-master-photo-status')) $('pm-master-photo-status').textContent = url ? '✅ 업로드 완료' : '업로드 실패';
    else if ($('pmi-add-status')) $('pmi-add-status').textContent = url ? '✅ 사진 업로드 완료' : '업로드 실패';
  } catch (error) {
    if (statusEl) statusEl.textContent = `업로드 실패: ${error.message}`;
  }
}

export async function removePMItemPhoto(id) {
  if (!confirm('기준 사진을 삭제하시겠습니까?')) return;
  const row = state.pmMasters.find((r) => Number(pick(r.id, r.pm_master_id, 0)) === id);
  if (!row) return;
  try {
    await apiFirst(['pm/master/update'], { method: 'POST', body: JSON.stringify({
      id,
      equip_code: pick(row.equip_code),
      part_name: pick(row.part_name, row.part, ''),
      input_type: pick(row.input_type, 'PASS_FAIL'),
      item_name: pick(row.item_name, row.check_item, ''),
      criteria: pick(row.criteria, ''),
      criteria_photo: '',
      sort_order: row.sort_order || 0,
    }) });
    showToast('✅ 기준 사진 삭제 완료');
    await loadPMMasterList();
  } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
}

export async function uploadAndUpdateItemPhoto(input, id) {
  const file = input.files?.[0];
  if (!file) return;
  showToast('사진 업로드 중...');
  try {
    const url = await uploadPhoto(file);
    if (!url) { showToast('업로드 실패', 'error'); return; }
    const row = state.pmMasters.find((r) => Number(pick(r.id, r.pm_master_id, 0)) === id);
    if (!row) return;
    await apiFirst(['pm/master/update'], { method: 'POST', body: JSON.stringify({
      id,
      equip_code: pick(row.equip_code),
      part_name: pick(row.part_name, row.part, ''),
      input_type: pick(row.input_type, 'PASS_FAIL'),
      item_name: pick(row.item_name, row.check_item, ''),
      criteria: pick(row.criteria, ''),
      criteria_photo: url,
      sort_order: row.sort_order || 0,
    }) });
    showToast('✅ 기준 사진 등록 완료');
    await loadPMMasterList();
  } catch (error) { showToast(`사진 등록 실패: ${error.message}`, 'error'); }
}

export async function uploadPMChecksheetPhoto(input, masterId) {
  const file = input.files?.[0];
  if (!file) return;
  const prevEl = document.getElementById(`pmc-photo-prev-${masterId}`);
  if (prevEl) prevEl.textContent = '업로드 중...';
  try {
    const url = await uploadPhoto(file);
    const hiddenEl = document.getElementById(`pmc-photo-${masterId}`);
    if (hiddenEl) hiddenEl.value = url || '';
    if (prevEl) prevEl.innerHTML = url ? `<img src="${escapeHtml(url)}" style="max-height:40px;border-radius:4px;border:1px solid var(--border)">` : '';
  } catch (error) {
    if (prevEl) prevEl.textContent = `실패: ${error.message}`;
  }
}

// ── PM 실적 수정/삭제 ─────────────────────────────────────────────────
export function openPMResultEdit(resultId) {
  // pmResultsMap에서 해당 레코드 찾기
  const allResults = Object.values(pmResultsMap).flat();
  const r = allResults.find((row) => Number(pick(row.id, row.result_id, 0)) === resultId);
  if (!r) { showToast('기록을 찾을 수 없습니다.', 'warn'); return; }
  if ($('pmre-id')) $('pmre-id').value = resultId;
  if ($('pmre-input-type')) $('pmre-input-type').value = r.input_type || 'PASS_FAIL';
  if ($('pmre-title')) $('pmre-title').textContent = `📝 점검 기록 수정 — ${String(r.check_month || '').slice(0, 7)}`;
  if ($('pmre-item-label')) $('pmre-item-label').textContent = `${escapeHtml(r.part_name || '')} / ${escapeHtml(r.item_name || '')}`;
  if ($('pmre-inspector')) $('pmre-inspector').value = r.inspector || '';
  if ($('pmre-date')) $('pmre-date').value = String(r.inspect_date || '').slice(0, 10);
  if ($('pmre-memo')) $('pmre-memo').value = r.memo || '';
  if ($('pmre-status')) $('pmre-status').textContent = '';
  const isPF = (r.input_type || 'PASS_FAIL') === 'PASS_FAIL';
  if ($('pmre-pf-group')) $('pmre-pf-group').style.display = isPF ? '' : 'none';
  if ($('pmre-num-group')) $('pmre-num-group').style.display = isPF ? 'none' : '';
  if (isPF) {
    const pf = String(r.pass_fail || '');
    ensureSelectValue('pmre-pass-fail', pf === 'P' ? 'O' : pf, '-');
  } else {
    if ($('pmre-value-num')) $('pmre-value-num').value = r.value_num ?? '';
  }
  openModal('modal-pm-result-edit');
}

export async function savePMResultEdit() {
  const id = Number($('pmre-id')?.value || 0);
  if (!id) return;
  const inputType = $('pmre-input-type')?.value || 'PASS_FAIL';
  const isPF = inputType === 'PASS_FAIL';
  const payload = {
    id,
    pass_fail: isPF ? ($('pmre-pass-fail')?.value || '') : '',
    value_num: isPF ? '' : (Number($('pmre-value-num')?.value) || ''),
    memo: $('pmre-memo')?.value.trim() || '',
    inspector: $('pmre-inspector')?.value.trim() || '',
    inspect_date: $('pmre-date')?.value || null,
    photo_url: '',
  };
  if ($('pmre-status')) $('pmre-status').textContent = '저장 중...';
  try {
    await apiFirst(['pm/result/update'], { method: 'POST', body: JSON.stringify(payload) });
    closeModal('modal-pm-result-edit');
    await loadPMResultsForEquip(selectedPMEquip);
    // 이력 상세뷰 현재 달 새로고침
    const detailView = $('pmh-detail-view');
    if (detailView && detailView.style.display !== 'none') {
      const titleEl = $('pmh-title');
      const mo = titleEl?.textContent?.match(/\d{4}-\d{2}/)?.[0];
      if (mo) openPMHistoryDetail(mo);
    }
    showToast('✅ 수정 완료');
  } catch (error) {
    if ($('pmre-status')) $('pmre-status').textContent = `저장 실패: ${error.message}`;
  }
}

export async function deletePMResultRow(resultId) {
  if (!confirm('이 점검 기록을 삭제하시겠습니까?')) return;
  const id = resultId ?? Number($('pmre-id')?.value || 0);
  if (!id) return;
  try {
    await apiFirst(['pm/result/delete'], { method: 'POST', body: JSON.stringify({ id, result_id: id }) });
    closeModal('modal-pm-result-edit');
    await loadPMResultsForEquip(selectedPMEquip);
    const detailView = $('pmh-detail-view');
    if (detailView && detailView.style.display !== 'none') {
      showPMHistoryList();
    }
    showToast('✅ 삭제 완료');
  } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
}

export async function deletePMResultMonth(checkMonth) {
  const allResults = Object.values(pmResultsMap).flat().filter((r) => String(r.check_month || '').slice(0, 7) === checkMonth);
  if (!allResults.length) return;
  if (!confirm(`${checkMonth} 점검 이력 ${allResults.length}건을 모두 삭제하시겠습니까?`)) return;
  try {
    for (const r of allResults) {
      const id = Number(pick(r.id, r.result_id, 0));
      if (id) await apiFirst(['pm/result/delete'], { method: 'POST', body: JSON.stringify({ id, result_id: id }) });
    }
    await loadPMResultsForEquip(selectedPMEquip);
    showPMHistoryList();
    showToast(`✅ ${checkMonth} 이력 ${allResults.length}건 삭제 완료`);
  } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
}

// ── PM 이력조회 모달 ──────────────────────────────────────────────────
export function openPMHistoryModal() {
  if (!selectedPMEquip) { showToast('설비를 먼저 선택하세요.', 'warn'); return; }
  const equip = state.equipment.find((r) => pick(r.equip_code, r.code) === selectedPMEquip);
  if ($('pmh-title')) $('pmh-title').textContent = `📂 점검 이력 — ${selectedPMEquip} ${pick(equip?.equip_name, equip?.name, '')}`;
  showPMHistoryList();
  openModal('modal-pm-history');
}

export function showPMHistoryList() {
  if ($('pmh-list-view')) $('pmh-list-view').style.display = '';
  if ($('pmh-detail-view')) $('pmh-detail-view').style.display = 'none';
  if ($('pmh-back-btn')) $('pmh-back-btn').style.display = 'none';
  const body = $('pmh-list-body');
  if (!body) return;
  const byMonth = {};
  Object.values(pmResultsMap).flat().forEach((r) => {
    const mo = String(r.check_month || '').slice(0, 7);
    if (!mo) return;
    if (!byMonth[mo]) byMonth[mo] = { inspector: '', inspect_date: '', items: [] };
    byMonth[mo].items.push(r);
    if (r.inspector) byMonth[mo].inspector = r.inspector;
    if (r.inspect_date) byMonth[mo].inspect_date = r.inspect_date;
  });
  const months = Object.keys(byMonth).sort().reverse();
  if (!months.length) {
    body.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text3);font-size:13px">점검 이력이 없습니다.</div>';
    return;
  }
  body.innerHTML = `<table style="width:100%;border-collapse:collapse">
    <thead style="position:sticky;top:0;background:var(--surface2)">
      <tr>
        <th style="padding:10px 14px;text-align:left;font-size:12px;border-bottom:2px solid var(--border)">점검월</th>
        <th style="padding:10px 14px;text-align:left;font-size:12px;border-bottom:2px solid var(--border)">담당자</th>
        <th style="padding:10px 14px;text-align:left;font-size:12px;border-bottom:2px solid var(--border)">점검일</th>
        <th style="padding:10px 14px;text-align:center;font-size:12px;border-bottom:2px solid var(--border)">항목수</th>
        <th style="padding:10px 14px;text-align:center;font-size:12px;border-bottom:2px solid var(--border)">합격률</th>
        <th style="padding:10px 14px;border-bottom:2px solid var(--border)"></th>
      </tr>
    </thead>
    <tbody>${months.map((mo) => {
      const g = byMonth[mo];
      const total = g.items.length;
      const passed = g.items.filter((r) => {
        const pf = String(r.pass_fail || '');
        return r.input_type === 'PASS_FAIL' ? (pf === 'O' || pf === 'P') : r.value_num != null;
      }).length;
      const rate = total > 0 ? Math.round(passed / total * 100) : 0;
      const rateColor = rate >= 90 ? '#16a34a' : rate >= 70 ? '#f59e0b' : '#ef4444';
      return `<tr style="border-bottom:1px solid var(--border)" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''">
        <td style="padding:10px 14px;font-weight:700;color:var(--primary)">${mo}</td>
        <td style="padding:10px 14px;font-size:13px">${escapeHtml(g.inspector || '—')}</td>
        <td style="padding:10px 14px;font-size:12px;color:var(--text3)">${String(g.inspect_date || '').slice(0, 10) || '—'}</td>
        <td style="padding:10px 14px;text-align:center;font-size:13px">${total}</td>
        <td style="padding:10px 14px;text-align:center;font-weight:700;color:${rateColor}">${rate}%</td>
        <td style="padding:10px 14px;text-align:center">
          <button class="btn btn-sm btn-secondary" onclick="openPMHistoryDetail('${mo}')">상세보기</button>
          <button class="btn btn-sm btn-danger" onclick="deletePMResultMonth('${mo}')" style="margin-left:4px">삭제</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

export function openPMHistoryDetail(checkMonth) {
  if ($('pmh-list-view')) $('pmh-list-view').style.display = 'none';
  if ($('pmh-detail-view')) $('pmh-detail-view').style.display = '';
  if ($('pmh-back-btn')) $('pmh-back-btn').style.display = '';
  const allResults = Object.values(pmResultsMap).flat().filter((r) => String(r.check_month || '').slice(0, 7) === checkMonth);
  const inspector = allResults.find((r) => r.inspector)?.inspector || '—';
  const inspectDate = allResults.find((r) => r.inspect_date)?.inspect_date || '—';
  const header = $('pmh-detail-header');
  if (header) header.innerHTML = `<span>점검월: <strong>${checkMonth}</strong></span><span>담당자: <strong>${escapeHtml(inspector)}</strong></span><span>점검일: <strong>${String(inspectDate).slice(0, 10)}</strong></span><span>항목수: <strong>${allResults.length}</strong></span>`;
  const body = $('pmh-detail-body');
  if (!body) return;
  if (!allResults.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">이력이 없습니다.</div>';
    return;
  }
  body.innerHTML = `<div class="table-wrap" style="max-height:440px;overflow-y:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead style="position:sticky;top:0;background:var(--surface2)">
      <tr>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid var(--border)">부위</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid var(--border)">점검 항목</th>
        <th style="padding:8px 10px;text-align:center;border-bottom:2px solid var(--border)">결과</th>
        <th style="padding:8px 10px;text-align:left;border-bottom:2px solid var(--border)">메모</th>
        <th style="padding:8px 10px;text-align:center;border-bottom:2px solid var(--border)">기준사진</th>
        <th style="padding:8px 10px;text-align:center;border-bottom:2px solid var(--border);width:72px"></th>
      </tr>
    </thead>
    <tbody>${allResults.map((r) => {
      const resultId = Number(pick(r.id, r.result_id, 0));
      const pf = String(r.pass_fail || '');
      const isPass = pf === 'O' || pf === 'P';
      const val = r.input_type === 'PASS_FAIL'
        ? `<span style="font-weight:900;font-size:16px;color:${isPass ? '#16a34a' : '#ef4444'}">${isPass ? 'O' : 'X'}</span>`
        : `<span style="font-weight:700">${r.value_num ?? '—'}</span>`;
      const cpUrl = pick(r.criteria_photo, '');
      const cpHtml = cpUrl ? `<a href="${escapeHtml(cpUrl)}" target="_blank"><img src="${escapeHtml(cpUrl)}" style="width:48px;height:38px;object-fit:cover;border-radius:4px;border:1px solid var(--border)"></a>` : '—';
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 10px;color:var(--text2)">${escapeHtml(r.part_name || '—')}</td>
        <td style="padding:8px 10px;font-weight:600">${escapeHtml(r.item_name || '—')}</td>
        <td style="padding:8px 10px;text-align:center">${val}</td>
        <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${escapeHtml(r.memo || '—')}</td>
        <td style="padding:8px 10px;text-align:center">${cpHtml}</td>
        <td style="padding:6px 8px;text-align:center;white-space:nowrap">
          <button class="btn btn-sm btn-secondary" onclick="openPMResultEdit(${resultId})" style="font-size:10px;padding:3px 7px">수정</button>
          <button class="btn btn-sm btn-danger" onclick="deletePMResultRow(${resultId})" style="font-size:10px;padding:3px 7px;margin-top:3px">삭제</button>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}
