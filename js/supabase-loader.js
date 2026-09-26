/* ============================================================
   Supabase client loader — dynamically loads supabase-js v2 from
   CDN ONLY when a backend is configured. No network on dev/file.
   Exposes:
     window.__SB          -> SupabaseClient or null
     window.__SB_PRELOAD  -> Promise<SupabaseClient|null>
   ============================================================ */
(function () {
  var cfg = window.VM_CONFIG || {};
  window.__SB = null;
  window.__SB_LOAD_ERROR = null;

  if (!cfg.isConfigured) {
    window.__SB_PRELOAD = Promise.resolve(null);
    return;
  }

  window.__SB_PRELOAD = new Promise(function (resolve) {
    var existing = document.getElementById('supabase-js');
    if (existing && window.supabase) {
      try { window.__SB = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); return resolve(window.__SB); } catch (e) { /* fallthrough */ }
    }
    var s = document.createElement('script');
    s.id = 'supabase-js';
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.async = true;
    var timedOut = false;
    var loadTimer = setTimeout(function () {
      timedOut = true;
      window.__SB_LOAD_ERROR = new Error('supabase CDN timed out after 8000ms');
      resolve(null);
    }, 8000);
    function finished() { if (!timedOut) { timedOut = true; clearTimeout(loadTimer); } }
    s.onload = function () {
      finished();
      try {
        var opts = {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        };
        window.__SB = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, opts);
        resolve(window.__SB);
      } catch (e) { window.__SB_LOAD_ERROR = e; resolve(null); }
    };
    s.onerror = function () { finished(); window.__SB_LOAD_ERROR = new Error('supabase CDN unavailable'); resolve(null); };
    document.head.appendChild(s);
  });
})();