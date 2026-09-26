/* ============================================================
   AREA VM CONTROL TOWER V1 — Branches, Branch detail, Comparison
   ============================================================ */

(function () {
  /* ---------- Branch list ---------- */
  Views.branches = function () {
    const all = [];
    Store.state.members.forEach(m => (m.branches || []).forEach(b => {
      const mm = Engine.mmBranch(b);
      all.push({ code: b, member: m, health: Engine.branchHealth(b), mm, latest: Engine.branchLatestActivity(b) });
    }));
    all.sort((a, b) => a.code.localeCompare(b.code));

    function row(x) {
      const issues = Store.state.issues.filter(i => i.branch === x.code && i.status !== 'RESOLVED').length;
      return '<div class="card clickable" data-goto="#/branch/' + esc(x.code) + '">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<span class="badge ' + x.health.cls + '">' + (x.health.nodata ? '—' : esc(t(x.health.key))) + '</span>' +
          '<b style="font-size:15px">' + esc(x.code) + '</b>' +
          '<span class="spacer" style="flex:1"></span>' +
        '</div>' +
        '<div class="a-meta" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:12px">' +
          '<span>👤 ' + esc(Store.memberName(x.member)) + '</span>' +
          '<span>📅 ' + (x.latest ? fmtDate(x.latest) : '—') + '</span>' +
          '<span>⚠️ ' + issues + '</span>' +
          (x.mm && x.mm.lastUpdate ? '<span>💵 ' + fmtDate(x.mm.lastUpdate) + '</span>' : '') +
        '</div>' +
      '</div>';
    }

    const html =
    '<div class="page">' +
      '<div class="page-head"><div class="page-title"><h1>🏬 ' + esc(t('nav_branches')) + '</h1><p>' + all.length + ' ' + t('branches') + '</p></div>' +
        '<div class="spacer"></div><button class="btn gray" id="btnExportMM2">⬇ ' + esc(t('exportCsv')) + '</button>' +
      '</div>' +
      '<div class="grid cols-3">' +
        kpi(t('healthy'), all.filter(b => b.health.key === 'healthy').length, '', 'green-k') +
        kpi(t('attention'), all.filter(b => b.health.key === 'attention').length, '', 'amber-k') +
        kpi(t('critical'), all.filter(b => b.health.key === 'critical').length, '', 'red-k') +
      '</div>' +
      '<div class="card"><div class="filters"><div class="field"><label>' + esc(t('branch')) + '</label><input type="text" id="fltBranchSearch" placeholder="' + esc(t('search')) + '"></div></div>' +
        '<div class="grid cols-2" style="margin-top:12px" id="branchGrid">' + all.map(row).join('') + '</div>' +
      '</div>' +
    '</div>';

    return {
      html,
      init(el) {
        el.querySelector('#btnExportMM2').addEventListener('click', () => Exporter.downloadCSV('moneyMap', 'vm_money_map_' + todayISO() + '.csv'));
        el.querySelector('#fltBranchSearch').addEventListener('input', (e) => {
          const q = e.target.value.trim().toUpperCase();
          el.querySelector('#branchGrid').innerHTML = all.filter(x => !q || x.code.toUpperCase().includes(q) || Store.memberName(x.member).toUpperCase().includes(q)).map(row).join('');
        });
        el.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', () => { location.hash = a.dataset.goto; }));
      }
    };
  };

  /* ---------- Branch detail ---------- */
  Views.branch = function (code) {
    const health = Engine.branchHealth(code);
    const noMM = !(Store.state.moneyMaps || []).length;
    const owners = Store.findMembersByBranch(code);
    const owner = owners[0];
    const mm = Engine.mmBranch(code);
    const ms = Engine.mmBranchScore(code);
    const issues = Store.state.issues.filter(i => i.branch === code);
    const visits = Engine.branchVisits(code);
    const videos = Engine.branchVideos(code);
    const latest = Engine.branchLatestActivity(code);

    const issueRows = issues.length ? issues.map(i =>
      '<tr><td>' + fmtDate(i.date) + '</td><td>' + esc(Store.memberName(Store.findMember(i.memberId))) + '</td><td>' + esc(i.title) + '</td><td>' + sevBadge(i.severity === 'CRITICAL' ? 'RED' : 'AMBER') + '</td><td>' + statusBadge(i.status) + '</td></tr>').join('')
      : '<tr><td colspan="5" class="empty">' + esc(t('noData')) + '</td></tr>';

    const visitRows = visits.length ? visits.slice(0, 10).map(v =>
      '<tr><td>' + fmtDate(v.date) + '</td><td>' + esc(v.branch) + '</td><td>' + statusBadge(v.status) + '</td></tr>').join('')
      : '<tr><td colspan="3" class="empty">' + esc(t('noVisits')) + '</td></tr>';

    const videoRows = videos.length ? videos.slice(0, 10).map(v =>
      '<tr><td>' + fmtDate(v.date) + '</td><td>' + esc(v.videoIn) + '</td><td>' + (v.videoOut ? esc(v.videoOut) : '<span class="badge red">' + esc(t('missing')) + '</span>') + '</td><td>' + (v.comment ? esc(v.comment) : '—') + '</td></tr>').join('')
      : '<tr><td colspan="4" class="empty">' + esc(t('noVideos')) + '</td></tr>';

    const html =
    '<div class="page">' +
      '<div class="page-head">' +
        '<a class="btn ghost sm" href="#/branches">← ' + esc(t('back')) + '</a>' +
        '<div class="page-title"><h1>🏬 ' + esc(code) + '</h1><p>' + (owner ? esc(Store.memberName(owner)) : '—') + '</p></div>' +
        '<div class="spacer"></div>' +
        '<span class="badge ' + health.cls + '">' + (health.nodata ? '—' : esc(t(health.key))) + '</span>' +
      '</div>' +
      '<div class="grid cols-4">' +
        kpi(t('branchHealth'), health.nodata ? '—' : esc(t(health.key)), health.reasons.join(' · '), health.cls === 'green' ? 'green-k' : health.cls === 'amber' ? 'amber-k' : 'red-k') +
        kpi(t('latestActivity'), latest ? fmtDate(latest) : '—', '', 'blue-k') +
        kpi(t('openIssues'), issues.filter(i => i.status !== 'RESOLVED').length, '', 'amber-k') +
        kpi(t('mmStatus'), noMM ? '—' : (ms.days > 7 ? t('mmNotUpdated') : ms.score + '%'), mm ? (t('lastUpdate') + ' ' + fmtDate(mm.lastUpdate)) : '—', noMM ? 'gray-k' : ms.days > 7 ? 'red-k' : ms.score >= 80 ? 'green-k' : 'amber-k') +
      '</div>' +
      '<div class="grid ' + (window.innerWidth < 1100 ? '' : 'cols-2-lg') + '">' +
        '<div style="display:flex;flex-direction:column;gap:14px">' +
          '<div class="card"><div class="card-title">💵 ' + esc(t('moneyMap')) + '</div>' +
          '<div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('lastUpdate')) + '</th><th class="num">' + esc(t('codesNoLoc')) + '</th><th class="num">' + esc(t('splitGroups')) + '</th><th class="num">' + esc(t('emptyLoc')) + '</th><th class="num">' + esc(t('stockRoom')) + '</th><th class="num">' + esc(t('l0')) + '</th><th>' + esc(t('mmStatus')) + '</th></tr></thead><tbody>' +
          '<tr><td>' + (mm && mm.lastUpdate ? fmtDate(mm.lastUpdate) : '—') + '</td><td class="num">' + (mm ? mm.codesNoLoc : 0) + '</td><td class="num">' + (mm ? mm.splitGroups : 0) + '</td><td class="num">' + (mm ? mm.emptyLoc : 0) + '</td><td class="num">' + (mm ? mm.stockRoom : 0) + '</td><td class="num">' + (mm ? mm.l0 : 0) + '</td><td>' + (noMM ? '<span class="badge gray">—</span>' : ms.problems.length ? '<span class="badge red">' + esc(ms.problems.join(' · ')) + '</span>' : '<span class="badge green">' + esc(t('mmUpdated')) + '</span>') + '</td></tr>' +
          '</tbody></table></div>' +
          (owner ? '<div style="margin-top:10px"><a class="btn sm gray" href="#/money-map">' + esc(t('addMoneyMap')) + ' →</a></div>' : '') +
          '</div>' +
          '<div class="card"><div class="card-title">⚠️ ' + esc(t('openIssues')) + '</div>' +
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('areaVM')) + '</th><th>' + esc(t('issue')) + '</th><th>' + esc(t('severity')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>' + issueRows + '</tbody></table></div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:14px">' +
          '<div class="card"><div class="card-title">🗺️ ' + esc(t('visitHistory')) + '</div>' +
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('branch')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>' + visitRows + '</tbody></table></div>' +
          '</div>' +
          '<div class="card"><div class="card-title">🎥 ' + esc(t('videoHistory')) + '</div>' +
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('videoIn')) + '</th><th>' + esc(t('videoOut')) + '</th><th>' + esc(t('videoComment')) + '</th></tr></thead><tbody>' + videoRows + '</tbody></table></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    return { html, init() {} };
  };

  /* ---------- Comparison ---------- */
  Views.compare = function () {
    const wa = Engine.weekAnalysis();
    const cols = ['dailyPct', 'mmPct', 'visitPct', 'videoPct', 'weeklyPct', 'total'];
    const labels = {
      dailyPct: t('dailyPct'), mmPct: t('mmPct'), visitPct: t('visitPct'), videoPct: t('videoPct'), weeklyPct: t('weeklyPct'), total: t('totalScore')
    };
    const rows = cols.map(k =>
      '<tr><td class="rowhead">' + esc(labels[k]) + '</td>' + wa.map(w =>
        '<td class="num"><span class="badge ' + (w[k] >= 80 ? 'green' : w[k] >= 60 ? 'amber' : 'red') + '">' + w[k] + (k === 'total' ? '' : '%') + '</span></td>').join('') + '</tr>').join('');

    const html =
    '<div class="page">' +
      '<div class="page-head"><div class="page-title"><h1>⚖️ ' + esc(t('comparisonTitle')) + '</h1><p>' + esc(t('weekCompare')) + '</p></div>' +
        '<div class="spacer"></div><button class="btn gray" id="btnCmpCsv">⬇ ' + esc(t('exportCsv')) + '</button>' +
      '</div>' +
      '<div class="card"><div class="chart-box"><canvas id="chCmp"></canvas></div></div>' +
      '<div class="card"><div class="table-wrap"><table class="tbl cmp-table"><thead><tr><th>' + esc(t('kpi')) + '</th>' + wa.map(w => '<th>' + esc(Store.memberName(w.member)) + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
    '</div>';

    return {
      html,
      init(el) {
        ChartKit.bar('chCmp', wa.map(w => Store.memberName(w.member)), [
          { label: t('totalScore'), data: wa.map(w => w.total), backgroundColor: wa.map(w => w.total >= 80 ? '#16a34a' : w.total >= 60 ? '#d97706' : '#dc2626'), borderRadius: 8 }
        ], { max: 100 });
        el.querySelector('#btnCmpCsv').addEventListener('click', () => {
          let csv = [['kpi'].concat(wa.map(w => Store.memberName(w.member))).join(',')];
          cols.forEach(k => { csv.push([labels[k]].concat(wa.map(w => w[k])).join(',')); });
          Exporter.downloadCSVAll('comparison', csv);
        });
      }
    };
  };
})();