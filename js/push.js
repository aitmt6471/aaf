// AIT TPM — 브라우저 푸시 알람 구독 관리 (push.js)

const VAPID_PUBLIC_KEY = 'BOlKEi1aeqzga8xXmB2xvlfs7b4IYmvhCgBX8lepOHPUiHmFRRl8PlW8djZrtwif1Z_LC6Gf3veV_tcKQG_K09A';

// VAPID 공개키 → Uint8Array 변환 (브라우저 API 요구 형식)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// 푸시 지원 여부 확인
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// iOS PWA 감지 (홈화면 추가 여부)
export function isIOSPWA() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) &&
         window.navigator.standalone === true;
}

// iOS 기기 여부 (PWA 미설치)
export function isIOSBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) &&
         !window.navigator.standalone;
}

// Service Worker 등록
async function registerSW() {
  // GitHub Pages: scope /TPM/, 로컬: scope /
  const swPath = location.hostname === 'aitmt6471.github.io'
    ? '/TPM/sw.js' : '/sw.js';
  const scope = location.hostname === 'aitmt6471.github.io'
    ? '/TPM/' : '/';
  return navigator.serviceWorker.register(swPath, { scope });
}

// 현재 구독 상태 반환 ('denied' | 'subscribed' | 'unsubscribed' | 'unsupported')
export async function getPushStatus() {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsubscribed';
  }
}

// 구독 신청 + DB 저장
export async function subscribePush(baseUrl, userLabel = '') {
  if (!isPushSupported()) throw new Error('이 브라우저는 푸시 알람을 지원하지 않습니다.');
  if (isIOSBrowser()) throw new Error('아이폰/아이패드는 홈화면에 추가(PWA) 후 사용 가능합니다.');

  // 알림 권한 요청
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('알림 권한이 거부되었습니다.');

  // Service Worker 등록 및 구독
  const reg = await registerSW();
  await navigator.serviceWorker.ready;

  // 기존 구독 해제 후 재구독 (키 변경 대응)
  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const p256dh = toB64(subscription.getKey('p256dh'));
  const auth   = toB64(subscription.getKey('auth'));
  if (!subscription.endpoint || !p256dh || !auth) throw new Error('구독 정보 생성 실패');
  const payload = {
    endpoint:   subscription.endpoint,
    p256dh,
    auth,
    user_label: userLabel || navigator.userAgent.substring(0, 80),
    device_info: `${navigator.platform} / ${navigator.userAgent.substring(0, 60)}`
  };

  // n8n에 구독정보 저장
  const res = await fetch(`${baseUrl}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`서버 저장 실패: ${res.status}`);

  return subscription;
}

// 구독 해제 + DB 삭제
export async function unsubscribePush(baseUrl) {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const endpoint = sub.endpoint;
  await sub.unsubscribe();

  await fetch(`${baseUrl}/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint })
  });
}

// 알림 허용 버튼 UI 업데이트
export async function updatePushUI(btnEl, statusEl, baseUrl) {
  if (!isPushSupported()) {
    if (statusEl) statusEl.textContent = '이 브라우저는 푸시 알람 미지원';
    if (btnEl) btnEl.style.display = 'none';
    return;
  }
  if (isIOSBrowser()) {
    if (statusEl) statusEl.textContent = '홈화면 추가 후 알림 사용 가능 (iOS)';
    if (btnEl) btnEl.style.display = 'none';
    return;
  }

  const status = await getPushStatus();
  if (status === 'subscribed') {
    if (btnEl) { btnEl.textContent = '🔕 알림 해제'; btnEl.dataset.action = 'off'; }
    if (statusEl) statusEl.textContent = '✅ 알림 켜짐';
  } else if (status === 'denied') {
    if (btnEl) btnEl.style.display = 'none';
    if (statusEl) statusEl.textContent = '🚫 브라우저 설정에서 알림 차단됨';
  } else {
    if (btnEl) { btnEl.textContent = '🔔 알림 허용'; btnEl.dataset.action = 'on'; }
    if (statusEl) statusEl.textContent = '알림이 꺼져 있습니다';
  }
}

// 버튼 클릭 핸들러
export async function togglePush(btnEl, statusEl, baseUrl) {
  const action = btnEl?.dataset.action || 'on';
  try {
    if (action === 'on') {
      await subscribePush(baseUrl);
      if (statusEl) statusEl.textContent = '✅ 알림이 켜졌습니다!';
    } else {
      await unsubscribePush(baseUrl);
      if (statusEl) statusEl.textContent = '알림이 해제되었습니다';
    }
    await updatePushUI(btnEl, statusEl, baseUrl);
  } catch (err) {
    if (statusEl) statusEl.textContent = `❌ ${err.message}`;
  }
}
