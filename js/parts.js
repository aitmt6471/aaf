import { state, CACHE_KEYS, $, pick, num, escapeHtml, getRows, saveCache, loadCache, api, apiFirst, showToast } from './core.js';
import { openModal, closeModal } from './ui.js';

export async function loadParts() {
  try {
    const [summaryRes, masterRes] = await Promise.allSettled([
      apiFirst(['spare-parts/summary']),
      apiFirst(['spare-parts/master/list']),
    ]);
    const summary = summaryRes.status === 'fulfilled' ? getRows(summaryRes.value) : [];
    const master = masterRes.status === 'fulfilled' ? getRows(masterRes.value) : [];
    state.parts = (master.length ? master : summary).map((row) => ({
      ...row,
      part_code: pick(row.part_code, row.code),
      part_name: pick(row.part_name, row.name),
      spec: pick(row.part_spec, row.spec, row.standard),
      current_stock: num(pick(row.total_stock, row.current_stock, row.stock_qty, row.qty)),
    }));
    saveCache(CACHE_KEYS.parts, state.parts);
    renderPartsList();
  } catch (error) {
    state.parts = loadCache(CACHE_KEYS.parts, []);
    renderPartsList();
    throw error;
  }
}

const CRITICALITY_LABELS = { 'A': 'A — 2주↑ 조달', 'B': 'B — 2주↓ 조달', 'C': 'C — 즉시조달' };
const CRITICALITY_COLORS = { 'A': 'bad', 'B': 'warn', 'C': 'caution', 'D': 'good' };

