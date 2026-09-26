/* ============================================================
   AREA VM CONTROL TOWER V3 — Excel Import System (additive)
   Daily Reports · Visit Plan · Tasks · Attendance · Money Map
   Flow: pick/drop -> analyze -> PREVIEW ONLY -> user confirms -> apply -> result.
   Nothing is ever written before the user confirms the preview.
   ============================================================ */

window.ExcelImport = (function () {
  'use strict';

  if (!window.XLSX) return { open: function () { if (window.toast) toast('Excel engine not loaded'); } };

  /* ---------- tiny helpers ---------- */
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  var L = function (en, ar) { return window.LANG === 'ar' ? ar : en; };
  var h = function (s) { return (typeof window.esc === 'function') ? window.esc(s) : String(s == null ? '' : s); };
  var norm = function (s) {
    return String(s === null || s === undefined ? '' : s).toLowerCase().replace(/[\s\-_.\/\\()[\]#]+/g, '');
  };
  var monthLabel = function (m) {
    return (typeof window.monthLabel === 'function' && /^20\d{2}-\d{2}$/.test(m)) ? window.monthLabel(m) : String(m);
  };

  /* ---------- date normalizer (ISO strings, Excel serials, Date objects) ---------- */
  function toDate(v) {
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    }
    if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 60000) {
      var d = new Date(Math.round((v - 25569) * 86400000));
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    var s = String(v === null || v === undefined ? '' : v).trim();
    if (!s) return '';
    var m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T].*)?$/);
    if (m) {
      var a = +m[1], b = +m[2], y = m[3];
      if (a > 12) return y + '-' + pad(b) + '-' + pad(a);
      if (b > 12) return y + '-' + pad(a) + '-' + pad(b);
      return y + '-' + pad(a) + '-' + pad(b);
    }
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})(?:[ T].*)?$/);
    if (m) {
      var a2 = +m[1], b2 = +m[2], y2 = (+m[3] < 70 ? 2000 : 1900) + +m[3];
      if (a2 > 12) return y2 + '-' + pad(b2) + '-' + pad(a2);
      if (b2 > 12) return y2 + '-' + pad(a2) + '-' + pad(b2);
      return y2 + '-' + pad(a2) + '-' + pad(b2);
    }
    return '';
  }

  /* ---------- master data matching (Area VMs + Branch Master) ---------- */
  function masterBranchSet() {
    var out = {};
    (Store.state.members || []).forEach(function (mm) {
      (mm.branches || []).forEach(function (b) { out[b] = 1; });
    });
    return out;
  }
  function matchBranch(v) {
    var code = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
    return masterBranchSet()[code] ? code : null;
  }
  function matchMember(v) {
    var s = norm(v);
    if (!s) return null;
    var members = Store.state.members || [];
    var i, m;
    for (i = 0; i < members.length; i++) {
      m = members[i];
      if (norm(m.id) === s) return m;
      if (norm(m.name.en) === s) return m;
      if (m.name.ar && norm(m.name.ar) === s) return m;
    }
    var first = {};
    members.forEach(function (mem) {
      var f = norm(mem.name.en).split(' ')[0];
      if (f) first[f] = mem;
      if (mem.name.ar) first[norm(mem.name.ar)] = mem;
    });
    return first[s] || null;
  }
  function ownerOf(branch) {
    var res = Store.findMembersByBranch(branch);
    return (res && res.length) ? res[0] : null;
  }
  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var x = parseFloat(String(v === null || v === undefined ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isFinite(x) ? x : 0;
  }

  /* ---------- status normalization ---------- */
  function buildStatusMap(defs) {
    var map = {};
    Object.keys(defs).forEach(function (internal) {
      (defs[internal] || []).forEach(function (alias) { map[norm(alias)] = internal; });
    });
    return map;
  }
  function normStatus(map, v) {
    var s = String(v === null || v === undefined ? '' : v).trim();
    if (!s) return '';
    return map[norm(s)] === undefined ? null : map[norm(s)];
  }

  var STATUS_MAPS = {
    daily: buildStatusMap({
      DONE: ['DONE', 'Done', 'Complete', 'تم'],
      NO: ['NO', 'No', 'None', 'لا'],
      STORE_NOT_SENT: ['Store not sent', 'Store Not Sent', 'Not sent', 'Not Sent', 'NS', 'لم يرسل'],
      PERMISSION: ['Permission', 'Perm', 'إذن'],
      WORK_MISSION: ['Work mission', 'Work Mission', 'Mission', 'WM', 'مهمة عمل'],
      OFF: ['Off', 'OFF', 'إجازة', 'سفرة']
    }),
    visit: buildStatusMap({
      PLANNED: ['Planned', 'PLAN', 'P'],
      DONE: ['Done', 'DONE', 'Complete', 'تم'],
      NOT_DONE: ['Not Done', 'Not done', 'NOT_DONE', 'ND', 'لم يتم'],
      RESCHEDULED: ['Rescheduled', 'Postponed', 'معاد'],
      OFF: ['Off', 'OFF', 'إجازة'],
      WORK_MISSION: ['Work mission', 'Work Mission', 'Mission', 'WM', 'مهمة عمل']
    }),
    task: buildStatusMap({
      CREATED: ['Created', 'CREATED', 'Pending', 'New', 'جديد'],
      IN_PROGRESS: ['In progress', 'In Progress', 'IN_PROGRESS', 'Working', 'جاري'],
      SUBMITTED: ['Submitted', 'SUBMITTED', 'Sent', 'تم التسليم'],
      APPROVED: ['Approved', 'APPROVED', 'Accepted', 'Done', 'Complete', 'معتمد'],
      APPROVED_LATE: ['Approved late', 'Approved Late', 'APPROVED_LATE', 'Late approved', 'معتمد متأخر'],
      NEED_CORRECTION: ['Need correction', 'Needs correction', 'Needs Correction', 'NEED_CORRECTION', 'Correction needed', 'يحتاج تعديل'],
      OVERDUE: ['Overdue', 'OVERDUE', 'Late', 'متأخر']
    }),
    attendance: buildStatusMap({
      ON_TIME: ['On time', 'On Time', 'ON_TIME', 'Ontime', 'في الموعد'],
      LATE: ['Late', 'LATE', 'متأخر'],
      ABSENT: ['Absent', 'ABSENT', 'Missing', 'غياب', 'غائب'],
      OFF: ['Off', 'OFF', 'إجازة'],
      WORK_MISSION: ['Work mission', 'Work Mission', 'Mission', 'WM', 'مهمة عمل']
    })
  };

  /* ---------- per-module configs ---------- */
  var CFG = {
    daily: {
      name: ['Daily Reports', 'التقارير اليومية'],
      required: ['date', 'areavm', 'branch', 'status'],
      aliases: {
        date: ['date', 'day', 'التاريخ', 'اليوم'],
        areavm: ['area vm name', 'area vm', 'area name', 'area', 'am', 'member', 'team', 'owner', 'name', 'الاسم', 'منطقة', 'المنطقة', 'المسؤول'],
        branch: ['branch', 'store', 'shop', 'الفرع', 'فرع'],
        status: ['status', 'state', 'الحالة', 'الوضع']
      },
      build: function (col, row) {
        var v = function (k) { return row[col[k]]; };
        var str = function (k) { var x = v(k); return x === null || x === undefined ? '' : String(x).trim(); };
        var date = toDate(v('date'));
        if (!date) return { ok: false, reason: L('Missing or invalid Date', 'تاريخ مفقود أو غير صحيح') };
        var m = matchMember(v('areavm'));
        if (!m) return { ok: false, reason: L('Unknown Area VM: ', 'Area VM غير معروفة: ') + (str('areavm') || '?') };
        var bridge = matchBranch(v('branch'));
        if (!bridge) return { ok: false, reason: L('Unknown Branch: ', 'فرع غير معروف: ') + (str('branch') || '?') };
        var raw = str('status');
        var st = normStatus(STATUS_MAPS.daily, raw);
        if (raw === '' || st === null) return { ok: false, reason: L('Invalid Status: ', 'حالة غير صالحة: ') + (raw || L('(empty)', '(فارغ)')) };
        return { ok: true, record: { date: date, memberId: m.id, branch: bridge, status: st } };
      },
      list: function () { return Store.state.dailyBranchReports; },
      keyOf: function (r) { return r.date + '|' + r.memberId + '|' + r.branch; },
      monthOf: function (r) { return r.date.slice(0, 7); },
      create: function (r) { Store.addDailyBranch({ id: uid(), date: r.date, memberId: r.memberId, branch: r.branch, status: r.status }); },
      update: function (ex, r) { Store.addDailyBranch({ id: ex.id, date: ex.date, memberId: ex.memberId, branch: ex.branch, status: r.status }); },
      removeByMonths: function (months) {
        Store.state.dailyBranchReports = Store.state.dailyBranchReports.filter(function (x) { return !months.has((x.date || '').slice(0, 7)); });
      }
    },

    visits: {
      name: ['Visit Plan', 'خطة الزيارات'],
      required: ['date', 'areavm', 'branch'],
      aliases: {
        date: ['date', 'day', 'التاريخ', 'اليوم'],
        areavm: ['area vm name', 'area vm', 'area name', 'area', 'am', 'member', 'team', 'owner', 'name', 'الاسم', 'منطقة', 'المنطقة', 'المسؤول'],
        branch: ['branch', 'store', 'shop', 'الفرع', 'فرع'],
        status: ['status', 'state', 'الحالة', 'الوضع'],
        shift: ['shift', 'الشيفت', 'وردية'],
        change: ['change', 'reason', 'change reason', 'تغيير', 'السبب'],
        comment: ['comment', 'notes', 'ملاحظة', 'ملاحظات']
      },
      build: function (col, row) {
        var v = function (k) { return row[col[k]]; };
        var str = function (k) { var x = v(k); return x === null || x === undefined ? '' : String(x).trim(); };
        var date = toDate(v('date'));
        if (!date) return { ok: false, reason: L('Missing or invalid Date', 'تاريخ مفقود أو غير صحيح') };
        var m = matchMember(v('areavm'));
        if (!m) return { ok: false, reason: L('Unknown Area VM: ', 'Area VM غير معروفة: ') + (str('areavm') || '?') };
        var bridge = matchBranch(v('branch'));
        if (!bridge) return { ok: false, reason: L('Unknown Branch: ', 'فرع غير معروف: ') + (str('branch') || '?') };
        var raw = str('status');
        var st = normStatus(STATUS_MAPS.visit, raw);
        if (st === null) return { ok: false, reason: L('Invalid Status: ', 'حالة غير صالحة: ') + (raw || L('(empty)', '(فارغ)')) };
        if (st === '') st = 'PLANNED';
        return { ok: true, record: { date: date, memberId: m.id, branch: bridge, shift: str('shift'), status: st, reason: str('change'), comment: str('comment') } };
      },
      list: function () { return Store.state.visits; },
      keyOf: function (r) { return r.date + '|' + r.memberId + '|' + r.branch; },
      monthOf: function (r) { return r.date.slice(0, 7); },
      create: function (r) { Store.addVisit({ date: r.date, memberId: r.memberId, branch: r.branch, shift: r.shift, status: r.status, reason: r.reason, comment: r.comment }); },
      update: function (ex, r) {
        Store.updateRec('visits', ex.id, { shift: r.shift, status: r.status, reason: r.reason, comment: r.comment });
      },
      removeByMonths: function (months) {
        Store.state.visits = Store.state.visits.filter(function (x) { return !months.has((x.date || '').slice(0, 7)); });
      }
    },

    tasks: {
      name: ['Tasks', 'المهام'],
      required: ['date', 'areavm', 'branch', 'task'],
      aliases: {
        date: ['date', 'day', 'التاريخ', 'اليوم'],
        areavm: ['area vm name', 'area vm', 'area name', 'area', 'am', 'member', 'team', 'owner', 'name', 'الاسم', 'منطقة', 'المنطقة', 'المسؤول'],
        branch: ['branch', 'store', 'shop', 'الفرع', 'فرع'],
        task: ['task', 'title', 'task title', 'المهمة', 'تاسك'],
        duetime: ['due time', 'due', 'due date', 'time', 'الموعد', 'وقت التسليم'],
        priority: ['priority', 'الأولوية'],
        status: ['status', 'state', 'الحالة', 'الوضع'],
        comment: ['comment', 'notes', 'ملاحظة', 'ملاحظات']
      },
      build: function (col, row) {
        var v = function (k) { return row[col[k]]; };
        var str = function (k) { var x = v(k); return x === null || x === undefined ? '' : String(x).trim(); };
        var date = toDate(v('date'));
        if (!date) return { ok: false, reason: L('Missing or invalid Date', 'تاريخ مفقود أو غير صحيح') };
        var m = matchMember(v('areavm'));
        if (!m) return { ok: false, reason: L('Unknown Area VM: ', 'Area VM غير معروفة: ') + (str('areavm') || '?') };
        var bridge = matchBranch(v('branch'));
        if (!bridge) return { ok: false, reason: L('Unknown Branch: ', 'فرع غير معروف: ') + (str('branch') || '?') };
        var title = str('task');
        if (!title) return { ok: false, reason: L('Missing task title', 'اسم المهمة مفقود') };
        var due = str('duetime');
        var prioRaw = norm(str('priority'));
        var priority = 'MEDIUM';
        if (prioRaw) { if (prioRaw === 'high' || prioRaw === 'urgent' || prioRaw === 'critical') priority = 'HIGH'; else if (prioRaw === 'low') priority = 'LOW'; else priority = 'MEDIUM'; }
        var raw = str('status');
        var st = normStatus(STATUS_MAPS.task, raw);
        if (st === null) return { ok: false, reason: L('Invalid Status: ', 'حالة غير صالحة: ') + (raw || L('(empty)', '(فارغ)')) };
        if (st === '') st = 'CREATED';
        return { ok: true, record: { date: date, memberId: m.id, branch: bridge, title: title, dueTime: due, dueDate: date + (due ? 'T' + due : ''), priority: priority, status: st, comment: str('comment') } };
      },
      list: function () { return Store.state.tasks; },
      keyOf: function (r) { return r.date + '|' + r.memberId + '|' + r.branch + '|' + norm(r.title); },
      monthOf: function (r) { return r.date.slice(0, 7); },
      create: function (r) {
        Store.addTask({ id: uid(), createdAt: new Date().toISOString(), date: r.date, memberId: r.memberId, branch: r.branch, title: r.title, dueTime: r.dueTime, dueDate: r.dueDate, priority: r.priority, status: r.status, comment: r.comment });
      },
      update: function (ex, r) {
        Store.updateTask(ex.id, { title: r.title, dueTime: r.dueTime, dueDate: r.dueDate, priority: r.priority, status: r.status, comment: r.comment });
      },
      removeByMonths: function (months) {
        Store.state.tasks = Store.state.tasks.filter(function (x) { return !months.has(((x.date || x.createdAt) || '').slice(0, 10).slice(0, 7)); });
      }
    },

    attendance: {
      name: ['Attendance', 'الحضور'],
      required: ['date', 'areavm'],
      aliases: {
        date: ['date', 'day', 'التاريخ', 'اليوم'],
        areavm: ['area vm name', 'area vm', 'area name', 'area', 'am', 'member', 'team', 'owner', 'name', 'الاسم', 'منطقة', 'المنطقة', 'المسؤول'],
        checkin: ['check in', 'check-in', 'checkin', 'in time', 'الدخول', 'وقت الدخول'],
        status: ['status', 'state', 'الحالة', 'الوضع']
      },
      build: function (col, row) {
        var v = function (k) { return row[col[k]]; };
        var str = function (k) { var x = v(k); return x === null || x === undefined ? '' : String(x).trim(); };
        var date = toDate(v('date'));
        if (!date) return { ok: false, reason: L('Missing or invalid Date', 'تاريخ مفقود أو غير صحيح') };
        var m = matchMember(v('areavm'));
        if (!m) return { ok: false, reason: L('Unknown Area VM: ', 'Area VM غير معروفة: ') + (str('areavm') || '?') };
        var raw = str('status');
        var st = normStatus(STATUS_MAPS.attendance, raw);
        if (st === null) return { ok: false, reason: L('Invalid Status: ', 'حالة غير صالحة: ') + (raw || L('(empty)', '(فارغ)')) };
        if (st === '') st = 'ON_TIME';
        return { ok: true, record: { date: date, memberId: m.id, checkIn: str('checkin'), status: st } };
      },
      list: function () { return Store.state.attendance; },
      keyOf: function (r) { return r.date + '|' + r.memberId; },
      monthOf: function (r) { return r.date.slice(0, 7); },
      create: function (r) { Store.addAttendance({ id: uid(), date: r.date, memberId: r.memberId, checkIn: r.checkIn, status: r.status }); },
      update: function (ex, r) { Store.updateAttendance(ex.id, { checkIn: r.checkIn, status: r.status }); },
      removeByMonths: function (months) {
        Store.state.attendance = Store.state.attendance.filter(function (x) { return !months.has((x.date || '').slice(0, 7)); });
      }
    },

    moneymap: {
      name: ['Money Map', 'الـMoney Map'],
      snapshot: true,
      required: ['date', 'areavm', 'branch'],
      aliases: {
        date: ['date', 'day', 'التاريخ', 'اليوم'],
        areavm: ['area vm name', 'area vm', 'area name', 'area', 'am', 'member', 'team', 'owner', 'name', 'الاسم', 'منطقة', 'المنطقة', 'المسؤول'],
        branch: ['branch', 'store', 'shop', 'الفرع', 'فرع'],
        codesnoloc: ['codes no loc', 'codes no location', 'no loc', 'no location', 'codes no lo', 'أكواد بدون موقع'],
        splitgroups: ['split groups', 'split group', 'split', 'مجموعات تقسيم', 'تقسيم'],
        emptyloc: ['empty locations', 'empty location', 'empty loc', 'empty', 'مواقع خالية', 'خاليه'],
        stockroom: ['stock room', 'stockroom', 'stock', 'مخزن'],
        l0: ['l0', 'l0 codes', 'l0 issues', 'l0s'],
        comment: ['comment', 'notes', 'ملاحظة', 'ملاحظات']
      },
      build: function (col, row) {
        var v = function (k) { return row[col[k]]; };
        var str = function (k) { var x = v(k); return x === null || x === undefined ? '' : String(x).trim(); };
        var date = toDate(v('date'));
        if (!date) return { ok: false, reason: L('Missing or invalid Date', 'تاريخ مفقود أو غير صحيح') };
        var m = matchMember(v('areavm'));
        if (!m) return { ok: false, reason: L('Unknown Area VM: ', 'Area VM غير معروفة: ') + (str('areavm') || '?') };
        var bridge = matchBranch(v('branch'));
        if (!bridge) return { ok: false, reason: L('Unknown Branch: ', 'فرع غير معروف: ') + (str('branch') || '?') };
        var owner = ownerOf(bridge);
        return {
          ok: true,
          record: {
            date: date,
            memberId: owner ? owner.id : m.id,
            branch: bridge,
            codesNoLoc: toNum(v('codesnoloc')),
            splitGroups: toNum(v('splitgroups')),
            emptyLoc: toNum(v('emptyloc')),
            stockRoom: toNum(v('stockroom')),
            l0: toNum(v('l0')),
            comment: str('comment')
          }
        };
      },
      list: function () { return Store.state.moneyMapDaily; },
      keyOf: function (r) { return r.date + '|' + r.branch; },
      monthOf: function (r) { return r.date.slice(0, 7); },
      syncCurrent: function (r) {
        var cur = Store.mmBranch(r.branch);
        var curlu = (cur && cur.lastUpdate) ? cur.lastUpdate : '';
        var newer = !cur || r.date >= curlu;
        var base = newer ? r : cur;
        var upd = { lastUpdate: newer ? r.date : curlu, codesNoLoc: base.codesNoLoc, splitGroups: base.splitGroups, emptyLoc: base.emptyLoc, stockRoom: base.stockRoom, l0: base.l0 };
        if (Store.mmBranch(r.branch)) Store.updateMoneyMap(r.branch, upd);
        else {
          Store.addMoneyMap({ branch: r.branch, memberId: r.memberId });
          Store.updateMoneyMap(r.branch, upd);
        }
      },
      create: function (r) {
        Store.addMoneyMapDaily({ id: uid(), date: r.date, memberId: r.memberId, branch: r.branch, codesNoLoc: r.codesNoLoc, splitGroups: r.splitGroups, emptyLoc: r.emptyLoc, stockRoom: r.stockRoom, l0: r.l0, comment: r.comment });
        this.syncCurrent(r);
      },
      update: function (ex, r) {
        Store.addMoneyMapDaily(Object.assign({}, ex, { date: r.date, memberId: r.memberId, branch: r.branch, codesNoLoc: r.codesNoLoc, splitGroups: r.splitGroups, emptyLoc: r.emptyLoc, stockRoom: r.stockRoom, l0: r.l0, comment: r.comment }));
        this.syncCurrent(r);
      },
      removeByMonths: function (months) {
        Store.state.moneyMapDaily = Store.state.moneyMapDaily.filter(function (x) { return !months.has((x.date || '').slice(0, 7)); });
      }
    }
  };

  /* ---------- workbook ingest ---------- */
  function fileExt(f) {
    var n = (f && f.name) ? f.name : '';
    var i = n.lastIndexOf('.');
    return i >= 0 ? n.slice(i + 1).toLowerCase() : '';
  }
  function aoaOf(wb) {
    var name = wb.SheetNames && wb.SheetNames[0];
    var ws = name ? wb.Sheets[name] : null;
    return { sheet: name || '', aoa: ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : [] };
  }
  function ingest(file) {
    return new Promise(function (resolve, reject) {
      var ext = fileExt(file);
      var r = new FileReader();
      r.onerror = function () { reject(new Error(L('Could not read file', 'تعذر قراءة الملف'))); };
      var done = function () {
        try {
          if (ext === 'csv' || ext === 'txt') resolve(aoaOf(XLSX.read(String(r.result), { type: 'string' })));
          else resolve(aoaOf(XLSX.read(new Uint8Array(r.result), { type: 'array', cellDates: true })));
        } catch (e) { reject(e); }
      };
      if (ext === 'csv' || ext === 'txt') { r.onload = done; r.readAsText(file); }
      else if (ext === 'xlsx' || ext === 'xls') { r.onload = done; r.readAsArrayBuffer(file); }
      else reject(new Error(L('Unsupported file type. Accepted: .xlsx, .xls, .csv', 'نوع ملف غير مدعوم. الصيغ المقبولة: .xlsx, .xls, .csv')));
    });
  }

  /* ---------- analysis ---------- */
  function analyze(cfg, aoaArr) {
    var rows = aoaArr.map(function (r) { return Array.prototype.slice.call(r); });
    while (rows.length && rows.every(function (r) { return r.every(function (c) { return String(c).trim() === ''; }); })) rows.shift();
    var headers = (rows.shift() || []).map(function (c) { return String(c).replace(/^\ufeff/, '').trim(); });
    while (headers.length && headers[headers.length - 1] === '') headers.pop();
    var data = rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    var used = {}, col = {};
    Object.keys(cfg.aliases).forEach(function (canon) {
      var aliasList = cfg.aliases[canon];
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        for (var a = 0; a < aliasList.length; a++) {
          if (norm(headers[i]) === norm(aliasList[a])) { col[canon] = i; used[i] = true; break; }
        }
        if (col[canon] !== undefined) break;
      }
    });
    var missing = cfg.required.filter(function (c) { return col[c] === undefined; });
    var valid = [], invalid = [];
    data.forEach(function (row, idx) {
      var res = cfg.build(col, row);
      if (res && res.ok) valid.push({ row: idx + 2, record: res.record });
      else invalid.push({ row: idx + 2, reason: (res && res.reason) ? res.reason : L('Unrecognized row', 'صف غير مفهوم') });
    });
    return { headers: headers, col: col, missing: missing, valid: valid, invalid: invalid, dataRows: data, previewRows: data.slice(0, 8) };
  }

  /* ---------- classification (preview counts per mode) ---------- */
  function classify(cfg, parsed, mode) {
    var existing = {};
    cfg.list().forEach(function (r) { existing[cfg.keyOf(r)] = r; });
    var snake = {}, seen = {};
    var added = 0, updated = 0, skipped = 0;
    parsed.valid.forEach(function (it) {
      var k = cfg.keyOf(it.record);
      if (seen[k]) { skipped++; return; }
      seen[k] = 1;
      if (mode === 'replace') { added++; return; }
      if (mode === 'add') { if (existing[k]) { skipped++; } else { added++; } return; }
      if (existing[k]) { updated++; } else { added++; }
    });
    var snap = 0;
    if (cfg.snapshot) {
      var snapSet = {};
      Store.state.moneyMapDaily.forEach(function (r) { snapSet[cfg.keyOf(r)] = 1; });
      parsed.valid.forEach(function (it) { if (snapSet[cfg.keyOf(it.record)]) snap++; });
    }
    return { added: added, updated: updated, skipped: skipped, invalid: parsed.invalid.length, snapshot: snap, snake: snake };
  }

  /* ---------- apply (only after the user confirms) ----------
     create()/update() return promises in remote mode. We keep the counters
     synchronous (tested API) but also collect the promises in
     counts.outcomes so the UI can wait for Supabase and correct the counts
     for anything that was rejected and rolled back. */
  function perform(cfg, parsed, mode) {
    var counts = { added: 0, updated: 0, skipped: 0, invalid: parsed.invalid.length, replacedMonths: 0, processed: parsed.valid.length + parsed.invalid.length };
    var reasons = [];
    var months = new Set();
    var outcomes = [];
    function track(type, p) { if (p && p.then) outcomes.push({ type: type, p: p }); return p; }
    parsed.valid.forEach(function (it) { months.add(cfg.monthOf(it.record)); });
    if (mode === 'replace' && cfg.removeByMonths) {
      cfg.removeByMonths(months);
      counts.replacedMonths = months.size;
    }
    var existing = {};
    if (mode !== 'replace') cfg.list().forEach(function (r) { existing[cfg.keyOf(r)] = r; });
    var seen = {};
    parsed.valid.forEach(function (it) {
      var rec = it.record;
      var k = cfg.keyOf(rec);
      if (seen[k]) { counts.skipped++; reasons.push({ row: it.row, msg: L('Duplicate row', 'صف مكرر') }); return; }
      seen[k] = 1;
      var ex = existing[k];
      if (mode === 'replace') { track('added', cfg.create(rec)); counts.added++; }
      else if (mode === 'add' && ex) { counts.skipped++; reasons.push({ row: it.row, msg: L('Already exists', 'موجود بالفعل') }); }
      else if (ex) { track('updated', cfg.update(ex, rec)); counts.updated++; }
      else { track('added', cfg.create(rec)); counts.added++; }
    });
    parsed.invalid.forEach(function (iv) { reasons.push({ row: iv.row, msg: iv.reason }); });
    Store.save();
    counts.reasons = reasons;
    counts.outcomes = outcomes;
    return counts;
  }

  /* ---------- modal state + rendering ---------- */
  var S = { step: 'pick', cfgKey: null, cfg: null, mode: 'upsert', file: null, fileName: '', sheet: '', parsed: null, result: null, error: '' };

  var ol = null;

  function ensureOverlay() {
    if (ol && document.body.contains(ol)) return ol;
    ol = document.createElement('div');
    ol.id = 'xiOverlay';
    ol.className = 'ximport-overlay';
    ol.addEventListener('click', function (e) {
      if (e.target === ol) { close(); return; }
      var t = e.target.closest ? e.target.closest('[id]') : null;
      var id = t && t.getAttribute ? t.getAttribute('id') : '';
      if (id === 'xiClose' || id === 'xiCancel' || id === 'xiDone') { close(); return; }
      if (id === 'xiReselect') { S.step = 'pick'; render(); return; }
      if (id === 'xiConfirm') { onConfirm(); return; }
      if (id === 'xiReplaceYes') { doPerform(); return; }
      if (id === 'xiReplaceNo') { var w = ol.querySelector('#xiReplaceWrap'); if (w) w.hidden = true; return; }
    });
    ol.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.id === 'xiFile') {
        if (t.files && t.files.length) pickFile(t.files[0]);
        t.value = '';
        return;
      }
      if (t && t.id === 'xiMode') {
        S.mode = t.value;
        var box = ol.querySelector('#xiReplaceWrap');
        if (box) box.hidden = S.mode !== 'replace';
        refreshCounts();
      }
    });
    ol.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); });
    ol.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); });
    document.body.appendChild(ol);
    return ol;
  }

  function close() {
    if (ol) ol.remove();
    ol = null;
  }

  function open(key) {
    if (!window.XLSX) { if (window.toast) toast(L('Excel engine not loaded', 'محرك Excel غير محمّل')); return; }
    if (!CFG[key]) return;
    S.cfgKey = key;
    S.cfg = CFG[key];
    S.step = 'pick';
    S.mode = 'upsert';
    S.file = null;
    S.fileName = '';
    S.sheet = '';
    S.parsed = null;
    S.result = null;
    S.error = '';
    ensureOverlay();
    render();
  }

  function render() {
    var box = ensureOverlay();
    var cfg = S.cfg;
    var head = '<div class="ximport-head"><span class="ximport-ico">📥</span><div class="ximport-title">Excel Import — ' + h(cfg.name[window.LANG === 'ar' ? 1 : 0]) + '</div><button class="icon-btn ximport-x" id="xiClose" type="button">✕</button></div>';
    var body = '';
    if (S.step === 'pick') {
      body = '<div class="ximport-body"><div class="ximport-drop" id="xiDrop">' +
        '<div class="ximport-drop-ico">📥</div>' +
        '<div class="ximport-drop-title">' + h(L('Import Excel File', 'استيراد ملف إكسل')) + '</div>' +
        '<div class="ximport-drop-sub">' + h(L('Drag & drop your .xlsx, .xls or .csv file here', 'اسحب وأفلت ملف .xlsx أو .xls أو .csv هنا')) + '</div>' +
        '<div class="ximport-drop-or">' + h(L('or', 'أو')) + '</div>' +
        '<label class="btn ghost ximport-choose">' + h(L('Choose Excel File', 'اختر ملف إكسل')) + '<input type="file" id="xiFile" accept=".xlsx,.xls,.csv" hidden></label>' +
        '<div class="ximport-hint">' + h(L('A preview is shown first. Nothing is imported until you confirm.', 'تُعرض المعاينة أولاً. لن يُستورد أي شيء حتى تؤكد.')) + '</div>' +
        '</div></div>';
    } else if (S.step === 'error') {
      body = '<div class="ximport-body"><div class="ximport-err">⚠️ ' + h(S.error) + '</div><div class="ximport-foot"><button class="btn ghost" id="xiCancel">' + h(L('Cancel', 'إلغاء')) + '</button></div></div>';
    } else if (S.step === 'blocked') {
      var missingStr = (S.parsed ? S.parsed.missing : []).map(function (c) { return '<b class="ximport-missing-col">' + h(c) + '</b>'; }).join(', ');
      body = '<div class="ximport-body">' + metaHtml(S.fileName, S.sheet, S.parsed) + headersHtml(S.parsed) +
        '<div class="ximport-block">⚠️ <b>' + h(L('Import blocked.', 'تم إيقاف الاستيراد.')) + '</b> ' + h(L('Missing required column', 'عمود مطلوب مفقود')) + ': ' + missingStr + '</div>' +
        '<div class="ximport-foot"><button class="btn red" id="xiCancel">' + h(L('Cancel', 'إلغاء')) + '</button><button class="btn ghost" id="xiReselect">' + h(L('Choose another file', 'اختر ملفاً آخر')) + '</button></div></div>';
    } else if (S.step === 'preview') {
      body = '<div class="ximport-body">' + metaHtml(S.fileName, S.sheet, S.parsed) + headersHtml(S.parsed) +
        '<div class="ximport-mode-row"><span class="ximport-sec-title">' + h(L('Import mode', 'وضع الاستيراد')) + '</span><select id="xiMode">' +
        '<option value="upsert">' + h(L('Update & Add (recommended)', 'تحديث وإضافة (موصى به)')) + '</option>' +
        '<option value="add">' + h(L('Add only (skip existing)', 'إضافة فقط (تخطي الموجود)')) + '</option>' +
        '<option value="replace">' + h(L('Replace Period (deletes existing records in imported months)', 'استبدال الفترة (حذف السجلات الموجودة في الأشهر المستوردة)')) + '</option>' +
        '</select></div>' +
        '<div class="ximport-counts" id="xiCounts"></div>' +
        '<div id="xiSnap"></div>' +
        '<div id="xiInvalid"></div>' +
        '<div class="ximport-row-count">' + h(L('First data rows', 'أول صفوف البيانات')) + '</div>' +
        previewTable(S.parsed) +
        '<div id="xiReplaceWrap" class="ximport-replace-wrap" hidden><div class="ximport-replace-warn">⚠️ ' +
        h(L('You are about to replace', 'أنت على وشك استبدال')) + ' <b>' + h(cfg.name[window.LANG === 'ar' ? 1 : 0]) + '</b> ' + h(L('for', 'لشهر')) + ' <b>' + h(replaceMonthsStr(S.parsed)) + '</b>. ' +
        h(L('Existing records in those months will be deleted before importing.', 'سيتم حذف السجلات الموجودة في هذه الأشهر قبل الاستيراد.')) +
        '<div class="ximport-form-actions"><button class="btn ghost" id="xiReplaceNo">' + h(L('Cancel', 'إلغاء')) + '</button><button class="btn red" id="xiReplaceYes">' + h(L('Confirm Replace', 'تأكيد الاستبدال')) + '</button></div></div></div>' +
        '<div class="ximport-foot"><button class="btn ghost" id="xiCancel">' + h(L('Cancel', 'إلغاء')) + '</button><button class="btn green" id="xiConfirm">' + h(L('Confirm Import', 'تأكيد الاستيراد')) + '</button></div></div>';
    } else if (S.step === 'result') {
      body = '<div class="ximport-body"><div class="ximport-ok">✔ ' + h(L('IMPORT COMPLETE', 'اكتمل الاستيراد')) + '</div>' + resultHtml(S.result) +
        '<div class="ximport-foot"><button class="btn green" id="xiDone">' + h(L('Done', 'تم')) + '</button></div></div>';
    }
    box.innerHTML = head + body;
    box.setAttribute('data-step', S.step);
    bindDrop();
    if (S.step === 'preview') refreshCounts();
  }

  function metaHtml(name, sheet, parsed) {
    var cols = (parsed ? parsed.headers : []).length;
    var rows = parsed ? parsed.valid.length + parsed.invalid.length : 0;
    return '<div class="ximport-meta">' +
      '<div class="ximport-meta-cell"><span>' + h(L('File name', 'اسم الملف')) + '</span><b>' + h(name || '') + '</b></div>' +
      '<div class="ximport-meta-cell"><span>' + h(L('Sheet', 'الورقة')) + '</span><b>' + h(sheet || '—') + '</b></div>' +
      '<div class="ximport-meta-cell"><span>' + h(L('Rows detected', 'الصفوف المكتشفة')) + '</span><b>' + rows + '</b></div>' +
      '<div class="ximport-meta-cell"><span>' + h(L('Columns detected', 'الأعمدة المكتشفة')) + '</span><b>' + cols + '</b></div>' +
      '</div>';
  }

  function headersHtml(parsed) {
    if (!parsed || !parsed.headers.length) return '';
    return '<div class="ximport-sec-title">' + h(L('Detected columns', 'الأعمدة المكتشفة')) + '</div><div class="ximport-headers">' +
      parsed.headers.map(function (c) { return '<span class="ximport-hchip">' + h(c) + '</span>'; }).join('') + '</div>';
  }

  function replaceMonthsStr(parsed) {
    var set = {}, out = [];
    parsed.valid.forEach(function (it) { set[it.record.date.slice(0, 7)] = 1; });
    Object.keys(set).sort().forEach(function (m) { out.push(monthLabel(m)); });
    return out.join(', ') || '—';
  }

  function refreshCounts() {
    if (!ol) return;
    var parsed = S.parsed;
    if (!parsed) return;
    var c = classify(S.cfg, parsed, S.mode);
    var snap = S.cfg.snapshot ? Math.max(c.snapshot, 0) : 0;
    var warn = '';
    if (!parsed.dataRows.length) warn = '<div class="ximport-warn">⚠️ ' + h(L('No data rows detected in this file.', 'لم يتم رصد أي صفوف بيانات في هذا الملف.')) + '</div>';
    var inv = parsed.invalid.length ? '<div class="ximport-invalid">' + h(L('Invalid rows (will be excluded)', 'صفوف غير صالحة (سيتم استثناؤها)')) + '<div>' +
      parsed.invalid.slice(0, 12).map(function (iv) { return '<div class="ximport-reason">' + h(L('Row', 'صف')) + ' ' + iv.row + ' — ' + h(iv.reason) + '</div>'; }).join('') +
      (parsed.invalid.length > 12 ? '<div class="ximport-more">… ' + (parsed.invalid.length - 12) + ' ' + h(L('more', 'أخرى')) + '</div>' : '') + '</div></div>' : '';
    var cntBox = ol.querySelector('#xiCounts');
    if (cntBox) {
      cntBox.innerHTML = warn + '<div class="ximport-count-grid">' +
        '<div class="ximport-count"><span>' + h(L('New', 'جديد')) + '</span><b>' + c.added + '</b></div>' +
        '<div class="ximport-count"><span>' + h(L('Updates', 'تحديثات')) + '</span><b>' + c.updated + '</b></div>' +
        '<div class="ximport-count"><span>' + h(L('Skipped', 'متخطى')) + '</span><b>' + c.skipped + '</b></div>' +
        '<div class="ximport-count ximport-count-inv"><span>' + h(L('Invalid', 'غير صالح')) + '</span><b>' + c.invalid + '</b></div>' +
        '</div>';
    }
    var snapBox = ol.querySelector('#xiSnap');
    if (snapBox) {
      if (S.cfg.snapshot && S.parsed.dataRows.length) {
        snapBox.innerHTML = '<div class="ximport-snap">' + (snap > 0 ? '🔄 ' + h(L('Existing snapshots → Will Update', 'لقطات موجودة ← ستُحدَّث')) + ': <b>' + snap + '</b>' : h(L('No existing snapshots for these dates.', 'لا توجد لقطات موجودة لهذه التواريخ.'))) + '</div>';
      } else snapBox.innerHTML = '';
    }
    var invBox = ol.querySelector('#xiInvalid');
    if (invBox) invBox.innerHTML = inv;
    var confirm = ol.querySelector('#xiConfirm');
    if (confirm) confirm.disabled = !parsed.dataRows.length;
  }

  function previewTable(parsed) {
    if (!parsed.dataRows.length) return '<div class="ximport-prevtable ximport-empty">' + h(L('No data rows to preview.', 'لا توجد صفوف بيانات للمعاينة.')) + '</div>';
    var hs = parsed.headers;
    var cap = hs.slice(0, 12);
    var html = '<div class="ximport-prevtable"><table><thead><tr>' + cap.map(function (h2) { return '<th>' + h(h2) + '</th>'; }).join('') + '</tr></thead><tbody>';
    parsed.previewRows.forEach(function (r) {
      html += '<tr>' + cap.map(function (_, i) { return '<td>' + h(r[i] === undefined ? '' : String(r[i])) + '</td>'; }).join('') + '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function resultHtml(c) {
    var grid = '<div class="ximport-count-grid">' +
      '<div class="ximport-count"><span>' + h(L('Rows processed', 'صفوف معالجة')) + '</span><b>' + c.processed + '</b></div>' +
      '<div class="ximport-count"><span>' + h(L('Added', 'أُضيف')) + '</span><b>' + c.added + '</b></div>' +
      '<div class="ximport-count"><span>' + h(L('Updated', 'حُدث')) + '</span><b>' + c.updated + '</b></div>' +
      '<div class="ximport-count"><span>' + h(L('Skipped', 'متخطى')) + '</span><b>' + c.skipped + '</b></div>' +
      '<div class="ximport-count ximport-count-inv"><span>' + h(L('Invalid', 'غير صالح')) + '</span><b>' + c.invalid + '</b></div>' +
      '</div>';
    var rep = '';
    if (c.replacedMonths) rep = '<div class="ximport-replaced">♻ ' + h(L('Replaced period', 'استُبدلت الفترة')) + ': <b>' + c.replacedMonths + '</b> ' + h(L('month(s)', 'شهر/أشهر')) + '</div>';
    var reasons = '';
    if (c.reasons && c.reasons.length) {
      reasons = '<div class="ximport-invalid">' + h(L('Per-row details', 'تفاصيل كل صف')) + '<div>' +
        c.reasons.slice(0, 50).map(function (rv) { return '<div class="ximport-reason">' + h(L('Row', 'صف')) + ' ' + rv.row + ' — ' + h(rv.msg) + '</div>'; }).join('') +
        (c.reasons.length > 50 ? '<div class="ximport-more">… ' + (c.reasons.length - 50) + ' ' + h(L('more', 'أخرى')) + '</div>' : '') + '</div></div>';
    }
    return grid + rep + reasons;
  }

  function bindDrop() {
    var dz = ol.querySelector('#xiDrop');
    if (!dz) return;
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.add('hover'); });
    });
    dz.addEventListener('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.remove('hover'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation(); dz.classList.remove('hover');
      var files = (e.dataTransfer && e.dataTransfer.files) ? e.dataTransfer.files : [];
      if (files.length) pickFile(files[0]);
    });
    var choose = ol.querySelector('.ximport-choose');
    if (choose) choose.addEventListener('click', function (e) {
      e.preventDefault();
      var fi = ol.querySelector('#xiFile');
      if (fi) fi.click();
    });
    if (S.step === 'preview') {
      var confirmBt = ol.querySelector('#xiConfirm');
      if (confirmBt && !parsedDataRows()) confirmBt.disabled = true;
    }
  }
  function parsedDataRows() { return S.parsed && S.parsed.dataRows.length; }

  function pickFile(file) {
    var ext = fileExt(file);
    if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv' && ext !== 'txt') {
      S.step = 'error'; S.error = L('Unsupported file type. Accepted: .xlsx, .xls, .csv', 'نوع ملف غير مدعوم. الصيغ المقبولة: .xlsx, .xls, .csv'); render(); return;
    }
    S.file = file;
    S.fileName = file.name || '';
    ingest(file).then(function (res) {
      S.sheet = res.sheet;
      var parsed = analyze(S.cfg, res.aoa);
      S.parsed = parsed;
      S.step = parsed.missing.length ? 'blocked' : 'preview';
      render();
    }).catch(function (err) {
      S.step = 'error';
      S.error = (err && err.message) ? err.message : L('Could not parse this file.', 'تعذر تحليل هذا الملف.');
      render();
    });
  }

  function onConfirm() {
    if (!S.parsed || !S.parsed.dataRows.length) return;
    if (S.mode === 'replace') {
      var box = ol.querySelector('#xiReplaceWrap');
      if (box) box.hidden = false;
      return;
    }
    doPerform();
  }

  function doPerform() {
    var cfg = S.cfg;
    var counts = perform(cfg, S.parsed, S.mode);
    var outcomes = counts.outcomes || [];
    if (!outcomes.length) { finish(counts); return; }
    // Supabase is the source of truth: only report what the server confirmed.
    var btn = ol ? ol.querySelector('#xiConfirm') : null;
    if (btn) { btn.disabled = true; btn.textContent = L('Saving...', 'جارٍ الحفظ...'); }
    Promise.all(outcomes.map(function (o) {
      return o.p.then(function (r) { return { type: o.type, ok: !!(r && r.ok !== false), err: r && r.error }; })
               .catch(function (e) { return { type: o.type, ok: false, err: (e && e.message) || String(e) }; });
    })).then(function (res) {
      var failed = 0, firstErr = '';
      res.forEach(function (r) {
        if (r.ok) return;
        failed++;
        if (!firstErr) firstErr = r.err || 'rejected';
        if (r.type === 'added' && counts.added > 0) counts.added--;
        if (r.type === 'updated' && counts.updated > 0) counts.updated--;
      });
      counts.failed = failed;
      if (failed) counts.reasons = (counts.reasons || []).concat([{ row: 0, msg: L('Rejected by server: ', 'مرفوض من السيرفر: ') + firstErr }]);
      finish(counts);
    });
  }

  function finish(counts) {
    S.result = counts;
    S.step = 'result';
    if (typeof window.router === 'function') { try { window.router(); } catch (e) { console.error(e); } }
    render();
  }

  return {
    open: open,
    modules: Object.keys(CFG),
    test: {
      norm: norm, toDate: toDate, matchMember: matchMember, matchBranch: matchBranch,
      analyze: analyze, classify: classify, perform: perform, cfg: CFG, statusMaps: STATUS_MAPS
    }
  };
})();