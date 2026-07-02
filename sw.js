const CACHE_NAME = "alquran-offline-v2";

const FILES_TO_CACHE = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",

  "/pages/amal.html",
  "/pages/amal_list.html",
  "/pages/bookmark.html",
  "/pages/cara-menggunakan.html",
  "/pages/doa-detail.html",
  "/pages/doa.html",
  "/pages/dukung-aplikasi.html",
  "/pages/dzikir-pagi.html",
  "/pages/dzikir-petang.html",
  "/pages/dzikir.html",
  "/pages/jadwal.html",
  "/pages/jumat-berkah.html",
  "/pages/juz.html",
  "/pages/kalender.html",
  "/pages/kiblat.html",
  "/pages/kontak.html",
  "/pages/mushaf.html",
  "/pages/my-daily-amal.html",
  "/pages/panduan.html",
  "/pages/privacy.html",
  "/pages/quran.html",
  "/pages/ramadhan.html",
  "/pages/surah.html",
  "/pages/tasbih.html",
  "/pages/testpage.html",

  "/data/kota.js",
  "/data/loader.js",
  "/data/header.html",
  "/data/footer.html",

  "/data/audio/adzan.mp3",
  "/data/audio/adzan-subuh.mp3",
  "/data/audio/sirine.mp3",

  "/icons/192x192.png",
  "/icons/512x512.png",
  "/icons/about.png",
  "/icons/bookmark.png",
  "/icons/dzikir.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/jadwal.png",
  "/icons/kiblat.png",
  "/icons/logo_alquran.png",
  "/icons/play.png",
  "/icons/video.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (
    url.hostname.includes("api.alquran.cloud") ||
    url.hostname.includes("api.aladhan.com")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const fresh = await fetch(event.request);
          cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(event.request);

          return cached || new Response(
            JSON.stringify({
              error: true,
              message: "Data belum tersedia offline. Buka halaman ini sekali saat online."
            }),
            {
              headers: {
                "Content-Type": "application/json"
              }
            }
          );
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;

      try {
        const response = await fetch(event.request);

        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());

        return response;
      } catch {
        return cached;
      }
    })
  );
});
