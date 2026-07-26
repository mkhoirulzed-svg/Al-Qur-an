(() => {
  'use strict';

  if (window.AndroidPrayerAlarm) return;

  const isAndroid = /Android/i.test(navigator.userAgent || '');
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches === true;
  const isTrustedWebActivity = String(document.referrer || '').startsWith('android-app://');
  const available = isAndroid && (isStandalone || isTrustedWebActivity);

  function parsePayload(rawPayload) {
    if (!rawPayload) return {};
    if (typeof rawPayload === 'object') return rawPayload;
    try {
      return JSON.parse(rawPayload);
    } catch {
      return {};
    }
  }

  function openNative(action, rawPayload) {
    if (!available) return false;

    const payload = parsePayload(rawPayload);
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.set(key, String(value));
    });

    const url = `alquran://prayer-alarm/${encodeURIComponent(action)}?${params.toString()}`;

    try {
      const link = document.createElement('a');
      link.href = url;
      link.style.display = 'none';
      link.setAttribute('aria-hidden', 'true');
      document.body.appendChild(link);
      link.click();
      setTimeout(() => link.remove(), 500);
      return true;
    } catch (error) {
      console.error('Gagal membuka alarm native Android:', error);
      return false;
    }
  }

  if (available) {
    window.AndroidPrayerAlarm = Object.freeze({
      schedule(payload) {
        return openNative('schedule', payload);
      },
      cancel(payload) {
        return openNative('cancel', payload);
      }
    });
  }

  window.AndroidPrayerAlarmBridgeStatus = Object.freeze({
    available,
    transport: available ? 'android-custom-scheme' : 'web-fallback',
    reason: available
      ? 'Native Android prayer alarm handler is available.'
      : 'Halaman tidak berjalan sebagai aplikasi Android terpasang.'
  });
})();
