/* AREA VM CONTROL TOWER — Core operational views
   Daily Reports | Visit Mail | Tasks Schedule | Attendance | MM History | Month Compare | Daily Control
*/
window.Views = window.Views || {};
(function(){
  'use strict';
  const STATUS = ['DONE','NO','STORE_NOT_SENT','PERMISSION','WORK_MISSION','OFF'];
  const TASK_STATUS = ['CREATED','IN_PROGRESS','SUBMITTED','APPROVED','APPROVED_LATE','NEED_CORRECTION','OVERDUE'];
  const ATT_STATUS = ['ON_TIME','LATE','ABSENT','OFF','WORK_MISSION'];
  const $ = s => document.querySelector(s);
  const memberName = id => Store.memberName(Store.findMember(id));
  const branchesFor = id => (Store.findMember(id) || {}).branches || [];
  const l = (en, ar) => LANG === 'ar' ? ar : en;
  const monthLabel = iso => { const d=new Date(iso+'-01T00:00:00'); return d.toLocaleDateString(LANG==='ar'?'ar-EG-u-nu-latn':'en-GB',{month:'long',year:'numeric'}); };
  const ym = d => String(d).slice(0,7);
  const daysInMonth = m => { const [y,mo]=m.split('-').map(Number); return new Date(y,mo,0).getDate(); };
  const dateFor = (m,n) => m+'-'+String(n).padStart(2,'0');
  const escAttr = s => esc(s).replace(/`/g,'&#96;');
  const statusClass = s => ({DONE:'green',WORK_MISSION:'purple',NO:'red',STORE_NOT_SENT:'amber',PERMISSION:'blue',OFF:'gray',ON_TIME:'green',LATE:'amber',ABSENT:'red',APPROVED:'green',APPROVED_LATE:'amber',OVERDUE:'red',NEED_CORRECTION:'red',IN_PROGRESS:'amber',SUBMITTED:'blue',CREATED:'gray'}[s]||'gray');
  const statusText = s => t('st_'+s) || s.replace(/_/g,' ');
  function opts(list, selected, labels){ return list.map(x=>'<option value="'+escAttr(x)+'"'+(x===selected?' selected':'')+'>'+esc(labels&&labels[x]||statusText(x))+'</option>').join(''); }
  function memberOpts(selected, all){ return (all?'<option value="">'+esc(l('All Area VMs','كل الـ Area VM'))+'</option>':'')+Store.state.members.map(m=>'<option value="'+escAttr(m.id)+'"'+(m.id===selected?' selected':'')+'>'+esc(Store.memberName(m))+'</option>').join(''); }
  function branchOpts(memberId, selected, all){ const bs=memberId?branchesFor(memberId):Store.state.members.flatMap(m=>m.branches||[]); const uniq=[...new Set(bs)]; return (all?'<option value="">'+esc(l('All branches','كل الفروع'))+'</option>':'')+uniq.map(b=>'<option value="'+escAttr(b)+'"'+(b===selected?' selected':'')+'>'+esc(b)+'</option>').join(''); }
  function field(label, inner, cls){ return '<label class="field '+(cls||'')+'"><span>'+esc(label)+'</span>'+inner+'</label>'; }
  function badge(s){ return '<span class="badge '+statusClass(s)+'">'+esc(statusText(s))+'</span>'; }
  function saveAndRender(msg){ Store.save(); if(msg) toast(msg); router(); }

  /* ---------------- Daily Reports: sheet-like grid ---------------- */
  Views.dailyControl = function(root){
    const month0=todayISO().slice(0,7);
    root.innerHTML='<div class="page operational-page">'+
      '<div class="page-head"><div class="page-title"><h1>📋 '+esc(l('Daily Reports','التقارير اليومية'))+'</h1><p>'+esc(l('Daily branch execution — same operating logic as the sheet','متابعة الفروع اليومية — بنفس منطق الشيت'))+'</p></div><div class="spacer"></div><button class="btn" id="drToday">'+esc(l('Today','اليوم'))+'</button><button class="btn gray" id="drImport">📥 '+esc(l('Import Excel','استيراد Excel'))+'</button></div>'+
      '<div class="card dr-toolbar"><div class="filters">'+field(l('Month','الشهر'),'<input type="month" id="drMonth" value="'+month0+'">')+field(l('Area VM','Area VM'),'<select id="drMember">'+memberOpts('',true)+'</select>')+field(l('Branch','الفرع'),'<select id="drBranch"><option value="">'+esc(l('All branches','كل الفروع'))+'</option></select>')+field(l('Status','الحالة'),'<select id="drStatus"><option value="">'+esc(l('All','الكل'))+'</option>'+opts(STATUS,'')+'</select>')+'</div></div>'+
      '<div id="drSummary"></div><div id="drAnalysis"></div><div id="drSections"></div></div>';
    const elapsedFor=month=>month===todayISO().slice(0,7)?Number(todayISO().slice(8,10)):daysInMonth(month);
    const summary=(month,mem,branch)=>{const all=(Store.state.dailyBranchReports||[]).filter(r=>r.date.startsWith(month)&&(!mem||r.memberId===mem)&&(!branch||r.branch===branch));const el=elapsedFor(month);const required=all.length?((mem?branchesFor(mem).filter(b=>!branch||b===branch).length:new Set(all.map(r=>r.branch)).size)*el):((mem?branchesFor(mem).filter(b=>!branch||b===branch).length:Store.state.members.reduce((n,m)=>n+m.branches.length,0))*el);const done=all.filter(r=>r.status==='DONE').length;const no=all.filter(r=>r.status==='NO').length;const notSent=all.filter(r=>r.status==='STORE_NOT_SENT').length;const comp=all.length?Math.round(done/required*100):null;return '<div class="dr-summary grid cols-6"><div class="kpi blue-k"><span class="k-label">'+esc(l('Recorded','مسجل'))+'</span><span class="k-value">'+all.length+'</span></div><div class="kpi green-k"><span class="k-label">DONE</span><span class="k-value">'+done+'</span></div><div class="kpi red-k"><span class="k-label">NO</span><span class="k-value">'+no+'</span></div><div class="kpi amber-k"><span class="k-label">'+esc(l('Store Not Sent','غير مُرسل للمخزن'))+'</span><span class="k-value">'+notSent+'</span></div><div class="kpi"><span class="k-label">'+esc(l('Expected','المطلوب'))+'</span><span class="k-value">'+required+'</span></div><div class="kpi"><span class="k-label">'+esc(l('Compliance','الالتزام'))+'</span><span class="k-value">'+(comp===null?esc(l('No Data','لا توجد بيانات')):comp+'%')+'</span></div></div>';};
    const analysis=()=>{const month=$('#drMonth').value,mem=$('#drMember').value,branch=$('#drBranch').value;const members=mem?[Store.findMember(mem)].filter(Boolean):Store.state.members;const el=elapsedFor(month);const rows=members.map(memObj=>{const used=(memObj.branches||[]).filter(b=>!branch||b===branch);const recs=(Store.state.dailyBranchReports||[]).filter(r=>r.date.startsWith(month)&&r.memberId===memObj.id&&(!branch||r.branch===branch));const expected=used.length*el;const cnt={};recs.forEach(r=>cnt[r.status]=(cnt[r.status]||0)+1);const comp=recs.length?Math.round((cnt.DONE||0)/expected*100):null;return {mem:memObj,expected,done:cnt.DONE||0,no:cnt.NO||0,notSent:cnt.STORE_NOT_SENT||0,perm:cnt.PERMISSION||0,wm:cnt.WORK_MISSION||0,off:cnt.OFF||0,comp};});return '<div class="card" style="margin-bottom:14px"><div class="card-title">📊 '+esc(l('Analysis','التحليل'))+'</div><div class="table-wrap"><table class="tbl"><thead><tr><th>'+esc(l('Area VM','Area VM'))+'</th><th class="num">'+esc(l('Expected','المطلوب'))+'</th><th class="num">DONE</th><th class="num">NO</th><th class="num">'+esc(l('Store Not Sent','غير مُرسل للمخزن'))+'</th><th class="num">'+esc(l('Permission','إذن'))+'</th><th class="num">'+esc(l('Work Mission','مهمة عمل'))+'</th><th class="num">'+esc(l('Off','إجازة'))+'</th><th class="num">'+esc(l('Compliance','الالتزام'))+'</th></tr></thead><tbody>'+rows.map(r=>'<tr><td class="rowhead">'+esc(memberName(r.mem.id))+'</td><td class="num">'+r.expected+'</td><td class="num" style="color:var(--green)">'+r.done+'</td><td class="num" style="color:var(--red)">'+r.no+'</td><td class="num" style="color:var(--amber)">'+r.notSent+'</td><td class="num">'+r.perm+'</td><td class="num">'+r.wm+'</td><td class="num">'+r.off+'</td><td class="num"><b>'+(r.comp===null?esc(l('No Data','لا توجد بيانات')):r.comp+'%')+'</b></td></tr>').join('')+'</tbody></table></div></div>';};
    const memberComp=(member,month,branch)=>{const used=(member.branches||[]).filter(b=>!branch||b===branch);const el=elapsedFor(month);const recs=(Store.state.dailyBranchReports||[]).filter(r=>r.date.startsWith(month)&&r.memberId===member.id&&(!branch||r.branch===branch));if(!recs.length)return null;const done=recs.filter(r=>r.status==='DONE').length;return used.length&&el?Math.round(done/(used.length*el)*100):0;};
    const render=()=>{const month=$('#drMonth').value,mem=$('#drMember').value,filter=$('#drStatus').value,branch=$('#drBranch').value;$('#drSummary').innerHTML=summary(month,mem,branch);$('#drAnalysis').innerHTML=analysis();const monthEmpty=!(Store.state.dailyBranchReports||[]).some(r=>r.date.startsWith(month));const members=mem?[Store.findMember(mem)].filter(Boolean):Store.state.members;let html='';if(monthEmpty)html+=emptyStateHtml('No reports recorded for this period.','Select a branch status cell below to record the first report.');members.forEach(member=>{let bs=(member.branches||[]);if(branch)bs=bs.filter(b=>b===branch);if(!bs.length)return;const comp=memberComp(member,month,branch);html+='<section class="dr-section card"><div class="dr-section-head"><div><h2>'+esc(memberName(member.id))+'</h2><span>'+bs.length+' '+esc(l('assigned branches','فرع مسؤول عنه'))+'</span></div><div class="dr-section-score"><span>'+esc(l('Compliance','الالتزام'))+'</span><b>'+(comp===null?esc(l('No Data','لا توجد بيانات')):comp+'%')+'</b></div></div><div class="table-wrap dr-wrap"><table class="vm-grid"><thead><tr><th class="sticky-col">'+esc(l('Date','التاريخ'))+'</th>'+bs.map(b=>'<th>'+esc(b)+'</th>').join('')+'</tr></thead><tbody>';
      for(let day=1;day<=daysInMonth(month);day++){const iso=dateFor(month,day);const recs=bs.map(b=>(Store.state.dailyBranchReports||[]).find(r=>r.date===iso&&r.memberId===member.id&&r.branch===b));if(filter&&!recs.some(r=>r&&r.status===filter))continue;html+='<tr class="dr-row '+(iso===todayISO()?'today-row':'')+'"><th class="sticky-col"><div class="dr-date">'+esc(fmtDate(iso))+'</div></th>'+recs.map((r,i)=>{const b=bs[i],st=r?r.status:'';return '<td class="dr-cell"><select class="dr-status '+statusClass(st)+'" data-date="'+iso+'" data-member="'+member.id+'" data-branch="'+escAttr(b)+'"><option value="">—</option>'+opts(STATUS,st)+'</select></td>';}).join('')+'</tr>';}
      html+='</tbody></table></div></section>';});$('#drSections').innerHTML=html||'<div class="empty">'+esc(l('No Area VM found','لا يوجد Area VM'))+'</div>';
      $('#drSections').querySelectorAll('.dr-status').forEach(sel=>sel.addEventListener('change',()=>{
        const keepY = window.scrollY || window.pageYOffset || 0;
        const keepTop = sel.getBoundingClientRect().top;
        if(!sel.value){
          requestAnimationFrame(()=>window.scrollTo({top:keepY,left:window.scrollX,behavior:'auto'}));
          return;
        }
        const previous = sel.dataset.previous || '';
        sel.dataset.previous = sel.value;
        Store.confirm(Store.addDailyBranch({date:sel.dataset.date,memberId:sel.dataset.member,branch:sel.dataset.branch,status:sel.value}),l('Saved','تم الحفظ')).then(function(r){
          if(!r||r.ok!==false){
            sel.className='dr-status '+statusClass(sel.value);
            const m2=$('#drMonth').value,b2=$('#drBranch').value;
            $('#drSummary').innerHTML=summary(m2,$('#drMember').value,b2);
            $('#drAnalysis').innerHTML=analysis();
            const sec=sel.closest('.dr-section');
            const sc=sec&&sec.querySelector('.dr-section-score b');
            if(sc){
              const memObj=Store.findMember(sel.dataset.member);
              if(memObj){
                const cc=memberComp(memObj,m2,b2);
                sc.textContent=cc===null?l('No Data','لا توجد بيانات'):cc+'%';
              }
            }
          } else if(previous) {
            sel.value=previous;
            sel.className='dr-status '+statusClass(previous);
          }
          requestAnimationFrame(()=>requestAnimationFrame(()=>{
            const nowTop = sel.getBoundingClientRect().top;
            const corrected = keepY + (nowTop - keepTop);
            window.scrollTo({top:corrected,left:window.scrollX,behavior:'auto'});
          }));
        });
      }));
      const head=document.querySelector('.dr-section-head');if(head)document.documentElement.style.setProperty('--drHeadH',(head.offsetHeight+6)+'px');
    };
    const syncBranchOpts=()=>{const sel=$('#drMember');const bsel=$('#drBranch');const keep=bsel.value;const list=sel.value?branchesFor(sel.value):Array.from(new Set(Store.state.members.flatMap(m=>m.branches||[])));bsel.innerHTML='<option value="">'+esc(l('All branches','كل الفروع'))+'</option>'+list.map(b=>'<option value="'+escAttr(b)+'"'+(b===keep?' selected':'')+'>'+esc(b)+'</option>').join('');};
    syncBranchOpts();
    $('#drMonth').addEventListener('change',render);$('#drMember').addEventListener('change',()=>{syncBranchOpts();render();});$('#drBranch').addEventListener('change',render);$('#drStatus').addEventListener('change',render);$('#drToday').addEventListener('click',()=>{$('#drMonth').value=todayISO().slice(0,7);render();});$('#drImport').addEventListener('click',()=>ExcelImport.open('daily'));render();
  };

  /* ---------------- Visit Mail ---------------- */
  function mailDeadline(visitDate, region){ const hour=(region==='Cairo'?14:16); return {date:addDays(visitDate,1), time:String(hour).padStart(2,'0')+':00'}; }
  function mailStatus(v){
    const dl=mailDeadline(v.visitDate,v.region);
    if(!v.mailSentDate){
      const now=new Date(); const nowDate=todayISO(); const nowTime=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
      if(nowDate>dl.date || (nowDate===dl.date && nowTime>dl.time)) return 'MISSING';
      return 'PENDING';
    }
    const sentDate=v.mailSentDate.slice(0,10); const sentTime=v.mailSentDate.length>10?v.mailSentDate.slice(11,16):'23:59';
    if(sentDate<dl.date || (sentDate===dl.date && sentTime<=dl.time)) return 'ON_TIME';
    if(sentDate===dl.date) return 'LATE';
    return 'MISSING';
  }
  Views.visitMail = function(root){
    const month=todayISO().slice(0,7);
    let pendingEmail=null, editId='';
    const okStr=y=>'<span class="'+(y?'vm-ok':'vm-no')+'">'+(y?'✓':'✕')+'</span>';
    const radioGroup=(name,row,checked)=>
      '<div class="vm-radio-group">'+
        '<label class="vm-radio"><input type="radio" name="'+name+'" value="0"'+(checked?'':' checked')+'> <span>✕ '+esc(l('Not Added','لم يُضف'))+'</span></label>'+
        '<label class="vm-radio" style="'+(!checked?'background:var(--green-bg);border-color:var(--green);color:var(--green)':'')+'"><input type="radio" name="'+name+'" value="1"'+(checked?' checked':'')+'> <span>✓ '+esc(row)+'</span></label>'+
      '</div>';
    root.innerHTML='<div class="page operational-page"><div class="page-head"><div class="page-title"><h1>✉️ '+esc(l('Visit Mail','Visit Mail'))+'</h1><p>'+esc(l('Visit report and mail compliance','متابعة الزيارة وإرسال الميل'))+'</p></div><div class="spacer"></div><button class="btn" id="vmNew">+ '+esc(l('Add Visit Mail','إضافة Visit Mail'))+'</button></div>'+
      '<div class="grid cols-4" id="vmKpis"></div><div class="form-panel" id="vmForm"></div><div class="card"><div class="filters">'+
        field(l('View By','عرض حسب'),'<select id="vmView"><option value="vm">'+esc(l('Area VM','Area VM'))+'</option><option value="date">'+esc(l('Date','التاريخ'))+'</option></select>')+
        field(l('Month','الشهر'),'<input type="month" id="vmMonth" value="'+month+'">')+
        field(l('Area VM','Area VM'),'<select id="vmFilterMember">'+memberOpts('',true)+'</select>')+
        field(l('Branch','الفرع'),'<select id="vmFilterBranch">'+branchOpts('', '', true)+'</select>')+
      '</div><div id="vmTable"></div></div></div>';
    const form=()=>
      '<div class="form-row cols-3">'+
        field(l('Visit Date','تاريخ الزيارة'),'<input type="date" id="vmVisitDate" value="'+todayISO()+'">')+
        field(l('Area VM','Area VM'),'<select id="vmMember">'+memberOpts('')+'</select>')+
        field(l('Branch','الفرع'),'<select id="vmBranch"></select>')+
        field(l('Region','المنطقة'),'<select id="vmRegion"><option value="Cairo">Cairo</option><option value="Governorates">Governorates</option></select>')+
        field(l('Mail Sent Date','تاريخ إرسال الميل'),'<input type="datetime-local" id="vmSent">')+
        field(l('Comment','Comment'),'<textarea id="vmComment"></textarea>')+
      '</div><div class="form-row cols-3 vm-upload-grid">'+
        '<div class="field vm-att-fields">'+esc(l('Excel / Sheet','إكسل / شيت'))+'<div class="vm-radio-group">'+
          '<label class="vm-radio"><input type="radio" name="vmExcel" value="0" checked> <span>✕ '+esc(l('Not Added','لم يُضف'))+'</span></label>'+
          '<label class="vm-radio"><input type="radio" name="vmExcel" value="1"> <span>✓ '+esc(l('Excel Added','تم إضافة الإكسل'))+'</span></label>'+
        '</div></div>'+
        '<div class="field vm-att-fields">'+esc(l('Pictures','الصور'))+'<div class="vm-radio-group">'+
          '<label class="vm-radio"><input type="radio" name="vmPictures" value="0" checked> <span>✕ '+esc(l('Not Added','لم تُضف'))+'</span></label>'+
          '<label class="vm-radio"><input type="radio" name="vmPictures" value="1"> <span>✓ '+esc(l('Pictures Added','تم إضافة الصور'))+'</span></label>'+
        '</div></div>'+
        '<div class="field vm-drop-field">'+esc(l('Visit Mail','إيميل الزيارة'))+
          '<div class="vm-drop" id="vmDrop"><div class="vm-drop-ico">📎</div><div class="vm-drop-title">'+esc(l('Drop Visit Mail here','أسقط الـ Visit Mail هنا'))+'</div><div class="vm-drop-sub">'+esc(l('Drag email from Outlook and drop it (.msg / .eml)','اسحب الإيميل من Outlook وأفلته (.msg / .eml)'))+'</div><label class="btn sm ghost vm-file-btn">'+esc(l('or choose file','أو اختر ملفاً'))+'<input type="file" id="vmEmail" accept=".eml,.msg" hidden></label><div class="vm-drop-status" id="vmDropStatus"></div></div>'+
        '</div>'+
      '</div><div class="form-actions"><button class="btn green" id="vmSave">'+esc(l('Save','حفظ'))+'</button><button class="btn gray" id="vmCancel">'+esc(l('Cancel','إلغاء'))+'</button></div>';
    const setEmail=f=>{
      if(!f)return;
      if(!/\.(msg|eml)$/i.test(f.name)){ toast(l('Only .msg or .eml email files','فقط ملفات .msg أو .eml')); return; }
      const r=new FileReader();
      r.onload=()=>{ pendingEmail={name:f.name,data:String(r.result)}; const st=$('#vmDropStatus'); if(st)st.innerHTML='<span class="vm-ok">✓ '+esc(l('Visit Mail Added','تم إضافة الـVisit Mail'))+'</span> <b>'+esc(f.name)+'</b>'; const dz=$('#vmDrop'); if(dz)dz.classList.add('has-file'); };
      r.onerror=()=>toast(l('Read failed','فشل قراءة الملف'));
      r.readAsDataURL(f);
    };
    const showForm=v=>{
      pendingEmail=null; editId=v?v.id:'';
      $('#vmForm').classList.add('open');
      $('#vmForm').innerHTML=form();
      const mSel=$('#vmMember'), bSel=$('#vmBranch');
      const syncB=()=>{ bSel.innerHTML=branchOpts(mSel.value,''); };
      mSel.addEventListener('change',syncB);
      const dz=$('#vmDrop');
      ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('dragover');}));
      dz.addEventListener('dragleave',e=>{e.preventDefault();dz.classList.remove('dragover');});
      dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragover');const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];if(f)setEmail(f);});
      $('#vmEmail').addEventListener('change',()=>{const f=$('#vmEmail').files[0];if(f)setEmail(f);});
      if(v){
        mSel.value=v.memberId||mSel.options[0].value; syncB(); bSel.value=v.branch||bSel.options[0].value;
        $('#vmVisitDate').value=v.visitDate||todayISO(); $('#vmRegion').value=v.region||'Cairo';
        $('#vmSent').value=v.mailSentDate||''; $('#vmComment').value=v.comment||'';
        const ex=v.sheetAdded===true||!!v.sheetName, pc=v.pictureAdded===true||!!v.pictureName||!!v.pictureData;
        const qx=(n,val)=>{const i=document.querySelector('input[name='+n+'][value="'+val+'"]'); if(i)i.checked=true;};
        qx('vmExcel',ex?1:0); qx('vmPictures',pc?1:0);
        if(v.emailData){ const st=$('#vmDropStatus'); if(st)st.innerHTML='<span class="vm-ok">✓ '+esc(l('Visit Mail Added','تم إضافة الـVisit Mail'))+'</span> <b>'+esc(v.emailName||'')+'</b>'; dz.classList.add('has-file'); }
      } else { syncB(); }
      $('#vmSave').addEventListener('click',async()=>{
        const visitDate=$('#vmVisitDate').value, memberId=mSel.value, branch=bSel.value, region=$('#vmRegion').value;
        if(!visitDate||!memberId||!branch){toast(l('Complete required fields','أكمل البيانات المطلوبة'));return;}
        const sheetAdded=$('input[name=vmExcel]:checked').value==='1';
        const pictureAdded=$('input[name=vmPictures]:checked').value==='1';
        let emailName='', emailData='';
        if(editId){ const old=Store.state.visitMails.find(x=>x.id===editId); if(old){ emailName=old.emailName||''; emailData=old.emailData||''; } }
        if(pendingEmail){ emailName=pendingEmail.name; emailData=pendingEmail.data; }
        const rec={visitDate,memberId,branch,region,mailSentDate:$('#vmSent').value||'',comment:$('#vmComment').value||'',sheetAdded,pictureAdded,emailName,emailData};
        const p = editId ? Store.updateVisitMail(editId,rec) : (rec.id=uid(), Store.addVisitMail(rec));
        $('#vmForm').classList.remove('open'); pendingEmail=null; editId=''; renderRows();
        Store.confirm(p, l('Saved','تم الحفظ'));
      });
      $('#vmCancel').addEventListener('click',()=>{$('#vmForm').classList.remove('open');pendingEmail=null;editId='';});
    };
    const renderRows=()=>{
      const m=$('#vmMonth').value, fm=$('#vmFilterMember').value, fb=$('#vmFilterBranch').value, view=$('#vmView').value;
      let rows=(Store.state.visitMails||[]).filter(v=>v.visitDate.startsWith(m)&&(!fm||v.memberId===fm)&&(!fb||v.branch===fb));
      const counts={ON_TIME:0,LATE:0,MISSING:0}; rows.forEach(v=>counts[mailStatus(v)]++);
      $('#vmKpis').innerHTML='<div class="kpi green-k"><span class="k-label">'+esc(l('On Time','في المعاد'))+'</span><span class="k-value">'+counts.ON_TIME+'</span></div><div class="kpi amber-k"><span class="k-label">LATE</span><span class="k-value">'+counts.LATE+'</span></div><div class="kpi red-k"><span class="k-label">MISSING</span><span class="k-value">'+counts.MISSING+'</span></div><div class="kpi blue-k"><span class="k-label">'+esc(l('Total Visits','إجمالي الزيارات'))+'</span><span class="k-value">'+rows.length+'</span></div>';
      const thead='<thead><tr><th>'+esc(view==='vm'?l('Visit Date','تاريخ الزيارة'):l('Area VM','Area VM'))+'</th><th>'+esc(l('Branch','الفرع'))+'</th><th>'+esc(l('Mail Sent','إرسال الميل'))+'</th><th>'+esc(l('Deadline','الموعد النهائي'))+'</th><th>'+esc(l('Status','الحالة'))+'</th><th>'+esc(l('Mail','الميل'))+'</th><th>'+esc(l('Excel','الإكسل'))+'</th><th>'+esc(l('Pictures','الصور'))+'</th><th>'+esc(l('Comment','التعليق'))+'</th><th>'+esc(l('Action','الإجراء'))+'</th></tr></thead>';
      const row=v=>{const dl=mailDeadline(v.visitDate,v.region);const st=mailStatus(v);const mailY=!!v.emailData;const exY=v.sheetAdded===true||!!v.sheetName;const picY=v.pictureAdded===true||!!v.pictureName||!!v.pictureData;return '<tr><td>'+esc(view==='vm'?v.visitDate:memberName(v.memberId))+'</td><td>'+esc(v.branch)+'</td><td>'+esc(v.mailSentDate||'—')+'</td><td>'+esc(dl.date+' '+dl.time)+'</td><td>'+badge(st)+'</td><td>'+okStr(mailY)+'</td><td>'+okStr(exY)+'</td><td>'+okStr(picY)+'</td><td>'+esc(v.comment||'—')+'</td><td>'+(mailY?'<button class="btn sm gray" data-open-mail="'+escAttr(v.id)+'">📎 '+esc(v.emailName||'Open')+'</button> ':'')+'<button class="icon-btn" data-edit-vm="'+escAttr(v.id)+'" title="'+esc(l('Edit','تعديل'))+'">✏️</button> <button class="icon-btn" data-del-mail="'+escAttr(v.id)+'">🗑️</button></td></tr>';};
      let html='';
      if(view==='vm'){
        const by={}; rows.forEach(v=>{(by[v.memberId]=by[v.memberId]||[]).push(v);});
        Store.state.members.forEach(mem=>{const list=(by[mem.id]||[]).sort((a,b)=>b.visitDate.localeCompare(a.visitDate));if(!list.length)return;html+='<div class="vm-group"><div class="vm-group-head">'+esc(Store.memberName(mem))+'</div><div class="table-wrap"><table class="tbl">'+thead+'<tbody>'+list.map(row).join('')+'</tbody></table></div></div>';});
      } else {
        const by={}; rows.forEach(v=>{(by[v.visitDate]=by[v.visitDate]||[]).push(v);});
        Object.keys(by).sort().reverse().forEach(d=>{const list=by[d].sort((a,b)=>memberName(a.memberId).localeCompare(memberName(b.memberId)));html+='<div class="vm-group"><div class="vm-group-head">'+esc(fmtDateLong(d))+'</div><div class="table-wrap"><table class="tbl">'+thead+'<tbody>'+list.map(row).join('')+'</tbody></table></div></div>';});
      }
      $('#vmTable').innerHTML=html||'<div class="empty">'+esc(l('No visit mails recorded.','لا توجد سجلات Visit Mail.'))+'</div>';
    };
    $('#vmNew').addEventListener('click',()=>showForm());
    ['vmMonth','vmFilterMember','vmFilterBranch','vmView'].forEach(id=>$( '#'+id).addEventListener('change',()=>{ if(id==='vmFilterMember') $('#vmFilterBranch').innerHTML=branchOpts($('#vmFilterMember').value,'',true); renderRows(); }));
    $('#vmTable').addEventListener('click',e=>{
      const ed=e.target.closest('[data-edit-vm]'); if(ed){ const v=Store.state.visitMails.find(x=>x.id===ed.dataset.editVm); if(v)showForm(v); return; }
      const b=e.target.closest('[data-del-mail]'); if(b){ Store.deleteVisitMail(b.dataset.delMail); renderRows(); return; }
      const o=e.target.closest('[data-open-mail]'); if(o){ const v=Store.state.visitMails.find(x=>x.id===o.dataset.openMail); if(v&&v.emailData){ const a=document.createElement('a'); a.href=v.emailData; a.download=v.emailName||'visit-mail.msg'; document.body.appendChild(a); a.click(); setTimeout(()=>document.body.removeChild(a),150); } else toast(l('Attachment not stored','المرفق غير محفوظ')); }
    });
    renderRows();
  };

  /* ---------------- Tasks Schedule ---------------- */
Views.tasksCalendar=function(root){
    const role=(window.DataService&&DataService.role)||'VIEWER';
    const canManageTasks=role==='ADMIN'||role==='OPERATION_MANAGER';
    const canDeleteTasks=role==='ADMIN';
    const taskStatusOptions=(current)=>{ const all=typeof TASK_STATUS!=='undefined'?TASK_STATUS:['CREATED','IN_PROGRESS','SUBMITTED','APPROVED','APPROVED_LATE','NEED_CORRECTION','OVERDUE']; if(canManageTasks)return all; const own=['CREATED','IN_PROGRESS','SUBMITTED']; return Array.from(new Set(own.concat(current||''))).filter(Boolean); };
    let month=todayISO().slice(0,7); let openIso='';
    const countFor=tasks=>{const c={total:tasks.length,done:0,ing:0,pend:0,over:0};tasks.forEach(x=>{const st=x.status;if(st==='APPROVED'||st==='APPROVED_LATE')c.done++;else if(st==='IN_PROGRESS')c.ing++;else if(st==='OVERDUE')c.over++;else c.pend++;});return c;};
    const byArea=tasks=>{const m={};tasks.forEach(x=>m[x.memberId]=(m[x.memberId]||0)+1);return m;};
    const daySummaryHtml=(iso,tasks)=>{
      const c=countFor(tasks), b=byArea(tasks);
      if(!tasks.length)return '<div class="task-empty">0 '+esc(l('Tasks','مهام'))+'</div>';
      return '<div class="task-counts"><b>'+c.total+'</b> '+esc(l('Tasks','مهام'))+'</div>'+
        '<div class="tc-line"><span class="tc-d"><i class="dot green"></i>'+c.done+'</span><span class="tc-i"><i class="dot amber"></i>'+c.ing+'</span><span class="tc-p"><i class="dot gray"></i>'+c.pend+'</span><span class="tc-o"><i class="dot red"></i>'+c.over+'</span></div>'+
        '<div class="tc-area">'+Store.state.members.filter(m=>b[m.id]).map(m=>'<span class="tc-avm">'+esc(Store.memberName(m))+' — <b>'+b[m.id]+'</b></span>').join('')+'</div>';
    };
    const dayPanelHtml=iso=>{
      const tasks=Store.state.tasks.filter(x=>(x.date||x.createdAt||'').slice(0,10)===iso);
      const b=byArea(tasks);
      let groups='';
      Store.state.members.forEach(m=>{const list=tasks.filter(x=>x.memberId===m.id);if(!list.length)return;groups+='<div class="tdp-group"><div class="tdp-group-head">'+esc(Store.memberName(m))+' — '+list.length+' '+esc(l('Tasks','مهام'))+'</div><div class="table-wrap"><table class="tbl"><thead><tr><th>'+esc(l('Task','المهمة'))+'</th><th>'+esc(l('Branch','الفرع'))+'</th><th>'+esc(l('Due','الموعد'))+'</th><th>'+esc(l('Status','الحالة'))+'</th><th></th></tr></thead><tbody>'+list.map(x=>'<tr><td>'+esc(x.title)+(x.comment?' <span class="tc-comment" title="'+esc(x.comment)+'">💬</span>':'')+'</td><td>'+esc(x.branch||'—')+'</td><td>'+esc(x.dueTime||(x.dueDate||'').slice(11,16)||'—')+'</td><td><select data-task-status="'+escAttr(x.id)+'">'+opts(taskStatusOptions(x.status),x.status)+'</select></td><td class="tdp-actions">'+(canManageTasks?'<button class="icon-btn" data-edit-task="'+escAttr(x.id)+'" title="'+esc(l('Edit','تعديل'))+'">✏️</button><button class="icon-btn" data-approve="'+escAttr(x.id)+'" title="Approve">✓</button><button class="icon-btn" data-approve-late="'+escAttr(x.id)+'" title="'+esc(l('Approve Late','موافقة متأخرة'))+'">⏳</button><button class="icon-btn" data-need-corr="'+escAttr(x.id)+'" title="'+esc(l('Need Correction','يحتاج تعديل'))+'">❗</button>':'')+'<button class="icon-btn" data-comment="'+escAttr(x.id)+'" title="'+esc(l('Comment','التعليق'))+'">💬</button>'+(canDeleteTasks?'<button class="icon-btn" data-delete-task="'+escAttr(x.id)+'" title="'+esc(l('Delete','حذف'))+'">🗑️</button>':'')+'</td></tr>').join('')+'</tbody></table></div></div>';});
      return '<div class="task-day-panel" id="taskDayPanel"><div class="tdp-head"><h3>📅 '+esc(fmtDateLong(iso))+'</h3><span class="tdp-count">'+tasks.length+' '+esc(l('Tasks','مهام'))+'</span><button class="btn sm gray" data-close-day>✕</button></div>'+(groups||'<div class="empty">'+esc(l('No tasks','لا توجد مهام'))+'</div>')+'</div>';
    };
    const render=()=>{
      const days=daysInMonth(month); let html='<div class="task-calendar">';
      for(let d=1;d<=days;d++){const iso=dateFor(month,d);const tasks=Store.state.tasks.filter(x=>(x.date||x.createdAt||'').slice(0,10)===iso); html+='<div class="task-day '+(iso===todayISO()?'today':'')+'" data-day="'+iso+'"><div class="task-day-head"><strong>'+d+'</strong><span>'+esc(fmtDate(iso))+'</span></div><div class="task-day-body">'+daySummaryHtml(iso,tasks)+'</div><button class="task-add-mini" data-add-task="'+iso+'">+ '+esc(l('Task','مهمة'))+'</button></div>';}
      html+='</div>'; $('#taskGrid').innerHTML=(Store.state.tasks.length?'':emptyStateHtml('No tasks scheduled.','Tasks will appear on the calendar once added.'))+html;
      const p=document.getElementById('taskDayPanel'); if(p&&openIso){ p.innerHTML=dayPanelHtml(openIso); }
    };
    root.innerHTML='<div class="page operational-page"><div class="page-head"><div class="page-title"><h1>✅ '+esc(l('Task Schedule','جدول المهام'))+'</h1><p>'+esc(l('Monthly schedule and follow-up','Schedule شهري ومتابعة التنفيذ'))+'</p></div><div class="spacer"></div>'+(canManageTasks?'<button class="btn" id="taskAdd">+ '+esc(l('Add Task','إضافة Task'))+'</button><button class="btn gray" id="taskImport">📥 '+esc(l('Import Excel','استيراد Excel'))+'</button>':'')+'</div><div class="card task-toolbar"><button class="btn ghost" id="taskPrev">←</button><input type="month" id="taskMonth" value="'+month+'"><button class="btn ghost" id="taskNext">→</button><span id="taskMonthLabel" class="cal-month"></span></div><div id="taskForm" class="form-panel"></div><div id="taskDayHost"></div><div id="taskGrid"></div></div>';
    const openForm=(date,task)=>{ const editId=task?task.id:''; const formDate=date||todayISO(); $('#taskForm').innerHTML='<div class="form-row cols-3">'+field(l('Task','المهمة'),'<input id="tkTitle" value="'+escAttr(task?.title||'')+'">')+field(l('Area VM','Area VM'),'<select id="tkMember">'+memberOpts(task?.memberId||'')+'</select>')+field(l('Branch','الفرع'),'<select id="tkBranch">'+branchOpts(task?.memberId||Store.state.members[0]?.id,task?.branch||'')+'</select>')+field(l('Date','التاريخ'),'<input type="date" id="tkDate" value="'+(task?.date||formDate)+'">')+field(l('Due Time','موعد التسليم'),'<input type="time" id="tkTime" value="'+(task?.dueTime||'14:00')+'">')+field(l('Priority','الأولوية'),'<select id="tkPriority">'+['HIGH','MEDIUM','LOW'].map(p=>'<option'+(p===(task?.priority||'MEDIUM')?' selected':'')+'>'+p+'</option>').join('')+'</select>')+field(l('Description','الوصف'),'<textarea id="tkDesc">'+esc(task?.description||'')+'</textarea>')+'</div><div class="form-actions"><button class="btn green" id="tkSave">'+esc(l('Save','حفظ'))+'</button><button class="btn gray" id="tkCancel">'+esc(l('Cancel','إلغاء'))+'</button></div>'; $('#taskForm').classList.add('open'); $('#tkMember').addEventListener('change',()=>$('#tkBranch').innerHTML=branchOpts($('#tkMember').value,task?.branch||'')); $('#tkSave').addEventListener('click',()=>{const title=$('#tkTitle').value.trim();if(!title){toast(l('Task title required','اكتب اسم التاسك'));return;}const date=$('#tkDate').value;const due=$('#tkTime').value;const rec={date,memberId:$('#tkMember').value,branch:$('#tkBranch').value,title,description:$('#tkDesc').value,priority:$('#tkPriority').value,dueDate:date+'T'+due,dueTime:due};const old=editId?Store.state.tasks.find(x=>x.id===editId):null;const tp=editId?Store.updateTask(editId,Object.assign({},old,rec)):Store.addTask(Object.assign({id:uid(),createdAt:new Date().toISOString(),status:'CREATED',comment:''},rec));$('#taskForm').classList.remove('open');openIso=openIso||date;Store.confirm(tp).then(r=>{if(r&&r.ok!==false)rerender();});}); $('#tkCancel').addEventListener('click',()=>$('#taskForm').classList.remove('open')); };
    const rerender=()=>{ render(); const p=document.getElementById('taskDayPanel'); if(p&&openIso){ p.innerHTML=dayPanelHtml(openIso); } };
    const renderHeader=()=>$('#taskMonthLabel').textContent=monthLabel(month);
    root.querySelector('#taskMonth').addEventListener('change',()=>{month=root.querySelector('#taskMonth').value;renderHeader();render();});
    root.querySelector('#taskPrev').addEventListener('click',()=>{let y=Number(month.slice(0,4)),mo=Number(month.slice(5,7))-1;if(mo===0){y-=1;mo=12;}month=String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0');root.querySelector('#taskMonth').value=month;renderHeader();render();});
    root.querySelector('#taskNext').addEventListener('click',()=>{let y=Number(month.slice(0,4)),mo=Number(month.slice(5,7))+1;if(mo===13){y+=1;mo=1;}month=String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0');root.querySelector('#taskMonth').value=month;renderHeader();render();});
    const taskAddBtn=root.querySelector('#taskAdd'); if(taskAddBtn)taskAddBtn.addEventListener('click',()=>openForm());
    const taskImportBtn=root.querySelector('#taskImport'); if(taskImportBtn)taskImportBtn.addEventListener('click',()=>ExcelImport.open('tasks'));
    root.addEventListener('click',e=>{
      const a=e.target.closest('[data-add-task]'); if(a){openForm(a.dataset.addTask);return;}
      const dy=e.target.closest('[data-day]'); if(dy){ openIso=dy.dataset.day; const host=$('#taskDayHost'); if(host)host.innerHTML=dayPanelHtml(openIso); if(host)host.scrollIntoView({behavior:'smooth',block:'nearest'}); return; }
      const cd=e.target.closest('[data-close-day]'); if(cd){ openIso=''; const p=document.getElementById('taskDayPanel'); if(p)p.remove(); return; }
      const et=e.target.closest('[data-edit-task]'); if(et){const t=Store.state.tasks.find(x=>x.id===et.dataset.editTask); if(t){openForm(t.date||todayISO(),t);}return;}
      const ap=e.target.closest('[data-approve]'); if(ap){Store.confirm(Store.updateTask(ap.dataset.approve,{status:'APPROVED'})).then(r=>{if(r&&r.ok!==false)rerender();});return;}
      const al=e.target.closest('[data-approve-late]'); if(al){Store.confirm(Store.updateTask(al.dataset.approveLate,{status:'APPROVED_LATE'})).then(r=>{if(r&&r.ok!==false)rerender();});return;}
      const nc=e.target.closest('[data-need-corr]'); if(nc){Store.confirm(Store.updateTask(nc.dataset.needCorr,{status:'NEED_CORRECTION'})).then(r=>{if(r&&r.ok!==false)rerender();});return;}
      const c=e.target.closest('[data-comment]'); if(c){const x=Store.state.tasks.find(t=>t.id===c.dataset.comment);const val=prompt(l('Comment','التعليق'),x?.comment||'');if(val!==null){Store.confirm(Store.updateTask(x.id,{comment:val})).then(r=>{if(r&&r.ok!==false)rerender();});}return;}
      const del=e.target.closest('[data-delete-task]'); if(del){Store.confirm(Store.deleteTask(del.dataset.deleteTask)).then(r=>{if(r&&r.ok!==false)rerender();});return;}
    });
    root.addEventListener('change',e=>{const s=e.target.closest('[data-task-status]');if(s){const v=s.value;Store.confirm(Store.updateTask(s.dataset.taskStatus,{status:v})).then(r=>{if(r&&r.ok!==false)rerender();else if(s)s.value=Store.state.tasks.find(t=>t.id===s.dataset.taskStatus)?.status||'';});}});
    renderHeader();render();
  };
  Views.tasks=Views.tasksCalendar;

  /* ---------------- Attendance ---------------- */
  Views.attendance=function(root){
    const m=todayISO().slice(0,7);
    root.innerHTML='<div class="page operational-page"><div class="page-head"><div class="page-title"><h1>🕘 '+esc(l('Attendance','الحضور'))+'</h1><p>'+esc(l('Daily attendance and punctuality','الحضور والالتزام بالمواعيد'))+'</p></div><div class="spacer"></div><button class="btn" id="attAdd">+ '+esc(l('Record Attendance','تسجيل حضور'))+'</button><button class="btn gray" id="attImport">📥 '+esc(l('Import Excel','استيراد Excel'))+'</button></div><div class="card"><div class="filters">'+field(l('Month','الشهر'),'<input type="month" id="attMonth" value="'+m+'">')+field(l('Area VM','Area VM'),'<select id="attMember">'+memberOpts('',true)+'</select>')+'</div><div id="attSummary" class="grid cols-5"></div><div class="table-wrap"><table class="tbl"><thead><tr><th>'+esc(l('Date','التاريخ'))+'</th><th>'+esc(l('Area VM','Area VM'))+'</th><th>'+esc(l('Check-in','الدخول'))+'</th><th>'+esc(l('Status','الحالة'))+'</th><th></th></tr></thead><tbody id="attRows"></tbody></table></div></div><div id="attForm" class="form-panel"></div></div>';
    const render=()=>{const month=$('#attMonth').value,mem=$('#attMember').value,rs=Store.state.attendance.filter(a=>(a.date||'').slice(0,7)===month&&(!mem||a.memberId===mem)).sort((a,b)=>b.date.localeCompare(a.date));const c={ON_TIME:0,LATE:0,ABSENT:0,OFF:0,WORK_MISSION:0};rs.forEach(r=>c[r.status]=(c[r.status]||0)+1);$('#attSummary').innerHTML=Object.entries(c).map(([k,v])=>'<div class="kpi '+statusClass(k)+'-k"><span class="k-label">'+esc(statusText(k))+'</span><span class="k-value">'+v+'</span></div>').join('')+'<div class="kpi"><span class="k-label">'+esc(l('Compliance','الالتزام'))+'</span><span class="k-value">'+(rs.length?Math.round(c.ON_TIME/rs.length*100)+'%':esc(l('No Data','لا توجد بيانات')))+'</span></div>';$('#attRows').innerHTML=rs.length?rs.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(memberName(r.memberId))+'</td><td>'+esc(r.checkIn||'—')+'</td><td>'+badge(r.status)+'</td><td><button class="icon-btn" data-att-del="'+escAttr(r.id)+'">🗑️</button></td></tr>').join(''):'<tr><td colspan="5" class="empty">'+esc(l('No attendance records','لا توجد سجلات حضور'))+'</td></tr>';};
    $('#attAdd').addEventListener('click',()=>{$('#attForm').classList.add('open');$('#attForm').innerHTML='<div class="form-row cols-3">'+field(l('Date','التاريخ'),'<input type="date" id="atDate" value="'+todayISO()+'">')+field(l('Area VM','Area VM'),'<select id="atMember">'+memberOpts('')+'</select>')+field(l('Check-in','وقت الدخول'),'<input type="time" id="atTime" value="09:00">')+field(l('Status','الحالة'),'<select id="atStatus">'+opts(ATT_STATUS,'ON_TIME')+'</select>')+'</div><div class="form-actions"><button class="btn green" id="atSave">'+esc(l('Save','حفظ'))+'</button></div>';$('#atSave').addEventListener('click',()=>{const date=$('#atDate').value,memberId=$('#atMember').value,status=$('#atStatus').value;const existing=Store.state.attendance.find(a=>a.date===date&&a.memberId===memberId);const ap=existing?Store.updateAttendance(existing.id,{checkIn:$('#atTime').value,status}):Store.addAttendance({id:uid(),date,memberId,checkIn:$('#atTime').value,status});$('#attForm').classList.remove('open');Store.confirm(ap,l('Saved','تم الحفظ')).then(r=>{if(r&&r.ok!==false)render();});});});
    $('#attMonth').addEventListener('change',render);$('#attMember').addEventListener('change',render);$('#attImport').addEventListener('click',()=>ExcelImport.open('attendance'));$('#attRows').addEventListener('click',e=>{const b=e.target.closest('[data-att-del]');if(b){Store.confirm(Store.deleteAttendance(b.dataset.attDel)).then(r=>{if(r&&r.ok!==false)render();});}});render();
  };

  /* ---------------- Money Map History ---------------- */
Views.moneyMapHistory=function(root){
    const month=todayISO().slice(0,7);
    root.innerHTML='<div class="page"><div class="page-head"><div class="page-title"><h1>🗺️ '+esc(l('Money Map History','سجل الـMoney Map'))+'</h1><p>'+esc(l('Daily snapshots and comparisons','تاريخ يومي ومقارنات'))+'</p></div></div><div class="card"><div class="filters">'+field(l('Month','الشهر'),'<input type="month" id="mmMonth" value="'+month+'">')+field(l('Date','التاريخ'),'<input type="date" id="mmDate">')+field(l('Area VM','Area VM'),'<select id="mmMember">'+memberOpts('', true)+'</select>')+field(l('Branch','الفرع'),'<select id="mmBranch">'+branchOpts('', '', true)+'</select>')+field(l('Status','الحالة'),'<select id="mmStatus"><option value="">'+esc(l('All','الكل'))+'</option><option value="attention">Attention</option><option value="ok">No Issues</option></select>')+'</div><div id="mmBox"></div></div></div>';
    const score=r=>(Number(r.codesNoLoc||0))+(Number(r.splitGroups||0))+(Number(r.emptyLoc||0))+(Number(r.stockRoom||0))+(Number(r.l0||0));
    const recStatus=r=>score(r)>0?'attention':'ok';
    const memberNameOf=rid=>{const m=Store.state.members.find(x=>x.id===rid);return m?Store.memberName(m):(rid||'—');};
    const render=()=>{
      const m=$('#mmMonth').value,d=$('#mmDate').value,mid=$('#mmMember').value,br=$('#mmBranch').value,st=$('#mmStatus').value;
      let rows=Store.state.moneyMapDaily.filter(r=>r.date&&r.date.startsWith(m)).slice();
      if(d) rows=rows.filter(r=>r.date===d);
      if(mid) rows=rows.filter(r=>r.memberId===mid);
      if(br) rows=rows.filter(r=>r.branch===br);
      if(st) rows=rows.filter(r=>recStatus(r)===st);
      rows.sort((a,z)=>z.date.localeCompare(a.date));
      const branches=[...new Set(Store.state.moneyMapDaily.filter(r=>r.date&&r.date.startsWith(m)).map(r=>r.branch))];
      const cmpHtml=branches.map(brk=>{
        const hist=Store.state.moneyMapDaily.filter(r=>r.branch===brk&&r.date&&r.date.startsWith(m)).sort((a,z)=>z.date.localeCompare(a.date));
        const cur=hist[0],prev=hist[1];if(!cur)return '';
        const cs=score(cur),ps=prev?score(prev):null;
        const dh=ps===null?null:(cs<ps?-1:(cs>ps?1:0));
        const dirLabel=dh===null?l('No data','لا بيانات'):(dh<0?l('Improved','تحسَّن'):(dh>0?l('Worsened','ازداد سوءاً'):l('Stable','مستقر')));
        const dirColor=dh===null?'var(--muted)':(dh<0?'var(--green)':(dh>0?'var(--red)':'var(--muted)'));
        return '<div class="mini-stat"><span class="ms-label">'+esc(brk)+' · '+esc(cur.date)+'</span><span class="ms-val">'+cs+'</span><span class="ms-label" style="margin-top:3px">'+(prev?('vs '+esc(prev.date)+' ('+ps+')'):'—')+' → <b style="color:'+dirColor+'">'+esc(dirLabel)+'</b></span></div>';
      }).join('');
      const body=rows.map(r=>{
        const prev=Store.state.moneyMapDaily.filter(x=>x.branch===r.branch&&x.date&&x.date<r.date).sort((a,z)=>z.date.localeCompare(a.date))[0];
        const cs=score(r),ps=prev?score(prev):null;
        const dh=ps===null?null:(cs<ps?-1:(cs>ps?1:0));
        const dirLabel=dh===null?'—':(dh<0?l('Improved','تحسَّن'):(dh>0?l('Worsened','ازداد سوءاً'):l('Stable','مستقر')));
        const dirColor=dh===null?'var(--muted)':(dh<0?'var(--green)':(dh>0?'var(--red)':'var(--muted)'));
        return '<tr><td>'+esc(r.date)+'</td><td>'+esc(memberNameOf(r.memberId))+'</td><td>'+esc(r.branch||'—')+'</td><td>'+esc(r.l0||0)+'</td><td>'+esc(r.codesNoLoc||0)+'</td><td>'+esc(r.emptyLoc||0)+'</td><td>'+esc(r.splitGroups||0)+'</td><td>'+esc(r.stockRoom||0)+'</td><td><b>'+cs+'</b></td><td><span class="'+(recStatus(r)==='attention'?'vm-no':'vm-ok')+'">'+esc(recStatus(r)==='attention'?'Attention':'OK')+'</span></td><td><span style="color:'+dirColor+';font-weight:600">'+esc(dirLabel)+'</span></td></tr>';
      }).join('');
      $('#mmBox').innerHTML=(cmpHtml?'<div class="members-mini" style="margin-bottom:10px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">'+cmpHtml+'</div>':'')+(rows.length?'<div class="table-wrap"><table class="tbl"><thead><tr><th>'+esc(l('Date','التاريخ'))+'</th><th>Area VM</th><th>'+esc(l('Branch','الفرع'))+'</th><th>L0</th><th>No Loc</th><th>Empty</th><th>Split</th><th>Stock</th><th>Score</th><th>'+esc(l('Status','الحالة'))+'</th><th>Trend</th></tr></thead><tbody>'+body+'</tbody></table></div>':'<div class="empty">'+esc(l('No snapshot data for this selection','لا توجد بيانات لهذا التحديد'))+'</div>');
    };
    const mm=$('#mmMonth'), md=$('#mmDate'), msel=$('#mmMember'), brsel=$('#mmBranch');
    mm.addEventListener('change',render); md.addEventListener('change',render);
    msel.addEventListener('change',()=>{const keep=brsel.value;const list=msel.value?branchesFor(msel.value):Array.from(new Set(Store.state.members.flatMap(m=>m.branches||[])));brsel.innerHTML='<option value="">'+esc(l('All branches','كل الفروع'))+'</option>'+list.map(b=>'<option value="'+escAttr(b)+'"'+(b===keep?' selected':'')+'>'+esc(b)+'</option>').join('');render();});
    brsel.addEventListener('change',render); $('#mmStatus').addEventListener('change',render);
    render();
  };

  /* ---------------- Month Compare ---------------- */
  Views.monthCompare=function(root){root.innerHTML='<div class="page"><div class="page-head"><div class="page-title"><h1>📊 '+esc(l('Month Compare','مقارنة الشهور'))+'</h1></div></div><div class="card"><div class="filters">'+field(l('Month A','الشهر الأول'),'<input type="month" id="cmpA" value="2026-09">')+field(l('Month B','الشهر الثاني'),'<input type="month" id="cmpB" value="'+todayISO().slice(0,7)+'">')+'</div><div id="cmpBox"></div></div></div>';const render=()=>{const a=$('#cmpA').value,b=$('#cmpB').value;let rows=[];if(Engine.monthCompare)try{rows=Engine.monthCompare(a,b)||[];}catch(e){rows=[];}$('#cmpBox').innerHTML=rows.length?'<div class="table-wrap"><table class="tbl"><thead><tr><th>Metric</th><th>'+esc(a)+'</th><th>'+esc(b)+'</th><th>Δ</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.key)+'</td><td>'+esc(r.a)+'</td><td>'+esc(r.b)+'</td><td>'+esc((r.deltaPct>0?'+':'')+r.deltaPct+'%')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">'+esc(l('Not enough data to compare yet','لا توجد بيانات كافية للمقارنة بعد'))+'</div>';};$('#cmpA').addEventListener('change',render);$('#cmpB').addEventListener('change',render);render();};


  /* ---------------- Management Dashboard ---------------- */
  Views.dashboard = function(root){
    const date=todayISO(), month=date.slice(0,7);
    const noOps = !Store.hasOperationalData();
    root.innerHTML='<div class="page operational-page"><div class="page-head"><div class="page-title"><h1>🏠 '+esc(l('Dashboard','لوحة المتابعة'))+'</h1><p>'+esc(l('Area VM monthly performance','أداء الـ Area VM الشهري'))+'</p></div></div>'+(noOps?emptyStateHtml('No operational data yet.','Enter daily reports, visits, Money Map, tasks or attendance to start tracking.'):'')+'<div class="card"><div class="filters">'+field(l('Date','التاريخ'),'<input type="date" id="dbDate" value="'+date+'">')+field(l('Month','الشهر'),'<input type="month" id="dbMonth" value="'+month+'">')+field(l('Area VM','Area VM'),'<select id="dbMember">'+memberOpts('',true)+'</select>')+field(l('Branch','الفرع'),'<select id="dbBranch">'+branchOpts('','',true)+'</select>')+'</div></div><div id="dbRanking"></div><div class="grid cols-2-lg"><div class="card"><div class="card-title">'+esc(l('Alerts','التنبيهات'))+'</div><div id="dbAlerts"></div></div><div class="card"><div class="card-title">'+esc(l('Monthly Summary','ملخص الشهر'))+'</div><div id="dbSummary"></div></div></div><div class="card"><div class="card-title">✅ '+esc(l('Task Schedule','جدول المهام'))+'</div><div id="dbTasks"></div></div></div>';
    const NA='<span class="badge gray">'+esc(l('No Data','لا توجد بيانات'))+'</span>';
    const pct=(n,d)=>d?Math.round(n/d*100):null;
    const fmt=v=>v===null?NA:esc(v+'%');
    const paper=s=>s===null?'#888':(s<60?'var(--red)':(s<90?'var(--amber)':'var(--green)'));
    const daily=(m,d,b)=>{const bs=(m.branches||[]).filter(x=>!b||x===b);const rs=(Store.state.dailyBranchReports||[]).filter(x=>x.date===d&&x.memberId===m.id&&(!b||x.branch===b));return rs.length?pct(rs.filter(x=>x.status==='DONE').length,bs.length):null};
    const mail=(m,mo,b)=>{const rs=(Store.state.visitMails||[]).filter(v=>v.memberId===m.id&&v.visitDate.startsWith(mo)&&(!b||v.branch===b));return pct(rs.filter(v=>mailStatus(v)==='ON_TIME').length,rs.length)};
    const videoStatus=(m,mo,b,key)=>{const rs=(Store.state.videos||[]).filter(v=>v.memberId===m.id&&v.date.startsWith(mo)&&(!b||v.branch===b));return pct(rs.filter(v=>(v[key]||'')==='DONE').length,rs.length)};
    const mm=(m,mo,b)=>{const rs=(Store.state.moneyMapDaily||[]).filter(v=>v.memberId===m.id&&v.date.startsWith(mo)&&(!b||v.branch===b));return rs.length?Math.round(rs.filter(v=>(v.codesNoLoc||0)+(v.splitGroups||0)+(v.emptyLoc||0)+(v.stockRoom||0)+(v.l0||0)===0).length/rs.length*100):null};
    const att=(m,mo,b)=>{const rs=(Store.state.attendance||[]).filter(v=>v.memberId===m.id&&v.date.startsWith(mo)&&(!b||v.branch===b));return pct(rs.filter(v=>v.status==='ON_TIME').length,rs.length)};
    const visits=(m,mo,b)=>{const rs=(Store.state.visits||[]).filter(v=>v.memberId===m.id&&v.date.startsWith(mo)&&(!b||v.branch===b));return pct(rs.filter(v=>v.status==='DONE').length,rs.length)};
    const render=()=>{const d=$('#dbDate').value,mo=$('#dbMonth').value,mem=$('#dbMember').value,bv=$('#dbBranch').value;const rows=Store.state.members.filter(m=>!mem||m.id===mem).map(m=>{const vals={daily:daily(m,d,bv),mail:mail(m,mo,bv),vin:videoStatus(m,mo,bv,'videoIn'),vout:videoStatus(m,mo,bv,'videoOut'),map:mm(m,mo,bv),att:att(m,mo,bv),vis:visits(m,mo,bv)};const nums=Object.values(vals).filter(v=>v!==null);const overall=nums.length?Math.round(nums.reduce((a,b)=>a+b,0)/nums.length):null;return {m,vals,overall};}).sort((a,b)=>(b.overall===null?-1:b.overall)-(a.overall===null?-1:a.overall));
      $('#dbRanking').innerHTML='<div class="card"><div class="card-title">'+esc(l('Area VM Performance','ترتيب أداء الـ Area VM'))+'</div><div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>'+esc(l('Area VM','Area VM'))+'</th><th>'+esc(l('Daily Reports','التقارير اليومية'))+'</th><th>'+esc(l('Visit Mail','Visit Mail'))+'</th><th>'+esc(l('Video In','Video In'))+'</th><th>'+esc(l('Video Out','Video Out'))+'</th><th>'+esc(l('Money Map','Money Map'))+'</th><th>'+esc(l('Attendance','الحضور'))+'</th><th>'+esc(l('Visit Plan','خطة الزيارات'))+'</th><th>'+esc(l('Overall','الإجمالي'))+'</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr><td><b>'+(i+1)+'</b></td><td class="rowhead">'+esc(memberName(r.m.id))+'</td>'+Object.values(r.vals).map(v=>'<td>'+(v===null?NA:'<span class="pill" style="display:inline-block;padding:2px 8px;border-radius:20px;color:#fff;background:'+paper(v)+'">'+v+'%</span>')+'</td>').join('')+'<td><b>'+(r.overall===null?NA:r.overall+'%')+'</b></td></tr>').join('')+'</tbody></table></div></div>';
      const alerts=[];rows.forEach(r=>{const comps=[['Daily Reports',r.vals.daily],['Visit Mail',r.vals.mail],['Video In',r.vals.vin],['Video Out',r.vals.vout],['Money Map',r.vals.map],['Attendance',r.vals.att],['Visit Plan',r.vals.vis]];comps.forEach(([label2,val])=>{if(val===null||val>=100)return;const cls2=val<60?'red':(val<90?'amber':'green');alerts.push('<div class="alert-row">'+esc(memberName(r.m.id))+' · '+esc(label2)+' <span class="badge '+cls2+'">'+val+'%</span></div>');});});$('#dbAlerts').innerHTML=alerts.slice(0,20).join('')||'<div class="empty">'+esc(l('No critical gaps','لا توجد فجوات حرجة'))+'</div>';
      const tk=(Store.state.tasks||[]).filter(x=>(x.date||x.createdAt||'').slice(0,7)===mo&&(!mem||x.memberId===mem)&&(!bv||x.branch===bv));const counts={};tk.forEach(x=>counts[x.status]=(counts[x.status]||0)+1);const pills=TASK_STATUS.map(s=>'<span class="badge '+statusClass(s)+'">'+esc(statusText(s))+' '+(counts[s]||0)+'</span>').join(' ');$('#dbTasks').innerHTML=(pills?'<div class="members-mini" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">'+pills+'</div>':'')+'<div class="table-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>'+esc(l('Task','المهمة'))+'</th><th>'+esc(l('Area VM','Area VM'))+'</th><th>'+esc(l('Date','التاريخ'))+'</th><th>'+esc(l('Status','الحالة'))+'</th></tr></thead><tbody>'+tk.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,6).map(x=>'<tr><td>'+esc(x.title)+'</td><td>'+esc(memberName(x.memberId))+'</td><td>'+esc(fmtDate(x.date||x.createdAt||''))+'</td><td>'+badge(x.status)+'</td></tr>').join('')+'</tbody></table></div>';
      const avg=rows.reduce((a,r)=>a+(r.overall===null?0:r.overall),0);const cnt=rows.filter(r=>r.overall!==null).length;$('#dbSummary').innerHTML='<div class="grid cols-2"><div class="kpi blue-k"><span class="k-label">'+esc(l('Month','الشهر'))+'</span><span class="k-value">'+esc(mo)+'</span></div><div class="kpi green-k"><span class="k-label">'+esc(l('Network Overall','الإجمالي'))+'</span><span class="k-value">'+(cnt?Math.round(avg/cnt)+'%':esc(l('No Data','لا توجد بيانات')))+'</span></div></div>';};
    const syncDbBranch=()=>{const m=$('#dbMember').value;const keep=$('#dbBranch').value;$('#dbBranch').innerHTML=branchOpts(m,'',true);if(keep)$('#dbBranch').value=keep;};
    $('#dbDate').addEventListener('change',render);$('#dbMonth').addEventListener('change',render);$('#dbMember').addEventListener('change',()=>{syncDbBranch();render();});$('#dbBranch').addEventListener('change',render);syncDbBranch();render();
  };

  /* ---------------- Daily Control summary ---------------- */
  Views.dailyControlSummary=Views.dailyControl;

  function bindSpeech(root){ root.querySelectorAll('[data-speech-target]').forEach(btn=>btn.addEventListener('click',()=>{const target=root.querySelector('#'+btn.dataset.speechTarget);if(window.VMSpeech&&VMSpeech.start){VMSpeech.start(target);}else if('webkitSpeechRecognition' in window){const R=window.webkitSpeechRecognition;const r=new R();r.lang=LANG==='ar'?'ar-EG':'en-US';r.interimResults=false;r.onresult=e=>target.value=(target.value?target.value+' ':'')+e.results[0][0].transcript;r.start();}else toast(l('Speech input is not supported by this browser','التسجيل الصوتي غير مدعوم في المتصفح'))})); }
  window.bindVMSpeech=bindSpeech;

  // The app router uses the project's {html, init} view contract.
  // Wrap the imperative core views so they render into the supplied mount node.
  ['dashboard','dailyControl','visitMail','tasksCalendar','attendance','moneyMapHistory','monthCompare'].forEach(function(name){
    const impl = Views[name];
    Views[name] = function(root){
      if (root) return impl(root);
      return { html:'<div id=\"viewMount\"></div>', init:function(el){ impl(el); } };
    };
  });
  Views.tasks = Views.tasksCalendar;
})();
