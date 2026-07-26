function setTheme(theme) {
  document.body.classList.remove('theme-blue', 'theme-dark');

  if (theme !== 'default') {
    document.body.classList.add(theme);
  }

  localStorage.setItem('appTheme', theme);
}

document.addEventListener('DOMContentLoaded', function() {
  const savedTheme = localStorage.getItem('appTheme') || 'default';

  if (savedTheme !== 'default') {
    document.body.classList.add(savedTheme);
  }

  const isJadwalPage = /\/pages\/jadwal\.html$/.test(location.pathname);
  if (isJadwalPage && !document.querySelector('script[data-jadwal-native-alarm]')) {
    const bridge = document.createElement('script');
    bridge.src = '../data/android-prayer-alarm-bridge.js?v=4';
    bridge.dataset.androidPrayerAlarmBridge = 'true';

    bridge.addEventListener('load', () => {
      const script = document.createElement('script');
      script.src = '../data/jadwal-native-alarm.js?v=5';
      script.defer = true;
      script.dataset.jadwalNativeAlarm = 'true';
      document.head.appendChild(script);
    });

    document.head.appendChild(bridge);
  }
});

async function loadFooter(currentPage){

    const isRoot =
        location.pathname.endsWith("index.html") ||
        location.pathname==="/" ||
        location.pathname.endsWith("/");

    const componentPath = isRoot
        ? "./data/footer.html"
        : "../data/footer.html";

    const res = await fetch(componentPath);

    const html = await res.text();

    document.getElementById("footer").innerHTML = html;

    const base = isRoot ? "" : "../";

    const links = {
        home: base + "index.html",
        quran: base + "pages/quran.html",
        bookmark: base + "pages/bookmark.html",
        doa: base + "pages/doa.html"
    };

    document.querySelectorAll(".nav-item").forEach(item=>{

        const page=item.dataset.page;

        item.href=links[page];

        if(page===currentPage){
            item.classList.add("active");
        }
    });

    const active=document.querySelector(".nav-item.active");

    if(active){

        const index=[...document.querySelectorAll(".nav-item")].indexOf(active);

        document.querySelector(".nav-indicator")
            .style.transform=`translateX(${index*100}%)`;
    }
}