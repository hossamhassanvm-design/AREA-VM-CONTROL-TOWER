/* ============================================================
   AREA VM CONTROL TOWER V3 — App root: router, nav, i18n boot
   ============================================================ */

let ROUTE = { page: 'dashboard', args: [], query: {} };

const NAV = [
  ['dashboard', 'nav_dash', '🏠'],
  ['mobile', 'nav_mobile', '📱'],
  ['daily', 'nav_daily', '📋'],
  ['visits', 'nav_visits', '🗺️'],
  ['visit-mail', 'nav_visitMail', '✉️'],
  ['videos', 'nav_videos', '🎥'],
  ['weekly', 'nav_weekly', '📅'],
  ['money-map', 'nav_mm', '💵'],
  ['alerts', 'nav_alerts', '🚨'],
  ['analysis', 'nav_analysis', '📊'],
  ['branches', 'nav_branches', '🏬'],
  ['compare', 'nav_compare', '⚖️'],
  ['tasks', 'nav_tasks', '✅'],
  ['attendance', 'nav_attendance', '📋'],
  ['money-map-history', 'nav_mmHistory', '🗺️'],
  ['month-compare', 'nav_monthCompare', '📊'],
  ['settings', 'nav_settings', '⚙️']
];

function parseHash() {
  const h = location.hash || '#/dashboard';
  const qi = h.indexOf('?');
  let path = qi >= 0 ? h.slice(1, qi) : h.slice(1);
  const query = {};
  if (qi >= 0) {
    h.slice(qi + 1).split('&').forEach(p => {
      if (!p) return;
      const eq = p.indexOf('=');
      const k = eq >= 0 ? decodeURIComponent(p.slice(0, eq)) : decodeURIComponent(p);
      const v = eq >= 0 ? decodeURIComponent(p.slice(eq + 1)) : '';
      query[k] = v;
    });
  }
  const parts = path.split('/').filter(Boolean);
  return { page: (parts[0] || 'dashboard').toLowerCase(), args: parts.slice(1), query, raw: h };
}

function resolveView() {
  const r = parseHash();
  ROUTE = r;
  window._autoForm = (r.query && r.query.new === '1') ? r.page : null;
  const page = r.page;
  const args = r.args;

  if (page === '' || page === 'dashboard') return Views.dashboard();
  if (page === 'mobile') return Views.mobile();
  if (page === 'daily' || page === 'daily-control') return Views.dailyControl();
  if (page === 'visits') return Views.visits();
  if (page === 'visit-mail') return Views.visitMail();
  if (page === 'videos') return Views.videos();
  if (page === 'weekly') return Views.weekly();
  if (page === 'money-map') return Views.moneyMap();
  if (page === 'alerts') return Views.alerts(r.query);
  if (page === 'analysis') return Views.analysis(args[0] || 'daily');
  if (page === 'branches') return Views.branches();
  if (page === 'branch') return args[0] ? Views.branch(decodeURIComponent(args[0]).toUpperCase()) : Views.branches();
  if (page === 'compare') return Views.compare();
  if (page === 'member') return Views.member(args[0]);
  if (page === 'settings') return Views.settings();
  if (page === 'tasks') return Views.tasksCalendar();
  if (page === 'attendance') return Views.attendance();
  if (page === 'money-map-history') return Views.moneyMapHistory();
  if (page === 'month-compare') return Views.monthCompare();
  if (page === 'daily-control') return Views.dailyControl();
  return Views.notFound();
}

function renderNav() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  const active = ROUTE.page;
  const role = (window.DataService && DataService.role) || 'VIEWER';
  const visibleNav = NAV.filter(([p]) => {
    if (p === 'settings') return !!DataService && DataService.status === 'online';
    return true;
  });
  nav.innerHTML = visibleNav.map(([p, labelKey, icon]) => {
    const isActive = active === p;
    return '<div class="nav-item"><a href="#/' + p + '"><button class="' + (isActive ? 'active' : '') + '">' + icon + ' ' + esc(t(labelKey)) + '</button></a></div>';
  }).join('');
}

