// ================= SERVICE WORKER =================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/Al-Qur-an/sw.js")
    .then(() => console.log("SW registered"))
    .catch(err => console.error("SW error:", err));
}

// ================= INSTALL POPUP =================
let deferredPrompt;

const popup = document.getElementById("installPopup");
const installBtn = document.getElementById("installBtn");

function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

// Jika sudah install → popup dihapus
if (isAppInstalled()) {
  popup?.remove();
}

// Tangkap event install
window.addEventListener("beforeinstallprompt", (e) => {
  if (isAppInstalled()) return;

  e.preventDefault();
  deferredPrompt = e;

  // Tampilkan popup
  popup?.classList.remove("hidden");
});

// Klik tombol install
installBtn?.addEventListener("click", async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === "accepted") {
    popup?.remove();
  }

  deferredPrompt = null;
});

// Setelah benar-benar terinstall
window.addEventListener("appinstalled", () => {
  popup?.remove();
});