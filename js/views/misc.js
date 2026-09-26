/* ============================================================
   AREA VM CONTROL TOWER V1 — Settings, Mobile dashboard, misc views
   ============================================================ */

(function () {
  function cardForMobile(m) {
    const date = todayISO();
    const sc = Engine.memberScore(m.id, date);
    const st = Engine.statusForScore(sc.total);
    const colors = ['#2563eb', '#7c3aed', '#059669', '#ea580c'];
    const ci = Store.state.members.indexOf(m) % colors.length;
    const initials = (m.name.en || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const mmPct = Math.round(Engine.mmMemberScore(m.id));
    const issues = Engine.openIssues(m.id).length;
    return '<div class="card clickable" data-goto="#/member/' + m.id + '">' +
        '<div class="member-card-head">' +
          '<div class="avatar" style="background:linear-gradient(135deg,' + colors[ci] + ',' + colors[(ci + 1) % colors.length] + ')">' + esc(initials) + '</div>' +
          '<div><div class="mc-name">' + esc(Store.memberName(m)) + '</div><div class="mc-sub">' + (m.branches || []).length + ' ' + t('branches') + '</div></div>' +
          '<div class="mc-score"><div class="big">' + sc.total + '</div><span class="badge ' + st.cls + '">' + esc(t(st.key)) + '</span></div>' +
        '</div>' +
        '<div class="members-mini">' +
          '<div class="mini-stat"><span class="ms-label">' + esc(t('moneyMap')) + '</span><span class="ms-val">' + mmPct + '%</span></div>' +
          '<div class="mini-stat"><span class="ms-label">' + esc(t('openIssues')) + '</span><span class="ms-val ' + (issues ? 'red-t' : 'green-t') + '">' + issues + '</span></div>' +
        '</div>' +
      '</div>';
  }

  /* ---------- Settings ---------- */
  Views.settings = function () {
    const isAdmin = (window.DataService && DataService.role === 'ADMIN');
    const adminBranchCard = isAdmin ?
      '<div class="card"><div class="card-title">🏬 ' + esc(t('branchAssignment')) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:18px" id="branchEditors">' +
          Store.state.members.map(m => {
            const chips = (m.branches || []).map(b => '<span class="badge blue" style="font-size:12px;padding:5px 10px">' + esc(b) + ' <button class="icon-btn" data-rmbranch="' + m.id + '|' + esc(b) + '" style="font-size:11px">✕</button></span>').join('');
            return '<div class="field"><label>' + esc(Store.memberName(m)) + ' (' + (m.branches || []).length + ' ' + t('branches') + ')</label>' +
              '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' + (chips || '<span class="badge gray">—</span>') + '</div>' +
              '<div style="display:flex;gap:8px"><input type="text" id="addBranch_' + m.id + '" placeholder="' + esc(t('addBranch')) + ' e.g. ALX4" style="flex:1"><button class="btn sm" data-addbranch="' + m.id + '">' + esc(t('addBranchBtn')) + '</button></div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>' : '';

    const adminIntegrationCard = isAdmin ?
      '<div class="card"><div class="card-title">💾 ' + esc(t('integrations')) + '</div>' +
        '<p style="font-size:12px;color:var(--muted);margin-bottom:10px">' + esc(t('integrationHint')) + '</p>' +
        '<div class="form-row">' +
          '<div class="field"><label>Google Sheets</label><input type="text" id="pfGs" value="' + esc(Store.state.prefs.gsKey) + '" placeholder="' + esc(t('gsKey')) + '"></div>' +
          '<div class="field"><label>Gmail</label><input type="text" id="pfGmail" value="' + esc(Store.state.prefs.gmailKey) + '" placeholder="' + esc(t('gmailKey')) + '"></div>' +
          '<div class="field"><label>Database</label><input type="text" id="pfDb" value="' + esc(Store.state.prefs.dbConn) + '" placeholder="' + esc(t('dbConn')) + '"></div>' +
        '</div>' +
        '<div class="form-actions"><button class="btn" id="savePrefs">' + esc(t('save')) + '</button></div>' +
      '</div>' : '';

    const adminResetCard = isAdmin ?
      '<div class="card"><div class="card-title">♻️ ' + esc(LANG === 'ar' ? 'إعادة تعيين للوضع الإنتاجي' : 'Reset to Production Baseline') + '</div>' +
        '<p style="font-size:12px;color:var(--muted);margin-bottom:10px">' + esc(LANG === 'ar' ? 'سيتم مسح كل البيانات التشغيلية مع الإبقاء على الـ 4 Area VM وشجرة الفروع الكاملة. متابعة؟' : 'Removes all operational data and keeps the 4 Area VMs + the complete Branch Master. Continue?') + '</p>' +
        '<button class="btn red" id="btnReset">↺ ' + esc(LANG === 'ar' ? 'إعادة تعيين البيانات التشغيلية' : 'Reset Operational Data') + '</button>' +
      '</div>' : '';

    const html =
    '<div class="page">' +
      '<div class="page-head"><div class="page-title"><h1>⚙️ ' + esc(t('settingsTitle')) + '</h1></div></div>' +
      '<div class="grid ' + (window.innerWidth < 1100 ? '' : 'cols-2-lg') + '">' +
        '<div style="display:flex;flex-direction:column;gap:14px">' +
          '<div class="card"><div class="card-title">🔐 Account / الحساب</div>' +
            '<p style="font-size:12px;color:var(--muted);margin-bottom:10px">' +
              esc((DataService && DataService.user && DataService.user.email) ? DataService.user.email : '—') +
              ' · ' + esc((DataService && DataService.role) ? DataService.role : '—') +
            '</p>' +
            '<div class="form-row">' +
              '<div class="field"><label>New password / كلمة المرور الجديدة</label><input type="password" id="newPassword" autocomplete="new-password" minlength="6" placeholder="At least 6 characters"></div>' +
              '<div class="field"><label>Confirm password / تأكيد كلمة المرور</label><input type="password" id="confirmPassword" autocomplete="new-password" minlength="6" placeholder="Repeat password"></div>' +
            '</div>' +
            '<div class="form-actions"><button class="btn" id="changePasswordBtn">Change Password / تغيير كلمة المرور</button></div>' +
            '<div id="passwordMsg" style="font-size:12px;min-height:18px;margin-top:8px"></div>' +
          '</div>' +
          '<div class="card"><div class="card-title">🌐 ' + esc(t('langCode')) + '</div>' +
            '<div class="tabs">' +
              '<button class="tab-btn' + (LANG === 'en' ? ' active' : '') + '" id="setLangEn">English / LTR</button>' +
              '<button class="tab-btn' + (LANG === 'ar' ? ' active' : '') + '" id="setLangAr">العربية / RTL</button>' +
            '</div>' +
          '</div>' +
          adminBranchCard +
          adminIntegrationCard +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:14px">' +
          '<div class="card"><div class="card-title">📤 ' + esc(t('exportCsv')) + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px">' +
              '<button class="btn gray" id="expDaily">📋 ' + esc(t('nav_daily')) + '</button>' +
              '<button class="btn gray" id="expMM">💵 ' + esc(t('nav_mm')) + '</button>' +
              '<button class="btn gray" id="expVisits">🗺️ ' + esc(t('nav_visits')) + '</button>' +
              '<button class="btn gray" id="expVideos">🎥 ' + esc(t('nav_videos')) + '</button>' +
              '<button class="btn gray" id="expWeekly">📅 ' + esc(t('nav_weekly')) + '</button>' +
              '<button class="btn gray" id="expIssues">⚠️ ' + esc(t('openIssues')) + '</button>' +
              '<button class="btn gray" id="expAlerts">🚨 ' + esc(t('nav_alerts')) + '</button>' +
              '<button class="btn green" id="expAll">⬇ ' + esc(t('exportCsv')) + ' — ALL</button>' +
              '<button class="btn" id="expPdf">🖨️ ' + esc(t('exportPdf')) + '</button>' +
            '</div>' +
          '</div>' +
          adminResetCard +
          '<div class="card"><div class="card-title">ℹ️ Version</div>' +
            '<p style="font-size:13px;color:var(--muted)">AREA VM CONTROL TOWER <b>V3</b> — Build 2026-09-24 — 4 Area VM · 33 branches · LocalStorage · Chart.js</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    return {
      html,
      init(el) {
        const changeBtn = el.querySelector('#changePasswordBtn');
        if (changeBtn) changeBtn.addEventListener('click', async () => {
          const np = el.querySelector('#newPassword').value;
          const cp = el.querySelector('#confirmPassword').value;
          const msg = el.querySelector('#passwordMsg');
          msg.textContent = '';
          msg.style.color = '';
          if (!np || np.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; msg.style.color = '#c0392b'; return; }
          if (np !== cp) { msg.textContent = 'Passwords do not match.'; msg.style.color = '#c0392b'; return; }
          changeBtn.disabled = true;
          const out = await Auth.changePassword(np);
          changeBtn.disabled = false;
          if (out.ok) {
            el.querySelector('#newPassword').value = '';
            el.querySelector('#confirmPassword').value = '';
            msg.textContent = 'Password changed successfully.';
            msg.style.color = '#16803a';
            toast('Password changed');
          } else {
            msg.textContent = out.error || 'Password change failed.';
            msg.style.color = '#c0392b';
          }
        });
        el.querySelector('#setLangEn').addEventListener('click', () => setLang('en'));
        el.querySelector('#setLangAr').addEventListener('click', () => setLang('ar'));
        const savePrefsBtn = el.querySelector('#savePrefs');
        if (savePrefsBtn) savePrefsBtn.addEventListener('click', () => {
          Store.savePrefs({
            gsKey: el.querySelector('#pfGs').value,
            gmailKey: el.querySelector('#pfGmail').value,
            dbConn: el.querySelector('#pfDb').value
          });
          toast(t('savedPrefs'));
        });
        el.addEventListener('click', (e) => {
          const add = e.target.closest('[data-addbranch]');
          if (add && isAdmin) {
            const id = add.dataset.addbranch;
            const inp = el.querySelector('#addBranch_' + id);
            const code = inp.value.trim().toUpperCase();
            if (!code) return;
            const m = Store.findMember(id);
            if ((m.branches || []).includes(code)) { toast('—'); return; }
            m.branches.push(code);
            Store.save();
            router();
            return;
          }
          const rm = e.target.closest('[data-rmbranch]');
          if (rm && isAdmin) {
            const [id, code] = rm.dataset.rmbranch.split('|');
            const m = Store.findMember(id);
            m.branches = (m.branches || []).filter(b => b !== code);
            Store.save();
            router();
          }
        });
        const resetBtn = el.querySelector('#btnReset');
        if (resetBtn) resetBtn.addEventListener('click', () => {
          if (confirm(LANG === 'ar' ? 'سيتم مسح كل البيانات التشغيلية مع الإبقاء على الـ 4 Area VM وشجرة الفروع الكاملة. متابعة؟' : 'This resets ALL operational data and keeps the 4 Area VMs + the complete Branch Master. Continue?')) { Store.reset(); router(); }
        });
        ['daily', 'MM', 'Visits', 'Videos', 'Weekly', 'Issues', 'Alerts'].forEach(k => {
          const b = el.querySelector('#exp' + k);
          if (b) b.addEventListener('click', () => {
            const map = { daily: 'daily', MM: 'moneyMap', Visits: 'visits', Videos: 'videos', Weekly: 'weekly', Issues: 'issues', Alerts: 'alerts' };
            Exporter.downloadCSV(map[k], 'vm_' + map[k] + '_' + todayISO() + '.csv');
          });
        });
        const expAllBtn = el.querySelector('#expAll');
        const expPdfBtn = el.querySelector('#expPdf');
        if (expAllBtn) expAllBtn.addEventListener('click', () => Exporter.exportAll());
        if (expPdfBtn) expPdfBtn.addEventListener('click', () => Exporter.printPDF());
      }
    };
  };

  /* ---------- Mobile dashboard ---------- */
  Views.mobile = function () {
    const date = todayISO();
    const noOps = !Store.hasOperationalData();
    const k = noOps ? { teamComp: null, openAlerts: 0, members: [] } : Engine.kpis(date);
    const teamStatus = noOps ? { key: 'nopdata', cls: 'gray' } : Engine.statusForScore(k.teamComp);
    const members = Store.state.members;
    const attention = noOps ? [] : members.map(m => ({ m, sc: Engine.memberScore(m.id, date) })).filter(x => x.sc.total < 80);

    const needRows = attention.length ? attention.map(x =>
      '<div class="alert-item ' + (x.sc.total < 60 ? 'red' : 'amber') + '">' +
        '<div style="font-size:18px">' + (x.sc.total < 60 ? '🔴' : '🟠') + '</div>' +
        '<div class="a-body"><div class="a-title">' + esc(Store.memberName(x.m)) + ' — ' + x.sc.total + t('of100') + '</div>' +
        '<div class="a-meta">' + x.sc.lost.map(l => esc(l.reason)).join(' · ') + '</div>' +
        '<a class="btn sm gray" href="#/member/' + x.m.id + '" style="align-self:flex-start">' + esc(t('viewDetails')) + '</a></div>' +
      '</div>').join('')
      : (noOps ? emptyStateHtml('No operational data yet,', 'Enter daily reports, visits, Money Map, tasks or attendance to start tracking.') : '<div class="card empty">✅ ' + esc(t('renderByData')) + '</div>');

    const html =
    '<div class="page">' +
      '<div class="mobile-top-card">' +
        '<div class="mt-row"><span class="score-lbl">' + esc(t('todaysScore')) + '</span><span class="badge ' + teamStatus.cls + '">' + esc(noOps ? 'N/A' : t(teamStatus.key)) + '</span></div>' +
        '<div class="score-num">' + (noOps ? 'N/A' : k.teamComp) + (noOps ? '' : '<small style="font-size:18px;color:#bfdbfe">%</small>') + '</div>' +
        (noOps ? '' : '<div style="height:8px;background:rgba(255,255,255,.15);border-radius:99px;overflow:hidden"><div style="height:100%;width:' + k.teamComp + '%;background:linear-gradient(90deg,#34d399,#22d3ee)"></div></div>') +
        '<div class="mt-row">' +
          '<a href="#/alerts" style="color:#fca5a5;font-weight:800;text-decoration:none">🚨 ' + k.openAlerts + ' ' + esc(t('nav_alerts')) + '</a>' +
          '<a href="#/analysis" style="color:#bfdbfe;font-weight:700;text-decoration:none;font-size:12px">' + esc(t('analysisTitle')) + ' →</a>' +
        '</div>' +
      '</div>' +

      '<div class="card"><div class="card-title">⚡ ' + esc(t('quickActions')) + '</div>' +
        '<div class="quick-actions">' +
          '<a class="qa-btn qa-daily" href="#/daily?new=1"><span class="qa-ico">📋</span>' + esc(t('addDaily')) + '</a>' +
          '<a class="qa-btn qa-visit" href="#/visits?new=1"><span class="qa-ico">🗺️</span>' + esc(t('addVisitQuick')) + '</a>' +
          '<a class="qa-btn qa-video" href="#/videos?new=1"><span class="qa-ico">🎥</span>' + esc(t('addVideoQuick')) + '</a>' +
          '<a class="qa-btn qa-issue" href="#/alerts?new=issue"><span class="qa-ico">⚠️</span>' + esc(t('addIssueQuick')) + '</a>' +
        '</div>' +
      '</div>' +

      '<div class="card"><div class="card-title">👥 Area VMs</div>' +
        '<div style="display:flex;flex-direction:column;gap:12px">' +
          members.map(cardForMobile).join('') +
        '</div>' +
      '</div>' +

      '<div style="display:flex;flex-direction:column;gap:10px"><div class="card-title" style="padding:0 4px">⚠️ ' + esc(t('needsAttention')) + '</div>' + needRows + '</div>' +
    '</div>';

    return { html, init(el) {
      el.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', () => { location.hash = a.dataset.goto; }));
    } };
  };

  /* ---------- 404 ---------- */
  Views.notFound = function () {
    const html = '<div class="page"><div class="card empty"><span class="emoji">🤔</span>404</div><a class="btn" href="#/dashboard">' + esc(t('nav_dash')) + '</a></div>';
    return { html, init() {} };
  };
})();