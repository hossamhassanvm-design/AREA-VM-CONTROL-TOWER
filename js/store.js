/* ============================================================
   AREA VM CONTROL TOWER V1 — Data Store
   All data persisted in localStorage. One save point per change.
   Future: swap these functions for Google Sheets / Database API calls.
   ============================================================ */

const STORE_KEY = 'area_vm_control_tower_v3_state';
let _idCounter = 1;

function uid() {
  return 'id_' + Date.now().toString(36) + '_' + (_idCounter++).toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

const Store = {
  state: null,

  defaultState() {
    return {
      version: 4,
      prefs: {
        gsKey: '',
        gmailKey: '',
        dbConn: ''
      },
      members: [],          // {id, name:{en,ar}, order}
      dailyReports: [],     // legacy/member daily records
      dailyBranchReports: [], // {id,date,memberId,branch,status}
      moneyMaps: [],        // {branch, memberId, lastUpdate, codesNoLoc, splitGroups, emptyLoc, stockRoom, l0}
      visits: [],           // visit-plan records
      visitMails: [],       // {id,visitDate,memberId,branch,region,mailSentDate,comment,pictureName,sheetName}
      videos: [],           // {id, date, memberId, branch, videoIn, videoOut, comment}
      weekly: [],           // {id, weekStart, memberId, outfit, window, meeting}
      visitSchedule: [],    // {id,date,memberId,branch,shift,status,originalBranch,newBranch,newDate,reason}
      visitScheduleFiles: [], // uploaded schedule metadata
      issues: [],           // {id, date, memberId, branch, title, severity, status, dueDate}
      tasks: [],            // {id, createdAt, dueDate, dueTime, memberId, branch, title, description, priority, status, comment}
                            //   status flow: CREATED → IN_PROGRESS → SUBMITTED → APPROVED | APPROVED_LATE | NEED_CORRECTION | OVERDUE
      attendance: [],       // {id, date, memberId, checkIn, status}  status: ON_TIME | LATE | ABSENT | OFF | WORK_MISSION
      moneyMapDaily: [],    // {branch, memberId, date, lastRegDate, codesNoLoc, splitGroups, emptyLoc, stockRoom, l0, comment}
                            //   one row per (branch,date) — full daily history, never overwritten across days
      handledAlerts: []     // [alertId, ...]
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && (s.version === 2 || s.version === 3 || s.version === 4) && Array.isArray(s.members)) {
          // merge with defaults so new keys are never missing
          const def = this.defaultState();
          this.state = Object.assign(def, s);
          this.state.dailyBranchReports = Array.isArray(this.state.dailyBranchReports) ? this.state.dailyBranchReports : [];
          this.state.visitMails = Array.isArray(this.state.visitMails) ? this.state.visitMails : [];
          this.state.visitScheduleFiles = Array.isArray(this.state.visitScheduleFiles) ? this.state.visitScheduleFiles : [];
          if (this.state.version < 4) this.migrateToV4();
          dataSanitize(this.state);
          return;
        }
      }
    } catch (e) { console.warn('Store load failed', e); }
    this.reset();
  },

  /* v2/v3 -> v4: strip ALL demo/operational data, keep master (Area VMs + Branch Master). */
  migrateToV4() {
    const operational = [
      'dailyReports', 'dailyBranchReports', 'moneyMaps', 'visits', 'visitMails',
      'videos', 'weekly', 'visitSchedule', 'visitScheduleFiles',
      'issues', 'tasks', 'attendance', 'moneyMapDaily', 'handledAlerts'
    ];
    operational.forEach(k => { this.state[k] = []; });
    this.state.members = seedMembers();
    this.state.version = 4;
    this.save();
  },

  save() {
    /* Prefs are the only thing persisted locally; operational data lives in
       Supabase and is written through DataService.commit() (see Store.mutate).
       Dev mode (no backend) keeps the exact legacy localStorage behaviour. */
    if (typeof DataService !== 'undefined' && DataService.mode === 'remote' && DataService.hydrated) {
      try {
        localStorage.setItem(STORE_KEY + '_prefs', JSON.stringify(this.state.prefs || {}));
      } catch (e) { /* ignore */ }
      return;
    }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch (e) { console.error('Save failed', e); }
  },

  /* ==================================================================
     CONFIRMED MUTATIONS
     ------------------------------------------------------------------
     In remote mode every mutation is written through to Supabase and the
     returned promise settles ONLY after the server confirms:
        ok  -> the record exists in the DB (it is then the source of truth)
        err -> the optimistic local change is ROLLED BACK and the exact
               server error is surfaced; nothing is left pending.
     The record is optimistically shown while the write is in flight and is
     tagged _sync:'pending' so the UI can show it is not yet saved.
     In dev mode these stay synchronous and behave exactly as before.
     ================================================================== */
  isRemote() {
    return typeof DataService !== 'undefined' && DataService.mode === 'remote' && DataService.hydrated;
  },

  /* Apply a local mutation, then confirm it with the server.
     undo() restores the previous state when the write is rejected. */
  mutate(kind, apply, undo) {
    if (!this.isRemote()) {
      apply();
      this.save();
      return Promise.resolve({ ok: true, id: null });
    }
    apply();
    var rec = this.lastTouched;
    if (rec) rec._sync = 'pending';
    this.save();
    return DataService.commit({ kind: kind, rec: rec }).then(function (r) {
      if (r && r.ok) {
        // a superseded write was skipped: the newer queued write for the same
        // record carries the final state, so leave it pending until it lands.
        if (rec && !r.superseded) { rec._sync = 'ok'; if (r.id) rec._dbId = r.id; }
        return r;
      }
      undo();                                   // server rejected it: undo the lie
      if (rec) rec._sync = 'error';
      var err = (r && r.error) || 'Save failed';
      if (typeof DataService !== 'undefined') DataService.lastError = err;
      console.error('[AVCT] save rejected (' + kind + '):', err);
      toast('Not saved: ' + err);
      return { ok: false, error: err };
    });
  },

  /* Remove a record only after the server confirms the delete. */
  mutateDelete(kind, rec) {
    if (!this.isRemote()) {
      this.state[kind] = this.state[kind].filter(function (r) { return r !== rec && r.id !== rec.id; });
      this.save();
      return Promise.resolve({ ok: true });
    }
    var idx = (this.state[kind] || []).indexOf(rec);
    this.state[kind] = this.state[kind].filter(function (r) { return r !== rec; });
    this.save();
    const self = this;
    return DataService.remove({ kind: kind, rec: rec }).then(function (r) {
      if (r && r.ok) return r;
      if (idx >= 0) self.state[kind].splice(idx, 0, rec);   // put it back
      var err = (r && r.error) || 'Delete failed';
      if (typeof DataService !== 'undefined') DataService.lastError = err;
      console.error('[AVCT] delete rejected (' + kind + '):', err);
      toast('Not deleted: ' + err);
      return { ok: false, error: err };
    });
  },

  /* resolves when every in-flight write has been confirmed or rolled back */
  settled() {
    if (typeof DataService === 'undefined' || !DataService.whenSettled) return Promise.resolve();
    return DataService.whenSettled();
  },

  /* Await a mutation and only then report success.
     use: Store.confirm(Store.addDaily(rec), t('savedPrefs'))
     In dev mode the promise is already resolved, so behaviour is unchanged. */
  confirm(promise, okMsg) {
    if (!promise || !promise.then) { if (okMsg) toast(okMsg); return Promise.resolve({ ok: true }); }
    return promise.then(function (r) {
      if (r && r.ok === false) return r;        // mutate() already toasted the reason
      if (okMsg) toast(okMsg);
      return r;
    });
  },

  reset() {
    if (typeof DataService !== 'undefined' && DataService.mode === 'remote') {
      toast(typeof t === 'function' ? (t('resetRemoteWarn') || 'Remote shared data is managed per-user; wipe lives in the Supabase Dashboard') : 'Remote data wipe not available');
      return this;
    }
    this.state = this.defaultState();
    this.state = seedDemoData(this.state);
    this.save();
  },

  /* true when any real operational data exists (drives "no invented metrics" gating) */
  hasOperationalData() {
    const S = this.state;
    const keys = ['dailyReports', 'dailyBranchReports', 'moneyMaps', 'visits', 'visitMails', 'videos', 'weekly', 'issues', 'tasks', 'attendance', 'moneyMapDaily'];
    return keys.some(k => (S[k] || []).length > 0);
  },

  /* ---------- generic id helpers ---------- */
  findMember(id) { return this.state.members.find(m => m.id === id); },
  findMembersByBranch(code) { return this.state.members.filter(m => (m.branches || []).includes(code)); },
  memberName(m) {
    if (!m) return LANG === 'ar' ? '—' : '?';
    return (LANG === 'ar' && m.name.ar) ? m.name.ar : m.name.en;
  },
  memberBranchCodes(m) { return (m && m.branches) ? m.branches : []; },

  addTo(kind, rec) { this.state[kind].push(rec); this.save(); },
  updateRec(kind, id, patch) {
    const i = this.state[kind].findIndex(r => r.id === id);
    if (i < 0) return Promise.resolve({ ok: false, error: 'record not found' });
    const before = Object.assign({}, this.state[kind][i]);
    const rec = this.state[kind][i];
    return this.mutate(kind, function () {
      this.state[kind][i] = Object.assign({}, rec, patch);
      this.lastTouched = this.state[kind][i];
    }.bind(this), function () {
      this.state[kind][i] = before;
    }.bind(this));
  },
  deleteRec(kind, id) {
    const rec = (this.state[kind] || []).find(r => r.id === id);
    if (!rec) return Promise.resolve({ ok: true });
    return this.mutateDelete(kind, rec);
  },

  /* ---------- typed shortcuts ---------- */
  addDaily(r) {
    const self = this;
    const i = this.state.dailyReports.findIndex(x => x.date === r.date && x.memberId === r.memberId && (x.branch || '') === (r.branch || ''));
    if (i >= 0) {
      const before = Object.assign({}, this.state.dailyReports[i]);
      return this.mutate('dailyReports', function () {
        self.state.dailyReports[i] = Object.assign({}, before, r);
        self.lastTouched = self.state.dailyReports[i];
      }, function () { self.state.dailyReports[i] = before; });
    }
    r.id = r.id || uid();
    const self2 = this;
    return this.mutate('dailyReports', function () {
      self2.state.dailyReports.push(r);
      self2.lastTouched = r;
    }, function () {
      self2.state.dailyReports = self2.state.dailyReports.filter(x => x !== r);
    });
  },
  addVisit(r) { r.id = r.id || uid(); const self = this; return this.mutate('visits', function () { self.state.visits.push(r); self.lastTouched = r; }, function () { self.state.visits = self.state.visits.filter(x => x !== r); }); },
  addVisitMail(r) { r.id = r.id || uid(); const self = this; return this.mutate('visitMails', function () { self.state.visitMails.push(r); self.lastTouched = r; }, function () { self.state.visitMails = self.state.visitMails.filter(x => x !== r); }); },
  updateVisitMail(id, patch) { return this.updateRec('visitMails', id, patch); },
  deleteVisitMail(id) { return this.deleteRec('visitMails', id); },
  addDailyBranch(r) {
    const self = this;
    const i = this.state.dailyBranchReports.findIndex(x => x.date === r.date && x.memberId === r.memberId && x.branch === r.branch);
    if (i >= 0) {
      const before = Object.assign({}, this.state.dailyBranchReports[i]);
      return this.mutate('dailyBranchReports', function () {
        self.state.dailyBranchReports[i] = Object.assign({}, before, r);
        self.lastTouched = self.state.dailyBranchReports[i];
      }, function () { self.state.dailyBranchReports[i] = before; });
    }
    r.id = r.id || uid();
    return this.mutate('dailyBranchReports', function () {
      self.state.dailyBranchReports.push(r);
      self.lastTouched = r;
    }, function () {
      self.state.dailyBranchReports = self.state.dailyBranchReports.filter(x => x !== r);
    });
  },
  addVideo(r) { r.id = r.id || uid(); const self = this; return this.mutate('videos', function () { self.state.videos.push(r); self.lastTouched = r; }, function () { self.state.videos = self.state.videos.filter(x => x !== r); }); },
  addWeekly(r) { r.id = r.id || uid(); const self = this; return this.mutate('weekly', function () { self.state.weekly.push(r); self.lastTouched = r; }, function () { self.state.weekly = self.state.weekly.filter(x => x !== r); }); },
  addIssue(r) { r.id = r.id || uid(); const self = this; return this.mutate('issues', function () { self.state.issues.push(r); self.lastTouched = r; }, function () { self.state.issues = self.state.issues.filter(x => x !== r); }); },
  updateIssue(id, patch) { return this.updateRec('issues', id, patch); },
  addMoneyMap(r) { const self = this; return this.mutate('moneyMaps', function () { self.state.moneyMaps.push(r); self.lastTouched = r; }, function () { self.state.moneyMaps = self.state.moneyMaps.filter(x => x !== r); }); },
  updateMoneyMap(branch, patch) {
    const self = this;
    const i = this.state.moneyMaps.findIndex(mm => mm.branch === branch);
    if (i < 0) return Promise.resolve({ ok: false, error: 'record not found' });
    const before = Object.assign({}, this.state.moneyMaps[i]);
    return this.mutate('moneyMaps', function () {
      self.state.moneyMaps[i] = Object.assign({}, before, patch);
      self.lastTouched = self.state.moneyMaps[i];
    }, function () { self.state.moneyMaps[i] = before; });
  },
  mmBranch(branch) { return (this.state.moneyMaps || []).find(mm => mm.branch === branch); },
  /* money map — full daily history: NEW row per (branch,date), never overwrites older days */
  addMoneyMapDaily(r) {
    const self = this;
    const i = this.state.moneyMapDaily.findIndex(x => x.branch === r.branch && x.date === r.date);
    if (i >= 0) {
      const before = Object.assign({}, this.state.moneyMapDaily[i]);
      return this.mutate('moneyMapDaily', function () {
        self.state.moneyMapDaily[i] = Object.assign({}, before, r);
        self.lastTouched = self.state.moneyMapDaily[i];
        self.refreshDerived();
      }, function () { self.state.moneyMapDaily[i] = before; self.refreshDerived(); });
    }
    r.id = r.id || uid();
    return this.mutate('moneyMapDaily', function () {
      self.state.moneyMapDaily.push(r);
      self.lastTouched = r;
      self.refreshDerived();
    }, function () {
      self.state.moneyMapDaily = self.state.moneyMapDaily.filter(x => x !== r);
      self.refreshDerived();
    });
  },
  deleteMoneyMapDailyRec(kind, id) { return this.deleteRec(kind, id); },

  /* moneyMaps is a derived view of the latest moneyMapDaily per branch;
     in remote mode DataService owns that projection. */
  refreshDerived() {
    if (typeof DataService !== 'undefined' && DataService.rebuildMoneyMaps) DataService.rebuildMoneyMaps();
  },

  /* ---------- tasks (virtual/window/meeting work orders) ---------- */
  addTask(r) { r.id = r.id || uid(); const self = this; return this.mutate('tasks', function () { self.state.tasks.push(r); self.lastTouched = r; }, function () { self.state.tasks = self.state.tasks.filter(x => x !== r); }); },
  updateTask(id, patch) { return this.updateRec('tasks', id, patch); },
  deleteTask(id) { return this.deleteRec('tasks', id); },

  /* ---------- attendance (right of way / leave / work-mission) ---------- */
  addAttendance(r) { r.id = r.id || uid(); const self = this; return this.mutate('attendance', function () { self.state.attendance.push(r); self.lastTouched = r; }, function () { self.state.attendance = self.state.attendance.filter(x => x !== r); }); },
  updateAttendance(id, patch) { return this.updateRec('attendance', id, patch); },
  deleteAttendance(id) { return this.deleteRec('attendance', id); },

  savePrefs(p) {
    Object.assign(this.state.prefs, p);
    this.save();
  },

  /* ---------- helpers to mirror tables back into members ---------- */
  saveBranches(memberId, codes) {
    const m = this.findMember(memberId);
    if (!m) return Promise.resolve({ ok: false, error: 'member not found' });
    const before = (m.branches || []).slice();
    const self = this;
    return this.mutate('members', function () { m.branches = codes; }, function () { m.branches = before; });
  },

  /* CSV export bundle */
  exportCSV(kind) {
    const rows = this.csvRows(kind);
    if (!rows.length) return null;
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell == null ? '' : cell);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    return csv;
  },

  csvRows(kind) {
    const S = this.state;
    const rows = [];
    if (kind === 'daily') {
      rows.push(['date', 'member', 'status', 'email_sent', 'images', 'excel']);
      [...S.dailyReports].sort((a, b) => b.date.localeCompare(a.date)).forEach(r => rows.push([r.date, this.memberName(this.findMember(r.memberId)), r.status, r.emailSent ? 'yes' : 'no', r.emailImages ? 'yes' : 'no', r.emailExcel ? 'yes' : 'no']));
    } else if (kind === 'moneyMap') {
      rows.push(['branch', 'member', 'last_update', 'codes_no_location', 'split_groups', 'empty_locations', 'stock_room_codes', 'l0_codes']);
      S.moneyMaps.forEach(m => rows.push([m.branch, this.memberName(this.findMember(m.memberId)), m.lastUpdate, m.codesNoLoc, m.splitGroups, m.emptyLoc, m.stockRoom, m.l0]));
    } else if (kind === 'visits') {
      rows.push(['date', 'member', 'branch', 'status']);
      [...S.visits].sort((a, b) => b.date.localeCompare(a.date)).forEach(v => rows.push([v.date, this.memberName(this.findMember(v.memberId)), v.branch, v.status]));
    } else if (kind === 'videos') {
      rows.push(['date', 'member', 'branch', 'video_in_status', 'video_out_status', 'comment']);
      [...S.videos].sort((a, b) => b.date.localeCompare(a.date)).forEach(v => rows.push([v.date, this.memberName(this.findMember(v.memberId)), v.branch, v.videoInStatus || '', v.videoOutStatus || '', v.comment || '']));
    } else if (kind === 'weekly') {
      rows.push(['week_start', 'member', 'outfit', 'window', 'meeting']);
      [...S.weekly].sort((a, b) => b.weekStart.localeCompare(a.weekStart)).forEach(w => rows.push([w.weekStart, this.memberName(this.findMember(w.memberId)), w.outfit, w.window, w.meeting]));
    } else if (kind === 'issues') {
      rows.push(['date', 'member', 'branch', 'title', 'severity', 'status', 'due_date']);
      [...S.issues].sort((a, b) => b.date.localeCompare(a.date)).forEach(i => rows.push([i.date, this.memberName(this.findMember(i.memberId)), i.branch || '', i.title, i.severity, i.status, i.dueDate || '']));
    } else if (kind === 'alerts') {
      rows.push(['severity', 'member', 'branch', 'problem', 'date', 'required_action']);
      Engine.alerts().forEach(a => rows.push([a.severity, this.memberName(this.findMember(a.memberId)), a.branch || '', t('reason_' + a.reason) || a.reason, a.date, t('act_' + a.reason)]));
    }
    return rows;
  }
};

