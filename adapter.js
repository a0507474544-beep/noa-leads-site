// Supabase stand-in for the claude.ai artifact runtime, so index.html runs unchanged on Vercel.
// Loaded before the app's own <script>. Needs window.supabase (supabase-js UMD) and window.NOA_CONFIG.
// Implements: window.claude.use('db'|'assets'|'downloads'|'user'|'mcp'),
//             fetch('leads.json') and fetch('/_blob/<id>') (served from Supabase, only after sign-in).
// Sign-in: email + password (first time / forgot: a link by email, then choose a password); Google when CFG.googleLogin.
// Nothing is readable until the email is in allowed_users.
(function () {
  'use strict';
  const CFG = window.NOA_CONFIG || {};
  const PAGE = 1000;
  const BUCKET = 'cv';

  // ---------- login gate ----------
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });
  let sb = null, me = { email: '', role: null };

  const css = `
  #noaGate{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:24px;direction:rtl;
    font-family:"Heebo",Arial,sans-serif;color:#e6f1f0;
    background:radial-gradient(900px 500px at 85% -10%,rgba(63,193,184,.35),transparent 60%),
      radial-gradient(800px 500px at 0% 110%,rgba(46,112,168,.30),transparent 60%),
      linear-gradient(160deg,#145063,#0e3a44 55%,#08232a)}
  #noaGate[hidden]{display:none!important}
  #noaGate .card{width:min(420px,100%);text-align:center;padding:36px 30px 30px;border-radius:24px;
    background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04));
    border:1px solid rgba(143,211,196,.25);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 30px 80px -20px rgba(0,0,0,.6)}
  #noaGate .mono{width:76px;height:76px;margin:0 auto 18px;border-radius:20px;display:grid;place-items:center;
    font-family:"Frank Ruhl Libre",Georgia,serif;font-weight:700;font-size:42px;color:#fff;padding-bottom:5px;
    background:linear-gradient(155deg,#3fc1b8,#2aa3ad 45%,#1c7b82);text-shadow:0 2px 2px rgba(8,35,42,.35);
    box-shadow:inset 0 2px 0 rgba(255,255,255,.45),inset 0 -5px 10px rgba(8,35,42,.3),0 5px 0 #0f4f55,0 20px 40px -10px rgba(28,123,130,.8)}
  #noaGate h1{font-family:"Frank Ruhl Libre",Georgia,serif;font-weight:700;font-size:30px;margin:0 0 4px}
  #noaGate .sub{color:rgba(230,241,240,.72);margin:0 0 26px;font-size:15px}
  #noaGate button{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;
    font:600 15px "Heebo",Arial,sans-serif;color:#143038;padding:13px 18px;border-radius:13px;border:1px solid #c9dbd9;
    background:linear-gradient(180deg,#fff,#eef4f3);
    box-shadow:inset 0 1px 0 #fff,0 3px 0 #9fb9b6,0 14px 26px -12px rgba(0,0,0,.6);transition:transform .14s,box-shadow .14s}
  #noaGate button:hover{transform:translateY(-1px)}
  #noaGate button:active{transform:translateY(2px);box-shadow:inset 0 1px 2px rgba(14,58,68,.2)}
  #noaGate button[disabled]{opacity:.6;cursor:default;transform:none}
  #noaGate input{width:100%;box-sizing:border-box;margin:0 0 12px;padding:12px 14px;border-radius:13px;direction:ltr;text-align:left;
    font:15px "Heebo",Arial,sans-serif;color:#143038;background:#fff;border:1px solid #c9dbd9}
  #noaGate .or{margin:16px 0;font-size:13px;color:rgba(230,241,240,.55)}
  #noaGate [hidden]{display:none!important}
  #noaGate button.link{width:auto;margin:12px auto 0;padding:6px 8px;background:none;border:0;box-shadow:none;color:#8fd3c4;font-weight:500;font-size:14px;text-decoration:underline}
  #noaGate .hint{margin:0 0 14px;font-size:14px;color:rgba(230,241,240,.8)}
  #noaGate .msg{min-height:22px;margin-top:16px;font-size:14px;color:#f0c96a}
  #noaGate .foot{margin-top:22px;font-size:12px;color:rgba(230,241,240,.5)}`;
  const gate = document.createElement('div');
  gate.id = 'noaGate';
  gate.innerHTML = `<style>${css}</style><div class="card" role="dialog" aria-labelledby="noaGateT">
    <div class="mono" aria-hidden="true">נ</div>
    <h1 id="noaGateT">נועה גיוס והשמה</h1>
    <p class="sub">מערכת הלידים · כניסה לצוות בלבד</p>
    <div id="noaGWrap" hidden><button type="button" id="noaSignIn"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>כניסה עם Google</button><div class="or">או</div></div>
    <form id="noaPwForm"><input type="email" id="noaEmail" required autocomplete="username" placeholder="name@example.com" aria-label="כתובת מייל"><input type="password" id="noaPw" required autocomplete="current-password" placeholder="סיסמה" aria-label="סיסמה"><button type="submit" id="noaPwBtn">כניסה</button>
      <button type="button" class="link" id="noaForgotLink">שכחתי סיסמה / כניסה ראשונה</button></form>
    <form id="noaMailForm" hidden><p class="hint">נשלח למייל שלך קישור. לחיצה עליו תכניס אותך, ואז תבחר סיסמה.</p><input type="email" id="noaEmail2" required autocomplete="email" placeholder="name@example.com" aria-label="כתובת מייל"><button type="submit" id="noaMailBtn">שליחת קישור למייל</button>
      <button type="button" class="link" id="noaBackLink">חזרה לכניסה עם סיסמה</button></form>
    <form id="noaSetForm" hidden><p class="hint">בחר סיסמה לכניסות הבאות (לפחות 8 תווים).</p><input type="password" id="noaNew1" required minlength="8" autocomplete="new-password" placeholder="סיסמה חדשה" aria-label="סיסמה חדשה"><input type="password" id="noaNew2" required minlength="8" autocomplete="new-password" placeholder="שוב את הסיסמה" aria-label="אימות סיסמה"><button type="submit" id="noaSetBtn">שמירת סיסמה וכניסה</button></form>
    <div class="msg" id="noaGateMsg" role="status"></div>
    <div class="foot">הגישה מוגבלת לאנשי הצוות המורשים. כל פעולה נשמרת עם שם המשתמש.</div>
  </div>`;
  document.body.appendChild(gate);
  const gateMsg = t => { gate.querySelector('#noaGateMsg').textContent = t || ''; };
  const signInBtn = gate.querySelector('#noaSignIn');
  const $g = s => gate.querySelector(s);
  const mailBtn = $g('#noaMailBtn'), pwBtn = $g('#noaPwBtn'), setBtn = $g('#noaSetBtn');
  const forms = { pw: $g('#noaPwForm'), mail: $g('#noaMailForm'), set: $g('#noaSetForm') };
  const show = k => { Object.entries(forms).forEach(([n, f]) => { f.hidden = n !== k; }); $g('#noaGWrap').hidden = !(CFG.googleLogin && k === 'pw'); };
  show('pw');

  if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseAnonKey) {
    signInBtn.disabled = true; mailBtn.disabled = true; pwBtn.disabled = true;
    gateMsg('המערכת עדיין לא מוגדרת (חסרים פרטי חיבור ל-Supabase).');
  } else {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    signInBtn.onclick = async () => {
      signInBtn.disabled = true; gateMsg('מעביר לכניסה עם Google…');
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
      });
      if (error) { signInBtn.disabled = false; gateMsg('הכניסה לא הצליחה. נסו שוב.'); }
    };
    $g('#noaForgotLink').onclick = () => { $g('#noaEmail2').value = $g('#noaEmail').value; gateMsg(''); show('mail'); };
    $g('#noaBackLink').onclick = () => { gateMsg(''); show('pw'); };

    // email + password
    forms.pw.onsubmit = async e => {
      e.preventDefault();
      const email = $g('#noaEmail').value.trim().toLowerCase(), password = $g('#noaPw').value;
      if (!email || !password) return;
      pwBtn.disabled = true; gateMsg('נכנס…');
      const { error } = await sb.auth.signInWithPassword({ email, password });
      pwBtn.disabled = false;
      if (error) gateMsg(error.status === 429 ? 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.'
        : 'המייל או הסיסמה לא נכונים. בכניסה הראשונה, או אם שכחתם, לחצו "שכחתי סיסמה".');
      else gateMsg('');
    };
    // first time / forgot password: a link by email, then choose a password
    forms.mail.onsubmit = async e => {
      e.preventDefault();
      const email = $g('#noaEmail2').value.trim().toLowerCase();
      if (!email) return;
      mailBtn.disabled = true; gateMsg('שולח…');
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
      mailBtn.disabled = false;
      gateMsg(error ? (error.status === 429 ? 'נשלחו יותר מדי קישורים. נסו שוב בעוד שעה.' : 'השליחה לא הצליחה. בדקו את כתובת המייל ונסו שוב.')
                    : `שלחנו קישור ל-${email}. פתחו את המייל ולחצו עליו.`);
    };
    // choose / change password (after signing in by link)
    let recovering = false;
    forms.set.onsubmit = async e => {
      e.preventDefault();
      const p1 = $g('#noaNew1').value, p2 = $g('#noaNew2').value;
      if (p1.length < 8) { gateMsg('הסיסמה צריכה להיות לפחות 8 תווים.'); return; }
      if (p1 !== p2) { gateMsg('שתי הסיסמאות לא זהות.'); return; }
      setBtn.disabled = true; gateMsg('שומר…');
      const { error } = await sb.auth.updateUser({ password: p1, data: { has_password: true } });
      setBtn.disabled = false;
      if (error) { gateMsg(/same|different/i.test(error.message) ? 'זו הסיסמה הקיימת. בחרו סיסמה אחרת.' : (/weak|short|characters/i.test(error.message) ? 'הסיסמה חלשה מדי. נסו סיסמה ארוכה יותר.' : 'השמירה לא הצליחה. נסו שוב.')); return; }
      $g('#noaNew1').value = $g('#noaNew2').value = '';
      recovering = false; gateMsg(''); enter();
    };

    let checked = '', pending = null;
    function enter() {
      if (!pending) return;
      me = pending; pending = null;
      gate.hidden = true;
      addSignOut();
      resolveReady();
    }
    const onSession = async session => {
      if (!session) { gate.hidden = false; signInBtn.disabled = false; mailBtn.disabled = false; pwBtn.disabled = false; show('pw'); return; }
      const email = (session.user.email || '').toLowerCase();
      if (checked === email) return;
      checked = email;
      const { data, error } = await sb.from('allowed_users').select('role,name').eq('email', email).maybeSingle();
      if (error || !data) {
        checked = '';
        gateMsg(error ? 'לא הצלחתי לבדוק הרשאות. רעננו את הדף.' : `לחשבון ${email} אין גישה למערכת. פנו למנהל המערכת.`);
        await sb.auth.signOut();
        signInBtn.disabled = false; show('pw');
        return;
      }
      pending = { email, role: data.role, name: data.name || '' };
      const hasPw = session.user.user_metadata && session.user.user_metadata.has_password;
      if (recovering || !hasPw) { gate.hidden = false; gateMsg(''); show('set'); setTimeout(() => $g('#noaNew1').focus(), 30); return; }
      enter();
    };
    // a used or expired sign-in link comes back as #error=...&error_code=otp_expired
    const hashErr = new URLSearchParams(location.hash.slice(1));
    if (hashErr.get('error')) {
      gateMsg(hashErr.get('error_code') === 'otp_expired' ? 'קישור הכניסה כבר נוצל או שפג תוקפו. בקשו קישור חדש.' : 'הכניסה דרך הקישור לא הצליחה. בקשו קישור חדש.');
      history.replaceState(null, '', location.pathname + location.search);
    }
    sb.auth.getSession().then(({ data }) => onSession(data.session));
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') { recovering = true; checked = ''; }
      if (ev === 'SIGNED_OUT') { if (me.role) location.reload(); }   // denied users stay on the gate with the message
      else if (session) onSession(session);
    });
  }

  function addSignOut() {
    const top = document.querySelector('.deck .top');
    if (!top || document.getElementById('signOutBtn')) return;
    const b = document.createElement('button');
    b.className = 'btn'; b.type = 'button'; b.id = 'signOutBtn';
    b.textContent = 'יציאה'; b.title = me.email;
    b.onclick = () => sb.auth.signOut();
    top.appendChild(b);
  }

  // ---------- helpers ----------
  async function selectAll(build) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build().range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < PAGE) return out;
    }
  }
  const fail = (e, code) => { const err = new Error((e && e.message) || code); err.code = code; throw err; };
  const newId = () => Date.now().toString(16) + Math.random().toString(16).slice(2, 10);

  // ---------- db (same shape as the artifact db) ----------
  const cols = {};
  function colState(name) {
    if (cols[name]) return cols[name];
    const st = cols[name] = { map: new Map(), subs: new Set(), loaded: false, started: false };
    st.emit = () => {
      const docs = [...st.map].map(([id, v]) => ({ id, data: () => v }));
      st.subs.forEach(s => { try { s.cb({ docs, metadata: { fromCache: false } }); } catch (e) { console.error(e); } });
    };
    st.start = async () => {
      if (st.started) return; st.started = true;
      try {
        sb.channel('docs-' + name)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'collection=eq.' + name }, p => {
            if (p.eventType === 'DELETE') st.map.delete(p.old.id); else st.map.set(p.new.id, p.new.data);
            if (st.loaded) st.emit();
          })
          .subscribe();
        const rows = await selectAll(() => sb.from('docs').select('id,data').eq('collection', name).order('id'));
        rows.forEach(r => st.map.set(r.id, r.data));
        st.loaded = true; st.emit();
      } catch (e) {
        st.started = false;
        st.subs.forEach(s => s.err && s.err(e));
      }
    };
    return st;
  }
  const db = {
    collection(name) {
      return {
        onSnapshot(cb, err) {
          const st = colState(name), sub = { cb, err };
          st.subs.add(sub);
          if (st.loaded) setTimeout(st.emit, 0); else st.start();
          return () => st.subs.delete(sub);
        },
        doc(id) {
          return {
            id,
            async set(data) {
              if (me.role !== 'editor') fail(null, 'permission_denied');
              const { error } = await sb.from('docs').upsert({ collection: name, id, data });
              if (error) fail(error, 'write_failed');
              const st = colState(name); st.map.set(id, data); if (st.loaded) st.emit();
            },
            async delete() {
              const { error } = await sb.from('docs').delete().match({ collection: name, id });
              if (error) fail(error, 'write_failed');
              const st = colState(name); st.map.delete(id); if (st.loaded) st.emit();
            },
          };
        },
        async add(data) { const id = newId(); await this.doc(id).set(data); return { id }; },
      };
    },
  };

  // ---------- assets (private storage bucket) ----------
  const assets = {
    async upload(blob) {
      const id = (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : newId());
      const { error } = await sb.storage.from(BUCKET).upload(id, blob, { contentType: blob.type || 'application/octet-stream' });
      if (error) fail(error, /exceed|quota|size/i.test(error.message) ? 'quota_or_state' : 'upload_failed');
      return { id };
    },
    async list() {
      // Supabase Pro has ample room; report a large quota so the app's space checks never block.
      return { files: [], usage: { bytes: 0, files: 0, maxBytes: 100 * 1024 ** 3, maxFiles: 1e7 } };
    },
  };

  // ---------- downloads ----------
  const downloads = {
    async save({ filename, data }) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
  };

  // ---------- user ----------
  const user = {
    async can(what) { return what === 'data.write' ? me.role === 'editor' : true; },
    get email() { return me.email; },
  };

  window.claude = {
    async use(name) {
      await ready;
      // mcp (Gmail) arrives in stage 5 via a server function; until then CV fetch from mail is off.
      return { db, assets, downloads, user }[name] || null;
    },
  };

  // ---------- fetch: leads.json and stored CV files come from Supabase ----------
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const path = url.replace(location.origin, '');
    if (path === 'leads.json' || path === '/leads.json') {
      await ready;
      try {
        // ~10k rows: ask for the count, then fetch all pages in parallel (sequential paging took ~9s)
        const { count, error: cErr } = await sb.from('leads').select('id', { count: 'exact', head: true });
        if (cErr) throw cErr;
        const pages = [];
        for (let from = 0; from < (count || 0); from += PAGE) {
          pages.push(sb.from('leads').select('data').order('ord').range(from, from + PAGE - 1)
            .then(({ data, error }) => { if (error) throw error; return data; }));
        }
        const rows = (await Promise.all(pages)).flat();
        return new Response(JSON.stringify(rows.map(r => r.data)), { status: 200, headers: { 'content-type': 'application/json' } });
      } catch (e) { console.error('leads load failed', e); return new Response('{}', { status: 500 }); }
    }
    const m = path.match(/^\/_blob\/([A-Za-z0-9_-]+)$/);
    if (m) {
      await ready;
      const { data, error } = await sb.storage.from(BUCKET).download(m[1]);
      if (error || !data) return new Response('', { status: 404 });
      return new Response(data, { status: 200, headers: { 'content-type': data.type || 'application/octet-stream' } });
    }
    return realFetch(input, init);
  };
})();
