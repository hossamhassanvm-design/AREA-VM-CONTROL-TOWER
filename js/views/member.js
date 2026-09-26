/* ============================================================
   AREA VM CONTROL TOWER V1 — Member detail view
   ============================================================ */

(function () {
  Views.member = function (id) {
    const m = Store.findMember(id);
    if (!m) return Views.notFound();
    const noOps = !Store.hasOperationalData();
    const date = todayISO();
    const sc = noOps ? null : Engine.memberScore(id, date);
    const st = noOps ? { key: 'nopdata', cls: 'gray' } : Engine.statusForScore(sc.total);
    const issues = Engine.openIssues(id);
    const mmItems = noOps ? [] : (m.branches || []).map(b => ({ code: b, info: Engine.mmBranchScore(b) , mm: Engine.mmBranch(b) }));
    const visits = Store.state.visits.filter(v => v.memberId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const videos = Store.state.videos.filter(v => v.memberId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const week = noOps ? null : Engine.weekAnalysis().find(x => x.member.id === id);

    const lostRows = (sc && sc.lost.length) ? sc.lost.map(l =>
      '<tr><td>' + esc(l.reason) + '</td><td class="num prob-cell" style="color:var(--red)">−' + l.points + '</td></tr>').join('')
      : '<tr><td colspan="2">' + esc(t('lostReasons')) + '</td></tr>';

    const partsRows = noOps ? '<tr><td colspan="3" class="empty">' + esc(t('noData')) + '</td></tr>' : sc.parts.map(p =>
      '<tr><td class="rowhead">' + esc(p.label) + '</td><td class="num">' + p.earned + '/' + p.max + '</td><td class="num"><div class="bar-bg" style="width:70px;display:inline-block;vertical-align:middle"><div class="bar ' + (p.earned >= p.max ? 'green' : p.earned >= p.max * 0.6 ? 'amber' : 'red') + '" style="width:' + Math.round(p.earned / p.max * 100) + '%"></div></div></td></tr>').join('');

    const mmRows = mmItems.length ? mmItems.map(x => {
      const days = x.info.days === Infinity ? '—' : x.info.days;
      const bad = x.info.problems.length ? t('mmNotUpdated') + ' ' : '';
      return '<tr><td class="rowhead">' + esc(x.code) + '</td>' +
        '<td>' + (x.mm.lastUpdate ? fmtDate(x.mm.lastUpdate) : '—') + '</td>' +
        '<td class="num">' + x.mm.codesNoLoc + '</td><td class="num">' + x.mm.emptyLoc + '</td>' +
        '<td><span class="badge ' + (x.info.score === 0 ? 'red' : x.info.score < 80 ? 'amber' : 'green') + '">' + (x.info.score === 0 ? t('mmNotUpdated') : x.info.score + '%') + '</span></td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty">' + esc(t('noData')) + '</td></tr>';

    const issueRows = issues.map(i =>
      '<tr><td>' + fmtDate(i.date) + '</td><td>' + esc(i.title) + '</td><td>' + (i.branch ? esc(i.branch) : '—') + '</td><td>' + sevBadge(i.severity === 'CRITICAL' ? 'RED' : i.severity === 'MAJOR' ? 'AMBER' : 'AMBER') + '</td><td>' + statusBadge(i.status) + '</td>' +
      '<td><button class="btn gray sm" data-resolve="' + i.id + '">' + esc(t('markResolved')) + '</button></td></tr>').join('') ||
      '<tr><td colspan="6" class="empty">' + esc(t('noData')) + '</td></tr>';

    const html =
    '<div class="page">' +
      '<div class="page-head">' +
        '<a class="btn ghost sm" href="#/dashboard">← ' + esc(t('back')) + '</a>' +
        '<div class="page-title"><h1>' + esc(Store.memberName(m)) + '</h1><p>' + (m.branches || []).length + ' ' + t('branches') + ' — ' + t('memberDetail') + '</p></div>' +
        '<div class="spacer"></div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<span style="font-size:26px;font-weight:800">' + (noOps ? 'N/A' : sc.total + t('of100')) + '</span>' +
          '<span class="badge ' + st.cls + '">' + esc(noOps ? 'N/A' : t(st.key)) + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="grid ' + (window.innerWidth < 1100 ? '' : 'cols-2-lg') + '">' +
        '<div class="grid">' +
          '<div class="card"><div class="card-title">' + esc(t('scoreBreakdown')) + '</div>' +
            '<div class="table-wrap"><table class="tbl">' +
              '<thead><tr><th>' + esc(t('kpi')) + '</th><th class="num">' + esc(t('score')) + '</th><th></th></tr></thead>' +
              '<tbody>' + partsRows + '</tbody>' +
            '</table></div>' +
            '<div style="margin-top:12px"><div class="card-title">' + esc(t('pointsLost')) + '</div>' +
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('problem')) + '</th><th class="num">' + esc(t('score')) + '</th></tr></thead><tbody>' + lostRows + '</tbody></table></div></div>' +
          '</div>' +

          '<div class="card"><div class="card-title">' + esc(t('moneyMap')) + '</div>' +
            '<div class="table-wrap"><table class="tbl">' +
              '<thead><tr><th>' + esc(t('branch')) + '</th><th>' + esc(t('lastUpdate')) + '</th><th class="num">' + esc(t('codesNoLoc')) + '</th><th class="num">' + esc(t('emptyLoc')) + '</th><th>' + esc(t('mmStatus')) + '</th></tr></thead>' +
              '<tbody>' + mmRows + '</tbody></table></div>' +
          '</div>' +
        '</div>' +

        '<div class="grid">' +
          '<div class="card"><div class="card-title">' + esc(t('openIssues')) + ' (' + issues.length + ')</div>' +
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('issue')) + '</th><th>' + esc(t('branch')) + '</th><th>' + esc(t('severity')) + '</th><th>' + esc(t('status')) + '</th><th></th></tr></thead><tbody>' + issueRows + '</tbody></table></div>' +
          '</div>' +

          '<div class="card"><div class="card-title">' + esc(t('visitHistory')) + ' — ' + esc(t('weekCompare')) + '</div>' +
            (week ? '<div class="table-wrap"><table class="tbl"><tbody>' +
              '<tr><td>' + esc(t('dailyPct')) + '</td><td class="num"><b>' + week.dailyPct + '%</b></td><td><div class="bar-bg"><div class="bar ' + (week.dailyPct >= 80 ? 'green' : week.dailyPct >= 60 ? 'amber' : 'red') + '" style="width:' + week.dailyPct + '%"></div></div></td></tr>' +
              '<tr><td>' + esc(t('mmPct')) + '</td><td class="num"><b>' + week.mmPct + '%</b></td><td><div class="bar-bg"><div class="bar ' + (week.mmPct >= 80 ? 'green' : week.mmPct >= 60 ? 'amber' : 'red') + '" style="width:' + week.mmPct + '%"></div></div></td></tr>' +
              '<tr><td>' + esc(t('visitPct')) + '</td><td class="num"><b>' + week.visitPct + '%</b></td><td><div class="bar-bg"><div class="bar ' + (week.visitPct >= 80 ? 'green' : week.visitPct >= 60 ? 'amber' : 'red') + '" style="width:' + week.visitPct + '%"></div></div></td></tr>' +
              '<tr><td>' + esc(t('videoPct')) + '</td><td class="num"><b>' + week.videoPct + '%</b></td><td><div class="bar-bg"><div class="bar ' + (week.videoPct >= 80 ? 'green' : week.videoPct >= 60 ? 'amber' : 'red') + '" style="width:' + week.videoPct + '%"></div></div></td></tr>' +
              '<tr><td>' + esc(t('weeklyPct')) + '</td><td class="num"><b>' + week.weeklyPct + '%</b></td><td><div class="bar-bg"><div class="bar ' + (week.weeklyPct >= 80 ? 'green' : week.weeklyPct >= 60 ? 'amber' : 'red') + '" style="width:' + week.weeklyPct + '%"></div></div></td></tr>' +
            '</tbody></table></div>' : '<div class="empty">' + esc(t('noData')) + '</div>') +
          '</div>' +

          '<div class="card"><div class="card-title">' + esc(t('visitHistory')) + '</div>' +
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('branch')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>' +
              (visits.length ? visits.map(v => '<tr><td>' + fmtDate(v.date) + '</td><td>' + esc(v.branch) + '</td><td>' + statusBadge(v.status) + '</td></tr>').join('') : '<tr><td colspan="3" class="empty">' + esc(t('noData')) + '</td></tr>') +
            '</tbody></table></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card"><div class="card-title">' + esc(t('videoHistory')) + '</div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('branch')) + '</th><th>' + esc(t('videoIn')) + '</th><th>' + esc(t('videoOut')) + '</th><th>' + esc(t('videoComment')) + '</th></tr></thead><tbody>' +
          (videos.length ? videos.map(v => '<tr><td>' + fmtDate(v.date) + '</td><td>' + esc(v.branch) + '</td><td>' + esc(v.videoIn) + '</td><td>' + (v.videoOut ? esc(v.videoOut) : '<span class="badge red">' + esc(t('missing')) + '</span>') + '</td><td>' + (v.comment ? esc(v.comment) : '—') + '</td></tr>').join('') : '<tr><td colspan="5" class="empty">' + esc(t('noVideos')) + '</td></tr>') +
        '</tbody></table></div>' +
      '</div>' +
    '</div>';

    return {
      html,
      init(el) {
        el.querySelectorAll('[data-resolve]').forEach(b => b.addEventListener('click', () => {
          Store.updateIssue(b.dataset.resolve, { status: 'RESOLVED' });
          toast(t('savedPrefs'));
          router();
        }));
      }
    };
  };
})();