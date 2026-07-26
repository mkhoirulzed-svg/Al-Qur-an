(() => {
  'use strict';

  if (window.AndroidPrayerAlarm) return;

  function openNative(action, rawPayload) {
    let payload = {};
    try {
      payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : (rawPayload || {});
    } catch {
      payload = {};
    }

    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.set(key, String(value));
    });

    const url = `alquran://prayer-alarm/${action}?${params.toString()}`;
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.src = url;
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 1500);
  }

  window.AndroidPrayerAlarm = {
    schedule(payload) {
      openNative('schedule', payload);
    },
    cancel(payload) {
      openNative('cancel', payload);
    }
  };
})();
