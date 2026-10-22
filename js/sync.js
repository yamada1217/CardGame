// 自作デッキを端末・ブラウザをまたいで使う（引き継ぎコード）。
// コードを作った端末のデッキを Firebase の saves/<コード> に置き、ほかの端末でコードを入れると同じデッキが使える。
// コードを入れた端末どうしは、デッキを保存・削除するたびに自動で同期する。
// コードを知っている人なら誰でも読み書きできるので、コードは他人に教えない（推測されにくい10文字）。
import { backend, onlineAvailable } from './online.js';
import { localSnapshot, applySnapshot, mergeSnapshots, onDecksChanged } from './decks.js';

const KEY = 'ijinden.sync';
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LEN = 10;
const path = (code) => `saves/${code}`;

let cur = null; // { code, db, off }
let pushTimer = null;
const listeners = new Set();
const emit = (why) => listeners.forEach((fn) => fn(why));

export const onSync = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const normSync = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatSync = (c) => (c ? `${c.slice(0, 5)}-${c.slice(5)}` : '');
export const syncAvailable = onlineAvailable;
export function syncCode() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}
export const syncActive = () => !!cur;

export function syncUrl(code) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('sync', code);
  const b = new URLSearchParams(location.search).get('backend');
  if (b) u.searchParams.set('backend', b);
  if (new URLSearchParams(location.search).get('emu')) u.searchParams.set('emu', '1');
  return u.toString();
}

const sameSnap = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
// Firebase は空のオブジェクトを保存しないので、空のものは除いて比べる
function sortKeys(o) {
  if (!o || typeof o !== 'object') return o;
  const out = {};
  for (const k of Object.keys(o).sort()) {
    const v = sortKeys(o[k]);
    if (v && typeof v === 'object' && !Object.keys(v).length) continue;
    out[k] = v;
  }
  return out;
}
const plain = (snap) => ({ decks: snap?.decks || {}, deleted: snap?.deleted || {} });

// remote と手元を合わせて、両方を同じにする
async function reconcile(db, code, remote) {
  const local = localSnapshot();
  const merged = mergeSnapshots(local, plain(remote));
  if (!sameSnap(merged, local)) { applySnapshot(merged); emit('pull'); }
  if (!remote || !sameSnap(merged, plain(remote))) await db.set(path(code), { ...merged, at: Date.now() });
}

// コードで同期を始める（起動時は保存してあるコードで）
export async function startSync(code = syncCode()) {
  if (!code || !onlineAvailable()) return false;
  const db = await backend();
  stopWatching();
  await reconcile(db, code, await db.get(path(code)));
  try { localStorage.setItem(KEY, code); } catch { /* 続行 */ }
  const off = db.onValue(path(code), (v) => {
    if (!v || cur?.code !== code) return;
    const local = localSnapshot();
    const merged = mergeSnapshots(local, plain(v));
    if (!sameSnap(merged, local)) { applySnapshot(merged); emit('pull'); }
    if (!sameSnap(merged, plain(v))) schedulePush();
  });
  cur = { code, db, off };
  emit('start');
  return true;
}

// 新しいコードを作って、この端末のデッキを置く
export async function createSync() {
  const db = await backend();
  for (let i = 0; i < 6; i++) {
    const c = Array.from({ length: LEN }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
    if (await db.get(path(c))) continue;
    await startSync(c);
    return c;
  }
  throw new Error('コードを作れませんでした');
}

// ほかの端末で作ったコードを入れる（手元のデッキは消えずに合わさる）
export async function joinSync(raw) {
  const code = normSync(raw);
  if (code.length !== LEN) throw new Error(`コードは${LEN}文字です`);
  const db = await backend();
  if (!(await db.get(path(code)))) throw new Error('そのコードは見つかりませんでした');
  await startSync(code);
  return code;
}

function stopWatching() {
  cur?.off?.();
  cur = null;
  clearTimeout(pushTimer);
}

// この端末だけ同期をやめる（デッキは手元に残る）
export function stopSync() {
  stopWatching();
  try { localStorage.removeItem(KEY); } catch { /* 続行 */ }
  emit('stop');
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    if (!cur) return;
    const { db, code } = cur;
    try { await reconcile(db, code, await db.get(path(code))); } catch (e) { console.warn('デッキの同期に失敗しました', e); }
  }, 600);
}

// 手元でデッキを保存・削除したら送る
onDecksChanged(() => { if (cur) schedulePush(); });
