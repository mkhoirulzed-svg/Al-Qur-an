let deferredPrompt;
const installBtn = document.getElementById("installBtn");

// CEK apakah app sudah terinstall
function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

// Kalau sudah install → tombol jangan muncul
if (isAppInstalled()) {
  installBtn?.remove();
}

// Tangkap event install
window.addEventListener("beforeinstallprompt", (e) => {
  if (isAppInstalled()) return;

  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});

// Klik tombol install
installBtn?.addEventListener("click", async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === "accepted") {
    installBtn.remove();
  }

  deferredPrompt = null;
});

// Jika app benar-benar terinstall
window.addEventListener("appinstalled", () => {
  installBtn?.remove();
});