export function renderPartsList() {
  const keyword = ($('parts-search')?.value || '').toLowerCase();
  const rows = state.parts
    .filter((row) =>
      [row.part_code, row.part_name, row.spec].some((v) => String(v || '').toLowerCase().includes(keyword))
    )
    .sort((a, b) => String(a.part_code || '').localeCompare(String(b.part_code || ''), undefined, { numeric: true, sensitivity: 'base' }));
  $('parts-tbody').innerHTML = rows.map((row) => {
    const stock = num(row.current_stock);
    const safeStock = num(pick(row.safe_stock_qty, row.total_safe_stock, row.safe_stock, 0));
    const stockCls = stock < safeStock ? 'stock-low' : 'stock-ok';
    const id = Number(pick(row.part_master_id, 0));
    const crit = pick(row.criticality, '-');
    const critLabel = crit === '-' ? '-' : (crit || '-');
    const critCls = CRITICALITY_COLORS[crit] || '';
    return `
    <tr style="cursor:pointer" onclick="openPartsHistory(${id},'${escapeHtml(row.part_code)}','${escapeHtml(row.part_name)}')">
      <td>${escapeHtml(row.part_code)}</td>
      <td>${escapeHtml(row.part_name)}</td>
      <td>${escapeHtml(row.spec)}</td>
      <td>${escapeHtml(pick(row.unit, '-'))}</td>
      <td>${num(pick(row.std_cycle_days, 0)).toLocaleString()}</td>
      <td><span class="badge ${critCls}" style="margin-left:0">${escapeHtml(critLabel)}</span></td>
      <td class="${stockCls}">${stock.toLocaleString()}</td>
      <td>${safeStock.toLocaleString()}</td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-secondary" onclick="openPartsMasterForm(${id})">✏️ 수정</button>
        <button class="btn btn-sm btn-secondary" onclick="openPartsEquipLink(${id})">🔗 설비 연결</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9">데이터 없음</td></tr>';
}

export function showPartUsage(partMasterId) {
  const row = state.parts.find((item) => Number(pick(item.part_master_id, 0)) === Number(partMasterId));
  if (!row) return;
  const usage = pick(row.equip_codes, '연결 설비 없음');
  alert(`${pick(row.part_code)} / ${pick(row.part_name)}\n사용 설비: ${usage}`);
}

// ── 설비 연결 (PEL: Parts Equipment Link) ─────────────────
let _pelPartMasterId = 0;
let _pelLinkedCodes = new Set();   // 현재 연결된 코드 (화면에 표시)
let _pelRemovedCodes = new Set();  // 제거 예정 코드
let _pelSuggestedCodes = new Set();

export function openPartsEquipLink(partMasterId) {
  _pelPartMasterId = Number(partMasterId);
  _pelRemovedCodes = new Set();
  const row = state.parts.find((item) => Number(pick(item.part_master_id, 0)) === _pelPartMasterId);

  document.getElementById('pel-part-id').value = _pelPartMasterId;
  document.getElementById('pel-title').textContent = `🔗 설비 연결 — ${pick(row?.part_code, '')} ${pick(row?.part_name, '')}`;
  document.getElementById('pel-search').value = '';

  // 현재 연결된 설비코드 파싱
  const codesStr = pick(row?.equip_codes, '');
  _pelLinkedCodes = new Set(codesStr ? codesStr.split(',').map((s) => s.trim()).filter(Boolean) : []);

  // 라인 선택 드롭다운 구성
  const locSel = document.getElementById('pel-location');
  if (locSel) {
    const locs = [...new Set(state.equipment.map((e) => pick(e.location, e.install_location, '')).filter(Boolean))].sort();
    locSel.innerHTML = '<option value="">전체 라인</option>' +
      locs.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
    // 이미 연결된 설비의 라인을 기본 선택
    if (_pelLinkedCodes.size > 0) {
      const firstLinked = state.equipment.find((e) => _pelLinkedCodes.has(pick(e.equip_code, e.code)));
      const firstLoc = pick(firstLinked?.location, firstLinked?.install_location, '');
      if (firstLoc) locSel.value = firstLoc;
    }
  }

  // 자동 추천: 연결된 설비와 같은 라인의 미연결 설비
  _pelSuggestedCodes = new Set();
  if (_pelLinkedCodes.size > 0) {
    const linkedEquip = state.equipment.filter((e) => _pelLinkedCodes.has(pick(e.equip_code, e.code)));
    const linkedLocs = new Set(linkedEquip.map((e) => pick(e.location, e.install_location, '')).filter(Boolean));
    state.equipment.forEach((e) => {
      const loc = pick(e.location, e.install_location, '');
      const code = pick(e.equip_code, e.code, '');
      if (loc && linkedLocs.has(loc) && !_pelLinkedCodes.has(code)) _pelSuggestedCodes.add(code);
    });
  }

  // 자동 추천 섹션
  const suggestSection = document.getElementById('pel-suggest-section');
  const suggestList = document.getElementById('pel-suggest-list');
  if (_pelSuggestedCodes.size > 0) {
    suggestSection.style.display = '';
    suggestList.innerHTML = [..._pelSuggestedCodes].slice(0, 12).map((code) => {
      const eq = state.equipment.find((e) => pick(e.equip_code, e.code) === code);
      const name = pick(eq?.equip_name, eq?.name, '');
      return `<label style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:rgba(37,99,235,0.1);border-radius:6px;cursor:pointer;font-size:12px">
        <input type="checkbox" data-suggest-code="${escapeHtml(code)}" onchange="togglePELSuggest('${escapeHtml(code)}',this.checked)" />
        ⭐ ${escapeHtml(code)}${name ? ' ' + escapeHtml(name) : ''}
      </label>`;
    }).join('');
  } else {
    suggestSection.style.display = 'none';
  }

  renderPELLinked();
  renderPELList();
  openModal('modal-parts-equip-link');
}

function renderPELLinked() {
  const container = document.getElementById('pel-linked-list');
  const countEl = document.getElementById('pel-linked-count');
  const emptyEl = document.getElementById('pel-linked-empty');
  if (!container) return;
  const active = [..._pelLinkedCodes].filter((c) => !_pelRemovedCodes.has(c));
  if (countEl) countEl.textContent = `(${active.length})`;
  if (emptyEl) emptyEl.style.display = active.length ? 'none' : '';
  // 태그 칩들 (emptyEl 제외)
  [...container.querySelectorAll('.pel-linked-chip')].forEach((el) => el.remove());
  active.forEach((code) => {
    const eq = state.equipment.find((e) => pick(e.equip_code, e.code) === code);
    const name = pick(eq?.equip_name, eq?.name, '');
    const chip = document.createElement('span');
    chip.className = 'pel-linked-chip';
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:rgba(37,99,235,0.12);border-radius:20px;font-size:12px;font-weight:600';
    chip.innerHTML = `${escapeHtml(code)}${name ? ' <span style="font-weight:400">${escapeHtml(name)}</span>' : ''} <button onclick="removePELLink('${escapeHtml(code)}')" style="border:none;background:none;cursor:pointer;color:#ef4444;font-size:14px;line-height:1;padding:0 2px">×</button>`;
    container.appendChild(chip);
  });
}

export function removePELLink(code) {
  _pelRemovedCodes.add(code);
  // 목록에서도 체크 해제
  const box = document.querySelector(`[data-pel-code="${CSS.escape(code)}"]`);
  if (box) box.checked = false;
  renderPELLinked();
}

export function renderPELList() {
  const keyword = (document.getElementById('pel-search')?.value || '').toLowerCase();
  const location = document.getElementById('pel-location')?.value || '';
  const container = document.getElementById('pel-equip-list');
  if (!container) return;

  const filtered = state.equipment.filter((e) => {
    const code = pick(e.equip_code, e.code, '');
    const name = pick(e.equip_name, e.name, '');
    const loc = pick(e.location, e.install_location, '');
    if (location && loc !== location) return false;
    return !keyword || [code, name, loc].some((v) => v.toLowerCase().includes(keyword));
  });

  if (!filtered.length) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3,#9ca3af)">검색 결과 없음</div>';
    return;
  }

  container.innerHTML = filtered.map((e) => {
    const code = pick(e.equip_code, e.code, '');
    const name = pick(e.equip_name, e.name, '');
    const loc = pick(e.location, e.install_location, '');
    const isLinked = _pelLinkedCodes.has(code) && !_pelRemovedCodes.has(code);
    const isSuggested = _pelSuggestedCodes.has(code);
    const badge = isSuggested ? '<span style="font-size:11px;color:#2563eb;margin-left:4px">⭐추천</span>' : '';
    const linkedBadge = isLinked ? '<span style="font-size:11px;color:#16a34a;margin-left:4px">✓연결됨</span>' : '';
    return `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border,#e5e7eb);cursor:pointer${isLinked ? ';background:rgba(22,163,74,0.04)' : ''}">
      <input type="checkbox" data-pel-code="${escapeHtml(code)}" ${isLinked ? 'checked' : ''} style="width:16px;height:16px;flex-shrink:0" />
      <span style="flex:1;min-width:0">
        <b>${escapeHtml(code)}</b> ${escapeHtml(name)}${badge}${linkedBadge}
        ${loc ? `<span style="font-size:11px;color:var(--text3,#9ca3af);margin-left:6px">${escapeHtml(loc)}</span>` : ''}
      </span>
    </label>`;
  }).join('');
}

export function filterPELList() { renderPELList(); }

export function togglePELSuggest(code, checked) {
  const listBox = document.querySelector(`[data-pel-code="${CSS.escape(code)}"]`);
  if (listBox) listBox.checked = checked;
}

export async function savePartsEquipLink() {
  const container = document.getElementById('pel-equip-list');
  if (!container) return;

  // 체크된 것 = 연결 추가 대상 (이미 연결된 것도 upsert는 idempotent)
  const toAdd = [...container.querySelectorAll('input[data-pel-code]:checked')].map((el) => el.dataset.pelCode);
  const toRemove = [..._pelRemovedCodes];

  if (toAdd.length === 0 && toRemove.length === 0) {
    showToast('변경 사항이 없습니다.', 'warn');
    return;
  }
  try {
    await Promise.all([
      ...toAdd.map((code) =>
        apiFirst(['equipment/spare-parts/upsert'], {
          method: 'POST',
          body: JSON.stringify({ equip_code: code, part_master_id: _pelPartMasterId, stock_qty: 0, safe_stock_qty: 0 }),
        })
      ),
      ...toRemove.map((code) =>
        apiFirst(['equipment/spare-parts/delete'], {
          method: 'POST',
          body: JSON.stringify({ equip_code: code, part_master_id: _pelPartMasterId }),
        })
      ),
    ]);
    closeModal('modal-parts-equip-link');
    const msg = [toAdd.length && `${toAdd.length}개 추가`, toRemove.length && `${toRemove.length}개 제거`].filter(Boolean).join(', ');
    showToast(`✅ 연결 저장 완료 (${msg})`);
    await loadParts();
  } catch (error) {
    showToast(`연결 저장 실패: ${error.message}`, 'error');
  }
}

// ── 파트 마스터 등록/수정 ──────────────────────────────────
export function openPartsMasterForm(partMasterId = 0) {
  const row = state.parts.find((item) => Number(pick(item.part_master_id, 0)) === Number(partMasterId));
  $('pm-form-title').textContent = row ? '파트 정보 수정' : '신규 파트 등록';
  $('pm-form-master-id').value = partMasterId || '';
  $('pm-form-code').value = pick(row?.part_code, '');
  $('pm-form-name').value = pick(row?.part_name, '');
  $('pm-form-spec').value = pick(row?.spec, row?.part_spec, '');
  $('pm-form-unit').value = pick(row?.unit, 'EA');
  $('pm-form-cycle').value = num(pick(row?.std_cycle_days, 0));
  $('pm-form-criticality').value = pick(row?.criticality, 'C');
  const safeEl = $('pm-form-safe-stock');
  if (safeEl) safeEl.value = num(pick(row?.total_safe_stock, row?.safe_stock_qty, row?.safe_stock, 0));
  if ($('pm-form-photo-url')) $('pm-form-photo-url').value = pick(row?.photo_url, '');
  syncPartsPhotoPreview();
  openModal('modal-parts-master');
}

export function syncPartsPhotoPreview() {
  const url = $('pm-form-photo-url')?.value || '';
  const img = $('pm-photo-previewimg');
  const ph = $('pm-photo-placeholder');
  const btn = $('btn-remove-parts-photo');
  if (url) {
    if (img) { img.src = url; img.style.display = ''; }
    if (ph) ph.style.display = 'none';
    if (btn) btn.style.display = '';
  } else {
    if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
    if (ph) ph.style.display = '';
    if (btn) btn.style.display = 'none';
  }
}

export async function uploadPartsPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  const statusEl = $('pm-photo-status');
  if (statusEl) statusEl.textContent = '업로드 중...';
  try {
    const formData = new FormData();
    formData.append('photo', file);
    const result = await api('photo/upload-parts', { method: 'POST', body: formData });
    const url = pick(result.direct_url, result.url, result.data?.[0]?.url, '');
    if ($('pm-form-photo-url')) $('pm-form-photo-url').value = url;
    syncPartsPhotoPreview();
    if (statusEl) statusEl.textContent = '업로드 완료';
  } catch (error) {
    if (statusEl) statusEl.textContent = `업로드 실패: ${error.message}`;
  }
}

export function removePartsPhoto() {
  if ($('pm-form-photo-url')) $('pm-form-photo-url').value = '';
  syncPartsPhotoPreview();
  if ($('pm-photo-status')) $('pm-photo-status').textContent = '';
}

export async function savePartsMaster() {
  const photoUrl = $('pm-form-photo-url')?.value?.trim() || '';
  if (!photoUrl) { showToast('파트 사진을 등록해주세요. (필수)', 'error'); return; }
  const payload = {
    part_master_id: $('pm-form-master-id').value || '',
    part_code: $('pm-form-code').value.trim(),
    part_name: $('pm-form-name').value.trim(),
    part_spec: $('pm-form-spec').value.trim(),
    unit: $('pm-form-unit').value.trim() || 'EA',
    std_cycle_days: num($('pm-form-cycle').value),
    criticality: $('pm-form-criticality').value,
    safe_stock_qty: num($('pm-form-safe-stock')?.value || 0),
    photo_url: photoUrl,
    eval_1: 1, eval_2: 1, eval_3: 1, eval_4: 1, eval_total: 4,
  };
  if (!payload.part_name) { alert('파트명은 필수입니다.'); return; }
  try {
    await apiFirst(['spare-parts/master/upsert', 'spare-parts/master/create'], { method: 'POST', body: JSON.stringify(payload) });
    closeModal('modal-parts-master');
    await loadParts();
  } catch (error) {
    alert(`파트 저장 실패: ${error.message}`);
  }
}

// ── 입고 ──────────────────────────────────────────────────
export function openPartsIn(partMasterId) {
  const row = state.parts.find((item) => Number(pick(item.part_master_id, 0)) === Number(partMasterId));
  $('trans-in-title').textContent = `📦 입고 — ${pick(row?.part_code, '')} ${pick(row?.part_name, '')}`;
  $('trans-in-master-id').value = partMasterId;
  $('trans-in-qty').value = '';
  $('trans-in-worker').value = '';
  $('trans-in-memo').value = '';
  $('trans-in-date').value = new Date().toISOString().slice(0, 10);
  openModal('modal-parts-in');
}

export async function savePartsIn() {
  const qty = num($('trans-in-qty').value);
  if (!qty || qty <= 0) { alert('수량을 입력하세요.'); return; }
  const masterId = num($('trans-in-master-id').value);
  const row = state.parts.find((item) => Number(pick(item.part_master_id, 0)) === masterId);
  const payload = {
    part_master_id: masterId,
    equip_spare_id: num(pick(row?.equip_spare_id, 0)),
    qty,
    in_qty: qty,
    worker: $('trans-in-worker').value.trim(),
    memo: $('trans-in-memo').value.trim(),
    trans_date: $('trans-in-date').value,
  };
  try {
    await apiFirst(['spare-parts/transaction/in'], { method: 'POST', body: JSON.stringify(payload) });
    closeModal('modal-parts-in');
    showToast(`✅ 입고 완료 (${qty}개)`);
    await loadParts();
  } catch (error) {
    showToast(`입고 저장 실패: ${error.message}`, 'error');
  }
}

// ── 출고 ──────────────────────────────────────────────────
export function openPartsOut(partMasterId) {
  const row = state.parts.find((item) => Number(pick(item.part_master_id, 0)) === Number(partMasterId));
  $('trans-out-title').textContent = `📤 출고 — ${pick(row?.part_code, '')} ${pick(row?.part_name, '')}`;
  $('trans-out-master-id').value = partMasterId;
  $('trans-out-qty').value = '';
  $('trans-out-worker').value = '';
  $('trans-out-memo').value = '';
  $('trans-out-date').value = new Date().toISOString().slice(0, 10);
  const sel = $('trans-out-equip');
  if (sel) {
    sel.innerHTML = '<option value="">-- 설비 선택 (선택사항) --</option>' +
      state.equipment.map((e) => {
        const code = escapeHtml(pick(e.equip_code, e.code));
        const name = escapeHtml(pick(e.equip_name, e.name));
        return `<option value="${code}">${code} — ${name}</option>`;
      }).join('');
  }
  openModal('modal-parts-out');
}

export async function savePartsOut() {
  const qty = num($('trans-out-qty').value);
  if (!qty || qty <= 0) { alert('수량을 입력하세요.'); return; }
  const masterId = num($('trans-out-master-id').value);
  const row = state.parts.find((item) => Number(pick(item.part_master_id, 0)) === masterId);
  const payload = {
    part_master_id: masterId,
    equip_spare_id: num(pick(row?.equip_spare_id, 0)),
    qty,
    out_qty: qty,
    equip_code: $('trans-out-equip').value.trim() || undefined,
    worker: $('trans-out-worker').value.trim(),
    memo: $('trans-out-memo').value.trim(),
    trans_date: $('trans-out-date').value,
  };
  try {
    await apiFirst(['spare-parts/transaction/out'], { method: 'POST', body: JSON.stringify(payload) });
    closeModal('modal-parts-out');
    showToast(`✅ 출고 완료 (${qty}개)`);
    await loadParts();
  } catch (error) {
    showToast(`출고 저장 실패: ${error.message}`, 'error');
  }
}

// ── 파트 입출고 이력 슬라이드오버 ─────────────────────────────────────
export async function openPartsHistory(partMasterId, partCode, partName) {
  const bg = document.getElementById('parts-history-bg');
  const panel = document.getElementById('parts-history-slideover');
  if (!panel) return;
  // 헤더 정보
  if (document.getElementById('parts-hist-title')) document.getElementById('parts-hist-title').textContent = `${partCode} 입출고 이력`;
  if (document.getElementById('parts-hist-sub')) document.getElementById('parts-hist-sub').textContent = partName;
  // 재고 요약
  const row = state.parts.find((r) => Number(pick(r.part_master_id, 0)) === Number(partMasterId));
  const stock = num(pick(row?.current_stock, 0));
  const safeStock = num(pick(row?.safe_stock_qty, row?.total_safe_stock, row?.safe_stock, 0));
  const equipCodes = pick(row?.equip_codes, '—');
  if (document.getElementById('parts-hist-stock')) {
    const el = document.getElementById('parts-hist-stock');
    el.textContent = stock.toLocaleString();
    el.style.color = stock < safeStock ? '#ef4444' : '#16a34a';
  }
  if (document.getElementById('parts-hist-safe')) document.getElementById('parts-hist-safe').textContent = safeStock.toLocaleString();
  if (document.getElementById('parts-hist-equip')) document.getElementById('parts-hist-equip').textContent = equipCodes;
  // 슬라이드오버 열기
  if (bg) bg.style.display = '';
  panel.style.transform = 'translateX(0)';
  // 이력 로드
  const body = document.getElementById('parts-hist-body');
  if (body) body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">로딩 중...</div>';
  try {
    const response = await apiFirst([`spare-parts/transaction/list?part_master_id=${encodeURIComponent(partMasterId)}`]);
    const rows = getRows(response);
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px">입출고 이력이 없습니다.</div>';
      return;
    }
    body.innerHTML = rows.map((r) => {
      const isIn = String(r.trans_type || '').toUpperCase() === 'IN';
      const typeColor = isIn ? '#16a34a' : '#ef4444';
      const typeBg = isIn ? '#f0fdf4' : '#fef2f2';
      const typeLabel = isIn ? '▲ 입고' : '▼ 출고';
      const qty = num(r.qty);
      const date = String(r.trans_date || '').slice(0, 10);
      return `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border)">
        <div style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;color:${typeColor};background:${typeBg};white-space:nowrap;flex-shrink:0">${typeLabel}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
            <span style="font-size:15px;font-weight:800;color:${typeColor}">${isIn ? '+' : '-'}${qty.toLocaleString()}<span style="font-size:11px;font-weight:400;color:var(--text3);margin-left:3px">${escapeHtml(pick(row?.unit, ''))}</span></span>
            <span style="font-size:11px;color:var(--text3);white-space:nowrap">${date}</span>
          </div>
          ${r.equip_code ? `<div style="font-size:11px;color:var(--text2);margin-top:2px">🔧 ${escapeHtml(r.equip_code)} ${escapeHtml(r.equip_name || '')}</div>` : ''}
          ${r.worker ? `<div style="font-size:11px;color:var(--text2)">👤 ${escapeHtml(r.worker)}</div>` : ''}
          ${r.memo ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${escapeHtml(r.memo)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (error) {
    if (body) body.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;font-size:13px">로드 실패: ${error.message}</div>`;
  }
}

export function closePartsHistory() {
  const bg = document.getElementById('parts-history-bg');
  const panel = document.getElementById('parts-history-slideover');
  if (bg) bg.style.display = 'none';
  if (panel) panel.style.transform = 'translateX(100%)';
}
