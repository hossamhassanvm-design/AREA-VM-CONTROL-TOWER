/* ============================================================
   AREA VM CONTROL TOWER V1 — Tracking modules
   Daily Reports · Money Map · Visit Plan · Video Visits · Weekly Tasks
   ============================================================ */

(function () {
  const X = {}; // local helpers

  X.memberOpts = function (selected) {
    return Store.state.members.map(m => '<option value="' + m.id + '"' + (m.id === selected ? ' selected' : '') + '>' + esc(Store.memberName(m)) + '</option>').join('');
  };
  X.allBranchesByMember = function () {
    const rows = [];
    Store.state.members.forEach(m => (m.branches || []).forEach(b => rows.push({ code: b, memberId: m.id })));
    return rows;
  };
  X.branchOptsFor = function (memberId, selected, includeAll) {
    const m = Store.findMember(memberId);
    const list = (m && m.branches) || [];
    return (includeAll ? '<option value="">' + esc(t('allBranches')) + '</option>' : '') +
      list.map(b => '<option value="' + esc(b) + '"' + (b === selected ? ' selected' : '') + '>' + esc(b) + '</option>').join('');
  };
  X.field = function (label, inner) {
    return '<div class="field"><label>' + label + '</label>' + inner + '</div>';
  };
  function branchSelectHtml(id, includeAll, selected) {
    const bs = Store.state.members.flatMap(m => (m.branches || []));
    const uniq = Array.from(new Set(bs)).sort();
    return '<select id="' + id + '">' +
      (includeAll ? '<option value="">' + esc(t('allBranches')) + '</option>' : '') +
      uniq.map(b => '<option value="' + esc(b) + '"' + (b === selected ? ' selected' : '') + '>' + esc(b) + '</option>').join('') +
      '</select>';
  }
  X.selectStatus = function (name, pool, current) {
    return '<select name="' + name + '">' + pool.map(s => '<option value="' + s + '"' + (s === current ? ' selected' : '') + '>' + esc(t('st_' + s)) + '</option>').join('') + '</select>';
  };
  X.openPanel = function (btn, panel) {
    btn.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      btn.textContent = open ? '−' : '+';
    });
  };

  /* ============================================================
     DAILY REPORTS
     ============================================================ */
  Views.daily = function () {
    const date = todayISO();
    const recs = [...Store.state.dailyReports].sort((a, b) => b.date.localeCompare(a.date));
    const todayRecs = recs.filter(r => r.date === date);
    const doneN = todayRecs.filter(r => Engine.isDoneDaily(r.status)).length;
    const wood = todayRecs.filter(r => Engine.isExcused(r.status)).length;
    const missN = todayRecs.filter(r => !Engine.isDoneDaily(r.status) && !Engine.isExcused(r.status)).length + (4 - todayRecs.length);

    function rows(list) {
      if (!list.length) return '<tr><td colspan="7" class="empty">' + esc(t('noData')) + '</td></tr>';
      return list.map(r =>
        '<tr>' +
          '<td>' + fmtDate(r.date) + '</td>' +
          '<td>' + esc(Store.memberName(Store.findMember(r.memberId))) + '</td>' +
          '<td>' + statusBadge(r.status) + '</td>' +
          '<td>' + (r.emailSent ? '✅' : '❌') + '</td>' +
          '<td>' + (r.emailImages ? '✅' : '❌') + '</td>' +
          '<td>' + (r.emailExcel ? '✅' : '❌') + '</td>' +
          '<td style="display:flex;gap:4px">' +
            '<button class="icon-btn" data-edit=\'' + JSON.stringify(r) + '\' title="' + esc(t('edit')) + '">✏️</button>' +
            '<button class="icon-btn" data-del="dailyReports|' + r.id + '" title="' + esc(t('delete')) + '">🗑️</button>' +
          '</td>' +
        '</tr>').join('');
    }

    const html =
    '<div class="page">' +
      '<div class="page-head">' +
        '<div class="page-title"><h1>📋 ' + esc(t('nav_daily')) + '</h1><p>' + esc(t('emailFields')) + ' · ' + fmtDateLong(date) + '</p></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn" id="btnNewDaily">+ ' + esc(t('addDaily')) + '</button>' +
      '</div>' +
      '<div class="grid cols-3">' +
        kpi(t('st_DONE'), doneN, date, 'green-k') +
        kpi(t('missing'), missN, date, 'red-k') +
        kpi(t('st_OFF') + ' / ' + t('st_ANNUAL'), wood, date, 'gray') +
      '</div>' +
      '<div class="form-panel" id="panelDaily">' +
        '<div class="form-row cols-3">' +
          X.field(t('date'), '<input type="date" id="fDailyDate" required>') +
          X.field(t('areaVM'), '<select id="fDailyMember">' + X.memberOpts('') + '</select>') +
          X.field(t('status'), X.selectStatus('fDailyStatus', ['DONE', 'NO', 'OFF', 'WORK_MISSION', 'ANNUAL'], 'DONE')) +
        '</div>' +
        '<div class="field"><label>' + esc(t('emailFields')) + '</label><div class="check-group">' +
          '<label><input type="checkbox" id="fDailySent"> ' + esc(t('emailSent')) + '</label>' +
          '<label><input type="checkbox" id="fDailyImgs"> ' + esc(t('emailImages')) + '</label>' +
          '<label><input type="checkbox" id="fDailyXls"> ' + esc(t('emailExcel')) + '</label>' +
        '</div></div>' +
        '<div class="form-actions"><input type="hidden" id="fDailyEditId"><button class="btn green" id="fDailySave">' + esc(t('save')) + '</button><button class="btn gray" data-close> ' + esc(t('cancel')) + '</button></div>' +
      '</div>' +
      '<div class="card"><div class="filters">' +
        X.field(t('date'), '<input type="date" id="fltDailyDate" value="' + date + '">') +
        X.field(t('areaVM'), '<select id="fltDailyMember"><option value="">' + esc(t('allMembers')) + '</option>' + X.memberOpts('') + '</select>') +
        X.field(t('status'), '<select id="fltDailyStatus"><option value="">' + esc(t('allStatuses')) + '</option><option>DONE</option><option>NO</option><option>OFF</option><option>WORK_MISSION</option><option>ANNUAL</option></select>') +
        '<button class="btn gray" id="btnExportDaily">⬇ ' + esc(t('exportCsv')) + '</button>' +
      '</div>' +
      '<div class="table-wrap" style="margin-top:12px"><table class="tbl">' +
        '<thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('areaVM')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('emailSent')) + '</th><th>' + esc(t('emailImages')) + '</th><th>' + esc(t('emailExcel')) + '</th><th>' + esc(t('action')) + '</th></tr></thead>' +
        '<tbody id="dailyRows">' + rows(recs.filter(r => r.date === date)) + '</tbody></table></div>' +
      '</div>' +
    '</div>';

    return {
      html,
      init(el) {
        const panel = el.querySelector('#panelDaily');
        X.openPanel(el.querySelector('#btnNewDaily'), panel);
        el.querySelector('[data-close]').addEventListener('click', () => { panel.classList.remove('open'); el.querySelector('#btnNewDaily').textContent = '+ ' + t('addDaily'); });
        if (window._autoForm === 'daily') { panel.classList.add('open'); el.querySelector('#btnNewDaily').textContent = '−'; }

        el.querySelector('#fDailySave').addEventListener('click', () => {
          const dateV = el.querySelector('#fDailyDate').value;
          if (!dateV) { toast(t('date') + '!'); return; }
          const memberId = el.querySelector('#fDailyMember').value;
          const status = el.querySelector('select[name=fDailyStatus]').value;
          const editId = el.querySelector('#fDailyEditId').value;
          const rec = { date: dateV, memberId, status, emailSent: el.querySelector('#fDailySent').checked, emailImages: el.querySelector('#fDailyImgs').checked, emailExcel: el.querySelector('#fDailyXls').checked };
          // Supabase is the source of truth: the row is written through and the
          // record is persisted to the DB BEFORE we report it as saved.
          const p = editId ? Store.updateRec('dailyReports', editId, rec) : Store.addDaily(rec);
          Store.confirm(p, t('savedPrefs')).then(function (r) { if (r && r.ok !== false) router(); });
        });

        function filterRows() {
          const fd = el.querySelector('#fltDailyDate').value;
          const fm = el.querySelector('#fltDailyMember').value;
          const fs = el.querySelector('#fltDailyStatus').value;
          const list = recs.filter(r =>
            (!fd || r.date === fd) &&
            (!fm || r.memberId === fm) &&
            (!fs || r.status === fs));
          el.querySelector('#dailyRows').innerHTML = rows(list);
        }
        ['fltDailyDate', 'fltDailyMember', 'fltDailyStatus'].forEach(id => el.querySelector('#' + id).addEventListener('change', filterRows));

        el.addEventListener('click', (e) => {
          const ed = e.target.closest('[data-edit]');
          if (ed) {
            const r = JSON.parse(ed.dataset.edit);
            panel.classList.add('open');
            el.querySelector('#btnNewDaily').textContent = '−';
            el.querySelector('#fDailyEditId').value = r.id;
            el.querySelector('#fDailyDate').value = r.date;
            el.querySelector('#fDailyMember').value = r.memberId;
            el.querySelector('select[name=fDailyStatus]').value = r.status;
            el.querySelector('#fDailySent').checked = !!r.emailSent;
            el.querySelector('#fDailyImgs').checked = !!r.emailImages;
            el.querySelector('#fDailyXls').checked = !!r.emailExcel;
            return;
          }
          const dl = e.target.closest('[data-del]');
          if (dl) {
            const [k, id] = dl.dataset.del.split('|');
            Store.deleteRec(k, id);
            router();
          }
        });
        el.querySelector('#btnExportDaily').addEventListener('click', () => Exporter.downloadCSV('daily', 'vm_daily_' + todayISO() + '.csv'));
      }
    };
  };

  /* ============================================================
     MONEY MAP
     ============================================================ */
