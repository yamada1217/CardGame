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
  return saved;
}

export function deleteDeck(id) {
  write(read().filter((d) => d.id !== id));
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
