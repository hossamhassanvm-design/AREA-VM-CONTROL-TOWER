/* ============================================================
   LIVE BACKEND CONFIG — Supabase Production Connection
   AREA VM CONTROL TOWER V3
   ============================================================ */

window.VM_CONFIG = {
  supabaseUrl: 'https://jbignswlvgtgdoqifskz.supabase.co',
  supabaseAnonKey: 'sb_publishable_pZ113MZLhBGtR3dPHCP5iQ_MfbGPUUr',

  showModeBanner: true
};

(function () {
  var cfg = window.VM_CONFIG || {};

  var has = function (v) {
    return typeof v === 'string' &&
      !!v &&
      v.indexOf('PUT_YOUR_') !== 0;
  };

  cfg.supabaseUrl = has(cfg.supabaseUrl)
    ? cfg.supabaseUrl
    : '';

  cfg.supabaseAnonKey = has(cfg.supabaseAnonKey)
    ? cfg.supabaseAnonKey
    : '';

  if (cfg.supabaseUrl && !cfg.supabaseAnonKey) {
    cfg.supabaseUrl = '';
  }

  cfg.isConfigured = !!(
    cfg.supabaseUrl &&
    cfg.supabaseAnonKey
  );

  window.VM_CONFIG = cfg;

})();