if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(reg => {
        console.log("SW scope:", reg.scope);
      })
      .catch(err => {
        console.error("SW error:", err);
      });
  });
}