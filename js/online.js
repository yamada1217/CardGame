// オンライン対戦。部屋のURLを共有して1対1で遊ぶ。
// ゲームの状態そのものは送らず、「行動」だけを順番に記録して両端末で再生する。
import { FIREBASE_CONFIG } from './firebase-config.js';

const FIREBASE_VER = '10.12.2';
const SDK = (m) => `https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-${m}.js`;

// ---- 通信の土台（Firebase か、テスト用のローカル） ----

async function firebaseBackend() {
  const { initializeApp } = await import(SDK('app'));
  const db = await import(SDK('database'));
  const app = initializeApp(FIREBASE_CONFIG);
  const d = db.getDatabase(app);
  const r = (path) => db.ref(d, path);
  return {
    get: async (path) => (await db.get(r(path))).val(),
    set: (path, v) => db.set(r(path), v),
    update: (path, v) => db.update(r(path), v),
    push: (path, v) => db.push(r(path), v),
    onValue: (path, cb) => db.onValue(r(path), (s) => cb(s.val())),
    onChildAdded: (path, cb) => db.onChildAdded(r(path), (s) => cb(s.val(), s.key)),
    onDisconnectSet: (path, v) => db.onDisconnect(r(path)).set(v),
    serverTime: () => db.serverTimestamp(),
  };
}

// 同じブラウザの別タブ同士でつなぐ。Firebase の設定がなくても動作確認できる
function localBackend() {
  // 葉ごとに別のキーへ保存して、タブ同士の書き込みが消し合わないようにする
  const PRE = 'ijinden.ldb:';
  const listeners = new Set();
  const norm = (p) => '/' + p.split('/').filter(Boolean).join('/');
  const fire = () => listeners.forEach((l) => l());
  // 他のタブの書き込みは storage イベントで届く（書き込みが見えるようになってから発火する）
  window.addEventListener('storage', (e) => { if (!e.key || e.key.startsWith(PRE)) fire(); });
  const changed = fire;
  const clear = (p) => {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PRE + p + '/')) localStorage.removeItem(k);
  };
  // 1回の書き込みは1つのキーにまとめる（途中の状態を読まないように）
  const write = (p, v) => localStorage.setItem(PRE + norm(p), JSON.stringify(v ?? null));
  const dig = (o, ks) => ks.reduce((x, k) => (x == null ? undefined : x[k]), o);
  const read = (p) => {
    const base = norm(p);
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PRE)).map((k) => k.slice(PRE.length));
    // 祖先に書かれた値を土台にして、子孫に書かれた値を上書きしていく
    const anc = keys.filter((k) => base === k || base.startsWith(k === '/' ? k : k + '/')).sort((x, y) => x.length - y.length);
    let root;
    for (const k of anc) {
      const v = dig(JSON.parse(localStorage.getItem(PRE + k)), base.slice(k.length).split('/').filter(Boolean));
      if (v !== undefined) root = JSON.parse(JSON.stringify(v));
    }
    const desc = keys.filter((k) => k.startsWith(base + '/')).sort((x, y) => x.length - y.length || (x < y ? -1 : 1));
    for (const k of desc) {
      const ks = k.slice(base.length + 1).split('/');
      if (root == null || typeof root !== 'object') root = {};
      let o = root;
      ks.slice(0, -1).forEach((x) => { o = (o[x] && typeof o[x] === 'object') ? o[x] : (o[x] = {}); });
      o[ks.at(-1)] = JSON.parse(localStorage.getItem(PRE + k));
    }
    return root ?? null;
  };
  let seq = 0;
  return {
    get: async (p) => read(p),
    set: async (p, v) => { clear(norm(p)); write(p, JSON.parse(JSON.stringify(v ?? null))); changed(); },
    update: async (p, v) => { for (const [k, x] of Object.entries(v)) { clear(norm(`${p}/${k}`)); write(`${p}/${k}`, x); } changed(); },
    push: async (p, v) => { write(`${p}/${Date.now().toString(36).padStart(9, '0')}${(seq++).toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 6)}`, v); changed(); },
    onValue: (p, cb) => {
      let last;
      const l = () => { const v = JSON.stringify(read(p)); if (v !== last) { last = v; cb(JSON.parse(v)); } };
      listeners.add(l); l();
    },
    onChildAdded: (p, cb) => {
      const seen = new Set();
      const l = () => {
        const o = read(p) || {};
        for (const k of Object.keys(o).sort()) if (!seen.has(k)) { seen.add(k); cb(o[k], k); }
      };
      listeners.add(l); l();
    },
    onDisconnectSet: () => {},
    serverTime: () => Date.now(),
  };
}