Views.moneyMap = function () {
    const today = todayISO();
    const master = Store.state.members.flatMap(m => (m.branches || []).map(b => ({ branch: b, memberId: m.id })));
    const noMM = !(Store.state.moneyMaps || []).length;
    function classify(mm) {
      if (!mm) return 'missing';
      const has = (mm.l0 || 0) + (mm.emptyLoc || 0) + (mm.splitGroups || 0) + (mm.stockRoom || 0) + (mm.codesNoLoc || 0) > 0;
      if (mm.lastUpdate === today) return 'updated';
      const days = mm.lastUpdate ? diffDays(today, mm.lastUpdate) : Infinity;
      if (days > 7 || has) return 'critical';
      return 'needs';
    }
    function statusBadgeOf(st) {
      if (noMM) return '<span class="badge gray">—</span>';
      if (st === 'updated') return '<span class="badge green">' + esc(t('mmUpdated')) + '</span>';
      if (st === 'missing') return '<span class="badge red">' + esc(t('missing')) + '</span>';
      if (st === 'critical') return '<span class="badge red">' + esc(t('mmNotUpdated')) + '</span>';
      return '<span class="badge amber">' + esc(t('needsUpdate')) + '</span>';
    }
    function branchRows(midF, branchF, statusF) {
      const list = master.filter(r => (!midF || r.memberId === midF) && (!branchF || r.branch === branchF));
      if (!list.length) return '<tr><td colspan="9" class="empty">' + esc(t('noData')) + '</td></tr>';
      return list.map(r => {
        const mm = Store.mmBranch(r.branch);
        const st = classify(mm);
        if (statusF && st !== statusF) return '';
        const info = mm ? Engine.mmBranchScore(r.branch) : null;
        return '<tr>' +
          '<td class="rowhead">' + esc(r.branch) + '</td>' +
          '<td>' + esc(memberName(r.memberId)) + '</td>' +
          '<td>' + (mm ? fmtDate(mm.lastUpdate) : '—') + '</td>' +
          '<td>' + statusBadgeOf(st) + '</td>' +
          '<td class="num">' + (mm ? mm.l0 || 0 : '—') + '</td>' +
          '<td class="num">' + (mm ? mm.emptyLoc || 0 : '—') + '</td>' +
          '<td class="num">' + (mm ? mm.splitGroups || 0 : '—') + '</td>' +
          '<td>' + (mm ? (info.days === Infinity ? '—' : (info.days === 0 ? t('today') : info.days + ' ' + 'd')) : '—') + '</td>' +
          '<td><button class="btn sm gray" data-viewmm="' + escAttr(r.branch) + '">👁</button><button class="btn sm gray" data-editmm="' + escAttr(r.branch) + '">' + esc(t('edit')) + '</button><button class="btn sm gray" data-updatemm="' + escAttr(r.branch) + '">⏱</button></td>' +
        '</tr>';
      }).filter(Boolean).join('') || '<tr><td colspan="9" class="empty">' + esc(t('noData')) + '</td></tr>';
    }
    function problemsHtml(midF) {
      if (noMM) return emptyStateHtml('No Money Map snapshot available.', 'Enter the first Money Map update to start tracking.');
      const list = master.filter(r => !midF || r.memberId === midF).map(r => ({ r, mm: Store.mmBranch(r.branch) })).filter(x => {
        if (!x.mm) return true;
        const has = (x.mm.l0 || 0) + (x.mm.emptyLoc || 0) + (x.mm.splitGroups || 0) + (x.mm.stockRoom || 0) + (x.mm.codesNoLoc || 0) > 0;
        const days = x.mm.lastUpdate ? diffDays(today, x.mm.lastUpdate) : Infinity;
        return days > 7 || has;
      });
      if (!list.length) return '<div class="empty">' + esc('No problems to review / لا توجد مشاكل للمراجعة') + '</div>';
      return list.map(x => {
        const mm = x.mm; const st = classify(mm);
        const days = mm && mm.lastUpdate ? diffDays(today, mm.lastUpdate) : Infinity;
        const problems = [];
        if (!mm) problems.push({ label: t('mmNotUpdated'), val: t('missing'), danger: true });
        else {
          if (days > 7) problems.push({ label: t('lastUpdate'), val: days === Infinity ? '—' : fmtDate(mm.lastUpdate) + ' (' + days + ' ' + 'd' + ')', danger: true });
          if (mm.l0 > 0) problems.push({ label: t('l0'), val: mm.l0, danger: true });
          if (mm.emptyLoc > 0) problems.push({ label: t('emptyLoc'), val: mm.emptyLoc, danger: true });
          if (mm.splitGroups > 0) problems.push({ label: t('splitGroups'), val: mm.splitGroups, danger: true });
          if (mm.stockRoom > 0) problems.push({ label: t('stockRoom'), val: mm.stockRoom, danger: false });
        }
        const actionNeeded = (st === 'missing' || st === 'critical' || days > 7 || (mm && ((mm.l0 || 0) > 0 || (mm.emptyLoc || 0) > 0 || (mm.splitGroups || 0) > 0))) ? 'UPDATE MONEY MAP' : 'REVIEW';
        return '<div class="mm-problem" id="mm-prob-' + escAttr(x.r.branch) + '"><div class="mm-problem-head">' + esc(x.r.branch) + '</div><div class="mm-problem-body">' +
          problems.map(p => '<div class="mm-item' + (p.danger ? ' danger' : '') + '"><span>' + esc(p.label) + '</span><b>' + esc(p.val) + '</b></div>').join('') +
          '<div class="mm-item"><span>Status</span><b>' + esc(st === 'missing' ? 'Missing' : st === 'critical' ? 'Needs Attention' : st === 'updated' ? 'Updated' : 'Needs Update') + '</b></div>' +
          '<div class="mm-item req"><span>Required Action</span><b>' + esc(actionNeeded) + '</b></div>' +
          '</div></div>';
      }).join('');
    }
    function trendOf(branch, uptoDate) {
      const hist = Store.state.moneyMapDaily.filter(r => r.branch === branch && r.date && (!uptoDate || r.date <= uptoDate)).sort((a, z) => z.date.localeCompare(a.date));
      const cur = hist[0], prev = hist[1];
      if (!cur) return '—';
      const sc = r => (Number(r.codesNoLoc || 0)) + (Number(r.splitGroups || 0)) + (Number(r.emptyLoc || 0)) + (Number(r.stockRoom || 0)) + (Number(r.l0 || 0));
      const cs = sc(cur), ps = prev ? sc(prev) : null;
      if (ps === null) return '—';
      return cs < ps ? '<span class="trend-up">'+esc('Improved')+'</span>' : (cs > ps ? '<span class="trend-down">'+esc('Worsened')+'</span>' : '<span class="trend-flat">'+esc('Stable')+'</span>');
    }
    function histHtml(midF, branchF, monthF, dateF) {
      let rows = Store.state.moneyMapDaily.slice();
      if (monthF) rows = rows.filter(r => r.date && r.date.startsWith(monthF));
      if (dateF) rows = rows.filter(r => r.date === dateF);
      const branchSet = branchF ? [branchF] : master.filter(r => !midF || r.memberId === midF).map(r => r.branch);
      rows = rows.filter(r => branchSet.indexOf(r.branch) >= 0);
      rows.sort((a, z) => z.date.localeCompare(a.date));
      if (!rows.length) return '<tr><td colspan="8" class="empty">' + esc(t('noData')) + '</td></tr>';
      return rows.map(r => '<tr>' +
        '<td>' + esc(r.date) + '</td>' +
        '<td>' + esc(memberName(r.memberId)) + '</td>' +
        '<td>' + esc(r.branch) + '</td>' +
        '<td class="num">' + esc(r.l0 || 0) + '</td>' +
        '<td class="num">' + esc(r.codesNoLoc || 0) + '</td>' +
        '<td class="num">' + esc(r.emptyLoc || 0) + '</td>' +
        '<td class="num">' + (Number(r.l0 || 0) + Number(r.codesNoLoc || 0) + Number(r.emptyLoc || 0) + Number(r.splitGroups || 0) + Number(r.stockRoom || 0)) + '</td>' +
        '<td>' + trendOf(r.branch, r.date) + '</td>' +
        '</tr>').join('');
    }
    const rowList = master.map(r => Store.mmBranch(r.branch));
    const stCnt = {}; ['updated', 'missing', 'needs', 'critical'].forEach(s => stCnt[s] = rowList.filter((mm, i) => classify(mm) === s).length);
    const l0Cnt = master.filter(r => { const mm = Store.mmBranch(r.branch); return mm && (mm.l0 || 0) > 0; }).length;
    const emptyCnt = master.filter(r => { const mm = Store.mmBranch(r.branch); return mm && (mm.emptyLoc || 0) > 0; }).length;
    const areaSummary = Store.state.members.map(m => {
      const brs = m.branches || [];
      let upd = 0, miss = 0, issu = 0, l0 = 0;
      brs.forEach(b => { const mm = Store.mmBranch(b); const st = classify(mm); if (st === 'updated') upd++; else if (st === 'missing') miss++; if (mm) { if ((mm.l0 || 0) > 0) l0++; if ((mm.l0 || 0) + (mm.emptyLoc || 0) + (mm.splitGroups || 0) + (mm.stockRoom || 0) + (mm.codesNoLoc || 0) > 0) issu++; } });
      return { n: Store.memberName(m), cnt: brs.length, upd, miss, issu, l0, comp: brs.length ? Math.round(upd / brs.length * 100) : 0 };
    });
    const html =
    '<div class="page">' +
      '<div class="page-head">' +
        '<div class="page-title"><h1>💵 ' + esc(t('nav_mm')) + '</h1><p>' + esc(t('renderByData')) + '</p></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn" id="btnNewMM">+ ' + esc(t('addMoneyMap')) + '</button>' +
        '<button class="btn gray" id="btnMMImport">📥 ' + esc('Import Excel / استيراد إكسل') + '</button>' +
      '</div>' +
      '<div class="grid cols-3">' +
        (noMM ? kpi('Updated Today / تم التحديث اليوم', '—', today, 'gray-k') : kpi('Updated Today / تم التحديث اليوم', stCnt.updated, today, 'green-k')) +
        (noMM ? kpi(t('mmNotUpdated'), '—', t('naLabel'), 'gray-k') : kpi(t('mmNotUpdated'), stCnt.missing + stCnt.needs + stCnt.critical, t('st_CRITICAL') + ' ' + stCnt.critical, 'red-k')) +
        (noMM ? kpi(t('needsUpdate'), '—', '', 'gray-k') : kpi(t('needsUpdate'), stCnt.needs, '', 'amber-k')) +
      '</div>' +
      '<div class="members-mini">' +
        '<div class="mini-stat"><span class="ms-label">' + esc('Branches / الفروع') + '</span><span class="ms-val">' + master.length + '</span></div>' +
        '<div class="mini-stat"><span class="ms-label">' + esc('L0 Issues / مشاكل L0') + '</span><span class="ms-val">' + (noMM ? '—' : l0Cnt) + '</span></div>' +
        '<div class="mini-stat"><span class="ms-label">' + esc('Empty Locations / مواقع خالية') + '</span><span class="ms-val">' + (noMM ? '—' : emptyCnt) + '</span></div>' +
      '</div>' +
      '<div class="card"><div class="card-title"><h3>Area VM Summary</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Area VM</th><th class="num">Branches</th><th class="num">Updated</th><th class="num">Missing</th><th class="num">Issues</th><th class="num">L0</th><th class="num">Compliance</th></tr></thead><tbody>' +
        areaSummary.map(a => '<tr><td>' + esc(a.n) + '</td><td class="num">' + a.cnt + '</td><td class="num">' + a.upd + '</td><td class="num">' + a.miss + '</td><td class="num">' + a.issu + '</td><td class="num">' + a.l0 + '</td><td class="num">' + (noMM ? '—' : a.comp + '%') + '</td></tr>').join('') +
      '</tbody></table></div></div>' +
      '<div class="card"><div class="filters">' +
        X.field('Month', '<input type="month" id="fltMMMonth" value="' + today.slice(0, 7) + '">') +
        X.field(t('date'), '<input type="date" id="fltMMDate">') +
        X.field(t('areaVM'), '<select id="fltMMMember"><option value="">' + esc(t('allMembers')) + '</option>' + X.memberOpts('') + '</select>') +
        X.field(t('branch'), '<select id="fltMMBranch">' + X.allBranchesByMember().map(r => '<option value="' + esc(r.code) + '" data-m="' + r.memberId + '"' + (r.code === '' ? ' selected' : '') + '>' + esc(r.code) + '</option>').join('') + '</select>') +
        X.field(t('mmStatus'), '<select id="fltMMStatus"><option value="">' + esc(t('allStatuses')) + '</option><option value="updated">' + esc(t('mmUpdated')) + '</option><option value="missing">' + esc(t('missing')) + '</option><option value="needs">' + esc(t('needsUpdate')) + '</option><option value="critical">' + esc(t('mmNotUpdated')) + '</option></select>') +
        '<button class="btn gray" id="btnExportMM">⬇ ' + esc(t('exportCsv')) + '</button>' +
      '</div></div>' +
      '<div class="card"><div class="card-title"><h3>Branch Details</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('branch')) + '</th><th>' + esc(t('areaVM')) + '</th><th>' + esc(t('lastUpdate')) + '</th><th>' + esc(t('mmStatus')) + '</th><th class="num">' + esc(t('l0')) + '</th><th class="num">' + esc(t('emptyLoc')) + '</th><th class="num">' + esc(t('splitGroups')) + '</th><th>' + esc('Age') + '</th><th></th></tr></thead>' +
        '<tbody id="mmRows">' + branchRows('', '', '') + '</tbody></table></div></div>' +
      '<div class="card"><div class="card-title"><h3>⚠ ' + esc(t('needsAttention')) + '</h3></div><div id="mmProblems">' + problemsHtml('') + '</div></div>' +
      '<div class="card"><div class="card-title"><h3>📈 ' + esc('History & Trend / التاريخ والاتجاه') + '</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('areaVM')) + '</th><th>' + esc(t('branch')) + '</th><th class="num">L0</th><th class="num">No Loc</th><th class="num">Empty</th><th class="num">Score</th><th>Trend</th></tr></thead>' +
        '<tbody id="mmHistRows">' + histHtml('', '', today.slice(0, 7), '') + '</tbody></table></div></div>' +
      '<div class="form-panel" id="panelMM">' +
        '<div class="form-row cols-3">' +
          X.field(t('branch'), '<select id="fMMBranch">' + X.allBranchesByMember().map(r => '<option value="' + esc(r.code) + '">' + esc(r.code) + '</option>').join('') + '</select>') +
          X.field(t('lastUpdate'), '<input type="date" id="fMMDate">') +
          X.field(t('codesNoLoc'), '<input type="number" id="fMMCodes" min="0" value="0">') +
          X.field(t('splitGroups'), '<input type="number" id="fMMSplit" min="0" value="0">') +
          X.field(t('emptyLoc'), '<input type="number" id="fMMEmpty" min="0" value="0">') +
          X.field(t('stockRoom'), '<input type="number" id="fMMStock" min="0" value="0">') +
          X.field(t('l0'), '<input type="number" id="fMML0" min="0" value="0">') +
        '</div>' +
        '<div class="form-actions"><input type="hidden" id="fMMEdit"><button class="btn green" id="fMMSave">' + esc(t('save')) + '</button><button class="btn gray" data-close> ' + esc(t('cancel')) + '</button></div>' +
      '</div>' +
    '</div>';

    return {
      html,
      init(el) {
        const panel = el.querySelector('#panelMM');
        X.openPanel(el.querySelector('#btnNewMM'), panel);
        el.querySelector('#btnMMImport').addEventListener('click', () => ExcelImport.open('moneymap'));
        el.querySelector('[data-close]').addEventListener('click', () => { panel.classList.remove('open'); el.querySelector('#btnNewMM').textContent = '+ ' + t('addMoneyMap'); });
        const fltMember = el.querySelector('#fltMMMember');
        const fltBranch = el.querySelector('#fltMMBranch');
        const refresh = () => {
          const mid = fltMember.value, br = fltBranch.value, st = el.querySelector('#fltMMStatus').value;
          el.querySelector('#mmRows').innerHTML = branchRows(mid, br, st);
          el.querySelector('#mmProblems').innerHTML = problemsHtml(mid);
        };
        fltMember.addEventListener('change', () => {
          const keep = fltBranch.value;
          const list = fltMember.value ? (Store.findMember(fltMember.value)?.branches || []) : X.allBranchesByMember().map(r => r.code);
          fltBranch.innerHTML = '<option value="">' + esc(t('allBranches')) + '</option>' + list.map(b => '<option value="' + escAttr(b) + '"' + (b === keep ? ' selected' : '') + '>' + esc(b) + '</option>').join('');
          refresh();
        });
        fltBranch.addEventListener('change', refresh);
        el.querySelector('#fltMMStatus').addEventListener('change', refresh);
        const histRefresh = () => {
          el.querySelector('#mmHistRows').innerHTML = histHtml(fltMember.value, fltBranch.value, el.querySelector('#fltMMMonth').value, el.querySelector('#fltMMDate').value);
        };
        el.querySelector('#fltMMMonth').addEventListener('change', histRefresh);
        el.querySelector('#fltMMDate').addEventListener('change', histRefresh);

        el.querySelector('#fMMSave').addEventListener('click', () => {
          const branch = el.querySelector('#fMMBranch').value;
          const rec = {
            lastUpdate: el.querySelector('#fMMDate').value || todayISO(),
            codesNoLoc: +el.querySelector('#fMMCodes').value || 0,
            splitGroups: +el.querySelector('#fMMSplit').value || 0,
            emptyLoc: +el.querySelector('#fMMEmpty').value || 0,
            stockRoom: +el.querySelector('#fMMStock').value || 0,
            l0: +el.querySelector('#fMML0').value || 0
          };
          const edit = el.querySelector('#fMMEdit').value;
          const target = Store.mmBranch(branch);
          const memberFor = Store.findMembersByBranch(branch)[0];
          if (target) {
            if (edit && edit !== branch) {
              Store.state.moneyMaps = Store.state.moneyMaps.filter(m => m.branch !== edit);
              Store.save();
            }
            Store.updateMoneyMap(branch, rec);
          } else {
            if (edit) {
              Store.state.moneyMaps = Store.state.moneyMaps.filter(m => m.branch !== edit);
              Store.save();
            }
            Store.addMoneyMap(Object.assign({ branch, memberId: memberFor ? memberFor.id : 'm_hz' }, rec));
          }
          const ownerId = target ? target.memberId : (memberFor ? memberFor.id : 'm_hz');
          // the daily history row is the persisted record; moneyMaps is derived
          const p = Store.addMoneyMapDaily({ id: uid(), date: rec.lastUpdate, memberId: ownerId, branch, codesNoLoc: rec.codesNoLoc, splitGroups: rec.splitGroups, emptyLoc: rec.emptyLoc, stockRoom: rec.stockRoom, l0: rec.l0, comment: '' });
          Store.confirm(p, t('savedPrefs')).then(function (r) { if (r && r.ok !== false) router(); });
        });

        el.addEventListener('click', (e) => {
          const eb = e.target.closest('[data-editmm]');
          if (eb) {
            const mm = Store.mmBranch(eb.dataset.editmm);
            if (!mm) return;
            panel.classList.add('open');
            el.querySelector('#btnNewMM').textContent = '−';
            el.querySelector('#fMMEdit').value = mm.branch;
            el.querySelector('#fMMBranch').value = mm.branch;
            el.querySelector('#fMMDate').value = mm.lastUpdate || '';
            el.querySelector('#fMMCodes').value = mm.codesNoLoc || 0;
            el.querySelector('#fMMSplit').value = mm.splitGroups || 0;
            el.querySelector('#fMMEmpty').value = mm.emptyLoc || 0;
            el.querySelector('#fMMStock').value = mm.stockRoom || 0;
            el.querySelector('#fMML0').value = mm.l0 || 0;
            return;
          }
          const qu = e.target.closest('[data-updatemm]');
          if (qu) {
            const mm = Store.mmBranch(qu.dataset.updatemm);
            panel.classList.add('open');
            el.querySelector('#btnNewMM').textContent = '−';
            el.querySelector('#fMMEdit').value = '';
            el.querySelector('#fMMBranch').value = qu.dataset.updatemm;
            el.querySelector('#fMMDate').value = todayISO();
            ['fMMCodes', 'fMMSplit', 'fMMEmpty', 'fMMStock', 'fMML0'].forEach(id => {
              const map = { fMMCodes: 'codesNoLoc', fMMSplit: 'splitGroups', fMMEmpty: 'emptyLoc', fMMStock: 'stockRoom', fMML0: 'l0' };
              el.querySelector('#' + id).value = mm ? (mm[map[id]] || 0) : 0;
            });
            return;
          }
          const view = e.target.closest('[data-viewmm]');
          if (view) { const tgt = document.getElementById('mm-prob-' + view.dataset.viewmm); if (tgt) { tgt.scrollIntoView({ behavior: 'smooth', block: 'center' }); } return; }
        });
        el.querySelector('#btnExportMM').addEventListener('click', () => Exporter.downloadCSV('moneyMap', 'vm_money_map_' + todayISO() + '.csv'));
      }
    };
  };
