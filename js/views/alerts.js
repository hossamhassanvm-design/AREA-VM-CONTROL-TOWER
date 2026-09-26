/* ============================================================
   AREA VM CONTROL TOWER V1 — Alerts Center + Issue tracking
   ============================================================ */

(function () {
  Views.alerts = function (query) {
    const date = todayISO();
    const alerts = Engine.alerts(date);
    const handledN = Store.state.handledAlerts.length;
    const redN = alerts.filter(a => a.severity === 'RED').length;
    const amberN = alerts.filter(a => a.severity === 'AMBER').length;
    const issues = Store.state.issues.slice().sort((a, b) => b.date.localeCompare(a.date));

    function alertHTML(a) {
      const member = Store.findMember(a.memberId);
      return '<div class="alert-item ' + (a.severity === 'RED' ? 'red' : 'amber') + '">' +
        '<span style="font-size:18px">' + (a.severity === 'RED' ? '🔴' : '🟠') + '</span>' +
        '<div class="a-body">' +
          '<div class="a-title">' + esc(t('reason_' + a.reason)) + (a.issueCount ? ' (' + a.issueCount + ')' : '') + '</div>' +
          '<div class="a-meta">' +
            '<span class="badge ' + (a.severity === 'RED' ? 'red' : 'amber') + '">' + esc(t('severity_' + a.severity)) + '</span>' +
            '<span>👤 ' + esc(Store.memberName(member)) + '</span>' +
            (a.branch ? '<span>🏬 ' + esc(a.branch) + '</span>' : '') +
            '<span>📅 ' + esc(fmtDate(a.date)) + '</span>' +
          '</div>' +
          '<div class="a-action">' + esc(t('requiredAction')) + ': <b>' + esc(t('act_' + a.reason)) + '</b></div>' +
        '</div>' +
        '<button class="btn sm gray" data-handle="' + a.id + '">' + esc(t('markHandled')) + '</button>' +
      '</div>';
    }

    const issueRows = (list) => list.map(i =>
      '<tr>' +
        '<td>' + fmtDate(i.date) + '</td>' +
        '<td>' + esc(Store.memberName(Store.findMember(i.memberId))) + '</td>' +
        '<td>' + (i.branch ? esc(i.branch) : '—') + '</td>' +
        '<td>' + esc(i.title) + '</td>' +
        '<td>' + sevBadge(i.severity === 'CRITICAL' ? 'RED' : i.severity === 'MAJOR' ? 'AMBER' : 'AMBER') + '</td>' +
        '<td>' + statusBadge(i.status) + '</td>' +
        '<td>' + (i.dueDate ? fmtDate(i.dueDate) : '—') + '</td>' +
        '<td style="display:flex;gap:4px">' +
          (i.status !== 'RESOLVED' ? '<button class="btn sm green" data-resolve="' + i.id + '">' + esc(t('markResolved')) + '</button>' : '') +
          '<button class="icon-btn" data-del="issues|' + i.id + '" title="' + esc(t('delete')) + '">🗑️</button>' +
        '</td>' +
      '</tr>').join('');

    const html =
    '<div class="page">' +
      '<div class="page-head">' +
        '<div class="page-title"><h1>🚨 ' + esc(t('alertsCenter')) + '</h1><p>' + esc(t('renderByData')) + '</p></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn red" id="btnNewIssue">+ ' + esc(t('addIssue')) + '</button>' +
        '<button class="btn gray" id="btnExportIssues">⬇ ' + esc(t('exportCsv')) + '</button>' +
        (handledN ? '<button class="btn gray sm" id="btnRestoreHandled" title="' + esc(t('unmark')) + '">↺ ' + handledN + '</button>' : '') +
      '</div>' +
      '<div class="grid cols-3">' +
        kpi(t('kpi_openAlerts'), alerts.length, date, alerts.length ? 'amber-k' : 'green-k') +
        kpi(t('severity_RED'), redN, t('severity_RED'), redN ? 'red-k' : 'green-k') +
        kpi(t('severity_AMBER'), amberN, t('severity_AMBER'), amberN ? 'amber-k' : 'green-k') +
      '</div>' +
      '<div class="grid ' + (window.innerWidth < 1100 ? '' : 'cols-2-lg') + '">' +
        '<div style="display:flex;flex-direction:column;gap:10px" id="alertList">' +
          (alerts.length ? alerts.map(alertHTML).join('') : Store.hasOperationalData() ? '<div class="card empty">✨ ' + esc(t('renderByData')) + '</div>' : emptyStateHtml('No operational data yet.', 'Alerts will appear once real data is entered.')) +
        '</div>' +
        '<div class="card" style="align-self:start">' +
          '<div class="card-title">' + esc(t('openIssues')) + ' (' + issues.filter(i => i.status !== 'RESOLVED').length + ')</div>' +
          '<div class="table-wrap"><table class="tbl">' +
            '<thead><tr><th>' + esc(t('date')) + '</th><th>' + esc(t('areaVM')) + '</th><th>' + esc(t('branch')) + '</th><th>' + esc(t('issue')) + '</th><th>' + esc(t('severity')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('dueDate')) + '</th><th></th></tr></thead>' +
            '<tbody>' + (issues.length ? issueRows(issues) : '<tr><td colspan="8" class="empty">' + esc(t('noData')) + '</td></tr>') + '</tbody>' +
          '</table></div>' +
        '</div>' +
      '</div>' +
      '<div class="form-panel" id="panelIssue">' +
        '<div class="form-row cols-3">' +
          '<div class="field"><label>' + esc(t('date')) + '</label><input type="date" id="fIssueDate"></div>' +
          '<div class="field"><label>' + esc(t('areaVM')) + '</label><select id="fIssueMember"><option value="">' + esc(t('selectMember')) + '</option>' + Store.state.members.map(m => '<option value="' + m.id + '">' + esc(Store.memberName(m)) + '</option>').join('') + '</select></div>' +
          '<div class="field"><label>' + esc(t('branch')) + '</label><input type="text" id="fIssueBranch" placeholder="ALX3"></div>' +
          '<div class="field"><label>' + esc(t('issueTitle')) + '</label><input type="text" id="fIssueTitle"></div>' +
          '<div class="field"><label>' + esc(t('severity')) + '</label><select id="fIssueSev"><option value="MINOR">' + esc(t('st_MINOR')) + '</option><option value="MAJOR">' + esc(t('st_MAJOR')) + '</option><option value="CRITICAL">' + esc(t('st_CRITICAL')) + '</option></select></div>' +
          '<div class="field"><label>' + esc(t('dueDate')) + '</label><input type="date" id="fIssueDue"></div>' +
        '</div>' +
        '<div class="form-actions"><button class="btn green" id="fIssueSave">' + esc(t('save')) + '</button><button class="btn gray" data-close>' + esc(t('cancel')) + '</button></div>' +
      '</div>' +
    '</div>';

    return {
      html,
      init(el) {
        const panel = el.querySelector('#panelIssue');
        el.querySelector('#btnNewIssue').addEventListener('click', () => {
          panel.classList.toggle('open');
        });
        el.querySelector('[data-close]').addEventListener('click', () => panel.classList.remove('open'));

        if (query && query.new === 'issue') panel.classList.add('open');

        el.querySelector('#fIssueSave').addEventListener('click', () => {
          const m = el.querySelector('#fIssueMember').value;
          const title = el.querySelector('#fIssueTitle').value.trim();
          if (!m || !title) { toast(t('issueTitle') + '!'); return; }
          Store.addIssue({
            date: el.querySelector('#fIssueDate').value || todayISO(),
            memberId: m, branch: el.querySelector('#fIssueBranch').value.trim() || '',
            title, severity: el.querySelector('#fIssueSev').value,
            status: 'OPEN', dueDate: el.querySelector('#fIssueDue').value || null
          });
          toast(t('savedPrefs'));
          router();
        });

        el.addEventListener('click', (e) => {
          const h = e.target.closest('[data-handle]');
          if (h) {
            Store.state.handledAlerts.push(h.dataset.handle);
            Store.save();
            toast(t('markHandled'));
            router();
            return;
          }
          const rs = e.target.closest('[data-resolve]');
          if (rs) { Store.updateIssue(rs.dataset.resolve, { status: 'RESOLVED' }); toast(t('markResolved')); router(); return; }
          const dl = e.target.closest('[data-del]');
          if (dl) { const [k, id] = dl.dataset.del.split('|'); Store.deleteRec(k, id); router(); }
        });
        const rb = el.querySelector('#btnRestoreHandled');
        if (rb) rb.addEventListener('click', () => { Store.state.handledAlerts = []; Store.save(); toast(t('restoreBtn')); router(); });
        el.querySelector('#btnExportIssues').addEventListener('click', () => Exporter.downloadCSV('issues', 'vm_issues_' + todayISO() + '.csv'));
      }
    };
  };
})();