/* ============================================================
   DataService — live backend bridge (Supabase) with a dev fallback.
   ------------------------------------------------------------
   Dev mode (no config):         no-op; localStorage is the store;
                                 exactly the V3 baseline behaviour.
   Remote mode (config present): Store.state is hydrated from the DB,
                                 Storage is bypassed for operational data,
                                 every Store.save() diffs dirty collections,
                                 flushes them to Supabase and applies
                                 realtime changes back into the current view.
   ============================================================ */
window.DataService = (function () {
  var T = window.VM_CONFIG && window.VM_CONFIG.isConfigured;

  var api = {
    mode: T ? 'remote' : 'dev',      // 'dev' | 'remote' | 'remote-error'
    status: T ? 'connecting' : 'dev',// dev|connecting|online|offline|syncing|config
    role: null,                      // ADMIN | OPERATION_MANAGER | AREA_VM | VIEWER | null
    areas: [],                       // area codes visible to this user
    user: null,
    hydrated: false,
    loginResolve: null,
    _sb: null,
    _snap: {},                       // {collectionKey: [records]} last known DB state
    _maps: null,                     // master lookup tables
    _flushTimer: null,
    _rerenderTimer: null,
    _everOnline: false
  };

  var LOG = []; // in-session audit trail (also via DB audit_log when online)

  /* ---------- hard timeout so a stalled promise never leaves us CONNECTING ---------- */
  function withTimeout(p, ms, tag) {
    var settled = false;
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error((tag || 'operation') + ' timed out after ' + ms + 'ms')); }
      }, ms);
      p.then(function (v) { if (settled) return; settled = true; clearTimeout(t); resolve(v); },
             function (e) { if (settled) return; settled = true; clearTimeout(t); reject(e); });
    });
  }

  /* ---------- master lookups built at hydrate ---------- */
  function buildMaps() {
    var maps = { areaById: {}, idByArea: {}, idByCode: {}, nameByCode: {}, codeById: {}, branchIdByCode: {}, codeByBranchId: {}, memberIdForAreaCode: {} };
    // Branches are intentionally kept as simple codes in Store.state for the UI,
    // but their UUIDs come from the remote branches table. Build the code -> UUID
    // lookup from the actual DB rows so a branch selection can never degrade to null.
    (api._branchRows || []).forEach(function (b) {
      if (b && b.code && b.id) {
        maps.branchIdByCode[String(b.code).toUpperCase()] = b.id;
        maps.codeByBranchId[b.id] = b.code;
      }
    });
    (api._members || []).forEach(function (m) {
      var a = m.area; // {id, code, name_en, name_ar, ord}
      maps.areaById[a.id] = a;
      maps.idByArea[a.id] = 'm_' + a.code;
      maps.idByCode[a.code] = a.id;
      maps.codeById[a.id] = a.code;
      maps.nameByCode[a.code] = a;
      maps.memberIdForAreaCode[a.code] = 'm_' + a.code;
      (m.branches || []).forEach(function (b) {
        // Support both master shapes: branch objects and legacy branch codes.
        if (typeof b === 'string') {
          var bc = String(b).toUpperCase();
          // Do not overwrite the UUID resolved from the branches table.
          if (!maps.branchIdByCode[bc]) maps.branchIdByCode[bc] = null;
          if (!maps.codeByBranchId[bc]) maps.codeByBranchId[bc] = bc;
        } else if (b) {
          maps.branchIdByCode[String(b.code).toUpperCase()] = b.id;
          maps.codeByBranchId[b.id] = b.code;
        }
      });
    });
    return maps;
  }

  function areaIdFor(rec) {
    var maps = api._maps;
    if (!maps) return null;
    if (rec.memberId) return maps.idByCode[String(rec.memberId).replace(/^m_/, '')] || null;
    return null;
  }
  function branchIdFor(code) {
    if (!code || !api._maps) return null;
    var normalizedCode = String(code).trim().toUpperCase();
    var id = api._maps.branchIdByCode[normalizedCode] || api._maps.branchIdByCode[code];
    if (id) return id;
    // Authoritative fallback: the hydrated branches table.
    var rows = api._branchRows || [];
    for (var k = 0; k < rows.length; k++) {
      if (rows[k] && String(rows[k].code || '').trim().toUpperCase() === normalizedCode && rows[k].id) return rows[k].id;
    }
    // Defensive fallback for legacy/object master shapes.
    var members = api._members || [];
    for (var i = 0; i < members.length; i++) {
      var bs = members[i].branches || [];
      for (var j = 0; j < bs.length; j++) {
        var b = bs[j];
        if (typeof b === 'object' && b.code && String(b.code).trim().toUpperCase() === normalizedCode && b.id) return b.id;
      }
    }
    return null;
  }
  function toMemberId(code) { return code ? ('m_' + code) : null; }

  /* ------------------------------------------------------------------
     DB write guards: per-table allowed value sets + fallback mapping.
     Matches the CHECK constraints in supabase/migrations/0001_init.sql.
     Values the UI uses but the DB rejects (e.g. 'ANNUAL' on
     daily_reports) are mapped to the nearest allowed status instead of
     failing the whole sync — schema stays untouched.
     ------------------------------------------------------------------ */
  var DB_ALLOW = {
    'daily_reports': {
      status: { allow: ['DONE','NO','STORE_NOT_SENT','PERMISSION','WORK_MISSION','OFF','NOT_DONE','PLANNED','PENDING','SUBMITTED','APPROVED','APPROVED_LATE','NEED_CORRECTION','OVERDUE','CREATED','IN_PROGRESS'], map: { ANNUAL: 'OFF' } }
    },
    'visit_plan': {
      status: { allow: ['DONE','NO','PERMISSION','WORK_MISSION','LATE','PLANNED','RESCHEDULED','NOT_DONE','PENDING'], map: {} }
    },
    'video_visits': {
      video_in_status: { allow: ['DONE','NO','PERMISSION','LATE'], map: {} },
      video_out_status: { allow: ['DONE','NO','PERMISSION','LATE'], map: {} }
    },
    'tasks': {
      status: { allow: ['CREATED','IN_PROGRESS','SUBMITTED','APPROVED','APPROVED_LATE','NEED_CORRECTION','OVERDUE','ON_TIME','LATE','ABSENT','OFF','WORK_MISSION','STORE_NOT_SENT','DONE','NO','PERMISSION','PLANNED'], map: {} },
      priority: { allow: ['HIGH','MEDIUM','LOW'], map: {} }
    },
    'attendance': {
      status: { allow: ['ON_TIME','LATE','ABSENT','OFF','WORK_MISSION','PERMISSION','STORE_NOT_SENT'], map: {} }
    },
    'issues': {
      status: { allow: ['OPEN','RESOLVED','IN_PROGRESS','CLOSED'], map: {} },
      severity: { allow: ['RED','AMBER','MINOR','CRITICAL','MAJOR'], map: {} }
    }
  };

  function sanitizeRow(table, row) {
    var defs = DB_ALLOW[table];
    if (!defs) return row;
    var out = {};
    for (var k in row) {
      var v = row[k];
      var d = defs[k];
      if (d && v != null && d.allow.indexOf(String(v)) === -1) {
        var mapped = (d.map && d.map[String(v)]) || d.allow[0];
        console.warn('[AVCT] sanitized ' + table + '.' + k + ' "' + v + '" -> "' + mapped + '" (DB check constraint)');
        v = mapped;
      }
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  function recordFlushError(c, e) {
    var msg = (e && e.message) || String(e);
    api._flushErr = c.table + ': ' + msg;
    console.error('[AVCT] flush', c.table, msg);
    logAudit('flush-error', c.table, null, msg);
  }

  /* ======================================================================
     COLLECTION MAP: local state array <-> DB table
     ====================================================================== */
  var COLLECTIONS = [
    {
      local: 'members', table: null,
      key: function (m) { return m.id; }
    },
    {
      local: 'dailyBranchReports', table: 'daily_reports',
      key: function (r) { return r.id || (r.date + '|' + (r.memberId || '') + '|' + (r.branch || '')); },
      toDB: function (r) {
        var bid = branchIdFor(r.branch);
        if (r.branch && !bid) throw new Error('Branch ' + r.branch + ' is not mapped to a database branch');
        return { report_date: r.date, area_vm_id: areaIdFor(r), branch_id: bid, status: r.status || null, comment: r.comment || null, data: r };
      },
      fromDB: function (row) {
        return { id: row.id, date: row.report_date, memberId: toMemberId(api._maps.codeById[row.area_vm_id]), branch: api._maps.codeByBranchId[row.branch_id] || (row.data && row.data.branch) || '', status: row.status, comment: row.comment || '' };
      },
      conflict: 'daily_reports_uniq_branch',
      partialUnique: true,
      partialWhere: { branch_id: 'notnull' },
      conflictCols: ['report_date', 'area_vm_id', 'branch_id']
    },
    {
      local: 'dailyReports', table: 'daily_reports',
      key: function (r) { return r.id || (r.date + '|' + (r.memberId || '') + '|' + (r.branch || '')); },
      toDB: function (r) { return { report_date: r.date, area_vm_id: areaIdFor(r), branch_id: null, status: r.status || null, email_sent: !!r.emailSent, email_images: !!r.emailImages, email_excel: !!r.emailExcel, comment: r.comment || null, data: r }; },
      fromDB: function (row) {
        return { id: row.id, date: row.report_date, memberId: toMemberId(api._maps.codeById[row.area_vm_id]), branch: (row.data && row.data.branch) || '', status: row.status, emailSent: !!row.email_sent, emailImages: !!row.email_images, emailExcel: !!row.email_excel, comment: row.comment || '' };
      },
      conflict: 'daily_reports_uniq_nobranch',
      partialUnique: true,
      partialWhere: { branch_id: 'null' },
      conflictCols: ['report_date', 'area_vm_id']
    },
    {
      local: 'visits', table: 'visit_plan',
      key: function (r) { return r.id || (r.date + '|' + (r.memberId || '') + '|' + (r.branch || '')); },
      toDB: function (r) { return { visit_date: r.date, area_vm_id: areaIdFor(r), branch_id: branchIdFor(r.branch), shift: r.shift || null, status: r.status || 'PLANNED', reason: r.reason || null, comment: r.comment || null, data: r }; },
      fromDB: function (row) {
        return { id: row.id, date: row.visit_date, memberId: toMemberId(api._maps.codeById[row.area_vm_id]), branch: api._maps.codeByBranchId[row.branch_id] || (row.data && row.data.branch) || '', shift: row.shift, status: row.status, reason: row.reason, comment: row.comment };
      },
      conflict: 'visit_plan_uniq',
      partialUnique: true,
      partialWhere: { branch_id: 'notnull' },
      conflictCols: ['visit_date', 'area_vm_id', 'branch_id']
    },
    {
      local: 'visitSchedule', table: 'visit_schedule',
      key: function (r) { return r.id || (r.date + '|' + (r.memberId || '') + '|' + (r.branch || '')); },
      toDB: function (r) { return { visit_date: r.date, area_vm_id: areaIdFor(r), branch_id: branchIdFor(r.branch), shift: r.shift || null, status: r.status || 'PLANNED', original_branch: r.originalBranch || null, new_branch: r.newBranch || null, new_date: r.newDate || null, reason: r.reason || null, data: r }; },
      fromDB: function (row) {
        return { id: row.id, date: row.visit_date, memberId: toMemberId(api._maps.codeById[row.area_vm_id]), branch: api._maps.codeByBranchId[row.branch_id] || (row.data && row.data.branch) || '', shift: row.shift, status: row.status, originalBranch: row.original_branch, newBranch: row.new_branch, newDate: row.new_date, reason: row.reason };
      }
    },
    {
      local: 'visitMails', table: 'visit_mails',
      key: function (r) { return r.id || (r.visitDate + '|' + (r.memberId || '') + '|' + (r.branch || '')); },
      toDB: function (r) {
        return { visit_date: r.visitDate, area_vm_id: areaIdFor(r), branch_id: branchIdFor(r.branch), region: r.region || null, mail_sent: !!(r.mailSentDate), mail_sent_date: r.mailSentDate || null, mail_file_path: r.mailFilePath || (r._mailFile || {}).path || null, excel_added: !!(r.sheetName), pictures_added: !!(r.pictureName), status: r.status || null, comment: r.comment || null, data: r };
      },
      fromDB: function (row) {
        var d = row.data || {};
        return { id: row.id, visitDate: row.visit_date, memberId: toMemberId(api._maps.codeById[row.area_vm_id]), branch: api._maps.codeByBranchId[row.branch_id] || d.branch || '', region: row.region || d.region || '', mailSentDate: row.mail_sent_date || d.mailSentDate || '', comment: row.comment || d.comment || '', pictureName: d.pictureName || '', sheetName: d.sheetName || '', mailFilePath: row.mail_file_path || '', _mailFile: d._mailFile };
      },
      conflict: 'visit_mails_uniq',
      partialUnique: true,
      partialWhere: { branch_id: 'notnull' },
      conflictCols: ['visit_date', 'area_vm_id', 'branch_id']
    },
    {
      local: 'videos', table: 'video_visits',
      key: function (r) { return r.id || (r.date + '|' + (r.memberId || '') + '|' + (r.branch || '')); },
      toDB: function (r) { return { visit_date: r.date, area_vm_id: areaIdFor(r), branch_id: branchIdFor(r.branch), video_in_status: r.videoInStatus || r.videoIn || 'NO', video_out_status: r.videoOutStatus || r.videoOut || 'NO', comment: r.comment || null, data: r }; },
      fromDB: function (row) {
        return { id: row.id, date: row.visit_date, memberId: toMemberId(api._maps.codeById[row.area_vm_id]), branch: api._maps.codeByBranchId[row.branch_id] || (row.data && row.data.branch) || '', videoIn: row.video_in_status, videoOut: row.video_out_status, videoInStatus: row.video_in_status, videoOutStatus: row.video_out_status, comment: row.comment || '' };
      },
      conflict: 'video_visits_uniq',
      partialUnique: true,
      partialWhere: { branch_id: 'notnull' },
      conflictCols: ['visit_date', 'area_vm_id', 'branch_id']
    },
    {
      local: 'weekly', table: 'weekly_reviews',
      key: function (r) { return r.id || (r.weekStart + '|' + (r.memberId || '')); },
      toDB: function (r) { return { week_start: r.weekStart, area_vm_id: areaIdFor(r), outfit: r.outfit || null, window_display: r.window || null, meeting: r.meeting || null, data: r }; },
      fromDB: function (row) {
        return { id: row.id, weekStart: row.week_start, memberId: toMemberId(api._maps.codeById[row.area_vm_id]), outfit: row.outfit, window: (row.window_display != null ? row.window_display : (row.data && row.data.window)) || null, meeting: row.meeting };
      },
      conflict: 'weekly_reviews_uniq',
      conflictCols: ['week_start', 'area_vm_id']
    },
    {
      local: 'issues', table: 'issues',
      key: function (r) { return r.id || (r.date + '|' + (r.memberId || '') + '|' + (r.title || '')); },
      toDB: function (r) { return { issue_date: r.date || null, area_vm_id: areaIdFor(r), branch_id: branchIdFor(r.branch), title: r.title || null, severity: r.severity || 'AMBER', status: r.status || 'OPEN', due_date: r.dueDate || null, data: r }; },
      fromDB: function (row) {
        return { id: row.id, date: row.issue_date, memberId: toMemberId(api._maps.codeById[row.area_vm_id]), branch: api._maps.codeByBranchId[row.branch_id] || (row.data && row.data.branch) || '', title: row.title, severity: row.severity, status: row.status, dueDate: row.due_date };
      }
    },
    {
      local: 'tasks', table: 'tasks',
      key: function (r) { return r.id || (r.date + '|' + (r.memberId || '') + '|' + (r.title || '')); },
      toDB: function (r) {
        return { task_date: r.date || (r.dueDate ? r.dueDate.slice(0, 10) : null), area_vm_id: areaIdFor(r), branch_id: branchIdFor(r.branch), title: r.title || '', due_time: r.dueTime || null, due_at: r.dueDate ? (r.dueDate.indexOf('T') >= 0 ? r.dueDate : null) : null, priority: r.priority || 'MEDIUM', status: r.status || 'CREATED', comment: r.comment || null, details: r.description || null, data: r };
      },
      fromDB: function (row) {
        return { id: row.id, createdAt: row.data && row.data.createdAt, date: row.task_date, memberId: toMemberId(api._maps.codeById[row.area_vm_id]), branch: api._maps.codeByBranchId[row.branch_id] || (row.data && row.data.branch) || '', title: row.title, description: row.details || null, priority: row.priority, status: row.status, comment: row.comment || '', dueTime: row.due_time || null, dueDate: row.due_at ? row.due_at.toISOString() : (row.data && row.data.dueDate) || null };
      }
    },
    {
      local: 'attendance', table: 'attendance',
      key: function (r) { return r.id || (r.date + '|' + (r.memberId || '')); },
      toDB: function (r) { return { attendance_date: r.date, area_vm_id: areaIdFor(r), check_in: r.checkIn || null, status: r.status || 'ON_TIME', comment: r.comment || null, data: r }; },
      fromDB: function (row) {
        return { id: row.id, date: row.attendance_date, memberId: toMemberId(api._maps.codeById[row.area_vm_id]), checkIn: row.check_in || '', status: row.status, comment: row.comment || '' };
      },
      conflict: 'attendance_uniq',
      conflictCols: ['attendance_date', 'area_vm_id']
    },
    {
      local: 'moneyMapDaily', table: 'money_map_snapshots',
      key: function (r) { return r.id || (r.branch + '|' + r.date); },
      toDB: function (r) { return { snapshot_date: r.date || r.lastRegDate || r.lastUpdate, area_vm_id: areaIdFor(r), branch_id: branchIdFor(r.branch), codes_no_loc: n(r.codesNoLoc), split_groups: n(r.splitGroups), empty_locations: n(r.emptyLoc), stock_room_codes: n(r.stockRoom), l0_codes: n(r.l0), comment: r.comment || null, data: r }; },
      fromDB: function (row) {
        return { id: row.id, branch: api._maps.codeByBranchId[row.branch_id] || (row.data && row.data.branch) || '', memberId: toMemberId(api._maps.codeById[row.area_vm_id]), date: row.snapshot_date, lastRegDate: row.snapshot_date, codesNoLoc: v(row.codes_no_loc, row.data && row.data.codesNoLoc), splitGroups: v(row.split_groups, row.data && row.data.splitGroups), emptyLoc: v(row.empty_locations, row.data && row.data.emptyLoc), stockRoom: v(r.stock_room_codes, row.data && row.data.stockRoom), l0: v(r.l0_codes, row.data && row.data.l0), comment: r.comment || '' };
      },
      conflict: 'money_map_uniq',
      partialUnique: true,
      partialWhere: { branch_id: 'notnull' },
      conflictCols: ['snapshot_date', 'area_vm_id', 'branch_id']
    },
    {
      local: 'moneyMaps', table: 'money_map_snapshots',
      key: function (r) { return r.branch || '_'; },
      toDB: function (r) { return { snapshot_date: r.lastUpdate || r.lastRegDate || todayISO(), area_vm_id: areaIdFor(r), branch_id: branchIdFor(r.branch), codes_no_loc: n(r.codesNoLoc), split_groups: n(r.splitGroups), empty_locations: n(r.emptyLoc), stock_room_codes: n(r.stockRoom), l0_codes: n(r.l0), comment: r.comment || null, last_update: r.lastUpdate ? (r.lastUpdate.length === 10 ? r.lastUpdate + 'T00:00:00Z' : r.lastUpdate) : null, data: r }; },
      fromDB: function (row) { return null; }, // moneyMaps derived from moneyMapDaily-era snapshots (never hydrated directly)
      conflict: 'money_map_uniq',
      partialUnique: true,
      partialWhere: { branch_id: 'notnull' },
      conflictCols: ['snapshot_date', 'area_vm_id', 'branch_id']
    }
  ];

  function n(v) { return typeof v === 'number' ? v : (v === '' || v == null ? null : NaN == v ? null : +v || null); }
  function v(dbv, fallback) { return (dbv !== null && dbv !== undefined) ? dbv : (fallback !== undefined ? fallback : null); }

  function collByName(local) {
    for (var i = 0; i < COLLECTIONS.length; i++) if (COLLECTIONS[i].local === local) return COLLECTIONS[i];
    return null;
  }

  var serverWrites = {}; // last seen remote timestamps per local key (coarse echo dedupe)
  function normalized(localName, rec) {
    var o = {};
    for (var k in rec) if (Object.prototype.hasOwnProperty.call(rec, k)) o[k] = rec[k];
    delete o._dbId;
    return o;
  }

  /* ---------- snapshot helpers ---------- */
  function snapKey(localName, rec) {
    var c = collByName(localName); if (!c) return null;
    if (rec && rec._dbId) return 'db:' + String(rec._dbId);
    var k = c.key(rec);
    return k != null ? 'key:' + String(k) : (rec && rec.id ? 'id:' + String(rec.id) : null);
  }

  /* c.key prefers r.id, so an optimistic record (client id) and its own Realtime row
     (database uuid) can never match on it. Where the database itself enforces
     c.conflictCols as a unique tuple, that tuple is a safe id-independent identity.
     Collections without a unique index are excluded: two rows may legitimately share
     their date/member/branch there and must not be merged. */
  function bizKey(c, rec) {
    if (!c || !rec || !c.conflictCols || !c.conflictCols.length) return null;
    var shadow = {};
    for (var k in rec) if (k !== '_dbId') shadow[k] = rec[k];
    shadow.id = null;
    var bk = c.key(shadow);
    return (bk != null && bk !== '') ? String(bk) : null;
  }

  /* Reconciliation order for an incoming Realtime row: the row's own id, then the
     _dbId already recorded on a local record, then snapKey, then the enforced
     business key. Returns -1 only when the row is genuinely new. */
  function reconcileIndex(c, list, rec, dbId) {
    if (!list || !list.length) return -1;
    var i;
    if (dbId != null) {
      i = list.findIndex(function (r) { return r && r.id != null && String(r.id) === String(dbId); });
      if (i >= 0) return i;
      i = list.findIndex(function (r) { return r && r._dbId != null && String(r._dbId) === String(dbId); });
      if (i >= 0) return i;
    }
    var key = snapKey(c.local, rec);
    if (key != null) {
      i = list.findIndex(function (r) { return snapKey(c.local, r) === key; });
      if (i >= 0) return i;
    }
    var bk = bizKey(c, rec);
    if (bk != null) {
      i = list.findIndex(function (r) { return bizKey(c, r) === bk; });
      if (i >= 0) return i;
    }
    return -1;
  }
  function snapLoad(localName) {
    var c = collByName(localName); if (!c) return [];
    return api._snap[localName] || [];
  }
  function snapRecord(localName, rec) {
    var c = collByName(localName); if (!c) return null;
    var o = normalized(localName, rec);
    if (rec._dbId) o._dbId = rec._dbId;
    return o;
  }

  /* ======================================================================
     HYDRATION (remote mode only)
     ====================================================================== */
  function hydrate() {
    return api._sb ? _hydrateDB() : Promise.resolve();
  }

  function loadQuery(query, name) {
    return withTimeout(query, 12000, 'read ' + name).then(function (r) {
      if (r && r.error) throw new Error(name + ': ' + r.error.message);
      return (r && r.data) || [];
    });
  }

  function _hydrateDB() {
    var sb = api._sb;
    return Promise.all([
      loadQuery(sb.from('area_vms').select('id,code,name_en,name_ar,ord').order('ord'), 'area_vms'),
      loadQuery(sb.from('branches').select('id,area_vm_id,code,ord').order('ord'), 'branches'),
      loadQuery(sb.from('daily_reports').select('*').order('report_date'), 'daily_reports'),
      loadQuery(sb.from('visit_plan').select('*'), 'visit_plan'),
      loadQuery(sb.from('visit_schedule').select('*'), 'visit_schedule'),
      loadQuery(sb.from('visit_mails').select('*'), 'visit_mails'),
      loadQuery(sb.from('video_visits').select('*'), 'video_visits'),
      loadQuery(sb.from('weekly_reviews').select('*'), 'weekly_reviews'),
      loadQuery(sb.from('issues').select('*'), 'issues'),
      loadQuery(sb.from('tasks').select('*'), 'tasks'),
      loadQuery(sb.from('attendance').select('*'), 'attendance'),
      loadQuery(sb.from('money_map_snapshots').select('*'), 'money_map_snapshots'),
      loadQuery(sb.from('handled_alerts').select('alert_id'), 'handled_alerts')
    ]).then(function (res) {
      try {
        var areaRows = res[0], branchRows = res[1];
        var byId = {}; areaRows.forEach(function (a) { byId[a.code] = a; });
        var members = areaRows.map(function (a) {
          return { id: 'm_' + a.code, name: { en: a.name_en, ar: a.name_ar || '' }, branches: branchRows.filter(function (b) { return b.area_vm_id === a.id; }).map(function (b) { return b.code; }), area: a };
        });
        api._members = members;
        api._branchRows = branchRows || [];
        api._maps = buildMaps();

        // note: res index = order of Promise.all in _hydrateDB:
        // 0 area_vms, 1 branches, 2 daily_reports, 3 visit_plan, 4 visit_schedule,
        // 5 visit_mails, 6 video_visits, 7 weekly_reviews, 8 issues, 9 tasks,
        // 10 attendance, 11 money_map_snapshots, 12 handled_alerts
        Store.state.members = members;
        applyRows('dailyBranchReports',
          (res[2] || []).filter(function (r) { return r.branch_id; }));
        applyRows('dailyReports',
          (res[2] || []).filter(function (r) { return !r.branch_id; }));
        applyRows('visits', res[3]);
        applyRows('visitSchedule', res[4]);
        applyRows('visitMails', res[5]);
        applyRows('videos', res[6]);
        applyRows('weekly', res[7]);
        applyRows('issues', res[8]);
        applyRows('tasks', res[9]);
        applyRows('attendance', res[10]);
        applyRows('moneyMapDaily', res[11]);

        // moneyMaps (current snapshots) derived = latest moneyMapDaily per branch:
        rebuildMoneyMaps();
        Store.state.handledAlerts = (res[12] || []).map(function (h) { return h.alert_id; });

        api._snap.members = members.map(function (m) { return normalized('members', m); });
        snapshotAll();
        api.hydrated = true;
      } catch (e) {
        console.error('[AVCT] hydrate build error:', (e && e.message) || e);
        if (!Store.state) Store.state = Store.defaultState();
        api.hydrated = true;
      }
    });
  }

  function applyRows(local, rows) {
    var c = collByName(local);
    var out = [];
    (rows || []).forEach(function (row) {
      var rec = c.fromDB(row);
      if (!rec) return;
      rec._dbId = row.id;
      rec._sync = 'ok';   // rows that came from the DB are, by definition, confirmed
      out.push(rec);
    });
    Store.state[local] = out;
  }

  function rebuildMoneyMaps() {
    var byBranch = {};
    (Store.state.moneyMapDaily || []).forEach(function (d) {
      if (!d.branch) return;
      var cur = byBranch[d.branch];
      if (!cur || (d.date || '') >= (cur.date || '')) byBranch[d.branch] = d;
    });
    var out = [];
    Object.keys(byBranch).forEach(function (b) {
      var d = byBranch[b];
      out.push({ branch: d.branch, memberId: d.memberId, lastUpdate: d.date, codesNoLoc: d.codesNoLoc, splitGroups: d.splitGroups, emptyLoc: d.emptyLoc, stockRoom: d.stockRoom, l0: d.l0 });
    });
    Store.state.moneyMaps = out;
  }
  /* ======================================================================
     CONFIRMED WRITES — Supabase is the source of truth
     ----------------------------------------------------------------------
     Every mutation is written through and settles ONLY after Supabase
     confirms. There is no background diff queue: a record is either
     confirmed (it exists in the DB) or rolled back with a visible error,
     so a failed write can never linger as an invisible pending operation
     and can never be silently dropped on the next refresh.

     Mutations of the same business key (collection key: date|member|branch)
     are serialised on one promise chain. A write issued while an earlier one
     for the same key is still in flight SUPERSEDES it: the older attempt is
     skipped so only the latest state reaches the database, which is what
     stops rapid edits from stacking up duplicate queued operations.
     ====================================================================== */
  var _keyChain = {};   // "kind:businessKey" -> tail of the per-key chain
  var _keyDepth = {};   // "kind:businessKey" -> in-flight count
  var _inflight = 0;
  var _superseded = {}; // "kind:businessKey" -> token of the newest queued write

  function chainKey(kind, key) { return kind + ':' + (key || '_'); }
  function noop() {}

  function enqueue(kind, key, task) {
    var ck = chainKey(kind, key);
    var prev = _keyChain[ck] || Promise.resolve();
    var token = {};
    _superseded[ck] = token;          // newest queued write wins
    _keyDepth[ck] = (_keyDepth[ck] || 0) + 1;
    _inflight++;
    var run = prev.then(function () {
      // a newer write for this key arrived while we waited -> our state is stale
      if (_superseded[ck] !== token) {
        return { ok: true, superseded: true };
      }
      return task();
    }, function () {
      if (_superseded[ck] !== token) return { ok: true, superseded: true };
      return task();
    });
    _keyChain[ck] = run.then(noop, noop);   // never poison the chain
    var settle = function (v) {
      _keyDepth[ck] = Math.max(0, (_keyDepth[ck] || 1) - 1);
      _inflight = Math.max(0, _inflight - 1);
      return v;
    };
    return run.then(function (r) { return settle(r); }, function (e) { settle(); throw e; });
  }

  function snapshotAll() {
    Object.keys(Store.state).forEach(function (k) {
      if (!collByName(k)) return;
      api._snap[k] = (Store.state[k] || []).map(function (r) { return snapRecord(k, r); }).filter(Boolean);
    });
  }

  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* ---------- outcome helpers: writes never throw, they report ---------- */
  function ok(id) { return { ok: true, id: id || null }; }
  function fail(c, e) {
    var msg = (e && e.message) || String(e);
    recordFlushError(c, e);
    // A rejected write must be immediately visible: there is no background
    // queue left to surface it later, so publish the exact server reason now.
    api.lastError = c.table + ': ' + msg;
    return { ok: false, error: msg };
  }

  /* ======================================================================
     PUBLIC WRITE API
     ----------------------------------------------------------------------
     commit({kind, rec})  -> Promise<{ok, id?, error?}>   insert or update
     remove({kind, rec})  -> Promise<{ok, error?}>        delete by db id
     Both resolve only after Supabase confirms.
     ====================================================================== */
  function canWrite(kind) {
    if (api.mode !== 'remote' || !api.hydrated || !api._sb) return 'not-connected';
    if (api.role === 'VIEWER') return 'read-only';
    // Operation Manager is intentionally limited to the assignment/task module.
    if (api.role === 'OPERATION_MANAGER' && kind !== 'tasks') return 'role-restricted';
    // RVMs may update their assigned tasks, but they do not create assignments.
    if (api.role === 'AREA_VM' && kind === 'tasks') return 'task-update-only';
    return null;
  }

  function commit(spec) {
    var c = collByName(spec.kind);
    if (!c) return Promise.resolve({ ok: false, error: 'unknown collection' });
    var guard = canWrite(spec.kind);
    var rec = spec.rec || {};
    if (guard === 'task-update-only' && !(rec._dbId || rec.id && String(rec.id).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i))) {
      return Promise.resolve({ ok: false, error: 'RVM can update assigned tasks only' });
    }
    if (guard && guard !== 'task-update-only') return Promise.resolve({ ok: false, error: guard === 'read-only' ? 'Read-only user' : guard === 'role-restricted' ? 'Operation Manager can only manage assignments/tasks' : 'Not connected to the server' });
    
    var key = c.key(rec) || null;
    var row;
    try { row = sanitizeRow(c.table, c.toDB(rec)); }
    catch (e) { return Promise.resolve(fail(c, e)); }
    return enqueue(spec.kind, key, function () {
      if (spec.kind === 'members') return writeMemberRow(c, rec);
      return withTimeout(writeRow(c, rec, row), 15000, 'write ' + spec.kind)
        .then(function (r) {
          if (!r.ok) return r;
          if (r.id) rec._dbId = r.id;
          rec._sync = 'ok';
          return r;
        });
    }).catch(function (e) { return fail(c, e); });
  }

  function remove(spec) {
    var c = collByName(spec.kind);
    if (!c) return Promise.resolve({ ok: false, error: 'unknown collection' });
    var guard = canWrite(spec.kind);
    if (guard || (api.role === 'AREA_VM' && spec.kind === 'tasks')) return Promise.resolve({ ok: false, error: guard === 'read-only' ? 'Read-only user' : guard === 'role-restricted' ? 'Operation Manager can only manage assignments/tasks' : api.role === 'AREA_VM' && spec.kind === 'tasks' ? 'RVM cannot delete assignments' : 'Not connected to the server' });
    var rec = spec.rec || {};
    var key = c.key(rec) || null;
    var dbId = rec._dbId || spec.dbId;
    if (!dbId) return Promise.resolve({ ok: true, id: null }); // never persisted
    return enqueue(spec.kind, key, function () {
      if (spec.kind === 'members') return writeMemberDel({ id: rec.id });
      return withTimeout(
        api._sb.from(c.table).delete().eq('id', dbId).then(function (resp) {
          if (resp && resp.error) return fail(c, resp.error);
          logAudit('delete', c.table, dbId, null);
          return ok(null);
        }).catch(function (e) { return fail(c, e); }),
        15000, 'delete ' + spec.kind
      );
    }).catch(function (e) { return fail(c, e); });
  }

  function whenSettled() {
    if (!_inflight) return Promise.resolve();
    return new Promise(function (resolve) {
      var t = setInterval(function () {
        if (!_inflight) { clearInterval(t); resolve(); }
      }, 60);
    });
  }

  function writeRow(c, rec, row) {
    if (c.partialUnique) return keyedWrite(c, row);
    if (!c.conflict) {
      /* No usable conflict target (tasks/issues/visit_schedule carry only a uuid
         primary key and have no business-key unique index). upserting on 'id'
         would duplicate a row on every save because the client id is not a
         uuid. Instead: update the row we already know exists, otherwise insert
         and adopt the id the database generates. */
      if (rec._dbId) return updateById(c, row, rec._dbId);
      return insertRow(c, row);
    }
    return plainUpsert(c, row);
  }

  function plainUpsert(c, row) {
    var onConflict = c.conflict ? c.conflictCols.join(',') : 'id';
    return api._sb.from(c.table).upsert([row], { onConflict: onConflict }).select()
      .then(function (resp) {
        if (resp && resp.error) return fail(c, resp.error);
        var inserted = resp && resp.data && resp.data[0];
        logAudit('flush', c.table, inserted ? inserted.id : null, null);
        return ok(inserted ? inserted.id : null);
      })
      .catch(function (e) { return fail(c, e); });
  }

  /* partial unique indexes cannot be targeted by supabase-js onConflict:
     resolve the row by its real conflict keys, then UPDATE or INSERT */
  function keyedWrite(c, row) {
    var q = api._sb.from(c.table).select('id');
    c.conflictCols.forEach(function (col) {
      var val = row[col];
      if (val === null || val === undefined) q = q.is(col, null); else q = q.eq(col, val);
    });
    if (c.partialWhere) {
      for (var w in c.partialWhere) {
        if (c.partialWhere[w] === 'null') q = q.is(w, null);
        else if (c.partialWhere[w] === 'notnull') q = q.not(w, 'is', null);
      }
    }
    return q.maybeSingle().then(function (res) {
      if (res && res.error) return fail(c, res.error);
      if (res && res.data) return updateById(c, row, res.data.id);
      return insertRow(c, row);
    }).catch(function (e) { return fail(c, e); });
  }

  function updateById(c, row, id) {
    return api._sb.from(c.table).update(row).eq('id', id).select().then(function (u) {
      if (u && u.error) return fail(c, u.error);
      logAudit('flush', c.table, id, null);
      return ok(id);
    }).catch(function (e) { return fail(c, e); });
  }

  function insertRow(c, row) {
    return api._sb.from(c.table).insert(row).select().then(function (ins) {
      if (ins && ins.error) return fail(c, ins.error);
      var inserted = ins && ins.data && ins.data[0];
      logAudit('flush', c.table, inserted ? inserted.id : null, null);
      return ok(inserted ? inserted.id : null);
    }).catch(function (e) { return fail(c, e); });
  }

  function writeMemberRow(c, m) {
    var code = String(m.id).replace(/^m_/, '');
    var nameEn = (m.name && m.name.en) || '', nameAr = (m.name && m.name.ar) || '';
    var snap = (api._snap.members || []).filter(function (s) { return s.id === m.id; })[0];
    return api._sb.from('branches').select('id').eq('area_vm_id', api._maps.idByCode[code]).then(function (br) {
      var areaUpdate = api._sb.from('area_vms').update({ name_en: nameEn, name_ar: nameAr }).eq('code', code);
      return areaUpdate.then(function (r1) {
        if (r1 && r1.error) return fail(c, r1.error);
        if (snap && eq(snap.branches || [], m.branches || [])) return ok(null);
        var delChain = Promise.resolve();
        if (br && br.data && br.data.length) delChain = api._sb.from('branches').delete().in('id', br.data.map(function (b) { return b.id; }));
        return delChain.then(function (r2) {
          if (r2 && r2.error) return fail(c, r2.error);
          return api._sb.from('branches').insert((m.branches || []).map(function (b) {
            return { area_vm_id: api._maps.idByCode[code], code: b };
          })).then(function (r3) { if (r3 && r3.error) return fail(c, r3.error); api._snap.members = Store.state.members.map(function (x) { return { id: x.id, name: x.name, branches: x.branches }; }); return ok(null); });
        });
      });
    }).catch(function (e) { return fail(c, e); });
  }

  function writeMemberDel(op) {
    var code = String(op.id).replace(/^m_/, '');
    if (!api._maps.idByCode[code]) return Promise.resolve(ok(null));
    api._snap.members = Store.state.members.map(function (x) { return { id: x.id, name: x.name, branches: x.branches }; });
    return Promise.resolve(ok(null)); // membership deletion is out-of-scope in UI; admin manages users in Supabase
  }

  /* ======================================================================
     REALTIME
     ====================================================================== */
  function subscribe() {
    if (!api._sb || !api.hydrated) return;
    api._channel = api._sb
      .channel('avct-live')
      .on('postgres_changes', { event: '*', schema: 'public' }, function (payload) {
        applyRealtime(payload);
      })
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') setStatus('online', 'ONLINE');
      });
  }

  function applyRealtime(payload) {
    var t = payload && payload.table;
    var locals = COLLECTIONS.filter(function (c) { return c.table === t; });
    if (!locals.length) {
      if (t === 'area_vms' || t === 'branches') { /* master changed: ignore in-place, next full refresh handles it */ }
      if (t === 'handled_alerts') { refreshHandledAlerts(); }
      return;
    }
    var sb = api._sb, ev = payload.eventType && payload.eventType.toLowerCase();
    var dbRow = payload.new || payload.old || {};
    var maps = api._maps;
    locals.forEach(function (c) {
      if (c.local === 'moneyMaps') return; // derived; refresh below
      var arr = Store.state[c.local] || [];
      if (ev === 'insert' || ev === 'update') {
        var rec = c.fromDB(dbRow);
        if (!rec) return;
        rec._dbId = dbRow.id;
        var idx = reconcileIndex(c, arr, rec, dbRow.id);
        if (idx >= 0) arr[idx] = rec; else arr.push(rec);
        // also fix snapshot so our own next diff sees it as synced
        var snap = api._snap[c.local] || (api._snap[c.local] = []);
        var si = reconcileIndex(c, snap, rec, dbRow.id);
        var sr = snapRecord(c.local, rec);
        if (si >= 0) snap[si] = sr; else snap.push(sr);
      } else if (ev === 'delete') {
        var dbId = (payload.old && payload.old.id) || (payload.new && payload.new.id);
        arr = arr.filter(function (r) { return r._dbId !== dbId; });
        Store.state[c.local] = arr;
        api._snap[c.local] = snapLoad(c.local).filter(function (s) { return s._dbId !== dbId; });
      }
      if (dbId) serverWrites[c.local + ':' + (rec ? (snapKey(c.local, rec) || dbId) : dbId)] = Date.now();
    });
    if (t === 'money_map_snapshots') rebuildMoneyMaps();
    scheduleRerender();
    updateAuditLogMark(t);
  }

  function refreshHandledAlerts() {
    if (!api._sb) return;
    api._sb.from('handled_alerts').select('alert_id').then(function (r) {
      if (r && !r.error) Store.state.handledAlerts = r.data.map(function (h) { return h.alert_id; });
    });
  }

  function updateAuditLogMark(t) { /* reserved */ }
  function scheduleRerender() {
    clearTimeout(api._rerenderTimer);
    api._rerenderTimer = setTimeout(function () {
      try { window.__preserveScrollOnNextRender = true; if (window.router) window.router(); } catch (e) { /* best effort */ }
    }, 200);
  }

  /* ======================================================================
     BOOTSTRAP
     ====================================================================== */
  function bootstrap() {
    if (api.mode === 'dev') {
      setStatus('dev', 'DEV');
      return Promise.resolve();
    }
    api.mode = 'remote';
    setStatus('connecting', 'CONNECTING');
    startWatchdog();
    var chain = window.__SB_PRELOAD.then(function (sb) {
      if (!sb) {
        goOffline('Supabase client failed to load (' + (window.__SB_LOAD_ERROR ? window.__SB_LOAD_ERROR.message : 'unknown') + ')');
        return;
      }
      api._sb = sb;
      console.info('[AVCT] boot: client ready');
      return withTimeout(api._sb.auth.getSession(), 8000, 'session lookup').then(function (s) {
        if (s && s.data && s.data.session) { console.info('[AVCT] boot: stored session found'); return afterAuth(s.data.session); }
        // no stored session (or it failed to refresh) -> check the server is reachable,
        // then show the login overlay. Never fail purely on getSession timing.
        console.info('[AVCT] boot: no session, probing');
        return probeReachable().then(function (ok2) {
          if (ok2) { console.info('[AVCT] boot: reachable, showing login'); api._atGate = true; return auth(); }
          goOffline('Cannot reach ' + String((window.VM_CONFIG || {}).supabaseUrl || 'server'));
        });
      }, function (e) {
        return probeReachable().then(function (ok2) {
          if (ok2) { console.info('[AVCT] boot: session lookup issue, showing login'); api._atGate = true; return auth(); }
          goOffline('Session lookup failed: ' + ((e && e.message) || e));
        });
      });
    });
    chain.catch(function (e) {
      if (api.status !== 'offline' && api.status !== 'online') {
        goOffline('Startup error: ' + ((e && e.message) || e));
      }
    });
    return chain;
  }

  /* Never stay in CONNECTING forever: if no terminal status within 30s and we are
     NOT sitting on the interactive login prompt, force OFFLINE with a reason. */
  function startWatchdog() {
    clearTimeout(api._wdTimer);
    api._wdTimer = setTimeout(function () {
      if (api.status !== 'connecting') return;
      if (api._atGate) return; // interactive login prompt is open — not stuck
      goOffline('Startup timed out: no response from the server within 30s');
    }, 30000);
  }

  function auth() {
    api._atGate = true;
    return Auth.showLogin().then(function (session) {
      if (!session) {
        // auth.js already recorded a specific failure (network/timeout) via goOffline;
        // keep that reason instead of the generic "cancelled" fallback.
        if (!api.lastError) goOffline('Login was cancelled or returned no session');
        throw new Error('login cancelled');
      }
      return afterAuth(session);
    });
  }

  function probeReachable() {
    const u = String((window.VM_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '');
    if (!u) return Promise.resolve(false);
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 6000);
    const anon = String((window.VM_CONFIG || {}).supabaseAnonKey || '');
    return fetch(u + '/rest/v1/', { method: 'GET', headers: { apikey: anon, Authorization: 'Bearer ' + anon }, signal: ctrl.signal })
      .then(function (r) { clearTimeout(t); return r.status === 401 || r.status === 200 || r.status === 403 || r.status === 404 || r.status === 406; })
      .catch(function () { clearTimeout(t); return false; });
  }

  function afterAuth(session) {
    api._atGate = false;
    api.user = session.user;
    var meta = (session.user.app_metadata || session.user.user_metadata || {});
    api.role = (meta.role || '').toUpperCase() || 'VIEWER';
    api.areas = (meta.area_codes || []).slice();
    Store.state = Store.defaultState();
    applyPrefs();
    Store._mode = 'remote';
    startWatchdog();
    return hydrate().then(function () {
      api._atGate = false;
      setStatus('online', 'ONLINE');
      try { subscribe(); } catch (e) { console.error('[AVCT] realtime subscribe error:', (e && e.message) || e); }
      console.info('[AVCT] connected. role=' + api.role + ' members=' + (Store.state.members || []).length);
    }, function (e) {
      api._atGate = false;
      goOffline('Data load failed: ' + ((e && e.message) || e));
    });
  }

  function applyPrefs() {
    try {
      var raw = localStorage.getItem(STORE_KEY + '_prefs');
      if (raw) Store.state.prefs = Object.assign(Store.state.prefs, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }

  function logout() {
    // Best-effort LOCAL sign-out: never blocked by the network, and it always
    // clears the persisted session so the next boot asks for credentials again.
    var p = api._sb ? api._sb.auth.signOut({ scope: 'local' }).catch(function () { /* best effort */ }) : Promise.resolve();
    return p.then(function () {
      api._sb = null;
      api.user = null;
      api.role = null;
      api.areas = [];
      api.hydrated = false;
      api.mode = 'remote';
      setStatus('connecting', 'CONNECTING');
      location.hash = '#/dashboard';
      location.reload();
    });
  }

  var loginPending = null;
  function ensureLogin() {
    if (!loginPending) loginPending = Auth.showLogin().then(function (s) { loginPending = null; return s; }, function () { loginPending = null; return null; });
    return loginPending;
  }
  function retryLogin() {
    api.mode = 'remote';
    return bootstrap();
  }

  /* ======================================================================
     STATUS + BANNER
     ====================================================================== */
  var _statusCb = null;
  function onStatus(cb) { _statusCb = cb; }
  function setStatus(st, label) {
    api.status = st;
    if (_statusCb) try { _statusCb(st, label); } catch (e) { /* ignore */ }
  }
  function goOffline(reason) {
    clearTimeout(api._wdTimer);
    api.mode = 'remote-error';
    api.lastError = reason;
    console.error('[AVCT] OFFLINE:', reason);
    setStatus('offline', reason);
  }
  function _reconnect() {
    setTimeout(function () { if (api._sb && navigator.onLine !== false) flush(); }, 4000);
  }

  /* ======================================================================
     AUDIT
     ====================================================================== */
  function logAudit(action, tableName, recordId, data) {
    if (api._sb && api.user) {
      api._sb.rpc('log_audit', { p_action: action, p_table_name: tableName, p_record_id: String(recordId || null), p_data: data ? JSON.parse(JSON.stringify(data)) : null }).then(function () {}, function () {});
    }
  }

  /* ---------- small mail-file helper used by the Visit Mail view ---------- */
  function uploadMailFile(areaCode, fileName, file) {
    if (!api._sb) return Promise.reject(new Error('offline'));
    var path = areaCode + '/' + Date.now() + '_' + safeName(fileName);
    return api._sb.storage.from('visit-mail').upload(path, file).then(function (r) {
      if (r && r.error) throw new Error(r.error.message);
      var publicPath = path;
      return { path: publicPath, url: null };
    });
  }
  function safeName(n) { return String(n || 'file').replace(/[^a-zA-Z0-9._-]/g, '_'); }
  function fileUrl(path) {
    if (!api._sb || !path) return Promise.resolve(null);
    return api._sb.storage.from('visit-mail').createSignedUrl(path, 3600).then(function (r) {
      if (r && r.error) return null;
      return r.data && r.data.signedUrl ? r.data.signedUrl : null;
    }).catch(function () { return null; });
  }

  /* ---------- public surface ---------- */
  api.bootstrap = bootstrap;
  api.onStatus = onStatus;
  api.logout = logout;
  api.login = auth;
  api.ensureLogin = ensureLogin;
  api.retryLogin = retryLogin;
  api.uploadMailFile = uploadMailFile;
  api.fileUrl = fileUrl;
  api.commit = commit;
  api.remove = remove;
  api.whenSettled = whenSettled;
  api.pendingWrites = function () { return _inflight; };
  api.rebuildMoneyMaps = rebuildMoneyMaps;
  api.goOffline = goOffline;
  api.lastError = null;

  return api;
})();