/* ---------- toast + helpers ---------- */
let _toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toastEl');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastEl';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function statusTxt(st) { return t('st_' + st) || st; }
function statusBadge(st) {
  const map = {
    DONE: 'green', WORK_MISSION: 'purple', PERMISSION: 'blue',
    NO: 'red', NOT_DONE: 'red', ANNUAL: 'blue', OFF: 'gray',
    PENDING: 'amber', STILL: 'amber', PLANNED: 'blue', RESCHEDULED: 'amber',
    ON_TIME: 'green', LATE: 'amber', ABSENT: 'red',
    CREATED: 'gray', SUBMITTED: 'blue', APPROVED: 'green',
    APPROVED_LATE: 'amber', NEED_CORRECTION: 'red', OVERDUE: 'red',
    STORE_NOT_SENT: 'amber',
    OPEN: 'red', IN_PROGRESS: 'amber', RESOLVED: 'green',
    CRITICAL: 'red', MAJOR: 'amber', MINOR: 'gray'
  };
  const cls = map[st] || 'gray';
  return '<span class="badge ' + cls + '">' + esc(statusTxt(st)) + '</span>';
}
function sevBadge(sev) {
  return '<span class="badge ' + (sev === 'RED' ? 'red' : 'amber') + '">' + esc(t('severity_' + (sev === 'RED' ? 'RED' : 'AMBER'))) + '</span>';
}

