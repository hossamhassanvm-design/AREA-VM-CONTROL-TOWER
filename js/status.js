/* ============================================================
   StatusBar — ONLINE / OFFLINE / SYNCING / DEV indicator chip
   and a mode banner. DOM-only; safe in every environment.
   ============================================================ */
window.StatusBar = (function () {
  var chip = null, banner = null, _last = { st: '', label: '' };

  function ensureDom() {
    if (chip) return;
    var bar = document.getElementById('topLive');
    if (bar) {
      chip = document.createElement('span');
      chip.id = 'connChip';
      chip.className = 'conn-chip';
      bar.appendChild(chip);
    }
    var app = document.getElementById('app');
    if (!banner) banner = document.getElementById('modeBanner');
    if (!banner && app) {
      banner = document.createElement('div');
      banner.id = 'modeBanner';
      app.insertBefore(banner, app.firstChild || null);
    }
  }

  function set(st, label) {
    _last = { st: st, label: label };
    try { ensureDom(); } catch (e) { return; }
    if (chip) {
      chip.textContent = chipLabel(st, label);
      chip.className = 'conn-chip conn-' + st;
      chip.title = chipTitle(st);
    }
    if (banner) {
      banner.innerHTML = bannerHtml(st);
      const rb = banner.querySelector('#retrySignIn');
      if (rb && !rb.dataset.bound) {
        rb.dataset.bound = '1';
        rb.addEventListener('click', function () {
          if (window.DataService && DataService.retryLogin) DataService.retryLogin();
        });
      }
    }
    applyLock(st);
  }

  function chipLabel(st, label) {
    if (st === 'dev') return label || 'DEV';
    return label || String(st).toUpperCase();
  }
  function chipTitle(st) {
    switch (st) {
      case 'dev': return 'Local mode — data stays in this browser';
      case 'online': return 'Connected to shared database';
      case 'syncing': return 'Syncing changes…';
      case 'offline': return 'Offline — changes queue and retry automatically';
      case 'connecting': return 'Connecting…';
      default: return st;
    }
  }

  function bannerHtml(st) {
    var cfg = window.VM_CONFIG || {};
    if (!cfg.isConfigured) {
      if (bannerFlag(st) === 'dev') {
        return '<div class="mode-banner banner-dev">' +
          '<b>DEV MODE</b> — running locally in this browser (no live backend configured). Visit Mail attachments are stored in-browser only. ' +
          'To go live: create a Supabase project, run <code>supabase/migrations/0001_init.sql</code>, then set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> on Vercel and redeploy (see SETUP.md).' +
          '</div>';
      }
      return '';
    }
    if (st === 'online') {
      var who = '';
      try {
        var ds = window.DataService;
        if (ds && ds.user && ds.user.email) who = esc(ds.user.email) + (ds.role ? ' · ' + esc(ds.role) : '');
      } catch (e) { /* ignore */ }
      return '<div class="mode-banner banner-online">● LIVE — shared database connected' + (who ? ' (' + who + ')' : '') + '</div>';
    }
    if (st === 'connecting') return '<div class="mode-banner banner-connecting">Connecting to shared database…</div>';
    if (st === 'offline') {
      const cfg = window.VM_CONFIG || {};
      if (cfg.isConfigured) {
        const why = (window.DataService && DataService.lastError) || 'cannot reach the shared database. Your edits are queued and will retry automatically.';
        return '<div class="mode-banner banner-offline">● OFFLINE — ' + esc(why) +
          ' <button id="retrySignIn" class="banner-btn">' + (typeof LANG !== 'undefined' && LANG === 'ar' ? 'تسجيل الدخول' : 'Sign in / Retry') + '</button></div>';
      }
      return '<div class="mode-banner banner-offline">● OFFLINE — changes queue until the server is reachable again.</div>';
    }
    if (st === 'syncing') return '<div class="mode-banner banner-syncing">Sync in progress…</div>';
    if (st === 'dev') return '<div class="mode-banner banner-dev"><b>DEV MODE</b> — backend configured but not reachable; local browser data shown. Set SUPABASE_URL / SUPABASE_ANON_KEY and redeploy.</div>';
    return '';
  }

  function bannerFlag(st) { return st; }

  function applyLock(st) {
    // In remote mode without a session the app is not rendered yet, so no lock needed here.
  }

  function updateUsers(users) {
    try {
      ensureDom();
      if (chip && users && users.length) chip.setAttribute('data-users', users.length);
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { ensureDom(); set(_last.st, _last.label); }, 0);
  });

  return { set: set, updateUsers: updateUsers };
})();

/* Wire DataService status into the StatusBar (idempotent, safe each load) */
(function () {
  function wire() {
    if (!window.DataService || !window.StatusBar) return;
    if (window._statusWired) return;
    window._statusWired = true;
    DataService.onStatus(function (st, label) {
      StatusBar.set(st, label);
    });
    StatusBar.set(DataService.status, DataService.mode === 'dev' ? 'DEV' : '');
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') wire();
  else document.addEventListener('DOMContentLoaded', wire);
})();