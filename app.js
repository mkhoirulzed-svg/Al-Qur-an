let deferredPrompt;

const popup = document.getElementById("installPopup");
const installBtn = document.getElementById("installBtn");

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

// Tampilkan popup sekali saja
if (!isInstalled() && !localStorage.getItem("install_popup_shown")) {
  popup.classList.remove("hidden");
  localStorage.setItem("install_popup_shown", "yes");
}

// Tangkap event install
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

// Klik tombol
installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) {
    alert(
      "Install lewat menu browser:\n" +
      "Klik ⋮ lalu pilih 'Install aplikasi' atau 'Tambahkan ke layar utama'"
    );
    return;
  }

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === "accepted") {
    popup.remove();
  }

  deferredPrompt = null;
});

// Setelah terinstall
window.addEventListener("appinstalled", () => {
  popup.remove();
});