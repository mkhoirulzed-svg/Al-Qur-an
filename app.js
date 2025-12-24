// Register Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js")
    .then(() => console.log("Service Worker registered"))
    .catch(err => console.error("SW failed:", err));
}

// ================= INSTALL BUTTON =================

let deferredPrompt;
const installBtn = document.getElementById("installBtn");

function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

// Jika sudah install → hapus tombol
if (isAppInstalled()) {
  installBtn?.remove();
}

// Event install
window.addEventListener("beforeinstallprompt", (e) => {
  if (isAppInstalled()) return;

  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});

// Klik tombol
installBtn?.addEventListener("click", async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === "accepted") {
    installBtn.remove();
  }

  deferredPrompt = null;
});

// Setelah terinstall
window.addEventListener("appinstalled", () => {
  installBtn?.remove();
});