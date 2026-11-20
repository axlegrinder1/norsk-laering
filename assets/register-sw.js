/* Offline support. Only on the hosted HTTPS site, so local development never serves stale cached files. */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () { /* offline mode is optional */ });
  });
}
