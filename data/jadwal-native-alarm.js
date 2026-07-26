(() => {
  'use strict';

  const STORAGE_KEY = 'sholatAlarmSettings';
  const SCHEDULE_KEY = 'sholatAlarmSchedule';
  const timers = new Map();

  function readJson(key, fallback = {}) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('Tidak dapat menyimpan pengaturan alarm:', error);
    }
  }

  function getSettings() {
    return readJson(STORAGE_KEY, {});
  }

  function getSchedule() {
    return readJson(SCHEDULE_KEY, {});
  }

  function normaliseName(name) {
    return String(name || '').replace(/\(.*?\)/g, '').trim();
  }

  function nextOccurrence(time) {
    const [hour, minute] = String(time).split(':').map(Number);
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
    return date;
  }

  async function requestWebNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      return (await Notification.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  function showWebNotification(name, time) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(`Waktu ${name}`, {
        body: `Telah masuk waktu ${name} pukul ${time}.`,
        icon: '../assets/icons/192x192.png',
        badge: '../assets/icons/192x192.png',
        tag: `sholat-${name}`,
        renotify: true
      });
    } catch (error) {
      console.error('Notifikasi web gagal:', error);
    }
  }

  function callNative(method, payload) {
    const bridge = window.AndroidPrayerAlarm;
    if (!bridge || typeof bridge[method] !== 'function') return false;

    try {
      return bridge[method](JSON.stringify(payload)) !== false;
    } catch (error) {
      console.error('Gagal memanggil alarm native:', error);
      return false;
    }
  }

  function clearWebTimer(name) {
    const timer = timers.get(name);
    if (timer) clearTimeout(timer);
    timers.delete(name);
  }

  function scheduleWebFallback(name, time) {
    clearWebTimer(name);
    const target = nextOccurrence(time);
    const delay = Math.max(0, target.getTime() - Date.now());

    const timer = setTimeout(() => {
      showWebNotification(name, time);
      if (typeof window.mainkanAlarm === 'function') window.mainkanAlarm(name);
      scheduleWebFallback(name, time);
    }, delay);

    timers.set(name, timer);
  }

  async function scheduleAlarm(name, time) {
    const target = nextOccurrence(time);
    const payload = {
      id: `sholat-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      time,
      triggerAt: target.getTime(),
      repeatDaily: true,
      title: `Waktu ${name}`,
      message: `Telah masuk waktu ${name} pukul ${time}.`
    };

    const schedule = getSchedule();
    schedule[name] = payload;
    writeJson(SCHEDULE_KEY, schedule);

    const nativeScheduled = callNative('schedule', payload);
    if (!nativeScheduled) {
      await requestWebNotificationPermission();
      scheduleWebFallback(name, time);
    }
    return nativeScheduled;
  }

  function cancelAlarm(name) {
    const schedule = getSchedule();
    const payload = schedule[name] || {
      id: `sholat-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name
    };

    delete schedule[name];
    writeJson(SCHEDULE_KEY, schedule);
    clearWebTimer(name);
    callNative('cancel', payload);
  }

  async function setEnabled(name, time, enabled) {
    const settings = getSettings();
    settings[name] = enabled;
    writeJson(STORAGE_KEY, settings);

    if (enabled) return scheduleAlarm(name, time);
    cancelAlarm(name);
    return false;
  }

  function enhanceCard(card) {
    if (card.dataset.nativeAlarmReady === 'true') return;

    const nameEl = card.querySelector('span:first-child');
    const timeEl = card.querySelector('.jam');
    const right = card.querySelector('.jadwal-right');
    if (!nameEl || !timeEl || !right) return;

    const name = normaliseName(nameEl.textContent);
    const time = timeEl.textContent.trim();
    if (!name || !/^\d{1,2}:\d{2}$/.test(time)) return;

    const enabled = !!getSettings()[name];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `alarm-toggle${enabled ? ' active' : ''}`;
    button.dataset.nama = name;
    button.setAttribute('aria-label', `${enabled ? 'Matikan' : 'Aktifkan'} alarm ${name}`);
    button.title = button.getAttribute('aria-label');
    button.innerHTML = `<i class="fa-solid ${enabled ? 'fa-bell' : 'fa-bell-slash'}"></i>`;

    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      const nextEnabled = !button.classList.contains('active');

      try {
        await setEnabled(name, time, nextEnabled);
        button.classList.toggle('active', nextEnabled);
        button.querySelector('i').className = `fa-solid ${nextEnabled ? 'fa-bell' : 'fa-bell-slash'}`;
        button.setAttribute('aria-label', `${nextEnabled ? 'Matikan' : 'Aktifkan'} alarm ${name}`);
        button.title = button.getAttribute('aria-label');
      } finally {
        button.disabled = false;
      }
    });

    right.appendChild(button);
    card.dataset.nativeAlarmReady = 'true';
  }

  function enhanceAllCards() {
    document.querySelectorAll('.jadwal-card').forEach(enhanceCard);
  }

  function addTestButton() {
    if (document.getElementById('testPrayerAlarmBtn')) return;
    const container = document.querySelector('.sholat-container');
    const schedule = document.getElementById('jadwalSholat');
    if (!container || !schedule) return;

    const button = document.createElement('button');
    button.id = 'testPrayerAlarmBtn';
    button.type = 'button';
    button.className = 'kota-select';
    button.style.cssText = [
      'border:none',
      'background:linear-gradient(145deg,#c49a2a,#a97f19)',
      'color:#fff',
      'cursor:pointer',
      'margin-bottom:14px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'gap:9px'
    ].join(';');
    button.innerHTML = '<i class="fa-solid fa-bell"></i><span>Tes Alarm 1 Menit</span>';

    const status = document.createElement('div');
    status.id = 'testPrayerAlarmStatus';
    status.style.cssText = 'font-size:12px;color:var(--text-secondary);text-align:center;margin:-6px 0 14px;display:none';

    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      const oldHtml = button.innerHTML;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Menjadwalkan...</span>';

      try {
        const triggerAt = Date.now() + 60 * 1000;
        const target = new Date(triggerAt);
        const time = target.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit'
        }).replace('.', ':');

        const payload = {
          id: 'sholat-test-alarm',
          name: 'Tes Alarm',
          time,
          triggerAt,
          repeatDaily: false,
          title: 'Tes Alarm Jadwal Sholat',
          message: 'Alarm native Al-Qur’an berhasil bekerja.'
        };

        const nativeScheduled = callNative('schedule', payload);

        if (!nativeScheduled) {
          await requestWebNotificationPermission();
          const delay = Math.max(0, triggerAt - Date.now());
          setTimeout(() => {
            showWebNotification('Tes Alarm', time);
            if (typeof window.mainkanAlarm === 'function') window.mainkanAlarm('Tes Alarm');
          }, delay);
        }

        status.style.display = 'block';
        status.textContent = nativeScheduled
          ? `Permintaan dikirim ke Android untuk pukul ${time}. Berikan izin Notifikasi dan Alarm & pengingat bila diminta.`
          : `Alarm web dijadwalkan pukul ${time}. Halaman harus tetap terbuka agar alarm berjalan.`;
        button.innerHTML = '<i class="fa-solid fa-check"></i><span>Alarm Dijadwalkan</span>';
      } catch (error) {
        console.error(error);
        status.style.display = 'block';
        status.textContent = 'Alarm gagal dijadwalkan. Coba buka ulang aplikasi.';
        button.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>Gagal</span>';
      }

      setTimeout(() => {
        button.disabled = false;
        button.innerHTML = oldHtml;
      }, 5000);
    });

    container.insertBefore(button, schedule);
    container.insertBefore(status, schedule);
  }

  const observer = new MutationObserver(enhanceAllCards);

  function init() {
    const container = document.getElementById('jadwalSholat');
    if (!container) return;
    addTestButton();
    enhanceAllCards();
    observer.observe(container, { childList: true, subtree: true });
  }

  window.AlQuranPrayerAlarm = {
    schedule: scheduleAlarm,
    cancel: cancelAlarm,
    refresh: enhanceAllCards,
    testInOneMinute: () => document.getElementById('testPrayerAlarmBtn')?.click(),
    hasNativeBridge: () => !!window.AndroidPrayerAlarm,
    bridgeStatus: () => window.AndroidPrayerAlarmBridgeStatus || null
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
