/* ============================================================
   AREA VM CONTROL TOWER V1 — Scoring / KPI / Alerts Engine
   Pure computation: reads Store.state, returns KPIs, scores & alerts.
   Daily Score weights: Daily Report 20% · Money Map 25% · Visit 20%
                         Video Visit 20% · Weekly/Follow-up 15%
   ============================================================ */

const Engine = {

  /* ---------- Money Map ---------- */
  mmBranch(code) { return Store.state.moneyMaps.find(m => m.branch === code); },
  mmBranchScore(code) {
    const mm = this.mmBranch(code);
    if (!mm) return { score: 0, days: Infinity, problems: [t('reason_mm')] };
    let days;
    if (!mm.lastUpdate) { days = Infinity; } else { days = diffDays(todayISO(), mm.lastUpdate); }
    const problems = [];
    if (days > 7) problems.push(t('mmNotUpdated'));
    if (days > 7) return { score: 0, days, problems };
    let s = 100;
    if (mm.codesNoLoc > 0) { s -= 45; problems.push(t('codesNoLoc') + ' ' + mm.codesNoLoc); }
    if (mm.emptyLoc > 0) { s -= 25; problems.push(t('emptyLoc') + ' ' + mm.emptyLoc); }
    if (mm.stockRoom > 0) { s -= 15; problems.push(t('stockRoom') + ' ' + mm.stockRoom); }
    if (mm.l0 > 0) { s -= 12; problems.push(t('l0') + ' ' + mm.l0); }
    if (mm.splitGroups > 0) { s -= 8; problems.push(t('splitGroups') + ' ' + mm.splitGroups); }
    return { score: Math.max(0, s), days, problems };
  },
  mmMemberScore(memberId) {
    const m = Store.findMember(memberId);
    if (!m || !m.branches.length) return 100;
    const scores = m.branches.map(b => this.mmBranchScore(b).score);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  },
  mmStatusPct() {
    const all = Store.state.moneyMaps;
    if (!all.length) return 0;
    const ok = all.filter(mm => {
      if (!mm.lastUpdate) return false;
      return diffDays(todayISO(), mm.lastUpdate) <= 7;
    }).length;
    return Math.round(ok / all.length * 100);
  },

  /* ---------- Daily report today ---------- */
  dailyToday(memberId) {
    return Store.state.dailyReports.find(r => r.date === todayISO() && r.memberId === memberId);
  },
  isExcused(st) { return st === 'OFF' || st === 'ANNUAL'; },
  isDoneDaily(st) { return st === 'DONE' || st === 'WORK_MISSION'; },

  /* ---------- Per-member daily score ---------- */
  memberScore(memberId, date) {
    const d = date || todayISO();
    const m = Store.findMember(memberId);
    const parts = [];

    /* Daily Report — 20 */
    const branchRows = (Store.state.dailyBranchReports || []).filter(r => r.date === d && r.memberId === memberId);
    const dr = Store.state.dailyReports.find(r => r.date === d && r.memberId === memberId);
    let dailyLost = null;
    let dailyStatus = dr ? dr.status : null;
    if (branchRows.length) {
      const active = branchRows.filter(r => !this.isExcused(r.status));
      const done = active.filter(r => this.isDoneDaily(r.status)).length;
      const pct = active.length ? Math.round(done / active.length * 100) : 100;
      if (pct >= 100) parts.push({ key:'daily', max:20, earned:20, label:t('dailyReport') });
      else { const earned=Math.round(20*pct/100); dailyLost={reason:t('reason_daily'),points:20-earned}; parts.push({key:'daily',max:20,earned,label:t('dailyReport'),lost:dailyLost}); }
    } else if (!dailyStatus) { dailyLost = { reason: t('reason_daily'), points: 20 }; parts.push({ key: 'daily', max: 20, earned: 0, label: t('dailyReport'), lost: dailyLost }); }
    else if (this.isExcused(dailyStatus)) { parts.push({ key: 'daily', max: 20, earned: 20, label: t('dailyReport'), note: statusTxt(dailyStatus) }); }
    else if (this.isDoneDaily(dailyStatus)) { parts.push({ key: 'daily', max: 20, earned: 20, label: t('dailyReport') }); }
    else { dailyLost = { reason: t('reason_daily'), points: 20 }; parts.push({ key: 'daily', max: 20, earned: 0, label: t('dailyReport'), lost: dailyLost }); }

    /* Money Map — 25 */
    const mmScore = this.mmMemberScore(memberId);
    const mmPoints = Math.round(25 * mmScore / 100);
    if (mmPoints < 25) {
      const mms = m.branches.map(b => this.mmBranchScore(b)).filter(x => x.problems.length);
      const reasons = [];
      mms.forEach(x => x.problems.forEach(p => { if (!reasons.includes(p)) reasons.push(p); }));
      parts.push({ key: 'mm', max: 25, earned: mmPoints, label: t('moneyMap'), lost: { reason: reasons.join(' · ') || t('mmPending'), points: 25 - mmPoints } });
    } else {
      parts.push({ key: 'mm', max: 25, earned: 25, label: t('moneyMap') });
    }

    /* Visit plan — 20 */
    const todayVisits = Store.state.visits.filter(v => v.date === d && v.memberId === memberId);
    const planned = todayVisits.filter(v => v.status === 'DONE' || v.status === 'NOT_DONE');
    let visitPts = 20;
    const missVisits = todayVisits.filter(v => v.status === 'NOT_DONE');
    if (missVisits.length) {
      const pct = planned.length ? (planned.filter(v => v.status === 'DONE').length / planned.length) : 1;
      visitPts = Math.round(20 * pct);
      parts.push({ key: 'visit', max: 20, earned: visitPts, label: t('visitPlan'), lost: { reason: t('reason_visit') + ' — ' + missVisits[0].branch, points: 20 - visitPts } });
    } else {
      parts.push({ key: 'visit', max: 20, earned: 20, label: t('visitPlan') });
    }

    /* Video visit — 20 */
    const todayVideos = Store.state.videos.filter(v => v.date === d && v.memberId === memberId);
    const withIn = todayVideos.filter(v => v.videoIn);
    let videoPts = 20;
    const missOut = withIn.filter(v => !v.videoOut);
    if (withIn.length) {
      if (missOut.length) {
        videoPts = Math.round(20 * (withIn.length - missOut.length) / withIn.length);
        parts.push({ key: 'video', max: 20, earned: videoPts, label: t('videoVisit'), lost: { reason: t('reason_video') + ' — ' + missOut[0].branch, points: 20 - videoPts } });
      } else {
        parts.push({ key: 'video', max: 20, earned: 20, label: t('videoVisit') });
      }
    } else {
      parts.push({ key: 'video', max: 20, earned: 20, label: t('videoVisit') });
    }

    /* Weekly — 15 */
    const wk = this.currentWeekly(memberId);
    if (!wk) {
      parts.push({ key: 'weekly', max: 15, earned: 0, label: t('weeklyTasks'), lost: { reason: t('reason_follow'), points: 15 } });
    } else {
      const done = ['outfit', 'window', 'meeting'].filter(k => wk[k] === 'DONE').length;
      const wkPts = Math.round(15 * done / 3);
      if (wkPts < 15) {
        parts.push({ key: 'weekly', max: 15, earned: wkPts, label: t('weeklyTasks'), lost: { reason: t('reason_follow'), points: 15 - wkPts } });
      } else {
        parts.push({ key: 'weekly', max: 15, earned: 15, label: t('weeklyTasks') });
      }
    }

    const total = parts.reduce((a, p) => a + p.earned, 0);
    const lost = parts.filter(p => p.lost).map(p => ({ reason: p.lost.reason, points: p.lost.points, key: p.key }));
    return { total, parts, lost, date: d, memberId };
  },

  currentWeekly(memberId) {
    const recs = Store.state.weekly.filter(w => w.memberId === memberId);
    if (!recs.length) return null;
    // the current week = the weekStart window containing today
    let best = null;
    recs.forEach(w => {
      const end = addDays(w.weekStart, 6);
      if (w.weekStart <= todayISO() && end >= todayISO()) { best = w; }
    });
    if (best) return best;
    // fallback: closest weekStart <= today
    return recs.filter(w => w.weekStart <= todayISO()).sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0] || recs.sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
  },

  statusFor(score) {
    if (score >= 80) return { key: 'healthy', cls: 'green' };
    if (score >= 60) return { key: 'attention', cls: 'amber' };
    return { key: 'critical', cls: 'red' };
  },
  statusForScore(score) { return this.statusFor(score); },

  /* ---------- Team KPIs ---------- */
  kpis(date) {
    const d = date || todayISO();
    const members = Store.state.members;
    const scores = members.map(m => this.memberScore(m.id, d).total);
    const teamComp = members.length ? Math.round(scores.reduce((a, b) => a + b, 0) / members.length) : 0;

    const alerts = this.alerts(d);
    const red = alerts.filter(a => a.severity === 'RED').length;

    /* tasks */
    let total = 0, done = 0;
    members.forEach(m => {
      const drs = Store.state.dailyReports.filter(r => r.date === d && r.memberId === m.id);
      const dr = drs[0];
      if (dr) {
        total++;
        if (this.isDoneDaily(dr.status) || this.isExcused(dr.status)) done++;
        else if (dr.status === 'STILL') total++; // still counts as pending to close
      } else { total++; }
      const plannedV = Store.state.visits.filter(v => v.date === d && v.memberId === m.id && (v.status === 'DONE' || v.status === 'NOT_DONE'));
      total += plannedV.length;
      done += plannedV.filter(v => v.status === 'DONE').length;
      const vids = Store.state.videos.filter(v => v.date === d && v.memberId === m.id && v.videoIn);
      total += vids.length;
      done += vids.filter(v => v.videoOut).length;
    });

    /* visit compliance */
    const commVisits = Store.state.visits.filter(v => v.date === d && (v.status === 'DONE' || v.status === 'NOT_DONE'));
    const visitComp = commVisits.length ? Math.round(commVisits.filter(v => v.status === 'DONE').length / commVisits.length * 100) : 100;

    /* video compliance */
    const commVids = Store.state.videos.filter(v => v.date === d && v.videoIn);
    const videoComp = commVids.length ? Math.round(commVids.filter(v => v.videoOut).length / commVids.length * 100) : 100;

    return {
      teamComp, tasksDone: done, tasksTotal: total,
      openAlerts: alerts.length, criticalRed: red,
      visitComp, videoComp, mmPct: this.mmStatusPct(), alerts
    };
  },

  /* ---------- Alerts ---------- */
  alertId(sev, reason, memberId, branch, date) {
    return [sev, reason, memberId, branch || 'x', date || todayISO()].join(':');
  },
  isHandled(id) { return Store.state.handledAlerts.includes(id); },

  _pushAlerts(list, alert, date) {
    const id = this.alertId(alert.severity, alert.reason, alert.memberId,
      alert.branch, alert.date || date);
    alert.id = id;
    if (this.isHandled(id)) return;
    list.push(alert);
  },

  alerts(date) {
    const d = date || todayISO();
    const out = [];
    if (!Store.hasOperationalData()) return out;
    const members = Store.state.members;

    members.forEach(m => {
      /* 1. missing daily report */
      const dr = Store.state.dailyReports.find(r => r.date === d && r.memberId === m.id);
      if (!dr || (dr.status !== 'DONE' && dr.status !== 'WORK_MISSION' && !this.isExcused(dr.status))) {
        if (!dr || !this.isExcused(dr.status)) {
          this._pushAlerts(out, { severity: 'RED', reason: 'daily', memberId: m.id, branch: null, date: d, actionKey: 'act_daily' }, d);
        }
      } else if (dr.emailSent && !(dr.emailImages && dr.emailExcel)) {
        if (!dr.emailImages || !dr.emailExcel) {
          this._pushAlerts(out, { severity: 'AMBER', reason: 'attach', memberId: m.id, branch: null, date: d, actionKey: 'act_attach' }, d);
        }
      }

      /* 2. missed visits */
      Store.state.visits.filter(v => v.date === d && v.memberId === m.id && v.status === 'NOT_DONE').forEach(v => {
        this._pushAlerts(out, { severity: 'RED', reason: 'visit', memberId: m.id, branch: v.branch, date: d, actionKey: 'act_visit' }, d);
      });

      /* 3. video out missing */
      Store.state.videos.filter(v => v.date === d && v.memberId === m.id && v.videoIn && !v.videoOut).forEach(v => {
        this._pushAlerts(out, { severity: 'RED', reason: 'video', memberId: m.id, branch: v.branch, date: d, actionKey: 'act_video' }, d);
      });

      /* 4 + 7. money map per branch */
      (m.branches || []).forEach(b => {
        const ms = this.mmBranchScore(b);
        if (ms.problems.length === 0) return;
        if (ms.problems.includes(t('mmNotUpdated'))) {
          this._pushAlerts(out, { severity: 'RED', reason: 'mm', memberId: m.id, branch: b, date: ms.days === Infinity ? '—' : addDays(todayISO(), -ms.days), actionKey: 'act_mm' }, d);
        } else {
          this._pushAlerts(out, { severity: 'AMBER', reason: 'mm', memberId: m.id, branch: b, date: ms.days === Infinity ? '—' : addDays(todayISO(), -ms.days), actionKey: 'act_mm' }, d);
        }
      });

      /* 5. repeated issue (>=2 open on same branch) */
      const branchCount = {};
      Store.state.issues.filter(i => i.memberId === m.id && i.status !== 'RESOLVED').forEach(i => {
        branchCount[i.branch] = (branchCount[i.branch] || 0) + 1;
      });
      Object.keys(branchCount).forEach(b => {
        if (branchCount[b] >= 2) {
          this._pushAlerts(out, { severity: 'RED', reason: 'repeat', memberId: m.id, branch: b, date: d, actionKey: 'act_repeat', issueCount: branchCount[b] }, d);
        }
      });

      /* 6. pending follow-up (open + overdue) */
      Store.state.issues.filter(i => i.memberId === m.id && i.status !== 'RESOLVED' && i.dueDate && i.dueDate < d).forEach(i => {
        this._pushAlerts(out, { severity: 'AMBER', reason: 'follow', memberId: m.id, branch: i.branch || null, date: i.dueDate, actionKey: 'act_follow', issueTitle: i.title }, d);
      });
    });

    const order = { RED: 0, AMBER: 1 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  },

  /* ---------- Branch health + detail ---------- */
  branchHealth(code) {
    if (!Store.hasOperationalData()) return { key: 'nopdata', cls: 'gray', reasons: [], nodata: true };
    const mm = this.mmBranchScore(code);
    const issues = Store.state.issues.filter(i => i.branch === code && i.status !== 'RESOLVED');
    const missedRecent = Store.state.visits.filter(v => v.branch === code && v.status === 'NOT_DONE' && v.date >= addDays(todayISO(), -14)).length;
    const videoMiss = Store.state.videos.filter(v => v.branch === code && v.videoIn && !v.videoOut && v.date >= addDays(todayISO(), -7)).length;

    if (mm.days > 7) return { key: 'critical', cls: 'red', reasons: [t('mmNotUpdated')] };
    if (issues.length >= 2 || issues.some(i => i.severity === 'CRITICAL')) return { key: 'critical', cls: 'red', reasons: [t('reason_repeat')] };
    if (issues.length || mm.problems.length || missedRecent || videoMiss) {
      const reasons = [];
      if (issues.length) reasons.push(t('openIssues') + ': ' + issues.length);
      if (mm.problems.length) reasons.push(mm.problems.join(', '));
      if (missedRecent) reasons.push(t('reason_visit'));
      if (videoMiss) reasons.push(t('reason_video'));
      return { key: 'attention', cls: 'amber', reasons };
    }
    return { key: 'healthy', cls: 'green', reasons: [] };
  },

  branchVisits(code) {
    return Store.state.visits.filter(v => v.branch === code).sort((a, b) => b.date.localeCompare(a.date));
  },
  branchVideos(code) {
    return Store.state.videos.filter(v => v.branch === code).sort((a, b) => b.date.localeCompare(a.date));
  },
  branchLatestActivity(code) {
    const v = this.branchVideos(code)[0];
    const vis = this.branchVisits(code)[0];
    const iv = v || vis;
    if (iv) return iv.date;
    return null;
  },

  /* ---------- Weekly / analysis comparisons (last 7 days) ---------- */
  weekAnalysis() {
    if (!Store.hasOperationalData()) return [];
    const from = addDays(todayISO(), -6);
    return Store.state.members.map(m => {
      const dailyRecs = Store.state.dailyReports.filter(r => r.memberId === m.id && r.date >= from && r.date <= todayISO());
      const denom = dailyRecs.filter(r => !this.isExcused(r.status)).length || 1;
      const dailyPct = Math.round(dailyRecs.filter(r => this.isDoneDaily(r.status)).length / denom * 100);

      const plannedV = Store.state.visits.filter(v => v.memberId === m.id && v.date >= from && (v.status === 'DONE' || v.status === 'NOT_DONE'));
      const visitPct = plannedV.length ? Math.round(plannedV.filter(v => v.status === 'DONE').length / plannedV.length * 100) : 100;

      const vids = Store.state.videos.filter(v => v.memberId === m.id && v.date >= from && v.videoIn);
      const videoPct = vids.length ? Math.round(vids.filter(v => v.videoOut).length / vids.length * 100) : 100;

      const mmPct = Math.round(this.mmMemberScore(m.id));
      const wk = this.currentWeekly(m.id);
      const weeklyPct = wk ? Math.round(['outfit', 'window', 'meeting'].filter(k => wk[k] === 'DONE').length / 3 * 100) : 0;

      const total = Math.round(0.2 * dailyPct + 0.25 * mmPct + 0.2 * visitPct + 0.2 * videoPct + 0.15 * weeklyPct);
      const today = this.memberScore(m.id).total;
      return { member: m, dailyPct, mmPct, visitPct, videoPct, weeklyPct, total, today };
    });
  },

  /* ---------- Monthly calendar ---------- */
  monthCalendar(year, month) {
    const daysIn = new Date(year, month + 1, 0).getDate();
    const firstDow = new Date(year, month, 1).getDay();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push({ blank: true });
    for (let d = 1; d <= daysIn; d++) {
      const iso = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const isFuture = iso > todayISO();
      let cls = 'future', score = null;
      if (!isFuture) {
        const scores = Store.state.members.map(m => this.memberScore(m.id, iso).total);
        score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        cls = score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red';
      }
      cells.push({ date: iso, day: d, cls, score, todays: iso === todayISO() });
    }
    return cells;
  },

  monthStats(year, month) {
    const isoFrom = year + '-' + String(month + 1).padStart(2, '0') + '-01';
    const isoTo = todayISO();
    let totalComp = 0, daysN = 0, missed = 0, mailTotal=0, mailOn=0, visitTotal=0, visitDone=0, videoTotal=0, videoDone=0, weeklyTotal=0, weeklyDone=0;
    for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) {
      const iso = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      if (iso > isoTo) break;
      const scores = Store.state.members.map(m => this.memberScore(m.id, iso).total);
      totalComp += scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0; daysN++;
      const pv=Store.state.visits.filter(v=>v.date===iso&&['DONE','NOT_DONE'].includes(v.status)); visitTotal+=pv.length; visitDone+=pv.filter(v=>v.status==='DONE').length;
      const vv=Store.state.videos.filter(v=>v.date===iso&&v.videoIn); videoTotal+=vv.length; videoDone+=vv.filter(v=>v.videoOut).length;
      const wm=Store.state.weekly.filter(w=>w.weekStart===iso); wm.forEach(w=>{weeklyTotal+=3;weeklyDone+=['outfit','window','meeting'].filter(k=>w[k]==='DONE').length;});
      Store.state.visits.filter(v => v.date === iso && v.status === 'NOT_DONE').forEach(() => missed++);
      Store.state.videos.filter(v => v.date === iso && v.videoIn && !v.videoOut).forEach(() => missed++);
      const br=(Store.state.dailyBranchReports||[]).filter(r=>r.date===iso); br.filter(r=>r.status==='NO').forEach(()=>missed++);
    }
    const mails=(Store.state.visitMails||[]).filter(v=>v.visitDate>=isoFrom&&v.visitDate<=isoTo); mailTotal=mails.length; mailOn=mails.filter(v=>v.mailSentDate && v.mailSentDate.slice(0,10)<=addDays(v.visitDate,1)).length;
    const avgComp = daysN ? Math.round(totalComp / daysN) : 0;
    const avgMail = mailTotal ? Math.round(mailOn/mailTotal*100) : 0;
    const avgVisit = visitTotal ? Math.round(visitDone/visitTotal*100) : 100;
    const avgVideo = videoTotal ? Math.round(videoDone/videoTotal*100) : 100;
    const avgWeekly = weeklyTotal ? Math.round(weeklyDone/weeklyTotal*100) : 100;

    const branchMiss = {};
    Store.state.visits.filter(v => v.status === 'NOT_DONE' && v.date >= isoFrom).forEach(v => branchMiss[v.branch] = (branchMiss[v.branch] || 0) + 1);
    Store.state.issues.filter(i => i.status !== 'RESOLVED' && i.branch && i.date >= isoFrom).forEach(i => branchMiss[i.branch] = (branchMiss[i.branch] || 0) + 2);
    Store.state.videos.filter(v => v.videoIn && !v.videoOut && v.date >= isoFrom).forEach(v => branchMiss[v.branch] = (branchMiss[v.branch] || 0) + 1);
    const problematic = Object.entries(branchMiss).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([b, n]) => ({ branch: b, n }));

    const repCount = {};
    Store.state.issues.filter(i => i.status !== 'RESOLVED').forEach(i => repCount[i.branch] = (repCount[i.branch] || 0) + 1);
    const repeated = Object.entries(repCount).filter(([, n]) => n >= 2).map(([b, n]) => ({ branch: b, n }));

    return { avgComp, avgMail, avgVisit, avgVideo, avgWeekly, missed, problematic, repeated };
  },

  /* open issues helper */
  openIssues(memberId) {
    return Store.state.issues.filter(i => i.memberId === memberId && i.status !== 'RESOLVED');
  },

  /* ============================================================
     Daily Tasks module — stats & compliance (additive)
     task status flow: CREATED → IN_PROGRESS → SUBMITTED → APPROVED
       | APPROVED_LATE | NEED_CORRECTION | OVERDUE
     ============================================================ */
  taskStats(fromIso, toIso) {
    fromIso = fromIso || '0000-00-00';
    toIso = toIso || todayISO();
    const ts = Store.state.tasks.filter(x => x.createdAt >= fromIso && x.createdAt <= toIso);
    const byStatus = {};
    ts.forEach(x => byStatus[x.status] = (byStatus[x.status] || 0) + 1);
    const done = ['APPROVED', 'APPROVED_LATE'].reduce((a, s) => a + (byStatus[s] || 0), 0);
    const overdue = ts.filter(x => x.status === 'OVERDUE').length;
    const compl = ts.length ? Math.round(done / ts.length * 100) : 0;
    const onTime = byStatus['APPROVED'] || 0;
    const lateDone = byStatus['APPROVED_LATE'] || 0;
    return { total: ts.length, byStatus, done, overdue, compl, onTime, lateDone };
  },

  taskCompliance(memberId) {
    const own = Store.state.tasks.filter(x => x.memberId === memberId && x.status !== 'CREATED');
    if (!own.length) return 0;
    const done = own.filter(x => x.status === 'APPROVED' || x.status === 'APPROVED_LATE').length;
    return Math.round(done / own.length * 100);
  },

  taskLoadByMember() {
    const map = {};
    Store.state.members.forEach(m => map[m.id] = 0);
    Store.state.tasks.forEach(x => { if (map[x.memberId] !== undefined) map[x.memberId]++; });
    return map;
  },

  /* ============================================================
     Attendance module — monthly analysis (additive)
     status: ON_TIME | LATE | ABSENT | OFF | WORK_MISSION
     ============================================================ */
  attendanceStats(monthIso) {
    const recs = Store.state.attendance.filter(a => (a.date || '').slice(0, 7) === monthIso);
    const buckets = { ON_TIME: 0, LATE: 0, ABSENT: 0, OFF: 0, WORK_MISSION: 0 };
    recs.forEach(a => { if (buckets[a.status] !== undefined) buckets[a.status]++; });
    const worked = recs.filter(a => a.status === 'ON_TIME' || a.status === 'LATE').length;
    const workedDays = worked + buckets.OFF + buckets.WORK_MISSION;
    const onTimePct = worked ? Math.round(buckets.ON_TIME / worked * 100) : 0;
    const latePct = worked ? Math.round(buckets.LATE / worked * 100) : 0;
    const compliance = workedDays ? Math.round(buckets.ON_TIME / workedDays * 100) : 0;
    return { monthIso, total: recs.length, ...buckets, worked, workedDays, onTimePct, latePct, compliance };
  },

  attendanceScore(memberId, monthIso) {
    const own = Store.state.attendance.filter(a => a.memberId === memberId && (a.date || '').slice(0, 7) === monthIso);
    if (!own.length) return 0;
    const worked = own.filter(a => a.status === 'ON_TIME' || a.status === 'LATE').length;
    const onTime = own.filter(a => a.status === 'ON_TIME').length;
    const lateFine = own.filter(a => a.status === 'LATE').length * 15;
    return Math.max(0, Math.round((worked ? onTime / worked : 0) * 100 - lateFine / (worked || 1)));
  },

  /* ============================================================
     Money Map Daily History — per branch per day (additive)
     ============================================================ */
  moneyMapHistory(branch, daysBack, toIso) {
    toIso = toIso || todayISO();
    const from = addDaysIso(toIso, -(daysBack || 30));
    return Store.state.moneyMapDaily
      .filter(m => m.branch === branch && m.date >= from && m.date <= toIso)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  /* today vs previous day comparison for a branch */
  mmCompare(branch) {
    const rows = Store.state.moneyMapDaily
      .filter(m => m.branch === branch)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length) return null;
    const today = rows[rows.length - 1];
    const prev = rows.length > 1 ? rows[rows.length - 2] : null;
    function score(r) {
      return r ? (r.stockRoom || 0) + (r.codesNoLoc || 0) + (r.splitGroups || 0) + (r.emptyLoc || 0) + (r.l0 || 0) : 0;
    }
    const cur = score(today), old = prev ? score(prev) : cur;
    const delta = cur - old;
    const deltaPct = old ? Math.round(delta / old * 100) : 0;
    const direction = delta === 0 ? 'same' : (delta < 0 ? 'improved' : 'worsened');
    return { branch, date: today.date, prevDate: prev ? prev.date : null, cur, old, delta, deltaPct, direction, healthy: cur <= 5 }
  },

  /* money map overview / dashboard for a month */
  mmOverview(monthIso) {
    const rows = Store.state.moneyMapDaily.filter(m => (m.date || '').slice(0, 7) === monthIso);
    const latest = {};
    rows.forEach(r => { const k = r.branch + '|' + r.date; if (!latest[r.branch] || r.date > latest[r.branch].date) latest[r.branch] = r; });
    const br = Object.values(latest);
    const total = br.length;
    function bucket(r) { return r.healthy ? 'healthy' : (r.attention ? 'attention' : 'critical'); }
    const counts = { healthy: 0, attention: 0, critical: 0 };
    br.forEach(r => counts[bucket(r) === 'critical' ? 'critical' : (r.attention ? 'attention' : 'healthy')]++);
    const healthyPct = total ? Math.round(counts.healthy / total * 100) : 0;
    const attentionPct = total ? Math.round(counts.attention / total * 100) : 0;
    const criticalPct = total ? Math.round(counts.critical / total * 100) : 0;
    const problems = br.filter(r => r.codesNoLoc > 0 || r.splitGroups > 0 || r.emptyLoc > 0 || r.stockRoom > 0 || r.l0 > 0);
    const topProblem = problems.sort((x, y) => (y.codesNoLoc + y.splitGroups + y.emptyLoc + y.stockRoom + y.l0) - (x.codesNoLoc + x.splitGroups + x.emptyLoc + x.stockRoom + x.l0))[0] || null;
    const improving = br.filter(r => !problems.includes(r));
    const topImproving = improving[0] || null;
    return { monthIso, total, counts: { healthy: counts.healthy, attention: counts.attention, critical: counts.critical }, healthyPct, attentionPct, criticalPct, topProblem, topImproving };
  },

  /* ============================================================
     Month-to-month comparison — 8 dimensions (additive)
     ============================================================ */
  monthCompare(aIso, bIso) {
    if (!Store.hasOperationalData()) return [];
    const [ay,am]=aIso.split('-').map(Number), [by,bm]=bIso.split('-').map(Number);
    const dim = (key, a, b, betterIs) => {
      const deltaPct = a ? Math.round((b - a) / a * 100) : (b ? 100 : 0);
      const direction = deltaPct === 0 ? 'same' : (deltaPct > 0 ? 'up' : 'down');
      const status = direction === 'same' ? 'same' : ((betterIs === 'up') === (direction === 'up') ? 'improved' : 'declined');
      return { key, a, b, deltaPct, direction, status };
    };
    const dA = this.monthStats(ay, am-1), dB = this.monthStats(by, bm-1);
    const aa = this.attendanceStats(aIso), ab = this.attendanceStats(bIso);
    const mmA = this.mmOverview(aIso), mmB = this.mmOverview(bIso);
    const ta = this.taskStats(aIso + '-01', aIso + '-31'), tb = this.taskStats(bIso + '-01', bIso + '-31');
    return [
      dim('daily', dA.avgComp, dB.avgComp, 'up'),
      dim('mail', dA.avgMail, dB.avgMail, 'up'),
      dim('moneyMap', mmA.healthyPct, mmB.healthyPct, 'up'),
      dim('visits', dA.avgVisit, dB.avgVisit, 'up'),
      dim('videos', dA.avgVideo, dB.avgVideo, 'up'),
      dim('weekly', dA.avgWeekly, dB.avgWeekly, 'up'),
      dim('tasks', ta.compl, tb.compl, 'up'),
      dim('attendance', aa.onTimePct, ab.onTimePct, 'up')
    ];
  }
};

/* quick alias used by views */
function statusCls(statusKey) {
  const map = { healthy: 'green', attention: 'amber', critical: 'red', DONE: 'green', WORK_MISSION: 'purple', NO: 'red', NOT_DONE: 'red', ANNUAL: 'blue', OFF: 'gray', PENDING: 'amber', STILL: 'amber', OPEN: 'red', IN_PROGRESS: 'amber', RESOLVED: 'green' };
  return map[statusKey] || 'gray';
}