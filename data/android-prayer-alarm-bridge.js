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

    // Custom scheme di dalam iframe sering diblokir oleh Chrome/TWA.
    // Navigasi langsung memastikan Android menerima intent tersebut.
    window.location.href = url;
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
