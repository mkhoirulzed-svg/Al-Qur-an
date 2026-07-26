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
    localStorage.setItem(key, JSON.stringify(value));
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

  async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  }

  function showNotification(name, time) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(`Waktu ${name}`, {
      body: `Telah masuk waktu ${name} pukul ${time}.`,
      icon: '../assets/icons/192x192.png',
      badge: '../assets/icons/192x192.png',
      tag: `sholat-${name}`,
      renotify: true
    });
  }

  function callNative(method, payload) {
    const bridge = window.AndroidPrayerAlarm;
    if (!bridge || typeof bridge[method] !== 'function') return false;

    try {
      bridge[method](JSON.stringify(payload));
      return true;
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
    const delay = target.getTime() - Date.now();

    const timer = setTimeout(() => {
      showNotification(name, time);
      if (typeof window.mainkanAlarm === 'function') window.mainkanAlarm(name);
      scheduleWebFallback(name, time);
    }, delay);

    timers.set(name, timer);
  }

  async function scheduleAlarm(name, time) {
    const target = nextOccurrence(time);
    const payload = {
      id: `sholat-${name.toLowerCase()}`,
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

    await requestNotificationPermission();
    const nativeScheduled = callNative('schedule', payload);
    if (!nativeScheduled) scheduleWebFallback(name, time);

    return nativeScheduled;
  }

  function cancelAlarm(name) {
    const schedule = getSchedule();
    const payload = schedule[name] || { id: `sholat-${name.toLowerCase()}`, name };
    delete schedule[name];
    writeJson(SCHEDULE_KEY, schedule);

    clearWebTimer(name);
    callNative('cancel', payload);
  }

  function setEnabled(name, time, enabled) {
    const settings = getSettings();
    settings[name] = enabled;
    writeJson(STORAGE_KEY, settings);

    if (enabled) scheduleAlarm(name, time);
    else cancelAlarm(name);
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

    const settings = getSettings();
    const enabled = !!settings[name];

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `alarm-toggle${enabled ? ' active' : ''}`;
    button.dataset.nama = name;
    button.setAttribute('aria-label', `${enabled ? 'Matikan' : 'Aktifkan'} alarm ${name}`);
    button.title = `${enabled ? 'Matikan' : 'Aktifkan'} alarm ${name}`;
    button.innerHTML = `<i class="fa-solid ${enabled ? 'fa-bell' : 'fa-bell-slash'}"></i>`;

    button.addEventListener('click', async () => {
      const nextEnabled = !button.classList.contains('active');
      button.classList.toggle('active', nextEnabled);
      button.querySelector('i').className = `fa-solid ${nextEnabled ? 'fa-bell' : 'fa-bell-slash'}`;
      button.setAttribute('aria-label', `${nextEnabled ? 'Matikan' : 'Aktifkan'} alarm ${name}`);
      button.title = button.getAttribute('aria-label');
      setEnabled(name, time, nextEnabled);
    });

    right.appendChild(button);
    card.dataset.nativeAlarmReady = 'true';

    if (enabled) scheduleAlarm(name, time);
  }

  function enhanceAllCards() {
    document.querySelectorAll('.jadwal-card').forEach(enhanceCard);
  }

  const observer = new MutationObserver(enhanceAllCards);

  function init() {
    const container = document.getElementById('jadwalSholat');
    if (!container) return;
    enhanceAllCards();
    observer.observe(container, { childList: true, subtree: true });
  }

  window.AlQuranPrayerAlarm = {
    schedule: scheduleAlarm,
    cancel: cancelAlarm,
    refresh: enhanceAllCards,
    hasNativeBridge: () => !!window.AndroidPrayerAlarm
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
