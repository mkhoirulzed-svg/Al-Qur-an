(() => {
  'use strict';

  // Jangan membuat bridge native palsu melalui custom URL scheme.
  // Pada paket Android/TWA yang tidak memiliki handler alarm yang cocok,
  // membuka `alquran://prayer-alarm/...` dapat menutup paksa aplikasi.
  //
  // Bridge native yang benar harus disuntikkan oleh aplikasi Android sebagai
  // `window.AndroidPrayerAlarm` sebelum file ini dimuat. Jika tidak tersedia,
  // jadwal-native-alarm.js otomatis memakai fallback web yang aman.
  if (window.AndroidPrayerAlarm) return;

  window.AndroidPrayerAlarmBridgeStatus = Object.freeze({
    available: false,
    transport: 'web-fallback',
    reason: 'Native Android prayer alarm bridge is not installed.'
  });
})();
