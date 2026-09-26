/* ============================================================
   Auth — password login with persistent Supabase session.
   No OTP: email + password signs in directly. Session persists until logout.
   ============================================================ */
window.Auth = (function () {
  var cfg = window.VM_CONFIG && window.VM_CONFIG.isConfigured;
  var shown = false;
  var resolveFn = null;

  function ensureCss() {
    if (document.getElementById('authCss')) return;
    var style = document.createElement('style');
    style.id = 'authCss';
    style.textContent =
      '#authOverlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(10,15,30,.72);backdrop-filter:blur(4px)}' +
      '#authBox{width:min(92vw,360px);background:#fff;border-radius:14px;padding:26px 22px;box-shadow:0 18px 60px rgba(0,0,0,.45);font-family:system-ui,Segoe UI,sans-serif}' +
      '#authBox h2{margin:0 0 4px;font-size:19px;color:#0f2740}' +
      '#authBox p{margin:0 0 16px;font-size:12.5px;color:#5b6b7c;line-height:1.5}' +
      '#authBox input{width:100%;box-sizing:border-box;margin:0 0 10px;padding:10px 12px;border:1px solid #ccd6e0;border-radius:8px;font-size:14px;outline:none}' +
      '#authBox input:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.15)}' +
      '#authBox .authErr{color:#c0392b;font-size:12.5px;min-height:16px;margin:0 0 6px}' +
      '#authBox button{width:100%;padding:11px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:14px;font-weight:600;cursor:pointer}' +
      '#authBox button:disabled{opacity:.6}' +
      '#authBox .authAlt{margin-top:10px;font-size:11.5px;color:#8a97a6;text-align:center}' +
      '#authBox .authBack{background:#eef2f7;color:#29425c;margin-top:8px}' +
      '#authOverlay[data-lang=ar] *{direction:rtl;text-align:right}' +
      '#authBox label{display:block;font-size:12px;color:#42536b;margin:0 0 4px}';
    document.head.appendChild(style);
  }

  function withTimeout(p, ms) {
    var settled = false;
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { if (!settled) { settled = true; reject(new Error('Request timed out after ' + ms + 'ms')); } }, ms);
      p.then(function (v) { if (settled) return; settled = true; clearTimeout(t); resolve(v); },
             function (e) { if (settled) return; settled = true; clearTimeout(t); reject(e); });
    });
  }

  function renderCredentials(ov, ar) {
    step = 'credentials';
    ov.querySelector('#authBody').innerHTML =
      '<p>' + (ar ? 'اكتب البريد الإلكتروني وكلمة المرور للدخول مباشرة.' : 'Enter your email and password to sign in directly.') + '</p>' +
      '<label for="authEmail">' + (ar ? 'البريد الإلكتروني' : 'Email') + '</label>' +
      '<input id="authEmail" type="email" autocomplete="username" placeholder="you@domain.com">' +
      '<label for="authPass">' + (ar ? 'كلمة المرور' : 'Password') + '</label>' +
      '<input id="authPass" type="password" autocomplete="current-password">' +
      '<div class="authErr" id="authErr"></div>' +
      '<button id="authBtn">' + (ar ? 'تسجيل الدخول' : 'Sign in') + '</button>';
    var btn=ov.querySelector('#authBtn'), errEl=ov.querySelector('#authErr');
    function attempt(){
      var email=ov.querySelector('#authEmail').value.trim().toLowerCase(), pass=ov.querySelector('#authPass').value;
      if(!email||!pass){errEl.textContent=ar?'أدخل البريد وكلمة المرور':'Enter email and password';return;}
      btn.disabled=true; btn.textContent=ar?'جارٍ تسجيل الدخول…':'Signing in…';
      window.__SB_PRELOAD.then(function(sb){
        if(!sb) throw new Error(ar?'الخادم غير متاح':'Backend unavailable');
        return withTimeout(sb.auth.signInWithPassword({email:email,password:pass}),15000);
      }).then(function(r){
        if(r&&r.error) throw r.error;
        var session=r&&r.data&&r.data.session;
        if(!session) throw new Error(ar?'لم يتم إنشاء جلسة':'No authenticated session returned');
        teardown(ov,session,null);
      }).catch(function(e){
        errEl.textContent=String((e&&e.message)||e);
        btn.disabled=false;
        btn.textContent=ar?'تسجيل الدخول':'Sign in';
      });
    }
    btn.addEventListener('click',attempt);
    ov.querySelector('#authPass').addEventListener('keydown',function(e){if(e.key==='Enter')attempt();});
    ov.querySelector('#authEmail').focus();
  }

  function showLogin() {
    if(!cfg) return Promise.resolve(null);
    if(shown&&resolveFn) return new Promise(function(res){resolveFn=res;});
    shown=true;
    return new Promise(function(resolve){
      resolveFn=resolve; ensureCss();
      var ar=(typeof LANG!=='undefined'&&LANG==='ar');
      var ov=document.createElement('div'); ov.id='authOverlay'; ov.setAttribute('data-lang',ar?'ar':'en');
      ov.innerHTML='<div id="authBox"><h2>'+(ar?'تسجيل الدخول':'Sign in to Area VM')+'</h2><div id="authBody"></div><div class="authAlt">'+(ar?'ستظل مسجّل الدخول على هذا الجهاز حتى تسجّل الخروج.':'Your session stays signed in on this device until you log out.')+'</div></div>';
      document.body.appendChild(ov); renderCredentials(ov,ar);
    });
  }

  function teardown(ov,session,failReason){
    if(ov&&ov.parentNode)ov.parentNode.removeChild(ov); shown=false; var res=resolveFn;resolveFn=null;if(res)res(session);
    if(failReason&&window.DataService&&DataService.goOffline)window.DataService.goOffline('Login failed: '+failReason);
  }
  function changePassword(newPassword) {
    if (!newPassword || String(newPassword).length < 6) {
      return Promise.resolve({ ok:false, error:'Password must be at least 6 characters' });
    }
    return window.__SB_PRELOAD.then(function(sb){
      if(!sb) throw new Error('Backend unavailable');
      return withTimeout(sb.auth.updateUser({password:String(newPassword)}),15000);
    }).then(function(r){
      if(r&&r.error) throw r.error;
      return { ok:true };
    }).catch(function(e){
      return { ok:false, error:String((e&&e.message)||e) };
    });
  }

  function current(){if(!DataService)return null;return {role:DataService.role,areas:DataService.areas,user:DataService.user,mode:DataService.mode};}
  return {showLogin:showLogin,current:current,changePassword:changePassword,isRemote:function(){return !!cfg;}};
})();
