/* ============================================================
   AREA VM CONTROL TOWER V1 — Dashboard view
   ============================================================ */

window.VMCards = window.VMCards || {};

(function () {
  Views.dashboard = function () {
    const date = todayISO();
    const k = Engine.kpis(date);
    const members = Store.state.members;

    function miniStat(label, val, cls) {
      return '<div class="mini-stat"><span class="ms-label">' + label + '</span><span class="ms-val ' + (cls || '') + '">' + val + '</span></div>';
    }

    function memberCard(m) {
      const sc = Engine.memberScore(m.id, date);
      const st = Engine.statusForScore(sc.total);
      const daily = Store.state.dailyReports.find(r => r.date === date && r.memberId === m.id);
      const visits = Store.state.visits.filter(v => v.date === date && v.memberId === m.id && (v.status === 'DONE' || v.status === 'NOT_DONE'));
      const vids = Store.state.videos.filter(v => v.date === date && v.memberId === m.id && v.videoIn);
      const wk = Engine.currentWeekly(m.id);
      const wkDone = wk ? ['outfit', 'window', 'meeting'].filter(x => wk[x] === 'DONE').length : 0;
      const issues = Engine.openIssues(m.id).length;
      const mmPct = Math.round(Engine.mmMemberScore(m.id));
      const initials = (m.name.en || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const colors = ['#2563eb', '#7c3aed', '#059669', '#ea580c'];
      const ci = Store.state.members.indexOf(m) % colors.length;

      return '<div class="card clickable" data-goto="#/member/' + m.id + '">' +
        '<div class="member-card-head">' +
          '<div class="avatar" style="background:linear-gradient(135deg,' + colors[ci] + ',' + colors[(ci + 1) % colors.length] + ')">' + esc(initials) + '</div>' +
          '<div><div class="mc-name">' + esc(Store.memberName(m)) + '</div><div class="mc-sub">' + (m.branches || []).length + ' ' + t('branches') + '</div></div>' +
          '<div class="mc-score"><div class="big">' + sc.total + '<small style="font-size:13px;color:var(--muted)">' + t('of100') + '</small></div><span class="badge ' + st.cls + '">' + esc(t(st.key)) + '</span></div>' +
        '</div>' +
        '<div class="members-mini">' +
          miniStat(t('dailyReport'), daily ? statusBadge(daily.status) : '<span class="badge red">—</span>', 'dailyRow') +
          miniStat(t('moneyMap'), mmPct + '%', mmPct >= 80 ? 'green-t' : mmPct >= 60 ? 'amber-t' : 'red-t', ) +
          miniStat(t('visitPlan'), visits.length ? Math.round(visits.filter(v => v.status === 'DONE').length / visits.length * 100) + '%' : '100%') +
          miniStat(t('videoVisit'), vids.length ? Math.round(vids.filter(v => v.videoOut).length / vids.length * 100) + '%' : '100%') +
          miniStat(t('weeklyTasks'), wkDone + '/3') +
          miniStat(t('openIssues'), issues, issues ? 'red-t' : 'green-t') +
        '</div>' +
      '</div>';
    }

    /* 14-day compliance line */
    const days = [];
    const comp = [];
    for (let i = 13; i >= 0; i--) {
      const dd = addDays(date, -i);
      days.push(fmtDate(dd));
      const scores = members.map(m => Engine.memberScore(m.id, dd).total);
      comp.push(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
    }

    const alerts = k.alerts;
    const redN = alerts.filter(a => a.severity === 'RED').length;
    const amberN = alerts.filter(a => a.severity === 'AMBER').length;

    const html = '' +
    '<div class="page">' +
      '<div class="page-head"><div class="page-title"><h1>' + esc(t('nav_dash')) + '</h1><p>' + fmtDateLong(date) + '</p></div></div>' +

      '<div class="grid cols-4">' +
        kpi(t('kpi_teamComp'), k.teamComp + '%', t('areaVMs') + ': ' + members.length, k.teamComp >= 80 ? 'green-k' : k.teamComp >= 60 ? 'amber-k' : 'red-k') +
        kpi(t('kpi_dailyDone'), k.tasksDone + ' / ' + k.tasksTotal, t('total') + ' ' + fmtDateLong(date), 'blue-k') +
        kpi(t('kpi_openAlerts'), k.openAlerts, redN + ' ' + t('severity_RED') + ' · ' + amberN + ' ' + t('severity_AMBER'), k.openAlerts ? 'amber-k' : 'green-k') +
        kpi(t('kpi_critical'), k.criticalRed, t('renderByData'), k.criticalRed ? 'red-k' : 'green-k') +
        kpi(t('kpi_visitComp'), k.visitComp + '%', t('compliancePct'), k.visitComp >= 80 ? 'green-k' : k.visitComp >= 60 ? 'amber-k' : 'red-k') +
        kpi(t('kpi_videoComp'), k.videoComp + '%', t('compliancePct'), k.videoComp >= 80 ? 'green-k' : k.videoComp >= 60 ? 'amber-k' : 'red-k') +
        kpi(t('kpi_mmStatus'), k.mmPct + '%', t('branches') + ' ' + Store.state.moneyMaps.length, k.mmPct >= 80 ? 'green-k' : k.mmPct >= 60 ? 'amber-k' : 'red-k') +
      '</div>' +

      '<div class="card"><div class="card-title">' + esc(t('areaVMs')) + '</div><div class="grid ' + (members.length === 4 ? 'cols-4' : 'cols-2') + '">' + members.map(memberCard).join('') + '</div></div>' +

      '<div class="grid ' + (window.innerWidth < 1100 ? '' : 'cols-2-lg') + '">' +
        '<div class="grid" style="gap:14px">' +
          '<div class="card"><div class="card-title">' + esc(t('score')) + ' — ' + esc(t('areaVMs')) + '</div><div class="chart-box"><canvas id="chScores"></canvas></div></div>' +
          '<div class="card"><div class="card-title">' + esc(t('kpi_teamComp')) + ' — 14 ' + esc(t('dt_day')) + '</div><div class="chart-box"><canvas id="chTrend"></canvas></div></div>' +
        '</div>' +
        '<div class="card"><div class="card-title">' + esc(t('alertsCenter')) + '</div><div class="chart-box"><canvas id="chAlerts"></canvas></div>' +
          '<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">' +
            '<a class="btn gray sm" href="#/alerts">' + esc(t('nav_alerts')) + ' (' + k.openAlerts + ')</a>' +
          '</div></div>' +
      '</div>' +
    '</div>';

    VMCards.memberCard = memberCard;

    return {
      html,
      init(el) {
        const names = members.map(m => Store.memberName(m));
        const scores = members.map(m => Engine.memberScore(m.id, date).total);
        ChartKit.bar('chScores', names, [{
          label: t('score'), data: scores,
          backgroundColor: scores.map(s => s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626'),
          borderRadius: 8
        }], { max: 100 });
        ChartKit.line('chTrend', days, [{
          label: t('teamComp'), data: comp, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.12)', fill: true
        }]);
        ChartKit.doughnut('chAlerts', [t('severity_RED'), t('severity_AMBER')], [redN, amberN], ['#dc2626', '#d97706']);
        el.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', e => {
          location.hash = a.dataset.goto;
        }));
      }
    };
  };

  function kpi(label, value, sub, cls) {
    const vCls = /[<>]/.test(String(value)) ? '' : 'k-value';
    return '<div class="kpi ' + (cls || '') + '"><span class="k-label">' + label + '</span><span class="' + vCls + '">' + value + '</span><span class="k-sub">' + (sub || '') + '</span></div>';
  }
  window.kpi = kpi;

  /* 14-day line helper for re-use in analysis */
  window.teamTrend = function () {
    const members = Store.state.members;
    const days = [], comp = [];
    for (let i = 13; i >= 0; i--) {
      const dd = addDays(todayISO(), -i);
      days.push(fmtDate(dd));
      const scores = members.map(m => Engine.memberScore(m.id, dd).total);
      comp.push(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
    }
    return { days, comp };
  };
})();