/* ============================================================
   AREA VM CONTROL TOWER V1 — Analysis (Daily / Weekly / Monthly)
   ============================================================ */

(function () {
  let monthCursor = { y: 0, m: 0 };

  Views.analysis = function (tab) {
    const active = tab || 'daily';
    const date = todayISO();
    const members = Store.state.members;
    const noOps = !Store.hasOperationalData();

    function todayLists() {
      const done = [], missing = [], critical = [];
      members.forEach(m => {
        const dr = Store.state.dailyReports.find(r => r.date === date && r.memberId === m.id);
        if (dr && (Engine.isDoneDaily(dr.status) || Engine.isExcused(dr.status))) {
          done.push({ icon: '📋', label: t('dailyReport') + ' — ' + Store.memberName(m), sub: statusTxt(dr.status) });
        } else {
          missing.push({ icon: '📋', label: t('dailyReport') + ' — ' + Store.memberName(m), sub: dr ? statusTxt(dr.status) : t('missing') });
        }
        Store.state.visits.filter(v => v.date === date && v.memberId === m.id).forEach(v => {
          if (v.status === 'DONE') done.push({ icon: '🗺️', label: t('visit') + ' ' + v.branch + ' — ' + Store.memberName(m), sub: v.date });
          else if (v.status === 'NOT_DONE') missing.push({ icon: '🗺️', label: t('visit') + ' ' + v.branch + ' — ' + Store.memberName(m), sub: t('reason_visit') });
        });
        Store.state.videos.filter(v => v.date === date && v.memberId === m.id && v.videoIn).forEach(v => {
          if (v.videoOut) done.push({ icon: '🎥', label: v.branch + ' — ' + Store.memberName(m), sub: t('videoVisit') });
          else missing.push({ icon: '🎥', label: v.branch + ' — ' + Store.memberName(m), sub: t('reason_video') });
        });
      });
      const redAlerts = Engine.alerts(date).filter(a => a.severity === 'RED');
      redAlerts.forEach(a => critical.push({ icon: '🚨', label: t('reason_' + a.reason), sub: Store.memberName(Store.findMember(a.memberId)) + (a.branch ? ' · ' + a.branch : '') }));
      members.forEach(m => Engine.openIssues(m.id).filter(i => i.severity === 'CRITICAL').forEach(i => critical.push({ icon: '⚠️', label: i.title, sub: Store.memberName(m) + (i.branch ? ' · ' + i.branch : '') })));
      return { done, missing, critical };
    }

    const dailyTab = (() => {
      if (noOps) return emptyStateHtml('No operational data yet.', 'Daily activity will appear once reports, visits and videos are entered.');
      const L = todayLists();
      const box = (title, cls, items, emoji) =>
        '<div class="card"><div class="card-title">' + emoji + ' ' + esc(title) + ' <span class="badge ' + cls + '">' + items.length + '</span></div>' +
        '<div style="display:flex;flex-direction:column;gap:6px">' +
        (items.length ? items.map(i =>
          '<div style="display:flex;align-items:center;gap:8px;background:var(--surface-2);border-radius:9px;padding:7px 10px"><span>' + i.icon + '</span><div style="flex:1"><div style="font-weight:700;font-size:12.5px">' + esc(i.label) + '</div></div><span class="badge gray">' + esc(i.sub || '') + '</span></div>').join('')
          : '<div class="empty">' + esc(t('noData')) + '</div>') +
        '</div></div>';
      return '<div class="grid cols-3">' +
        box(t('todayCompleted'), 'green', L.done, '✅') +
        box(t('todayMissing'), 'amber', L.missing, '⏳') +
        box(t('todayCritical'), 'red', L.critical, '🚨') +
      '</div>';
    })();

    const weeklyTab = (() => {
      if (noOps) return emptyStateHtml('No operational data yet.', 'Weekly comparison will appear once real data is entered.');
      const wa = Engine.weekAnalysis();
      const cols = {
        dailyPct: t('dailyPct'), mmPct: t('mmPct'), visitPct: t('visitPct'), videoPct: t('videoPct'), weeklyPct: t('weeklyPct')
      };
      const row = k => '<tr><td class="rowhead">' + esc(cols[k]) + '</td>' + wa.map(w =>
        '<td class="num"><span class="badge ' + (w[k] >= 80 ? 'green' : w[k] >= 60 ? 'amber' : 'red') + '">' + w[k] + '%</span></td>').join('') + '</tr>';
      return '<div class="card"><div class="card-title">' + esc(t('weekCompare')) + '</div><div class="chart-box"><canvas id="chWeek"></canvas></div>' +
        '<div class="table-wrap" style="margin-top:12px"><table class="tbl cmp-table"><thead><tr><th>' + esc(t('kpi')) + '</th>' + wa.map(w => '<th>' + esc(Store.memberName(w.member)) + '</th>').join('') + '</tr></thead><tbody>' +
        row('dailyPct') + row('mmPct') + row('visitPct') + row('videoPct') + row('weeklyPct') + '<tr><td class="rowhead">' + esc(t('totalScore')) + '</td>' + wa.map(w => '<td class="num"><b>' + w.total + '</b></td>').join('') + '</tr>' +
        '</tbody></table></div></div>';
    })();

    const monthly = (() => {
      if (noOps) return emptyStateHtml('No operational data yet.', 'Monthly calendar and compliance will appear once real data is entered.');
      const y = monthCursor.y, m = monthCursor.m;
      const cells = Engine.monthCalendar(y, m);
      const stats = Engine.monthStats(y, m);
      const wd = (LANG === 'ar' ? I18N.ar : I18N.en).weekdays;
      const gridHead = wd.map(w => '<div class="cal-head">' + (w[0] + (LANG === 'ar' ? '' : '')) + '</div>').join('');
      const grid = cells.map(c => c.blank
        ? '<div class="cal-day blank"></div>'
        : '<div class="cal-day ' + c.cls + (c.todays ? ' today' : '') + '" data-date="' + c.date + '"><span class="d-num">' + c.day + '</span>' + (c.score !== null ? c.score + '%' : '') + '</div>'
      ).join('');
      const monthName = I18N[LANG].months[m];
      return '<div class="card"><div class="card-title"><button class="btn gray sm" id="calPrev">‹</button>&nbsp;' + esc(monthName + ' ' + y) + '&nbsp;<button class="btn gray sm" id="calNext">›</button>' +
        '<span class="spacer" style="flex:1"></span>' +
        '<span class="badge green">' + esc(t('day_good')) + '</span> <span class="badge amber">' + esc(t('day_alert')) + '</span> <span class="badge red">' + esc(t('day_critical')) + '</span>' +
      '</div>' +
        '<div class="cal-wrap"><div class="cal-grid">' + gridHead + grid + '</div></div>' +
        '<div id="dayDetail"></div>' +
        '<div style="margin-top:14px" class="grid cols-4">' +
          kpi(t('totalCompliance'), stats.avgComp + '%', monthName, stats.avgComp >= 80 ? 'green-k' : stats.avgComp >= 60 ? 'amber-k' : 'red-k') +
          kpi(t('missedTasks'), stats.missed, monthName, 'red-k') +
          kpi(t('problematicBranches'), stats.problematic.length, '', 'amber-k') +
          kpi(t('repeatedIssues'), stats.repeated.length, '', 'red-k') +
        '</div>' +
        '<div class="grid ' + (window.innerWidth < 1100 ? '' : 'cols-2') + '" style="margin-top:14px">' +
          '<div class="card"><div class="card-title">' + esc(t('problematicBranches')) + '</div>' +
            (stats.problematic.length ? stats.problematic.map(p => '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)"><b>' + esc(p.branch) + '</b><span class="badge red">' + p.n + ' ' + esc(t('times')) + '</span></div>').join('') : '<div class="empty">' + esc(t('noData')) + '</div>') +
          '</div>' +
          '<div class="card"><div class="card-title">' + esc(t('repeatedIssues')) + '</div>' +
            (stats.repeated.length ? stats.repeated.map(p => '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)"><b>' + esc(p.branch) + '</b><span class="badge red">' + p.n + ' ' + esc(t('openIssues')) + '</span></div>').join('') : '<div class="empty">' + esc(t('noData')) + '</div>') +
          '</div>' +
        '</div>' +
      '</div>';
    })();

    const html =
    '<div class="page">' +
      '<div class="page-head">' +
        '<div class="page-title"><h1>📊 ' + esc(t('analysisTitle')) + '</h1></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn gray" id="btnExportAlerts">⬇ ' + esc(t('exportCsv')) + '</button>' +
      '</div>' +
      '<div class="tabs">' +
        '<button class="tab-btn' + (active === 'daily' ? ' active' : '') + '" data-tab="daily">' + esc(t('tabDaily')) + '</button>' +
        '<button class="tab-btn' + (active === 'weekly' ? ' active' : '') + '" data-tab="weekly">' + esc(t('tabWeekly')) + '</button>' +
        '<button class="tab-btn' + (active === 'monthly' ? ' active' : '') + '" data-tab="monthly">' + esc(t('tabMonthly')) + '</button>' +
      '</div>' +
      '<div id="tabContent">' + (active === 'daily' ? dailyTab : active === 'weekly' ? weeklyTab : monthly) + '</div>' +
    '</div>';

    return {
      html,
      init(el) {
        if (!monthCursor.y) { monthCursor.y = new Date().getFullYear(); monthCursor.m = new Date().getMonth(); }
        el.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => {
          location.hash = '#/analysis/' + b.dataset.tab;
          router();
        }));
        el.querySelector('#btnExportAlerts').addEventListener('click', () => Exporter.downloadCSV('alerts', 'vm_alerts_' + todayISO() + '.csv'));
        if (active === 'weekly') {
          const wa = Engine.weekAnalysis();
          ChartKit.bar('chWeek', wa.map(w => Store.memberName(w.member)), [
            { label: t('dailyPct'), data: wa.map(w => w.dailyPct), backgroundColor: '#2563eb' },
            { label: t('mmPct'), data: wa.map(w => w.mmPct), backgroundColor: '#16a34a' },
            { label: t('visitPct'), data: wa.map(w => w.visitPct), backgroundColor: '#d97706' },
            { label: t('videoPct'), data: wa.map(w => w.videoPct), backgroundColor: '#7c3aed' },
            { label: t('weeklyPct'), data: wa.map(w => w.weeklyPct), backgroundColor: '#0ea5e9' }
          ], { max: 100 });
        }
        if (active === 'monthly') {
          const calPrev = el.querySelector('#calPrev');
          if (calPrev) calPrev.addEventListener('click', () => {
            monthCursor.m--; if (monthCursor.m < 0) { monthCursor.m = 11; monthCursor.y--; }
            router();
          });
          const calNext = el.querySelector('#calNext');
          if (calNext) calNext.addEventListener('click', () => {
            monthCursor.m++; if (monthCursor.m > 11) { monthCursor.m = 0; monthCursor.y++; }
            router();
          });
          el.querySelectorAll('.cal-day[data-date]').forEach(d => d.addEventListener('click', () => {
            const iso = d.dataset.date;
            const scores = Store.state.members.map(m => ({ m, s: Engine.memberScore(m.id, iso).total }));
            const st = Engine.statusForScore(Math.round(scores.reduce((a, b) => a + b.s, 0) / scores.length));
            const al = Engine.alerts(iso);
            el.querySelector('#dayDetail').innerHTML =
              '<div class="card" style="margin-top:14px;border:2px solid var(--primary)">' +
              '<div class="card-title">📅 ' + esc(fmtDateLong(iso)) + ' — <span class="badge ' + st.cls + '">' + esc(t(st.key)) + '</span>' +
              '<span class="spacer" style="flex:1"></span><button class="btn gray sm" id="closeDay">✕</button></div>' +
              '<div class="grid ' + (window.innerWidth < 1100 ? '' : 'cols-4') + '">' +
              scores.map(x => '<div class="mini-stat"><span class="ms-label">' + esc(Store.memberName(x.m)) + '</span><span class="ms-val" style="color:' + (x.s >= 80 ? 'var(--green)' : x.s >= 60 ? 'var(--amber)' : 'var(--red)') + '">' + x.s + '</span></div>').join('') +
              '</div>' +
              (al.length ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">' + al.slice(0, 4).map(a =>
                '<div class="alert-item ' + (a.severity === 'RED' ? 'red' : 'amber') + '"><span class="badge ' + (a.severity === 'RED' ? 'red' : 'amber') + '">' + esc(t('severity_' + a.severity)) + '</span><div class="a-body"><span class="a-title">' + esc(t('reason_' + a.reason)) + '</span><span class="a-meta">' + esc(Store.memberName(Store.findMember(a.memberId))) + (a.branch ? ' · ' + esc(a.branch) : '') + '</span></div></div>').join('') + '</div>' : '') +
              '</div>';
            const cd = el.querySelector('#closeDay');
            if (cd) cd.addEventListener('click', () => { el.querySelector('#dayDetail').innerHTML = ''; });
          }));
        }
      }
    };
  };
})();