Views.visits = function () {
    const todayDate = todayISO();
    let rootEl = null;
    const dDays = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
    const dFor = (m, d) => { const [y, mo] = m.split('-').map(Number); return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
    const statusSh = v => v.status === 'DONE' ? '✓' : v.status === 'NOT_DONE' ? '✕' : v.status === 'RESCHEDULED' ? '↻' : v.status === 'OFF' ? 'OFF' : v.status === 'WORK_MISSION' ? 'WM' : 'P';
    const chipBody = v => v.status === 'RESCHEDULED' ? esc(v.originalBranch || v.branch) + '→' + esc(v.newBranch || '') + ' @' + esc((v.newDate || '').slice(5)) : esc(v.branch) + ' · ' + statusSh(v);
    function scheduleGrid(links) {
      const viewMode = (links.view || 'day').value;
      const month = (links.month || { value: todayDate.slice(0, 7) }).value;
      const filterDate = links.date ? links.date.value : '';
      const midF = links.member ? links.member.value : '';
      const brF = links.branch ? links.branch.value : '';
      const days = dDays(month);
      const members = Store.state.members;
      let visits = Store.state.visits.slice().filter(v => (v.date || '').startsWith(month));
      if (filterDate) visits = visits.filter(v => v.date === filterDate);
      if (midF) visits = visits.filter(v => v.memberId === midF);
      if (brF) visits = visits.filter(v => v.branch === brF);
      const byDayMember = {};
      visits.forEach(v => { const k = (v.date || '') + '|' + v.memberId; (byDayMember[k] = byDayMember[k] || []).push(v); });
      const chips = list => list.length ? list.map(v => '<button class="vs-chip c-' + v.status + '" data-editv="' + escAttr(JSON.stringify(v)) + '">' + chipBody(v) + '</button>').join('') : '<span class="vs-none">—</span>';
      let html;
      if (viewMode === 'area') {
        html = '<table class="tbl vs-grid"><thead><tr><th>Area VM</th>';
        for (let d = 1; d <= days; d++) html += '<th>' + d + '</th>';
        html += '</tr></thead><tbody>' + members.map(m => {
          let row = '<tr><td class="rowhead">' + esc(memberName(m.id)) + '</td>';
          for (let d = 1; d <= days; d++) { const iso = dFor(month, d); const list = byDayMember[iso + '|' + m.id] || []; row += '<td class="vday-col">' + chips(list) + '</td>'; }
          return row + '</tr>';
        }).join('') + '</tbody></table>';
      } else {
        html = '<table class="tbl vs-grid"><thead><tr><th>Day</th>';
        members.forEach(m => html += '<th>' + esc(memberName(m.id)) + '</th>');
        html += '</tr></thead><tbody>';
        for (let d = 1; d <= days; d++) { const iso = dFor(month, d); html += '<tr><td class="rowhead">' + d + '</td>'; members.forEach(m => { const list = byDayMember[iso + '|' + m.id] || []; html += '<td class="vday-col">' + chips(list) + '</td>'; }); html += '</tr>'; }
        html += '</tbody></table>';
      }
      return html;
    }
function analysisHtml() {
      const all = Store.state.visits || [];
      if (!all.length) return emptyStateHtml('No visits planned.', 'Analysis will appear once visits are added.');
      const members = Store.state.members;
      const planned = all.filter(v => v.date === todayDate);
      const done = all.filter(v => v.status === 'DONE');
      const noted = all.filter(v => v.status === 'NOT_DONE');
      const resched = all.filter(v => v.status === 'RESCHEDULED');
      const allBranches = new Set(); members.forEach(m => (m.branches || []).forEach(b => allBranches.add(b)));
      const visitedBranches = new Set(all.map(x => x.branch));
      const coverage = allBranches.size ? Math.round(visitedBranches.size / allBranches.size * 100) : 0;
      const workDays = new Set(all.map(x => x.date || '')).size;
      const perVM = members.map(m => {
        const n = all.filter(x => x.memberId === m.id);
        const vb = new Set(n.map(x => x.branch));
        const cov = (m.branches || []).length ? Math.round(vb.size / (m.branches || []).length * 100) : 0;
        return { name: Store.memberName(m), n: n.length, cov };
      });
      const wd = {}; all.forEach(x => { const dn = new Date((x.date || '') + 'T00:00:00'); const w = isNaN(dn) ? -1 : dn.getDay(); if (w >= 0) wd[w] = (wd[w] || 0) + 1; });
      const wdNames = LANG === 'ar' ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return '<div class="grid cols-3">' +
        kpi('Total / الإجمالي', all.length, todayDate, 'blue-k') +
        kpi('Completed / منفذة', done.length, '', 'green-k') +
        kpi('Not Done / غير منفذة', noted.length, '', 'red-k') +
        '</div>' +
        '<div class="members-mini">' +
        '<div class="mini-stat"><span class="ms-label">' + esc(t('branchCoverage')) + '</span><span class="ms-val">' + visitedBranches.size + ' / ' + allBranches.size + ' (' + coverage + '%)</span></div>' +
        '<div class="mini-stat"><span class="ms-label">' + esc(t('workingDays')) + '</span><span class="ms-val">' + workDays + '</span></div>' +
        '<div class="mini-stat"><span class="ms-label">' + esc(t('visitsPerAreaVM')) + '</span><span class="ms-val">' + (members.length ? (all.length / members.length).toFixed(1) : '0') + '</span></div>' +
        '<div class="mini-stat"><span class="ms-label">Rescheduled / مُعاد جدولتها</span><span class="ms-val">' + resched.length + '</span></div>' +
        '</div>' +
        '<div class="table-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>' + esc(t('areaVM')) + '</th><th class="num">' + esc(t('totalVisits')) + '</th><th class="num">Coverage / التغطية</th></tr></thead><tbody>' +
        perVM.map(v => '<tr><td>' + esc(v.name) + '</td><td class="num">' + v.n + '</td><td class="num">' + v.cov + '%</td></tr>').join('') + '</tbody></table></div>';
    }
    const html =
    '<div class="page">' +
      '<div class="page-head">' +
        '<div class="page-title"><h1>🗺️ ' + esc(t('nav_visits')) + '</h1><p>Visit Plan / Shift & Visit Schedule</p></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn" id="btnNewVisit">+ ' + esc(t('addVisitTxt')) + '</button>' +
      '</div>' +
      '<div class="card"><div class="card-title"><h3>Controls</h3></div><div class="filters">' +
        X.field('Month / الشهر', '<input type="month" id="fltVisitMonth" value="' + todayDate.slice(0, 7) + '">') +
        X.field(t('date'), '<input type="date" id="fltVisitDate">') +
        X.field(t('areaVM'), '<select id="fltVisitMember"><option value="">' + esc(t('allMembers')) + '</option>' + X.memberOpts('') + '</select>') +
        X.field(t('branch'), branchSelectHtml('fltVisitBranch', true, '')) +
        X.field('View By / العرض', '<select id="fltVisitView"><option value="day">By Day / باليوم</option><option value="area">By Area VM / بالمنطقة</option></select>') +
      '</div></div>' +
      '<div class="form-panel visit-plan-inline-form" id="panelVisit"><div class="form-row cols-3">' + X.field(t('date'), '<input type="date" id="fVisitDate">') + X.field(t('areaVM'), '<select id="fVisitMember">' + X.memberOpts('') + '</select>') + X.field(t('plannedBranch'), branchSelectHtml('fVisitBranch', false, '')) + X.field('Shift / الشيفت', '<input id="fVisitShift" placeholder="10:00-18:00">') + X.field(t('status'), '<select id="fVisitStatus">' + ['PLANNED', 'DONE', 'NOT_DONE', 'RESCHEDULED', 'OFF', 'WORK_MISSION'].map(x => '<option>' + x + '</option>').join('') + '</select>') + X.field('Reason / السبب', '<input id="fVisitReason">') + X.field('Comment / ملاحظة', '<input id="fVisitComment">') + '</div><div class="form-row cols-3" id="rescheduleFields" style="display:none">' + X.field('Original Branch / الفرع الأصلي', '<input id="fOriginalBranch" readonly>') + X.field('Changed To / الفرع الجديد', '<select id="fNewBranch"></select>') + X.field('New Visit Date / التاريخ الجديد', '<input type="date" id="fNewDate">') + '</div><div class="form-actions"><input type="hidden" id="fVisitEditId"><button class="btn green" id="fVisitSave">' + esc(t('save')) + '</button><button class="btn red" id="fVisitDelete" style="display:none">🗑️ ' + esc(t('delete')) + '</button><button class="btn amber" id="fVisitResched" style="display:none">↻ Reschedule / إعادة جدولة</button><button class="btn gray" data-close>' + esc(t('cancel')) + '</button></div></div>' +
      '<div class="card visit-plan-grid-card"><div id="vsGrid"></div></div>' +
      '<div class="card"><div class="card-title"><h3>📊 Analysis / التحليل</h3></div><div id="vsAnalysis">' + analysisHtml() + '</div></div>' +
      '<div class="card import-tools"><div class="card-title"><h3>📥 Import / Data Tools</h3></div><div class="filters"><label class="field"><span>Upload Shift & Visit Schedule</span><input type="file" id="visitScheduleFile" accept=".csv,.txt"></label><button class="btn gray" id="importVisitSchedule">Import CSV/TSV</button><button class="btn gray" id="btnVisitExcel">📥 ' + esc('Import Excel / استيراد إكسل') + '</button><span id="scheduleFileName" class="badge blue">' + esc((Store.state.visitScheduleFiles || []).slice(-1)[0]?.name || 'No schedule file') + '</span></div><div id="vsStatsArea"></div></div>' +
    '</div>';
    return {
      html,
      init(el) {
        rootEl = el;
        const panel = el.querySelector('#panelVisit');
        const newVisitBtn = el.querySelector('#btnNewVisit');
        X.openPanel(newVisitBtn, panel);
        el.querySelector('[data-close]').addEventListener('click', () => panel.classList.remove('open'));
        if (window._autoForm === 'visits') {
          panel.classList.add('open');
          newVisitBtn.textContent = '−';
        }
        const syncBranches = () => {
          const mid = el.querySelector('#fVisitMember').value;
          const opts = (Store.findMember(mid)?.branches || []).map(b => '<option value="' + esc(b) + '">' + esc(b) + '</option>').join('');
          const cur = el.querySelector('#fVisitBranch').value;
          el.querySelector('#fVisitBranch').innerHTML = opts;
          el.querySelector('#fNewBranch').innerHTML = opts;
          if (cur && opts.indexOf('value="' + esc(cur) + '"') >= 0) el.querySelector('#fVisitBranch').value = cur;
          else el.querySelector('#fVisitBranch').selectedIndex = 0;
        };
        el.querySelector('#fVisitMember').addEventListener('change', syncBranches);
        el.querySelector('#fVisitStatus').addEventListener('change', () => { const show = el.querySelector('#fVisitStatus').value === 'RESCHEDULED'; el.querySelector('#rescheduleFields').style.display = show ? 'grid' : 'none'; el.querySelector('#fOriginalBranch').value = el.querySelector('#fVisitBranch').value; });
el.querySelector('#fVisitSave').addEventListener('click', () => {
          const r = { date: el.querySelector('#fVisitDate').value, memberId: el.querySelector('#fVisitMember').value, branch: el.querySelector('#fVisitBranch').value, shift: el.querySelector('#fVisitShift').value, status: el.querySelector('#fVisitStatus').value, reason: el.querySelector('#fVisitReason').value, comment: el.querySelector('#fVisitComment').value };
          if (r.status === 'RESCHEDULED') { r.originalBranch = el.querySelector('#fOriginalBranch').value || r.branch; r.newBranch = el.querySelector('#fNewBranch').value; r.newDate = el.querySelector('#fNewDate').value; if (!r.newBranch || !r.newDate) { toast('Set new branch + date for reschedule / حدد الفرع والتاريخ الجديدين'); return; } }
          if (!r.date || !r.memberId || !r.branch) { toast(t('date') + '!'); return; }
          const id = el.querySelector('#fVisitEditId').value;
          const p = id ? Store.updateRec('visits', id, r) : Store.addVisit(r);
          Store.confirm(p, t('savedPrefs')).then(function (res) { if (res && res.ok !== false) router(); });
        });
        el.querySelector('#fVisitResched').addEventListener('click', () => {
          el.querySelector('#fVisitStatus').value = 'RESCHEDULED';
          el.querySelector('#fOriginalBranch').value = el.querySelector('#fVisitBranch').value || (el.querySelector('#fVisitBranch').options[0] || {}).value || '';
          el.querySelector('#rescheduleFields').style.display = 'grid';
        });
        el.querySelector('#fVisitDelete').addEventListener('click', () => { const id = el.querySelector('#fVisitEditId').value; if (id) { Store.confirm(Store.deleteRec('visits', id), 'Deleted / تم الحذف').then(function (r) { if (r && r.ok !== false) router(); }); } });
        const fltMember = el.querySelector('#fltVisitMember');
        const fltBranch = el.querySelector('#fltVisitBranch');
const renderAll = () => {
          const recs = Store.state.visits || [];
          const banner = recs.length ? '' : emptyStateHtml('No visits planned.', 'Planned visits will appear here once added.');
          el.querySelector('#vsGrid').innerHTML = banner + scheduleGrid({ view: el.querySelector('#fltVisitView'), month: el.querySelector('#fltVisitMonth'), date: el.querySelector('#fltVisitDate'), member: fltMember, branch: fltBranch });
        };
        fltMember.addEventListener('change', () => { const keep = fltBranch.value; const list = fltMember.value ? (Store.findMember(fltMember.value)?.branches || []) : X.allBranchesByMember().map(r => r.code); fltBranch.innerHTML = '<option value="">' + esc(t('allBranches')) + '</option>' + list.map(b => '<option value="' + escAttr(b) + '"' + (b === keep ? ' selected' : '') + '>' + esc(b) + '</option>').join(''); renderAll(); });
        el.querySelector('#fltVisitView').addEventListener('change', renderAll);
        el.querySelector('#fltVisitMonth').addEventListener('change', renderAll);
        el.querySelector('#fltVisitDate').addEventListener('change', renderAll);
        fltBranch.addEventListener('change', renderAll);
        el.addEventListener('click', e => {
          const ed = e.target.closest('[data-editv]');
          if (ed) {
            const v = JSON.parse(ed.getAttribute('data-editv'));
            panel.classList.add('open');
            el.querySelector('#fVisitEditId').value = v.id;
            el.querySelector('#fVisitDate').value = v.date;
            el.querySelector('#fVisitMember').value = v.memberId;
            syncBranches();
            el.querySelector('#fVisitBranch').value = v.branch;
            el.querySelector('#fVisitShift').value = v.shift || '';
el.querySelector('#fVisitStatus').value = v.status;
            el.querySelector('#fVisitReason').value = v.reason || '';
            el.querySelector('#fVisitComment').value = v.comment || '';
            el.querySelector('#fOriginalBranch').value = v.originalBranch || v.branch;
            el.querySelector('#fNewBranch').value = v.newBranch || v.branch;
            el.querySelector('#fNewDate').value = v.newDate || '';
            el.querySelector('#rescheduleFields').style.display = v.status === 'RESCHEDULED' ? 'grid' : 'none';
            el.querySelector('#fVisitDelete').style.display = 'inline-block';
            el.querySelector('#fVisitResched').style.display = 'inline-block';
            return;
          }
          const va = e.target.closest('[data-vadd]');
          if (va) {
            const [d, mid] = va.dataset.vadd.split('|');
            panel.classList.add('open');
            el.querySelector('#fVisitEditId').value = '';
            el.querySelector('#fVisitDate').value = d;
            el.querySelector('#fVisitMember').value = mid;
            syncBranches();
el.querySelector('#fVisitStatus').value = 'PLANNED';
            el.querySelector('#fVisitDelete').style.display = 'none';
            el.querySelector('#fVisitResched').style.display = 'none';
            el.querySelector('#rescheduleFields').style.display = 'none';
            el.querySelector('#fVisitBranch').selectedIndex = 0;
            return;
          }
});
        el.querySelector('#btnVisitExcel').addEventListener('click', () => ExcelImport.open('visits'));
        el.querySelector('#importVisitSchedule').addEventListener('click', () => {
          const file = el.querySelector('#visitScheduleFile').files[0];
          if (!file) { toast('Choose schedule file first'); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const text = String(reader.result || '');
            const lines = text.split(/\r?\n/).filter(Boolean);
            if (!lines.length) return;
            const head = lines[0].split(/[\t,]/).map(x => x.trim().toLowerCase());
            const idx = k => head.findIndex(x => x === k || x.includes(k));
            const toISO = d => {
              const m = String(d).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
              if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
              const m2 = String(d).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
              if (m2) return m2[1] + '-' + String(m2[2]).padStart(2, '0') + '-' + String(m2[3]).padStart(2, '0');
              return String(d || '').slice(0, 10);
            };
            let added = 0; let skipped = 0;
            lines.slice(1).forEach(line => {
              const c = line.split(/[\t,]/).map(x => x.trim());
              const d = toISO(c[idx('date')]);
              const mid = c[idx('area vm')] || c[idx('member')] || c[idx('area vm name')];
              const br = c[idx('branch')] || c[idx('visit branch')];
              const shift = c[idx('shift')];
              const low = String(mid || '').trim().toLowerCase();
              const m = Store.state.members.find(x => x.id === low || x.name.en.toLowerCase() === low || (x.name.ar || '').toLowerCase() === low);
              if (d && br && m) {
                const dup = Store.state.visits.some(v => v.date === d && v.memberId === m.id && v.branch === br.toUpperCase());
                if (dup) { skipped++; return; }
                Store.addVisit({ id: uid(), date: d, memberId: m.id, branch: br.toUpperCase(), shift: shift || '', status: 'PLANNED' });
                added++;
              }
            });
            Store.state.visitScheduleFiles.push({ id: uid(), name: file.name, uploadedAt: new Date().toISOString(), rows: added });
            Store.save();
            toast('Imported ' + added + ' schedule rows' + (skipped ? ' (' + skipped + ' duplicates skipped)' : ''));
            router();
          };
          reader.readAsText(file);
        });
        const all = Store.state.visits || [];
        const members = Store.state.members;
        const uniq = new Set(all.map(x => x.branch));
        const allBranches = new Set(); members.forEach(m => (m.branches || []).forEach(b => allBranches.add(b)));
        const perBranch = {}; all.forEach(x => perBranch[x.branch] = (perBranch[x.branch] || 0) + 1);
        const wd = {}; all.forEach(x => { const dn = new Date((x.date || '') + 'T00:00:00'); const w = isNaN(dn) ? -1 : dn.getDay(); if (w >= 0) wd[w] = (wd[w] || 0) + 1; });
        const wdNames = LANG === 'ar' ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const sf2 = el.querySelector('#vsStatsArea');
        if (sf2) sf2.innerHTML = '<div class="grid cols-2-lg" style="margin-top:10px"><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('branch')) + '</th><th class="num">' + esc(t('totalVisits')) + '</th></tr></thead><tbody>' + Object.entries(perBranch).sort((a, b) => b[1] - a[1]).map(x => '<tr><td>' + esc(x[0]) + '</td><td class="num">' + x[1] + '</td></tr>').join('') + '</tbody></table></div><div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('weeklyDistribution')) + '</th><th class="num">' + esc(t('totalVisits')) + '</th></tr></thead><tbody>' + wdNames.map((n, i) => '<tr><td>' + esc(n) + '</td><td class="num">' + (wd[i] || 0) + '</td></tr>').join('') + '</tbody></table></div></div>';
        renderAll();
      }
    };
  };

  /* ============================================================
     VIDEO VISITS
     ============================================================ */
  Views.videos = function () {
    const date = todayISO(); const recs=[...Store.state.videos].sort((a,b)=>b.date.localeCompare(a.date));
    const VSTAT=['DONE','NO','PERMISSION','LATE'];
    const label=s=>s.replace(/_/g,' ');
    const rows=list=>list.length?list.map(v=>'<tr><td>'+fmtDate(v.date)+'</td><td>'+esc(Store.memberName(Store.findMember(v.memberId)))+'</td><td>'+esc(v.branch)+'</td><td>'+badge(v.videoInStatus||'NO')+'</td><td>'+badge(v.videoOutStatus||'NO')+'</td><td>'+esc(v.comment||'—')+'</td><td><button class="icon-btn" data-editx="'+escAttr(JSON.stringify(v))+'">✏️</button><button class="icon-btn" data-del="videos|'+v.id+'">🗑️</button></td></tr>').join(''):'<tr><td colspan="7" class="empty">'+esc(t('noData'))+'</td></tr>';
    const html='<div class="page"><div class="page-head"><div class="page-title"><h1>🎥 '+esc(t('nav_videos'))+'</h1><p>'+esc(t('videoVisit'))+'</p></div><div class="spacer"></div><button class="btn" id="btnNewVideo">+ '+esc(t('addVideo'))+'</button></div><div class="form-panel" id="panelVideo"><div class="form-row cols-3">'+X.field(t('date'),'<input type="date" id="fVideoDate">')+X.field(t('areaVM'),'<select id="fVideoMember">'+X.memberOpts('')+'</select>')+X.field(t('branch'),branchSelectHtml('fVideoBranch',false,''))+X.field(t('videoIn'),'<select id="fVideoIn">'+VSTAT.map(x=>'<option>'+x+'</option>').join('')+'</select>')+X.field(t('videoOut'),'<select id="fVideoOut">'+VSTAT.map(x=>'<option>'+x+'</option>').join('')+'</select>')+X.field(t('videoComment'),'<input type="text" id="fVideoComment">')+'</div><div class="form-actions"><input type="hidden" id="fVideoEditId"><button class="btn green" id="fVideoSave">'+esc(t('save'))+'</button><button class="btn gray" data-close>'+esc(t('cancel'))+'</button></div></div><div class="card"><div class="filters">'+X.field(t('date'),'<input type="date" id="fltVideoDate" value="'+date+'">')+X.field(t('areaVM'),'<select id="fltVideoMember"><option value="">'+esc(t('allMembers'))+'</option>'+X.memberOpts('')+'</select>')+X.field(t('branch'),branchSelectHtml('fltVideoBranch',true,''))+'</div><div class="table-wrap"><table class="tbl"><thead><tr><th>'+esc(t('date'))+'</th><th>'+esc(t('areaVM'))+'</th><th>'+esc(t('branch'))+'</th><th>VIDEO IN</th><th>VIDEO OUT</th><th>'+esc(t('videoComment'))+'</th><th>'+esc(t('action'))+'</th></tr></thead><tbody id="videoRows">'+rows(recs.filter(v=>v.date===date))+'</tbody></table></div></div></div>';
    return {html,init(el){const panel=el.querySelector('#panelVideo');X.openPanel(el.querySelector('#btnNewVideo'),panel);el.querySelector('[data-close]').addEventListener('click',()=>panel.classList.remove('open'));el.querySelector('#fVideoMember').addEventListener('change',()=>{const mid=el.querySelector('#fVideoMember').value;el.querySelector('#fVideoBranch').innerHTML=(Store.findMember(mid)?.branches||[]).map(b=>'<option value="'+esc(b)+'">'+esc(b)+'</option>').join('');});el.querySelector('#fVideoSave').addEventListener('click',()=>{const rec={date:el.querySelector('#fVideoDate').value,memberId:el.querySelector('#fVideoMember').value,branch:el.querySelector('#fVideoBranch').value,videoInStatus:el.querySelector('#fVideoIn').value,videoOutStatus:el.querySelector('#fVideoOut').value,comment:el.querySelector('#fVideoComment').value};if(!rec.date||!rec.memberId||!rec.branch){toast(t('date')+'!');return;}const id=el.querySelector('#fVideoEditId').value;const vp=id?Store.updateRec('videos',id,rec):Store.addVideo(Object.assign({videoIn:'',videoOut:''},rec));Store.confirm(vp,t('savedPrefs')).then(r=>{if(r&&r.ok!==false)router();});});
      const filter=()=>{const d=el.querySelector('#fltVideoDate').value,m=el.querySelector('#fltVideoMember').value,b=el.querySelector('#fltVideoBranch').value;el.querySelector('#videoRows').innerHTML=rows(recs.filter(v=>(!d||v.date===d)&&(!m||v.memberId===m)&&(!b||v.branch===b)));};['fltVideoDate','fltVideoMember','fltVideoBranch'].forEach(id=>el.querySelector('#'+id).addEventListener('change',filter));el.addEventListener('click',e=>{const ed=e.target.closest('[data-editx]');if(ed){const v=JSON.parse(ed.getAttribute('data-editx'));panel.classList.add('open');el.querySelector('#fVideoEditId').value=v.id;el.querySelector('#fVideoDate').value=v.date;el.querySelector('#fVideoMember').value=v.memberId;el.querySelector('#fVideoIn').value=v.videoInStatus||'DONE';el.querySelector('#fVideoOut').value=v.videoOutStatus||'DONE';el.querySelector('#fVideoComment').value=v.comment||'';return;}const dl=e.target.closest('[data-del]');if(dl){const [k,id]=dl.dataset.del.split('|');Store.deleteRec(k,id);router();}});}};
  };

  /* ============================================================
     WEEKLY TASKS
     ============================================================ */
  Views.weekly = function () {
    const recs = [...Store.state.weekly].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    const curWeek = (Engine.currentWeekly(Store.state.members[0].id) || {}).weekStart || todayISO();

    function rows(list) {
      if (!list.length) return '<tr><td colspan="7" class="empty">' + esc(t('noData')) + '</td></tr>';
      return list.map(w => {
        const doneN = ['outfit', 'window', 'meeting'].filter(k => w[k] === 'DONE').length;
        const pct = Math.round(doneN / 3 * 100);
        return '<tr>' +
          '<td>' + fmtDate(w.weekStart) + '</td>' +
          '<td>' + esc(Store.memberName(Store.findMember(w.memberId))) + '</td>' +
          '<td>' + statusBadge(w.outfit) + '</td>' +
          '<td>' + statusBadge(w.window) + '</td>' +
          '<td>' + statusBadge(w.meeting) + '</td>' +
          '<td class="num"><b>' + pct + '%</b></td>' +
          '<td style="display:flex;gap:4px">' +
            '<button class="icon-btn" data-editw=\'' + JSON.stringify(w) + '\' title="' + esc(t('edit')) + '">✏️</button>' +
            '<button class="icon-btn" data-del="weekly|' + w.id + '" title="' + esc(t('delete')) + '">🗑️</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    const html =
    '<div class="page">' +
      '<div class="page-head">' +
        '<div class="page-title"><h1>📅 ' + esc(t('nav_weekly')) + '</h1><p>' + esc(t('weeklyComp')) + '</p></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn" id="btnNewWeekly">+ ' + esc(t('addWeekly')) + '</button>' +
      '</div>' +
      '<div class="form-panel" id="panelWeekly">' +
        '<div class="form-row cols-3">' +
          X.field(t('date'), '<input type="date" id="fWeeklyDate" value="' + curWeek + '">') +
          X.field(t('areaVM'), '<select id="fWeeklyMember">' + X.memberOpts('') + '</select>') +
          X.field(t('outfit'), X.selectStatus('fWeeklyOutfit', ['DONE', 'NO', 'PENDING', 'STILL'], 'DONE')) +
          X.field(t('window'), X.selectStatus('fWeeklyWindow', ['DONE', 'NO', 'PENDING', 'STILL'], 'DONE')) +
          X.field(t('meeting'), X.selectStatus('fWeeklyMeeting', ['DONE', 'NO', 'PENDING', 'STILL'], 'DONE')) +
        '</div>' +
        '<div class="form-actions"><input type="hidden" id="fWeeklyEditId"><button class="btn green" id="fWeeklySave">' + esc(t('save')) + '</button><button class="btn gray" data-close> ' + esc(t('cancel')) + '</button></div>' +
      '</div>' +
      '<div class="card"><div class="filters">' +
        X.field(t('date'), '<input type="date" id="fltWeeklyDate" value="' + curWeek + '">') +
        X.field(t('areaVM'), '<select id="fltWeeklyMember"><option value="">' + esc(t('allMembers')) + '</option>' + X.memberOpts('') + '</select>') +
        '<button class="btn gray" id="btnExportWeekly">⬇ ' + esc(t('exportCsv')) + '</button>' +
      '</div>' +
      '<div class="table-wrap" style="margin-top:12px"><table class="tbl">' +
        '<thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('areaVM')) + '</th><th>' + esc(t('outfit')) + '</th><th>' + esc(t('window')) + '</th><th>' + esc(t('meeting')) + '</th><th class="num">' + esc(t('weeklyComp')) + '</th><th>' + esc(t('action')) + '</th></tr></thead>' +
        '<tbody id="weeklyRows">' + rows(recs.filter(w => w.weekStart === curWeek)) + '</tbody></table></div>' +
      '</div>' +
      '<div class="card"><div class="card-title">📅 '+esc(t('monthlySummary'))+'</div><div class="filters">'+X.field('Month / الشهر','<input type="month" id="inpWeeklyMonth" value="'+todayISO().slice(0,7)+'">')+'<button class="btn gray" id="btnExportWeeklySummary">⬇ CSV</button></div><div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>'+esc(t('areaVM'))+'</th><th>Week 1</th><th>Week 2</th><th>Week 3</th><th>Week 4</th><th>Week 5</th><th>'+esc(t('monthlyResult'))+'</th></tr></thead><tbody id="weeklySummaryRows"></tbody></table></div><div id="weeklyBest" style="margin-top:12px"></div></div>' +
    '</div>';

    return {
      html,
      init(el) {
        const panel = el.querySelector('#panelWeekly');
        X.openPanel(el.querySelector('#btnNewWeekly'), panel);
        el.querySelector('[data-close]').addEventListener('click', () => { panel.classList.remove('open'); el.querySelector('#btnNewWeekly').textContent = '+ ' + t('addWeekly'); });
        if (window._autoForm === 'weekly') { panel.classList.add('open'); el.querySelector('#btnNewWeekly').textContent = '−'; }

        el.querySelector('#fWeeklySave').addEventListener('click', () => {
          const dateV = el.querySelector('#fWeeklyDate').value;
          if (!dateV) { toast(t('date') + '!'); return; }
          const rec = {
            weekStart: dateV, memberId: el.querySelector('#fWeeklyMember').value,
            outfit: el.querySelector('select[name=fWeeklyOutfit]').value,
            window: el.querySelector('select[name=fWeeklyWindow]').value,
            meeting: el.querySelector('select[name=fWeeklyMeeting]').value
          };
          const editId = el.querySelector('#fWeeklyEditId').value;
          const p = editId ? Store.updateRec('weekly', editId, rec) : Store.addWeekly(rec);
          Store.confirm(p, t('savedPrefs')).then(function (res) { if (res && res.ok !== false) router(); });
        });

        function filterRows() {
          const fd = el.querySelector('#fltWeeklyDate').value;
          const fm = el.querySelector('#fltWeeklyMember').value;
          el.querySelector('#weeklyRows').innerHTML = rows(recs.filter(w => (!fd || w.weekStart === fd) && (!fm || w.memberId === fm)));
        }
        ['fltWeeklyDate', 'fltWeeklyMember'].forEach(id => el.querySelector('#' + id).addEventListener('change', filterRows));

        el.addEventListener('click', (e) => {
          const ed = e.target.closest('[data-editw]');
          if (ed) {
            const w = JSON.parse(ed.dataset.editw);
            panel.classList.add('open');
            el.querySelector('#btnNewWeekly').textContent = '−';
            el.querySelector('#fWeeklyEditId').value = w.id;
            el.querySelector('#fWeeklyDate').value = w.weekStart;
            el.querySelector('#fWeeklyMember').value = w.memberId;
            el.querySelector('select[name=fWeeklyOutfit]').value = w.outfit;
            el.querySelector('select[name=fWeeklyWindow]').value = w.window;
            el.querySelector('select[name=fWeeklyMeeting]').value = w.meeting;
            return;
          }
          const dl = e.target.closest('[data-del]');
          if (dl) { const [k, id] = dl.dataset.del.split('|'); Store.deleteRec(k, id); router(); }
        });
        el.querySelector('#btnExportWeekly').addEventListener('click', () => Exporter.downloadCSV('weekly', 'vm_weekly_' + todayISO() + '.csv'));
        const inWeek=(d,start)=>d>=start&&d<=addDays(start,6);
        const pctOf=(num,den)=>den?Math.round(num/den*100):null;
        function weekModule(m,start){
          const month=start.slice(0,7);
          const bs=(m.branches||[]).length*7;
          const mods={};
          const dr=(Store.state.dailyBranchReports||[]).filter(r=>r.memberId===m.id&&r.date&&inWeek(r.date,start));
          mods.daily=bs?pctOf(dr.filter(r=>r.status==='DONE').length,bs):null;
          const vmails=(Store.state.visitMails||[]).filter(r=>r.memberId===m.id&&r.date&&inWeek(r.date,start));
          mods.mail=vmails.length?pctOf(vmails.filter(v=>v.status==='ON_TIME').length,vmails.length):null;
          const vids=(Store.state.videos||[]).filter(r=>r.memberId===m.id&&r.date&&inWeek(r.date,start));
          mods.vIn=vids.length?pctOf(vids.filter(v=>(v.videoInStatus||'NO')==='DONE').length,vids.length):null;
          mods.vOut=vids.length?pctOf(vids.filter(v=>(v.videoOutStatus||'NO')==='DONE').length,vids.length):null;
          const mm=(Store.state.moneyMapDaily||[]).filter(r=>r.memberId===m.id&&r.date&&inWeek(r.date,start));
          mods.money=bs?pctOf(mm.length,bs):null;
          const att=(Store.state.attendance||[]).filter(r=>r.memberId===m.id&&r.date&&inWeek(r.date,start));
          mods.att=att.length?pctOf(att.filter(a=>a.status==='ON_TIME').length,att.length):null;
          const visits=(Store.state.visits||[]).filter(r=>r.memberId===m.id&&r.date&&inWeek(r.date,start));
          const planV=visits.filter(v=>['PLANNED','DONE','NOT_DONE','RESCHEDULED'].includes(v.status));
          mods.visit=planV.length?pctOf(planV.filter(v=>v.status==='DONE').length,planV.length):null;
          const tk=(Store.state.tasks||[]).filter(r=>r.memberId===m.id&&r.date&&inWeek(r.date,start));
          mods.task=tk.length?pctOf(tk.filter(x=>['APPROVED','APPROVED_LATE'].includes(x.status)).length,tk.length):null;
          const vals=Object.values(mods).filter(v=>v!==null);
          return {mods,score:vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):null};
        }
        function renderWeekly(month){
          const cells=Store.state.members.map(m=>{const weeks=[0,1,2,3,4].map(i=>weekModule(m,addDays(month+'-01',i*7)));const ok=weeks.filter(w=>w.score!==null);const monthly=ok.length?Math.round(ok.reduce((a,b)=>a+b.score,0)/ok.length):null;return{m,weeks,monthly};});
          const sr=el.querySelector('#weeklySummaryRows');
          if(sr)sr.innerHTML=cells.map(r=>'<tr><td class="rowhead">'+esc(Store.memberName(r.m))+'</td>'+r.weeks.map(w=>'<td class="num">'+(w.score===null?esc(t('naLabel')):w.score+'%')+'</td>').join('')+'<td class="num"><b>'+(r.monthly===null?esc(t('naLabel')):r.monthly+'%')+'</b></td></tr>').join('')||'<tr><td colspan="7" class="empty">'+esc(t('noData'))+'</td></tr>';
          const wb=el.querySelector('#weeklyBest');
          if(wb){const best=[0,1,2,3,4].map(i=>{const z=cells.filter(x=>x.weeks[i].score!==null).sort((a,b)=>b.weeks[i].score-a.weeks[i].score)[0];return z?'W'+(i+1)+': '+esc(Store.memberName(z.m))+' ('+z.weeks[i].score+'%)':'W'+(i+1)+': '+esc(t('naLabel'));}).join(' · ');wb.innerHTML='<div class="card-title">🏆 '+esc(t('bestAreaVMWeek'))+'</div><div style="padding:10px;border-radius:10px;background:var(--surface-2)">'+best+'</div>';}
        }
        renderWeekly(todayISO().slice(0,7));
        const wmI=el.querySelector('#inpWeeklyMonth'); if(wmI)wmI.addEventListener('change',()=>renderWeekly(wmI.value));
        const bws=el.querySelector('#btnExportWeeklySummary'); if(bws)bws.addEventListener('click',()=>{const month=(el.querySelector('#inpWeeklyMonth')||{value:todayISO().slice(0,7)}).value;const rows=[['Area VM','Week 1','Week 2','Week 3','Week 4','Week 5','Monthly Result']];Store.state.members.forEach(m=>{const weeks=[0,1,2,3,4].map(i=>weekModule(m,addDays(month+'-01',i*7)));const ok=weeks.filter(w=>w.score!==null);rows.push([m.name.en,...weeks.map(w=>w.score===null?'N/A':w.score),ok.length?Math.round(ok.reduce((a,b)=>a+b.score,0)/ok.length):'N/A']);});const csv=rows.map(r=>r.join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));a.download='weekly_summary_'+(month||todayISO().slice(0,7))+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(a.href);},200);});      }
    };
  };

  /* member -> branch dependent select binding is handled globally in app.js */
})();
