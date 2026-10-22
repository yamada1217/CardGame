// 自作デッキの保存と、デッキ構築ルールの確認
// デッキは { id, name, cards: { カードID: 枚数 }, updated } の形で localStorage に置く。
// 対戦で使うときは、カードIDの配列に展開してエンジンに渡す。
import { CARDS, DECKS } from './cards.js';
import { READY } from './effects/index.js';

export const MIN_CARDS = 40;
export const MAX_CARDS = 60; // ルール上の上限はないが、アプリでは60枚までにする
export const MAX_COPIES = 4;
const KEY = 'ijinden.decks';

// 効果が実装されていて、対戦で使えるカード
export const playable = (id) => READY.has(id);

const DELETED = 'ijinden.decks.deleted'; // 消したデッキの記録 { id: 消した時刻 }（端末間の同期で復活しないように）
const changeListeners = new Set();
export const onDecksChanged = (fn) => { changeListeners.add(fn); return () => changeListeners.delete(fn); };
const changed = () => changeListeners.forEach((fn) => fn());

function readDeleted() {
  try { return JSON.parse(localStorage.getItem(DELETED)) || {}; } catch { return {}; }
}
function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 保存できなくても続行 */ }
}

export const listDecks = () => read().sort((a, b) => b.updated - a.updated);
export const getDeck = (id) => read().find((d) => d.id === id) || null;

export function saveDeck(deck) {
  const list = read().filter((d) => d.id !== deck.id);
  const saved = { ...deck, updated: Date.now() };
  write([saved, ...list]);
  changed();
  return saved;
}

export function deleteDeck(id) {
  write(read().filter((d) => d.id !== id));
  try { localStorage.setItem(DELETED, JSON.stringify({ ...readDeleted(), [id]: Date.now() })); } catch { /* 続行 */ }
  changed();
}

// ---------- 端末間の同期用 ----------
// スナップショット: { decks: { id: { name, cards, updated } }, deleted: { id: 時刻 } }

export function localSnapshot() {
  const decks = {};
  for (const d of read()) decks[d.id] = { name: d.name, cards: d.cards || {}, updated: d.updated || 0 };
  return { decks, deleted: readDeleted() };
}

// 同期で受け取った内容をこの端末に書く（変更の通知は出さない）
export function applySnapshot(snap) {
  write(Object.entries(snap.decks || {}).map(([id, d]) => ({ id, name: d.name, cards: d.cards || {}, updated: d.updated || 0 })));
  try { localStorage.setItem(DELETED, JSON.stringify(snap.deleted || {})); } catch { /* 続行 */ }
}

// 2つを合わせる。同じデッキは新しく保存した方、消した記録が保存より新しければ消す
export function mergeSnapshots(a, b) {
  const deleted = { ...(a?.deleted || {}) };
  for (const [id, t] of Object.entries(b?.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);
  const decks = {};
  for (const src of [a?.decks || {}, b?.decks || {}]) {
    for (const [id, d] of Object.entries(src)) {
      if (!d || typeof d.name !== 'string') continue;
      const cur = decks[id];
      if (!cur || (d.updated || 0) > (cur.updated || 0)) decks[id] = { name: d.name.slice(0, 20), cards: sanitizeCards(d.cards), updated: d.updated || 0 };
    }
  }
  for (const [id, t] of Object.entries(deleted)) if (decks[id] && decks[id].updated <= t) delete decks[id];
  return { decks, deleted };
}

function sanitizeCards(cards) {
  const out = {};
  for (const [id, n] of Object.entries(cards || {})) if (CARDS[id] && Number.isInteger(n) && n > 0 && n <= 60) out[id] = n;
  return out;
}

export function newDeck(name = '新しいデッキ', cards = {}) {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, cards: { ...cards }, updated: Date.now() };
}

// スターターの中身を { ID: 枚数 } にする（コピーして作るとき用）
export function starterCards(starterId) {
  const out = {};
  for (const id of DECKS[starterId].cards) out[id] = (out[id] || 0) + 1;
  return out;
}

export const total = (cards) => Object.values(cards).reduce((s, n) => s + n, 0);

// 1種類あたりの上限。ストーンなど「何枚でも」のカードは上限なし
export const copyLimit = (card) => (card?.unlimited ? Infinity : MAX_COPIES);

// 枚数の上限はカード名ごと。色違いや再録で別IDでも、同じ名前なら合わせて4枚まで（例：ヒエロスガモス）
const NAME_IDS = new Map();
for (const c of Object.values(CARDS)) NAME_IDS.set(c.name, [...(NAME_IDS.get(c.name) || []), c.id]);
export const sameName = (card) => NAME_IDS.get(card.name) || [card.id];
const nameTotal = (cards, card) => sameName(card).reduce((t, id) => t + (cards[id] || 0), 0);

// このIDを最大何枚まで入れられるか（同名のほかのカードの枚数を差し引く）
export const capFor = (cards, card) => copyLimit(card) - nameTotal(cards, card) + (cards[card.id] || 0);

export function validate(cards) {
  const errors = [];
  const n = total(cards);
  if (n < MIN_CARDS) errors.push(`あと${MIN_CARDS - n}枚必要です（40枚以上）`);
  if (n > MAX_CARDS) errors.push(`${MAX_CARDS}枚までにしてください`);
  const byName = {};
  for (const [id, k] of Object.entries(cards)) {
    if (!playable(id)) { errors.push('まだ対戦で使えないカードが入っています'); break; }
    const name = CARDS[id].name;
    byName[name] = (byName[name] || 0) + k;
    if (byName[name] > copyLimit(CARDS[id])) { errors.push(`「${name}」は同じ名前のカードを合わせて${MAX_COPIES}枚までです`); break; }
  }
  return { ok: errors.length === 0, errors, count: n };
}

// 選択中のデッキを表すキー: スターターは 'R01' など、自作は 'u:<id>'
export function deckLabel(key) {
  if (DECKS[key]) return DECKS[key].name;
  return getDeck(key.slice(2))?.name || 'デッキ';
}

export function deckColors(cards) {
  const ids = Array.isArray(cards) ? cards : Object.keys(cards);
  return [...new Set(ids.map((id) => CARDS[id]?.color).filter(Boolean))];
}

// 対戦に使えるデッキの一覧（スターター＋ルールを満たす自作デッキ）
export function usableDecks() {
  const starters = Object.entries(DECKS).map(([key, d]) => ({ key, name: d.name, cards: d.cards, starter: true, ok: true }));
  const mine = listDecks().map((d) => {
    const v = validate(d.cards);
    return { key: `u:${d.id}`, name: d.name, cards: expand(d.cards), starter: false, ok: v.ok, why: v.errors[0] };
  });
  return [...mine, ...starters];
}

export function expand(cards) {
  return Object.entries(cards).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).flatMap(([id, k]) => Array(k).fill(id));
}

// 対戦開始時に渡すデッキ。スターターはID、自作はカードIDの配列
export function deckForMatch(key) {
  if (DECKS[key]) return key;
  const d = getDeck(String(key).slice(2));
  return d && validate(d.cards).ok ? expand(d.cards) : null;
}

// 相手から届いたデッキを確かめる。おかしければスターターに置き換える（両端末で同じ結果になる）
export function sanitizeDeck(deck) {
  if (typeof deck === 'string') return DECKS[deck] ? deck : 'R01';
  if (!Array.isArray(deck)) return 'R01';
  const cards = {};
  for (const id of deck) cards[id] = (cards[id] || 0) + 1;
  return validate(cards).ok ? deck : 'R01';
}
