let deferredPrompt;
const installBox = document.getElementById("installBox");
const installBtn = document.getElementById("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBox.style.display = "block";
});

installBtn.addEventListener("click", () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      installBox.style.display = "none";
      deferredPrompt = null;
    });
  }
});

// Register Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
