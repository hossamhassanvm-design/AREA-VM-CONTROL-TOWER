/* ============================================================
   PWA — installable app shell (static assets only).
   Never caches dynamic/operational data: SW runs network-first
   and caches the versioned static shell; the DB is the source
   of truth. Skipped on file:// and non-secure contexts.
   ============================================================ */
(function () {
  var proto = (window.location && window.location.protocol) || '';
  var secure = proto === 'https:' || proto === 'http://localhost' || proto === 'http://127.0.0.1';
  if (!secure) return;

  function injectManifest() {
    if (document.getElementById('pwaManifest')) return;
    var link = document.createElement('link');
    link.id = 'pwaManifest';
    link.rel = 'manifest';
    link.href = 'manifest.json';
    document.head.appendChild(link);
  }

  function register() {
    injectManifest();
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then(function () { /* ok */ })
      .catch(function () { /* silent */ });
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') register();
  else document.addEventListener('DOMContentLoaded', register);
})();