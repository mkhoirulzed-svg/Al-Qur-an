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

    // Buka handler Android sebagai aktivitas terpisah agar halaman Jadwal Sholat
    // tetap berada di TWA dan tidak berubah menjadi halaman kosong/custom scheme.
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 1000);
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
