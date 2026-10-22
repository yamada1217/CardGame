// フレンド登録。Firebase の匿名ログインのID（端末・ブラウザごと）に、短いフレンドコードを結びつける。
// コードで申請 → 相手が承認すると、お互いのフレンド一覧に載る。一覧からオンラインの相手を対戦に誘える。
// データの置き場所（書き込みの制限は database.rules.json）:
//   users/<uid>       { name, code, online, last }   みんなが読める
//   codes/<code>      <uid>                          コードから相手を探す
//   requests/<to>/<from> { name, code, at }          届いた申請（受け取った人だけ読める）
//   friends/<uid>/<friendUid> { since }              フレンド一覧（本人だけ読める）
//   invites/<to>/<from>  { name, room, at }          対戦の誘い（フレンドだけが送れる）
import { backend } from './online.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_TTL = 10 * 60 * 1000;
let me = null; // { db, uid, code }

export const formatCode = (c) => (c ? `${c.slice(0, 4)}-${c.slice(4)}` : '');
export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// 自分の登録（初回はコードを発行）。オンライン状態も更新する
export async function myProfile(name) {
  if (me) { await me.db.update(`users/${me.uid}`, { name }); return me; }
  const db = await backend();
  const uid = db.uid;
  if (!uid) throw new Error('ログインできませんでした');
  let code = (await db.get(`users/${uid}/code`)) || null;
  for (let i = 0; !code && i < 6; i++) {
    const c = Array.from({ length: 8 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
    if (await db.get(`codes/${c}`)) continue;
    await db.set(`codes/${c}`, uid);
    code = c;
  }
  if (!code) throw new Error('フレンドコードを作れませんでした');
  await db.set(`users/${uid}`, { name, code, online: true, last: db.serverTime() });
  db.onDisconnectSet(`users/${uid}/online`, false);
  me = { db, uid, code };
  return me;
}

// コードで申請する
export async function sendRequest(rawCode, name) {
  const { db, uid, code: mine } = me;
  const code = normCode(rawCode);
  if (code.length !== 8) throw new Error('フレンドコードは8文字です');
  if (code === mine) throw new Error('自分のコードです');
  const to = await db.get(`codes/${code}`);
  if (!to) throw new Error('そのコードのプレイヤーが見つかりません');
  if (await db.get(`friends/${uid}/${to}`)) throw new Error('もうフレンドです');
  // 相手からも申請が来ていたら、そのまま承認する
  if (await db.get(`requests/${uid}/${to}`)) { await accept(to); return 'accepted'; }
  await db.set(`requests/${to}/${uid}`, { name, code: mine, at: db.serverTime() });
  return 'sent';
}

export async function accept(from) {
  const { db, uid } = me;
  await db.update('', { [`friends/${uid}/${from}`]: { since: db.serverTime() }, [`friends/${from}/${uid}`]: { since: db.serverTime() }, [`requests/${uid}/${from}`]: null });
}
export const decline = (from) => me.db.set(`requests/${me.uid}/${from}`, null);
export const unfriend = (f) => me.db.update('', { [`friends/${me.uid}/${f}`]: null, [`friends/${f}/${me.uid}`]: null });

// 対戦に誘う（部屋を作ってから呼ぶ）
export const invite = (to, room, name) => me.db.set(`invites/${to}/${me.uid}`, { name, room, at: Date.now() });
export const clearInvite = (from) => me && me.db.set(`invites/${me.uid}/${from}`, null);

// フレンド一覧・届いた申請を見張る。cb({ friends: [{uid,name,online}], requests: [{uid,name,code}] })。解除する関数を返す
export function watchFriends(cb) {
  const { db, uid } = me;
  const state = { friends: {}, requests: [] };
  const offs = [];
  const userOffs = new Map();
  const emit = () => cb({ friends: Object.entries(state.friends).map(([u, x]) => ({ uid: u, ...x })).sort((a, b) => (b.online - a.online) || String(a.name).localeCompare(b.name, 'ja')), requests: state.requests });
  offs.push(db.onValue(`requests/${uid}`, (v) => { state.requests = Object.entries(v || {}).map(([u, x]) => ({ uid: u, ...x })); emit(); }));
  offs.push(db.onValue(`friends/${uid}`, (v) => {
    const ids = Object.keys(v || {});
    for (const [u, off] of userOffs) if (!ids.includes(u)) { off?.(); userOffs.delete(u); delete state.friends[u]; }
    for (const u of ids) {
      if (userOffs.has(u)) continue;
      state.friends[u] = { name: '…', online: false };
      userOffs.set(u, db.onValue(`users/${u}`, (x) => { state.friends[u] = { name: x?.name || '名無し', code: x?.code, online: x?.online === true }; emit(); }));
    }
    emit();
  }));
  return () => { offs.forEach((f) => f?.()); userOffs.forEach((f) => f?.()); };
}

// 届いた対戦の誘いを見張る。cb({ from, name, room })
export function watchInvites(cb) {
  const { db, uid } = me;
  return db.onValue(`invites/${uid}`, (v) => {
    for (const [from, x] of Object.entries(v || {})) {
      if (x && Date.now() - x.at < INVITE_TTL) cb({ from, name: x.name, room: x.room });
    }
  });
}
