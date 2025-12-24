let deferredPrompt;

const banner = document.getElementById("installBanner");
const btn = document.getElementById("installAction");
const text = document.getElementById("installText");

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function showBanner(autoHide = true) {
  banner.classList.remove("hidden");
  setTimeout(() => banner.classList.add("show"), 50);

  if (autoHide) {
    setTimeout(() => {
      banner.classList.remove("show");
      setTimeout(() => banner.classList.add("hidden"), 400);
    }, 5000); // ⏱ 5 detik
  }
}

window.addEventListener("load", () => {
  if (isInstalled()) {
    text.textContent = "Assalamualaikum Warahmatullahi Wabarakatuh";
    btn.style.display = "none";
    showBanner(true);
  } else {
    showBanner(true);
  }
});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

btn.addEventListener("click", async () => {
  if (!deferredPrompt) {
    alert(
      "Untuk memasang aplikasi:\n" +
      "Klik menu ⋮ browser\n" +
      "lalu pilih 'Install aplikasi' atau 'Tambahkan ke layar utama'"
    );
    return;
  }

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === "accepted") {
    banner.classList.remove("show");
    setTimeout(() => banner.classList.add("hidden"), 400);
  }

  deferredPrompt = null;
});

window.addEventListener("appinstalled", () => {
  text.textContent = "✅ Salam App berhasil dipasang";
  btn.style.display = "none";
  showBanner(true);
});