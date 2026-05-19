// AIT TPM — Service Worker (푸시 알람)
// 위치: /TPM/sw.js  |  scope: /TPM/

const CACHE_NAME = 'ait-tpm-v1';

// ── 설치 ─────────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
});

// ── 활성화 ───────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// ── 푸시 수신 ────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'AIT TPM 알림', body: '새 알림이 있습니다.', url: '/TPM/report.html' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body:    data.body,
    icon:    '/TPM/ait-logo.png',
    badge:   '/TPM/ait-logo.png',
    vibrate: [200, 100, 200],
    tag:     data.tag || 'ait-tpm',
    renotify: true,
    data:    { url: data.url || '/TPM/report.html' },
    actions: [
      { action: 'open',    title: '바로 열기' },
      { action: 'dismiss', title: '닫기' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── 알림 클릭 ────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/TPM/report.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // 이미 열린 탭이 있으면 포커스
      for (const client of clientList) {
        if (client.url.includes('/TPM') && 'focus' in client) {
          return client.focus();
        }
      }
      // 없으면 새 탭
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