/* ---------- global render helpers shared by every view ---------- */
function escAttr(s) { return esc(s).replace(/`/g, '&#96;'); }
function memberName(id) { return Store.memberName(Store.findMember(id)); }
function badge(s) {
  const map = { DONE: 'green', WORK_MISSION: 'purple', PERMISSION: 'blue', STORE_NOT_SENT: 'amber', NO: 'red', NOT_DONE: 'red', OFF: 'gray', PLANNED: 'blue', RESCHEDULED: 'amber', ON_TIME: 'green', LATE: 'amber', ABSENT: 'red', CREATED: 'gray', SUBMITTED: 'blue', APPROVED: 'green', APPROVED_LATE: 'amber', NEED_CORRECTION: 'red', OVERDUE: 'red' };
  return '<span class="badge ' + (map[s] || 'gray') + '">' + esc(statusTxt(s)) + '</span>';
}

/* ---------- sanitize loaded legacy/v2 data into the V3 shape ---------- */
function dataSanitize(state) {
  if (!state || !Array.isArray(state.members)) return;
  (state.moneyMaps || []).forEach(mm => {
    const owner = state.members.find(m => (m.id === mm.memberId) || (m.branches || []).includes(mm.branch));
    if (owner) mm.memberId = owner.id;
  });
}

/* ---------- shared "empty operational data" presentation ---------- */
function emptyStateHtml(msg, sub) {
  return '<div class="empty-state"><div class="empty-state-ico">🗂️</div>' +
    '<div class="empty-state-txt">' + esc(msg) + '</div>' +
    (sub ? '<div class="empty-state-sub">' + esc(sub) + '</div>' : '') +
    '</div>';
}