function initBranchSelects(root) {
  root.querySelectorAll('.form-panel, .filters').forEach(form => {
    const mSel = form.querySelector('select[id$="Member"]:not([id^=flt])');
    const bSel = form.querySelector('select[data-branches]');
    if (mSel && bSel && !bSel.dataset.bound) {
      const memberId = mSel.value;
      if (memberId) {
        bSel.innerHTML = Store.memberBranchCodes(Store.findMember(memberId)).map(b =>
          '<option value="' + esc(b) + '">' + esc(b) + '</option>').join('');
      }
      bSel.dataset.bound = '1';
    }
  });
}

function router() { render(); }
window.router = router;

function render() {
  ChartKit.destroyAll();
  const keepScroll = window.__preserveScrollOnNextRender === true;
  const savedX = keepScroll ? window.scrollX : 0;
  const savedY = keepScroll ? window.scrollY : 0;
  const view = resolveView();
  const app = document.getElementById('appView');
  if (!app) return;
  app.innerHTML = view.html;
  try {
    if (view.init) view.init(app);
  } catch (e) { console.error('view init error', e); toast('Error: ' + e.message); }
  initBranchSelects(app);
  renderNav();
  document.title = t('brandTitle') + ' V3';
  if (keepScroll) {
    window.__preserveScrollOnNextRender = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        window.scrollTo(savedX, savedY);
      });
    });
  } else {
    window.scrollTo(0, 0);
  }
}

function afterLanguageChange() { render(); }

/* bind member change -> refresh dependent branch selects inside forms */
document.addEventListener('change', (e) => {
  const sel = e.target;
  if (sel.tagName !== 'SELECT' || !/Member$/.test(sel.id)) return;
  const form = sel.closest('.form-panel, .filters');
  if (!form) return;
  const branchSel = form.querySelector('select[data-branches]');
  if (branchSel) {
    branchSel.innerHTML = Store.memberBranchCodes(Store.findMember(sel.value)).map(b =>
      '<option value="' + esc(b) + '">' + esc(b) + '</option>').join('');
  }
});

function boot() {
  const cfg = window.VM_CONFIG && window.VM_CONFIG.isConfigured;
  if (cfg) {
    afterBoot(); // render baseline shell instantly even while connecting
    DataService.bootstrap().then(afterBoot).catch(() => afterBoot());
  } else {
    Store.load();
    afterBoot();
  }
}

function afterBoot() {
  /* remote-mode defensive shell: if we never got a session/DB (offline),
     rendered baseline master in-memory (never persisted) so views don't
     crash; the OFFLINE banner explains the state. */
  if (window.DataService && DataService.mode === 'remote' && !DataService.hydrated && DataService.status !== 'online') {
    if (!Store.state) Store.state = Store.defaultState();
    if (!Store.state.members || !Store.state.members.length) Store.state.members = seedMembers();
  }
  setLang(LANG);
  render();
  if (window._avctBound) return;
  window._avctBound = true;
  window.addEventListener('hashchange', render);
  const langBtn = document.getElementById('langBtn');
  if (langBtn) langBtn.addEventListener('click', () => {
    setLang(LANG === 'ar' ? 'en' : 'ar');
  });
  addLogoutControl();
  initYearFilter();
}

/* log out button (remote mode only) */
function addLogoutControl() {
  if (!(window.DataService && DataService.mode === 'remote')) return;
  const bar = document.getElementById('topBar') || document.getElementById('topLive');
  if (!bar || bar.querySelector('#logoutBtn')) return;
  const b = document.createElement('button');
  b.id = 'logoutBtn';
  b.className = 'logout-btn';
  b.textContent = 'Logout / خروج';
  b.addEventListener('click', () => { DataService.logout(); });
  bar.appendChild(b);
}

/* top-year select already handled per-view; keep a global no-op safe hook */
function initYearFilter() {}

document.addEventListener('DOMContentLoaded', boot);