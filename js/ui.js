import { state, $, showToast } from './core.js';

let refreshers = {};

export function registerRefreshers(map) {
  refreshers = map;
}

export function openModal(id) {
  const el = $(id);
  if (el) el.classList.add('open');
}

export function closeModal(id) {
  const el = $(id);
  if (el) el.classList.remove('open');
}

export function updatePageTitle() {
  const activeNav = document.querySelector('.nav-item.active');
  const title = $('page-title');
  if (activeNav && title) title.textContent = activeNav.textContent.trim().replace(/\s+/g, ' ');
}

export function showPage(pageId) {
  state.currentPage = pageId;
  document.querySelectorAll('.page').forEach((el) => el.classList.toggle('active', el.id === pageId));
  document.querySelectorAll('.nav-item').forEach((el) => {
    const onClick = el.getAttribute('onclick') || '';
    el.classList.toggle('active', onClick.includes(pageId));
  });
  updatePageTitle();
  refreshCurrent();
}

export function refreshCurrent() {
  const fn = refreshers[state.currentPage];
  if (fn) {
    Promise.resolve(fn()).catch((error) => {
      console.error(error);
      showToast(`조회 실패: ${error.message}`);
    });
  }
}

const LINE_PALETTE = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#be185d','#059669','#ea580c','#4338ca','#b45309','#0e7490'];

export function renderMultiLineChart(id, labels, datasets) {
  if (typeof Chart === 'undefined') return;
  if (state.charts[id]) state.charts[id].destroy();
  const canvas = $(id);
  if (!canvas) return;
  state.charts[id] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        borderColor: LINE_PALETTE[i % LINE_PALETTE.length],
        backgroundColor: LINE_PALETTE[i % LINE_PALETTE.length] + '18',
        borderWidth: 2,
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { mode: 'index', intersect: false },
      },
      hover: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

export function renderHBarChart(id, labels, data, label) {
  if (typeof Chart === 'undefined') return;
  if (state.charts[id]) state.charts[id].destroy();
  const canvas = $(id);
  if (!canvas) return;
  state.charts[id] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label, data, backgroundColor: 'rgba(37,99,235,0.70)', borderColor: '#2563eb', borderWidth: 2, borderRadius: 6 }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

export function renderChart(id, type, labels, data, label) {
  if (typeof Chart === 'undefined') return;
  if (state.charts[id]) state.charts[id].destroy();
  const canvas = $(id);
  if (!canvas) return;
  const max = Math.max(...data.map(Number).filter(Number.isFinite), 1);
  const barColors = data.map((v) => {
    const r = Number(v) / max;
    if (r < 0.33) return 'rgba(22,163,74,0.75)';
    if (r < 0.67) return 'rgba(249,115,22,0.75)';
    return 'rgba(239,68,68,0.75)';
  });
  const barBorders = data.map((v) => {
    const r = Number(v) / max;
    if (r < 0.33) return 'rgb(22,163,74)';
    if (r < 0.67) return 'rgb(249,115,22)';
    return 'rgb(239,68,68)';
  });
  state.charts[id] = new Chart(canvas, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: type === 'bar' ? barBorders : '#2563eb',
        backgroundColor: type === 'bar' ? barColors : 'rgba(37,99,235,0.12)',
        borderWidth: 2,
        borderRadius: type === 'bar' ? 8 : 0,
        fill: type !== 'bar',
        tension: 0.32,
      }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type !== 'doughnut' }, tooltip: { mode: 'index', intersect: false } }, hover: { mode: 'index', intersect: false } },
  });
}