export const onlineAvailable = () => !!FIREBASE_CONFIG || new URLSearchParams(location.search).get('backend') === 'local';

let backendPromise = null;
function backend() {
  const local = new URLSearchParams(location.search).get('backend') === 'local' || !FIREBASE_CONFIG;
  backendPromise ??= local ? Promise.resolve(localBackend()) : firebaseBackend();
  return backendPromise;
}

// ---- 部屋 ----

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

// ローカル確認では同じブラウザの2タブを別人として扱う
const store = () => (new URLSearchParams(location.search).get('backend') === 'local' ? sessionStorage : localStorage);

export function savedSession() {
  try { return JSON.parse(store().getItem('ijinden.session') || 'null'); } catch { return null; }
}

export function clientId() {
  try {
    const st = store();
    let id = st.getItem('ijinden.cid');
    if (!id) { id = crypto.randomUUID(); st.setItem('ijinden.cid', id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

export function roomUrl(code) {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('room', code);
  const b = new URLSearchParams(location.search).get('backend');
  if (b) u.searchParams.set('backend', b);
  return u.toString();
}

// handlers: onWaiting(code) / onStart(start, role) / onAction(action, index) / onPresence(foeOnline) / onError(msg)
export async function hostRoom({ name, deck }, handlers) {
  const db = await backend();
  let code;
  for (let i = 0; i < 5; i++) {
    code = newCode();
    if (!(await db.get(`rooms/${code}/host`))) break;
  }
  await db.set(`rooms/${code}`, { created: db.serverTime(), host: { name, deck, cid: clientId() } });
  return connect(db, code, 'host', handlers);
}

export async function joinRoom(code, { name, deck }, handlers) {
  const db = await backend();
  const room = await db.get(`rooms/${code}`);
  if (!room?.host) throw new Error('部屋が見つかりません');
  const cid = clientId();
  if (room.host.cid === cid) return connect(db, code, 'host', handlers);
  if (room.guest && room.guest.cid !== cid) throw new Error('この部屋はもう満員です');
  if (!room.guest) await db.set(`rooms/${code}/guest`, { name, deck, cid });
  return connect(db, code, 'guest', handlers);
}

function connect(db, code, role, h) {
  const base = `rooms/${code}`;
  const foeRole = role === 'host' ? 'guest' : 'host';
  const me = role === 'host' ? 0 : 1;
  let game = null; // 今の試合番号
  let room = null;
  let starting = false;

  db.set(`${base}/presence/${role}`, true);
  db.onDisconnectSet(`${base}/presence/${role}`, false);
  db.onValue(`${base}/presence/${foeRole}`, (v) => h.onPresence?.(v !== false));

  // 部屋全体ではなく必要な所だけ監視して、通信量を抑える
  room = { host: null, guest: null, start: null };
  const changed = () => {
    if (!room.host) return;
    // ホストは、相手が来たら試合を始める
    if (role === 'host' && room.guest?.deck && !room.start) { if (!starting) { starting = true; startGame(1); } return; }
    if (!room.start) { h.onWaiting?.(code, room); return; }
    if (game !== room.start.n) {
      game = room.start.n;
      h.onStart?.(room.start, me);
      let i = 0;
      const n = game;
      db.onChildAdded(`${base}/games/${n}`, (a) => { if (game === n) h.onAction?.(a, i++); });
    }
  };
  for (const k of ['host', 'guest', 'start']) db.onValue(`${base}/${k}`, (v) => { room[k] = v; changed(); });

  function startGame(n) {
    return db.set(`${base}/start`, {
      n, seed: (Math.random() * 2 ** 32) >>> 0, first: Math.random() < 0.5 ? 0 : 1,
      names: [room.host.name, room.guest.name], decks: [room.host.deck, room.guest.deck],
    });
  }

  try { store().setItem('ijinden.session', JSON.stringify({ code, role })); } catch { /* 保存できなくても続行 */ }

  return {
    code, role, me,
    // Firebase は undefined を保存できないので JSON を通して消す
    send: (action) => db.push(`${base}/games/${game}`, JSON.parse(JSON.stringify({ p: me, ...action }))),
    rematch: () => role === 'host' && room?.start && startGame(room.start.n + 1),
    leave: () => { db.set(`${base}/presence/${role}`, false); try { store().removeItem('ijinden.session'); } catch { /* 無視 */ } },
  };
}
