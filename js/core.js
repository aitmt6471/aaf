export const state = {
  currentPage: 'page-dashboard',
  baseUrl: localStorage.getItem('baseUrl') || 'https://aitechn8n.ngrok.app/webhook',
  equipment: [],
  reports: [],
  parts: [],
  pmPlans: [],
  pmMasters: [],
  charts: {},
  currentEquip: null,
  reportPhotoUrl: '',
  equipPhotoUrl: '',
  pmEditTarget: null,
};

export const EVAL_KEYS = ['1-1','1-2','2-3','2-4','3-5','3-6','4-7','4-8','4-9','5-10','5-11'];
export const STATUS_COLORS = {
  '정상': 'good',
  '가동중': 'good',
  '점검필요': 'warn',
  '고장': 'bad',
  '폐기': 'muted',
  '유휴': 'muted',
};
export const CACHE_KEYS = {
  equipment: 'ait_cache_equipment',
  reports: 'ait_cache_reports',
  parts: 'ait_cache_parts',
  pmPlans: 'ait_cache_pmPlans',
  pmMasters: 'ait_cache_pmMasters',
  stats: 'ait_cache_stats',
};

export function isPlanned(value) { return ['P', 'D', '1', 1, true, 'Y'].includes(value); }
export function $(id) { return document.getElementById(id); }
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
export function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
export function pick(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (!text || text === 'undefined' || text === 'null') continue;
    return value;
  }
  return '';
}
export function normalizeStatus(value) { const v = String(value ?? '').trim(); if (!v) return '접수'; if (v.includes('확인')) return '확인중'; if (v.includes('수리')) return '수리중'; if (v.includes('완료') || v.includes('조치')) return '완료'; return v; }
export function setConnection(ok, text) { const dot = $('conn-dot'); const label = $('conn-text'); if (dot) dot.className = `conn-dot ${ok ? 'ok' : 'err'}`; if (label) label.textContent = text; }
export async function api(path, options = {}) { const url = `${state.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`; const headers = new Headers(options.headers || {}); headers.set('ngrok-skip-browser-warning', 'true'); if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) { headers.set('Content-Type', 'application/json'); } const response = await fetch(url, { ...options, headers }); const text = await response.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; } if (!response.ok) { throw new Error(data.message || data.error || `${response.status} ${response.statusText}`); } return data; }
export async function apiFirst(paths, options = {}) { let lastError = null; for (const path of paths) { try { return await api(path, options); } catch (error) { lastError = error; } } throw lastError || new Error('API 요청 실패'); }
export function getRows(payload) { if (Array.isArray(payload)) return payload; if (Array.isArray(payload?.data)) return payload.data; if (Array.isArray(payload?.items)) return payload.items; return []; }
export function showToast(message, type = 'info') {
  const result = $('cfg-result');
  if (result) result.innerHTML = `<div style="padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2)">${escapeHtml(message)}</div>`;
  let toast = document.getElementById('_global_toast');
  if (!toast) { toast = document.createElement('div'); toast.id = '_global_toast'; toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;padding:14px 28px;border-radius:16px;font-size:15px;font-weight:700;box-shadow:0 8px 32px rgba(0,0,0,0.28);transition:opacity 0.4s;text-align:center;min-width:200px;max-width:400px'; document.body.appendChild(toast); }
  toast.textContent = message;
  toast.style.background = type === 'error' ? '#ef4444' : type === 'warn' ? '#f59e0b' : '#16a34a';
  toast.style.color = '#fff';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}
export function formatDate(value) { if (!value) return '-'; const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value).slice(0, 10); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function hoursSince(value) { const d = new Date(value); if (Number.isNaN(d.getTime())) return '-'; const diff = Math.max(0, Date.now() - d.getTime()); const hours = Math.floor(diff / 3600000); const minutes = Math.floor((diff % 3600000) / 60000); return `${hours}시간 ${minutes}분`; }
export function ensureSelectValue(id, value, placeholder = '기타') { const el = $(id); if (!el) return; const normalized = String(value ?? '').trim(); if (!normalized) { el.value = ''; return; } const exists = Array.from(el.options).some((opt) => opt.value === normalized || opt.text === normalized); if (!exists) { const opt = document.createElement('option'); opt.value = normalized; opt.textContent = `${placeholder}: ${normalized}`; el.appendChild(opt); } el.value = normalized; }
export function saveCache(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
export function loadCache(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
export function normalizeDriveUrl(url) { const src = String(url ?? '').trim(); if (!src || src === 'undefined' || src === 'null') return ''; if (src.includes('drive.google.com')) { const fileMatch = src.match(/\/file\/d\/([^/?#]+)/); if (fileMatch) return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w800`; const idMatch = src.match(/[?&]id=([^&]+)/); if (idMatch) return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w800`; } return src; }
export function driveImgFallback(img) { const src = img.src || ''; const idMatch = src.match(/[?&]id=([^&]+)/); if (idMatch) { img.onerror = null; img.src = `https://lh3.googleusercontent.com/d/${idMatch[1]}`; } }
export function renderPhotoThumb(url) { const src = normalizeDriveUrl(url); if (!src) return '-'; return `<a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer">보기</a>`; }
export function renderStatusBadge(value) { const statusText = String(value ?? '').trim() || '-'; const cls = STATUS_COLORS[statusText] || 'good'; return `<span class="badge ${cls}">${escapeHtml(statusText)}</span>`; }
export async function uploadPhoto(file, fileName) { const formData = new FormData(); formData.append('photo', fileName ? new File([file], fileName, { type: file.type }) : file); const result = await api('photo/upload', { method: 'POST', body: formData }); const direct = String(result.direct_url ?? ''); const safeDirectUrl = (direct && !direct.includes('anyoneWithLink')) ? direct : ''; return safeDirectUrl || pick(result.url, result.data?.url, result.file_url, result.data?.file_url); }
