// イジンデン ゲームエンジン
// 「状態 + 行動 → 新しい状態」の純粋な関数。UI・CPU・オンライン同期はすべてこれを通す。
// 能力の処理は state.queue に積んで順に解決する。プレイヤーの選択が必要になったら
// state.prompt を出して止まり、{ type: 'choose' } 行動で続きを解決する。
import { CARDS, DECKS } from './cards.js';

export const def = (inst) => CARDS[inst.id];
const clone = (o) => JSON.parse(JSON.stringify(o));
const opp = (p) => 1 - p;
export const STONE = { red: 'R-13', blue: 'B-13', green: 'G-13' };

// mulberry32。シードを状態に持たせて、どの端末でも同じ順番になるようにする
function random(state) {
  let t = (state.seed = (state.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle(state, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function log(state, text, p = null) {
  state.log.push({ text, p });
  if (state.log.length > 300) state.log.shift();
}

const name = (inst) => def(inst).name;

export function createGame({ seed = Date.now() >>> 0, names = ['あなた', 'あいて'], decks = ['R01', 'B01'], first = null } = {}) {
  const state = {
    seed, turn: 0, turnNo: 0, phase: 'mulligan', winner: null, winReason: '',
    rights: { mana: 1, summon: 1 }, battleUsed: false, battle: null, log: [],
    queue: [], prompt: null, fx: {}, mulligan: [null, null],
    players: [0, 1].map((p) => ({
      name: names[p], deckId: Array.isArray(decks[p]) ? 'custom' : decks[p], deck: (Array.isArray(decks[p]) ? decks[p] : DECKS[decks[p]].cards).map((id, n) => ({ uid: `${p}-${n}`, id })),
      hand: [], mana: [], field: [], guardians: [], grave: [], turnsTaken: 0,
    })),
  };
  for (const pl of state.players) {
    shuffle(state, pl.deck);
    pl.hand = pl.deck.splice(0, 6);
    pl.guardians = pl.deck.splice(0, 4).map((c) => ({ ...c, tapped: false }));
  }
  state.turn = first ?? (random(state) < 0.5 ? 0 : 1);
  state.first = state.turn;
  log(state, `${state.players[state.turn].name}の先攻`);
  return state;
}

// ---------- 参照用の計算 ----------

export function levelSum(pl) {
  return pl.mana.reduce((s, m) => s + (m.faceUp ? def(m).level : 1), 0);
}

export function hasColor(pl, color) {
  return pl.mana.some((m) => m.faceUp && def(m).color === color);
}

const ijinsOf = (pl) => pl.field.filter((c) => def(c).type === 'ijin');
const haikeisOf = (pl) => pl.field.filter((c) => def(c).type === 'haikei');
const ownerOf = (uid) => Number(uid.split('-')[0]);

export function power(state, p, inst, role = null) {
  const d = def(inst);
  if (inst.guardian || d.type !== 'ijin') return 0;
  const pl = state.players[p];
  let v = d.power;
  for (const h of haikeisOf(pl)) if (h.id === 'R-10' || h.id === 'G-10') v += 1000; // 連なる天守閣・毘盧遮那仏像
  if (d.id === 'B-7') v += 1000 * ijinsOf(pl).length; // 武帝
  if (d.id === 'B-6' && state.turn !== p) v += 2000; // ジャン・カルヴァン
  if (role === 'atk') {
    v += d.kw.atk || 0;
    if (d.kw.voyage && state.fx.fleet?.[p]) v += 2000; // フリート
  }
  return v;
}

export function isDouble(state, p, inst) {
  const d = def(inst);
  return !!(d.kw.double || state.fx.double?.[p] || (d.id === 'B-7' && power(state, p, inst) >= 5000));
}

// このブロッカーでこのアタッカーをブロックできるか
export function canBlockPair(state, d, blocker, attacker) {
  if (blocker.guardian) return !blocker.tapped;
  const bd = def(blocker);
  if (bd.type !== 'ijin' || bd.kw.cannotBlock || blocker.tapped) return false;
  const a = opp(d), ad = def(attacker);
  if (ad.id === 'B-3' && power(state, d, blocker, 'blk') <= 1000) return false; // 好太王
  if (ad.id === 'B-8' && state.players[a].hand.length >= 5) return false; // 楊貴妃
  return true;
}

export function canBlockWith(inst) {
  if (inst.guardian) return !inst.tapped;
  const d = def(inst);
  return d.type === 'ijin' && !d.kw.cannotBlock && !inst.tapped;
}

export function canAttackWith(state, p, inst) {
  const d = def(inst);
  return d.type === 'ijin' && !inst.tapped && (inst.enteredTurn !== state.turnNo || d.kw.sokuo);
}

export function effectiveLevel(state, p, d) {
  if (d.id === 'R-10' && ijinsOf(state.players[p]).some((c) => def(c).traits.includes('剣術'))) return 1;
  return d.level;
}

const colorName = (c) => ({ red: '赤', blue: '青', green: '緑' })[c] || c;

// 手札のカードが今使えるか。理由つきで返す
export function checkPlay(state, p, uid) {
  const pl = state.players[p];
  const inst = pl.hand.find((c) => c.uid === uid);
  if (!inst) return { ok: false, why: '手札にありません' };
  if (state.phase !== 'main' || state.turn !== p || state.prompt || state.queue.length) return { ok: false, why: '自分のメインフェイズではありません' };
  const d = def(inst);
  if (d.type === 'maryoku') return state.rights.mana > 0 ? { ok: true } : { ok: false, why: 'マリョク配置権がありません' };
  if (d.color && !hasColor(pl, d.color)) return { ok: false, why: `${colorName(d.color)}の表向きマリョクが必要です` };
  const lv = effectiveLevel(state, p, d);
  if (levelSum(pl) < lv) return { ok: false, why: `レベル${lv}が必要です（今は${levelSum(pl)}）` };
  if (d.type === 'ijin' && state.rights.summon < 1) return { ok: false, why: 'イジン召喚権がありません' };
  if (d.type === 'mahou') {
    if (pl.mana.length < d.cost) return { ok: false, why: `魔力ゾーンに${d.cost}枚必要です` };
    const cond = mahouCondition(state, p, d);
    if (cond) return { ok: false, why: cond };
  }
  return { ok: true };
}

function mahouCondition(state, p, d) {
  if (d.id === 'R-12' && (!ijinsOf(state.players[p]).length || !state.players[opp(p)].guardians.length)) return '自分のイジンと相手のガーディアンが必要です';
  return null;
}

// ---------- カードの移動 ----------

function findOnBoard(state, uid) {
  for (const p of [0, 1]) {
    const pl = state.players[p];
    for (const zone of ['field', 'guardians', 'mana', 'hand', 'grave', 'deck']) {
      const i = pl[zone].findIndex((c) => c.uid === uid);
      if (i >= 0) return { p, zone, i, inst: pl[zone][i] };
    }
  }
  return null;
}

function take(state, uid) {
  const f = findOnBoard(state, uid);
  if (!f) return null;
  state.players[f.p][f.zone].splice(f.i, 1);
  return { ...f, card: { uid: f.inst.uid, id: f.inst.id } };
}

function draw(state, p, n = 1) {
  const pl = state.players[p];
  let k = 0;
  for (; k < n && pl.deck.length; k++) pl.hand.push(pl.deck.shift());
  return k;
}

function topToMana(state, p) {
  const pl = state.players[p];
  if (!pl.deck.length) return;
  pl.mana.push({ ...pl.deck.shift(), faceUp: false });
  log(state, '山札の上を裏向きで魔力ゾーンへ', p);
}

function untapAll(state, p) {
  for (const c of [...state.players[p].field, ...state.players[p].guardians]) c.tapped = false;
}

// 表向きのマリョクを1つ裏にする（コスト）。残したい色を考えて選ぶ
function flipManaCost(state, p) {
  const pl = state.players[p];
  const ups = pl.mana.filter((m) => m.faceUp);
  if (!ups.length) return false;
  const pick = ups.sort((a, b) => manaKeep(pl, a) - manaKeep(pl, b))[0];
  pick.faceUp = false;
  return true;
}

function manaKeep(pl, m) {
  if (!m.faceUp) return 0;
  const d = def(m);
  const same = pl.mana.filter((x) => x.faceUp && def(x).color === d.color).length;
  return d.level * 2 + (d.color && same === 1 ? 10 : 0);
}

// 戦場に置く。「戦場に置かれたとき」と、それに反応する能力を積む
function putOnField(state, p, card, { summoned = false } = {}) {
  const pl = state.players[p];
  const inst = { uid: card.uid, id: card.id, tapped: false, enteredTurn: state.turnNo };
  pl.field.push(inst);
  const d = def(inst);
  log(state, d.type === 'haikei' ? `ハイケイ「${d.name}」を展開` : `${d.name}を${summoned ? '召喚' : '戦場に'}`, p);
  const trig = [];
  if (ENTER[d.id]) trig.push({ k: 'enter', p, src: inst.uid });
  // 執筆（ハイケイが置かれたとき）・アテルイ（剣術イジンが置かれたとき）は両者のカードが反応する
  for (const q of turnOrder(state)) {
    for (const c of state.players[q].field) {
      if (c.uid === inst.uid) continue;
      const cd = def(c);
      if (d.type === 'haikei' && cd.kw.shippitsu && !state.fx.noShippitsu) trig.push({ k: 'shippitsu', p: q, src: c.uid });
      if (d.type === 'ijin' && d.traits.includes('剣術') && cd.id === 'G-3') trig.push({ k: 'aterui', p: q, src: c.uid });
    }
  }
  pushFront(state, trig);
  return inst;
}

// ターンプレイヤー → 相手 の順
const turnOrder = (state) => [state.turn, opp(state.turn)];

function pushFront(state, items) {
  state.queue.unshift(...items);
}

// 破壊：破壊されている状態にして、破壊されたときの能力 → まとめて墓地 → 遺業 の順に積む
function destroy(state, uids) {
  const hits = uids.map((u) => findOnBoard(state, u)).filter((f) => f && (f.zone === 'field' || f.zone === 'guardians'));
  if (!hits.length) return;
  for (const h of hits) h.inst.destroyed = true;
  const items = [];
  for (const h of hits) {
    if (h.zone !== 'field' || def(h.inst).type !== 'ijin') continue;
    const d = def(h.inst);
    if (d.id === 'G-1') items.push({ k: 'okuniSave', p: h.p, src: h.inst.uid });
    for (const q of turnOrder(state)) {
      for (const c of state.players[q].field) {
        if (c.id === 'B-10') items.push({ k: 'plazaDraw', p: q, src: c.uid });
        if (c.id === 'R-9' && q === h.p && d.color === 'red') items.push({ k: 'shrine', p: q, src: c.uid, target: h.inst.uid });
      }
    }
  }
  items.push({ k: 'toGrave', uids: hits.map((h) => h.inst.uid) });
  pushFront(state, items);
}

function toGrave(state, uids) {
  const legacy = [];
  for (const u of uids) {
    const f = findOnBoard(state, u);
    if (!f || !f.inst.destroyed || (f.zone !== 'field' && f.zone !== 'guardians')) continue;
    const t = take(state, u);
    state.players[t.p].grave.push(t.card);
    const d = def(t.card);
    log(state, t.zone === 'guardians' ? `${state.players[t.p].name}のガーディアン（${d.name}）が破壊された` : `${d.name}が破壊された`, t.p);
    if (d.legacy) legacy.push({ k: 'legacy', p: t.p, src: u });
  }
  // ターンプレイヤーの遺業から
  legacy.sort((a, b) => (a.p === state.turn ? 0 : 1) - (b.p === state.turn ? 0 : 1));
  pushFront(state, legacy);
}

// ---------- 選択 ----------

// 選択肢つきの問い合わせを出して止まる。item は選択後にもう一度呼ばれる
function ask(state, item, { p, title, options = [], min = 1, max = 1, confirm = false, src = null }) {
  state.prompt = { p, title, options, min: Math.min(min, options.length || (confirm ? 0 : 0)), max: confirm ? 1 : Math.min(max, options.length), confirm, src };
  state.queue.unshift(item);
}

// ---------- 能力 ----------

const pickedOnce = (item) => item.picks !== undefined;

const ENTER = {
  'R-6': (s, it) => { if (s.turn === it.p) { s.rights.summon++; log(s, 'イジン召喚権+1', it.p); } },
  'B-1': (s, it) => {
    const pl = s.players[it.p];
    const opts = pl.grave.filter((c) => (def(c).type === 'ijin' && def(c).level <= 6) || (def(c).type === 'haikei' && def(c).level <= 5)).map((c) => c.uid);
    if (!opts.length) return;
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: '墓地から戦場に置くカードを選ぶ（任意）', options: opts, min: 0, src: it.src });
    if (it.picks[0]) { const t = take(s, it.picks[0]); putOnField(s, it.p, t.card); }
  },
  'B-5': (s, it) => {
    const pl = s.players[it.p];
    const opts = pl.grave.filter((c) => ['ijin', 'haikei'].includes(def(c).type)).map((c) => c.uid);
    if (!opts.length) return;
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: '墓地から手札に戻すカードを選ぶ', options: opts, src: it.src });
    const t = take(s, it.picks[0]); pl.hand.push(t.card); log(s, `${name(t.card)}を手札に戻した`, it.p);
  },
  'B-8': (s, it) => {
    const pl = s.players[it.p];
    const opts = ijinsOf(pl).map((c) => c.uid);
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: '破壊して3ドローするイジンを選ぶ（任意）', options: opts, min: 0, src: it.src });
    if (!it.picks[0]) return;
    draw(s, it.p, 3); log(s, '3ドロー', it.p);
    destroy(s, [it.picks[0]]);
  },
  'G-1': (s, it) => { untapAll(s, it.p); log(s, '戦場のカードをすべて起こした', it.p); },
  'G-2': (s, it) => topToMana(s, it.p),
  'G-6': (s, it) => {
    const opts = s.players[it.p].grave.filter((c) => def(c).type === 'haikei').map((c) => c.uid);
    if (!opts.length) return;
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: '墓地から手札に戻すハイケイを選ぶ（2つまで・任意）', options: opts, min: 0, max: 2, src: it.src });
    for (const u of it.picks) { const t = take(s, u); s.players[it.p].hand.push(t.card); log(s, `${name(t.card)}を手札に戻した`, it.p); }
  },
};

const ATTACK = {
  'R-1': (s, it) => {
    const me = findOnBoard(s, it.src);
    if (!me) return;
    const lim = power(s, it.p, me.inst, 'atk');
    const opts = ijinsOf(s.players[opp(it.p)]).filter((c) => power(s, opp(it.p), c) <= lim).map((c) => c.uid);
    if (!opts.length) return;
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: `破壊する相手のイジンを選ぶ（パワー${lim}以下）`, options: opts, src: it.src });
    destroy(s, it.picks);
  },
  'R-4': (s, it) => {
    if (!s.players[it.p].mana.some((m) => m.faceUp)) return;
    const opts = ijinsOf(s.players[opp(it.p)]).filter((c) => power(s, opp(it.p), c) <= 2000).map((c) => c.uid);
    if (!opts.length) return;
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: 'マリョク1つを裏にして、パワー2000以下のイジンを破壊する（任意）', options: opts, min: 0, src: it.src });
    if (!it.picks[0]) return;
    flipManaCost(s, it.p);
    destroy(s, it.picks);
  },
  'R-7': (s, it) => { const n = haikeisOf(s.players[opp(it.p)]).length; if (n) { draw(s, it.p, n); log(s, `${n}ドロー`, it.p); } },
  'R-8': (s, it) => {
    const n = s.battle?.attackers.length || 1;
    const opts = haikeisOf(s.players[opp(it.p)]).map((c) => c.uid);
    if (!opts.length) return;
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: `破壊する相手のハイケイを${Math.min(n, opts.length)}つ選ぶ`, options: opts, min: Math.min(n, opts.length), max: n, src: it.src });
    destroy(s, it.picks);
  },
  'B-2': (s, it) => {
    if (!pickedOnce(it)) {
      draw(s, it.p, 1);
      const opts = s.players[it.p].hand.map((c) => c.uid);
      if (!opts.length) return;
      return ask(s, it, { p: it.p, title: '航海：手札1枚を墓地に置く', options: opts, src: it.src });
    }
    const t = take(s, it.picks[0]); s.players[it.p].grave.push(t.card);
  },
  'B-4': (s, it) => {
    const foe = opp(it.p);
    const opts = s.players[foe].hand.map((c) => c.uid);
    if (!opts.length) return;
    if (!pickedOnce(it)) return ask(s, it, { p: foe, title: 'マゼランの航海：墓地に置く手札を1枚選ぶ', options: opts, src: it.src });
    const t = take(s, it.picks[0]); s.players[foe].grave.push(t.card); log(s, `${name(t.card)}を墓地に置いた`, foe);
  },
  'G-8': (s, it) => {
    const opts = haikeisOf(s.players[it.p]).map((c) => c.uid);
    if (!opts.length) return;
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: 'ハイケイ1つを手札に戻し、イジン全員にダブルプレッシャー（任意）', options: opts, min: 0, src: it.src });
    if (!it.picks[0]) return;
    const t = take(s, it.picks[0]); s.players[it.p].hand.push(t.card);
    s.fx.double = { ...s.fx.double, [it.p]: true };
    log(s, 'このターン、イジン全員がダブルプレッシャー', it.p);
  },
};

const MAHOU = {
  'R-11': (s, it) => {
    const pl = s.players[it.p];
    const opts = [...ijinsOf(pl).filter((c) => def(c).traits.includes('剣術')).map((c) => c.uid), ...pl.guardians.map((c) => c.uid)];
    if (opts.length && !pickedOnce(it)) return ask(s, it, { p: it.p, title: '剣術イジンを破壊するか、ガーディアンを山札の上に戻す', options: opts, src: it.src });
    const u = it.picks?.[0];
    draw(s, it.p, 3); log(s, '3ドロー', it.p);
    if (u && pl.guardians.some((g) => g.uid === u)) { const t = take(s, u); pl.deck.unshift(t.card); log(s, 'ガーディアンを山札の上に戻した', it.p); } else if (u) destroy(s, [u]);
  },
  'R-12': (s, it) => {
    const mine = ijinsOf(s.players[it.p]).map((c) => c.uid), foeG = s.players[opp(it.p)].guardians.map((c) => c.uid);
    if (!mine.length || !foeG.length) return;
    if (!it.mine) {
      if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: '破壊する自分のイジンを選ぶ', options: mine, src: it.src });
      return pushFront(s, [{ ...it, mine: it.picks[0], picks: undefined }]);
    }
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: '破壊する相手のガーディアンを選ぶ', options: foeG, src: it.src });
    destroy(s, [it.mine, it.picks[0]]);
  },
  'B-11': (s, it) => { s.fx.fleet = { ...s.fx.fleet, [it.p]: true }; log(s, 'このターン、アタッカーはバトルで破壊されない', it.p); },
  'B-12': (s, it) => { draw(s, it.p, 2); log(s, '2ドロー', it.p); },
  'G-11': (s, it) => topToMana(s, it.p),
  'G-12': (s, it) => {
    const pl = s.players[it.p];
    pl.hand.push(...pl.guardians.map(({ uid, id }) => ({ uid, id })));
    pl.guardians = pl.deck.splice(0, 2).map((c) => ({ ...c, tapped: false }));
    log(s, 'ガーディアンを手札に戻し、山札から2枚をガーディアンにした', it.p);
  },
};

// メインフェイズ開始時の能力（{ p: 持ち主, any: 両者のメインフェイズで発動 }）
const MAIN_START = {
  'B-6': { any: true }, 'B-9': {}, 'B-10': {}, 'G-9': {},
};

const ITEMS = {
  enter: (s, it) => { if (findOnBoard(s, it.src)?.zone === 'field') ENTER[findOnBoard(s, it.src).inst.id](s, it); },
  attack: (s, it) => { const f = findOnBoard(s, it.src); if (f?.zone === 'field') ATTACK[f.inst.id](s, it); },
  voyageEcho: (s, it) => {
    const f = findOnBoard(s, it.src);
    if (f?.zone !== 'field') return;
    draw(s, it.p, 1); f.inst.tapped = false; log(s, `${name(f.inst)}：1ドローして起きた`, it.p);
  },
  mahou: (s, it) => MAHOU[it.id](s, it),
  shippitsu: (s, it) => {
    const f = findOnBoard(s, it.src);
    if (f?.zone !== 'field' || s.fx.noShippitsu) return;
    if (f.inst.id === 'G-4') { const t = take(s, it.src); s.players[it.p].mana.push({ ...t.card, faceUp: false }); log(s, `執筆：${name(t.card)}を魔力ゾーンへ`, it.p); }
    if (f.inst.id === 'G-7') { untapAll(s, it.p); log(s, '執筆：戦場のカードをすべて起こした', it.p); }
  },
  aterui: (s, it) => { const f = findOnBoard(s, it.src); if (f?.zone === 'field') f.inst.tapped = false; },
  plazaDraw: (s, it) => { if (findOnBoard(s, it.src)?.zone === 'field') { draw(s, it.p, 1); log(s, '革命の広場：1ドロー', it.p); } },
  shrine: (s, it) => {
    const t = findOnBoard(s, it.target);
    if (!t?.inst.destroyed || findOnBoard(s, it.src)?.zone !== 'field') return;
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: `神剣眠る氏社：${name(t.inst)}を墓地ではなく魔力ゾーンに置く？`, confirm: true, src: it.src });
    if (!it.picks.length) return;
    const c = take(s, it.target); s.players[it.p].mana.push({ ...c.card, faceUp: false }); log(s, `${name(c.card)}を魔力ゾーンへ`, it.p);
  },
  okuniSave: (s, it) => {
    const f = findOnBoard(s, it.src);
    if (!f?.inst.destroyed || !s.players[it.p].mana.some((m) => m.faceUp)) return;
    if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: '出雲の阿国：マリョク1つを裏にして、破壊を取り消す？', confirm: true, src: it.src });
    if (!it.picks.length) return;
    flipManaCost(s, it.p); f.inst.destroyed = false; log(s, '出雲の阿国の破壊を取り消した', it.p);
  },
  toGrave: (s, it) => toGrave(s, it.uids),
  legacy: (s, it) => {
    const f = findOnBoard(s, it.src);
    if (f?.zone !== 'grave') return;
    const d = def(f.inst), pl = s.players[it.p];
    if (d.legacy === 'draw1') { draw(s, it.p, 1); log(s, `遺業（${d.name}）：1ドロー`, it.p); }
    if (d.legacy === 'manaize' || d.legacy === 'restore') {
      const t = take(s, it.src); pl.mana.push({ ...t.card, faceUp: d.legacy === 'restore' });
      log(s, `遺業（${d.name}）：${d.legacy === 'restore' ? '復元' : '魔力化'}`, it.p);
    }
    if (d.legacy === 'returnToHand') { const t = take(s, it.src); pl.hand.push(t.card); log(s, `遺業（${d.name}）：手札に戻した`, it.p); }
    if (d.legacy === 'meifu') {
      if (mahouCondition(s, it.p, d)) return;
      if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: `冥府発動：${d.name}を使う？`, confirm: true, src: it.src });
      if (!it.picks.length) return;
      log(s, `冥府発動：マホウ「${d.name}」`, it.p);
      pushFront(s, [{ k: 'mahou', p: it.p, id: d.id, src: it.src }]);
    }
  },
  mainStart: (s, it) => {
    const f = findOnBoard(s, it.src);
    if (f?.zone !== 'field') return;
    const pl = s.players[it.p];
    if (f.inst.id === 'B-6') {
      if (!pl.mana.some((m) => m.faceUp) || s.fx.noShippitsu) return;
      if (![0, 1].some((q) => s.players[q].field.some((c) => def(c).kw.shippitsu))) return;
      if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: 'ジャン・カルヴァン：マリョク1つを裏にして、このターン「執筆」を止める？', confirm: true, src: it.src });
      if (it.picks.length) { flipManaCost(s, it.p); s.fx.noShippitsu = true; log(s, 'このターン「執筆」は発動しない', it.p); }
    }
    if (f.inst.id === 'B-9') {
      const opts = pl.hand.filter((c) => def(c).traits.includes('美術')).map((c) => c.uid);
      if (!opts.length) return;
      if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: 'モナ・リザ：「美術」カードを墓地に置いて1ドロー（任意）', options: opts, min: 0, src: it.src });
      if (it.picks[0]) { const t = take(s, it.picks[0]); pl.grave.push(t.card); draw(s, it.p, 1); log(s, 'モナ・リザ：1ドロー', it.p); }
    }
    if (f.inst.id === 'B-10') {
      const opts = ijinsOf(pl).map((c) => c.uid);
      if (!opts.length) return;
      if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: '革命の広場：自分のイジン1体を破壊する（任意）', options: opts, min: 0, src: it.src });
      if (it.picks[0]) destroy(s, it.picks);
    }
    if (f.inst.id === 'G-9') {
      const opts = [...pl.field.filter((c) => c.uid !== it.src).map((c) => c.uid), ...pl.mana.map((c) => c.uid)];
      if (!opts.length) return;
      if (!pickedOnce(it)) return ask(s, it, { p: it.p, title: '阿弥陀堂：戦場か魔力ゾーンのカード1つを手札に戻す（任意）', options: opts, min: 0, src: it.src });
      if (it.picks[0]) { const t = take(s, it.picks[0]); pl.hand.push(t.card); log(s, `${name(t.card)}を手札に戻した`, it.p); }
    }
  },
  endStart: (s, it) => { if (findOnBoard(s, it.src)?.zone === 'field') { untapAll(s, it.p); log(s, '毘盧遮那仏像：戦場のカードをすべて起こした', it.p); } },
  // フェイズの進行も積んで処理する（能力の解決が終わってから進むように）
  toBlock: (s) => { s.phase = 'block'; },
  resolveBattle: (s, it) => resolveAttacker(s, it),
  battleEnd: (s) => { s.battle = null; s.phase = 'main'; },
  finishTurn: (s) => finishTurn(s),
  startMain: (s) => { s.phase = 'main'; },
};

function run(state) {
  while (!state.prompt && state.queue.length && state.phase !== 'over') {
    const it = state.queue.shift();
    ITEMS[it.k](state, it);
  }
}

// ---------- ターン ----------

function startTurn(state) {
  const p = state.turn, pl = state.players[p];
  state.turnNo++;
  state.fx = {};
  if (pl.deck.length === 0) return endGame(state, opp(p), `${pl.name}の山札が尽きた`);
  state.rights = { mana: 1, summon: 1 };
  state.battleUsed = false;
  state.phase = 'start';
  for (const c of [...pl.field, ...pl.guardians]) c.tapped = false;
  const skipDraw = p === state.first && pl.turnsTaken === 0;
  if (!skipDraw) draw(state, p);
  pl.turnsTaken++;
  log(state, `― ${pl.name}のターン ―`, p);
  const items = [];
  for (const q of turnOrder(state)) {
    for (const c of state.players[q].field) {
      const m = MAIN_START[c.id];
      if (m && (m.any || q === p)) items.push({ k: 'mainStart', p: q, src: c.uid });
    }
  }
  items.push({ k: 'startMain' });
  pushFront(state, items);
  run(state);
}

function finishTurn(state) {
  state.turn = opp(state.turn);
  startTurn(state);
}

function endGame(state, winner, reason) {
  state.phase = 'over';
  state.winner = winner;
  state.winReason = reason;
  state.prompt = null;
  state.queue = [];
  log(state, `${state.players[winner].name}の勝利！（${reason}）`, winner);
}

// アタッカーを1体ずつ解決する
function resolveAttacker(state, it) {
  const a = state.turn, d = opp(a), A = state.players[a], D = state.players[d];
  const b = state.battle;
  const au = b.attackers[it.i];
  const atk = A.field.find((c) => c.uid === au);
  if (!atk) return; // 先に戦場を離れた
  // 破壊されたり戦場を離れたブロッカーは外れる
  const blockers = (b.blocks[au] || []).map((u) => {
    const g = D.guardians.find((c) => c.uid === u && !c.destroyed);
    if (g) return { ...g, guardian: true };
    return D.field.find((c) => c.uid === u && !c.destroyed);
  }).filter(Boolean);
  const need = isDouble(state, a, atk) ? 2 : 1;
  if (blockers.length < need) {
    log(state, `${name(atk)}の攻撃が通った！`, a);
    return endGame(state, a, `${name(atk)}の攻撃を防げなかった`);
  }
  const ap = power(state, a, atk, 'atk');
  const sum = blockers.reduce((s, x) => s + power(state, d, x, 'blk'), 0);
  log(state, `${name(atk)}(${ap}) vs ${blockers.map((x) => (x.guardian ? 'ガーディアン' : `${name(x)}(${power(state, d, x, 'blk')})`)).join('＋')}`, a);
  const losers = [];
  if (sum >= ap && !state.fx.fleet?.[a]) losers.push(atk.uid);
  for (const x of blockers) if (x.guardian ? ap > 0 : power(state, d, x, 'blk') <= ap) losers.push(x.uid);
  destroy(state, losers);
}

// ---------- 行動 ----------

export function applyAction(prev, p, action) {
  const state = clone(prev);
  const err = (why) => ({ ok: false, why, state: prev });
  if (state.phase === 'over') return err('ゲームは終了しています');
  const pl = state.players[p];

  if (action.type === 'mulligan') {
    if (state.phase !== 'mulligan' || state.mulligan[p] !== null) return err('今は引き直しできません');
    state.mulligan[p] = !!action.redo;
    if (action.redo) {
      pl.deck.push(...pl.hand); pl.hand = [];
      shuffle(state, pl.deck);
      pl.hand = pl.deck.splice(0, 6);
      log(state, `${pl.name}は手札を引き直した`, p);
    }
    if (state.mulligan.every((m) => m !== null)) startTurn(state);
    return { ok: true, state };
  }

  if (action.type === 'choose') {
    const pr = state.prompt;
    if (!pr || pr.p !== p) return err('今は選べません');
    const picks = [...new Set(action.picks || [])];
    if (pr.confirm) {
      if (picks.length > 1) return err('選び方が正しくありません');
    } else {
      if (picks.length < pr.min || picks.length > pr.max || picks.some((u) => !pr.options.includes(u))) return err(`${pr.min === pr.max ? pr.min : `${pr.min}〜${pr.max}`}つ選んでください`);
    }
    state.prompt = null;
    state.queue[0] = { ...state.queue[0], picks: pr.confirm ? (picks.length ? ['yes'] : []) : picks };
    run(state);
    return { ok: true, state };
  }

  if (state.prompt) return err('選択を待っています');

  if (action.type === 'declareBlocks') {
    if (state.phase !== 'block' || p !== opp(state.turn)) return err('ブロックの番ではありません');
    const blocks = {};
    const used = new Set();
    const A = state.players[state.turn];
    for (const au of state.battle.attackers) {
      const atk = A.field.find((c) => c.uid === au);
      const list = [...new Set((action.blocks || {})[au] || [])];
      for (const bu of list) {
        if (used.has(bu)) return err('同じカードで2体はブロックできません');
        const g = pl.guardians.find((c) => c.uid === bu);
        const f = pl.field.find((c) => c.uid === bu);
        const inst = g ? { ...g, guardian: true } : f;
        if (!inst || !atk || !canBlockPair(state, p, inst, atk)) return err('そのカードではブロックできません');
        used.add(bu);
      }
      if (atk && list.length === 1 && isDouble(state, state.turn, atk)) return err(`${name(atk)}は2体以上でないとブロックできません`);
      blocks[au] = list;
    }
    state.battle.blocks = blocks;
    state.phase = 'resolve';
    pushFront(state, [...state.battle.attackers.map((_, i) => ({ k: 'resolveBattle', i })), { k: 'battleEnd' }]);
    run(state);
    return { ok: true, state };
  }

  if (state.turn !== p) return err('相手のターンです');
  if (state.phase !== 'main' || state.queue.length) return err('今はその行動ができません');

  switch (action.type) {
    case 'placeMana': {
      if (state.rights.mana < 1) return err('マリョク配置権がありません');
      const i = pl.hand.findIndex((c) => c.uid === action.uid);
      if (i < 0) return err('手札にありません');
      const faceUp = !!action.faceUp;
      if (faceUp && def(pl.hand[i]).type !== 'maryoku') return err('表向きに置けるのはマリョクだけです');
      const [c] = pl.hand.splice(i, 1);
      pl.mana.push({ ...c, faceUp });
      state.rights.mana--;
      log(state, faceUp ? `${def(c).name}を配置` : 'カードを裏向きで魔力ゾーンに配置', p);
      break;
    }
    case 'play': {
      const chk = checkPlay(state, p, action.uid);
      if (!chk.ok) return err(chk.why);
      const i = pl.hand.findIndex((c) => c.uid === action.uid);
      const d = def(pl.hand[i]);
      if (d.type === 'maryoku') return err('マリョクは配置してください');
      const [c] = pl.hand.splice(i, 1);
      if (d.type === 'ijin') {
        state.rights.summon--;
        putOnField(state, p, c, { summoned: true });
      } else if (d.type === 'haikei') {
        putOnField(state, p, c);
      } else {
        // 魔力コスト：裏向き → レベルの低い順に墓地へ（色が残るように）
        const order = [...pl.mana].sort((x, y) => manaKeep(pl, x) - manaKeep(pl, y)).slice(0, d.cost);
        const paid = new Set(order.map((m) => m.uid));
        pl.mana = pl.mana.filter((m) => !paid.has(m.uid));
        pl.grave.push(...order.map(({ uid, id }) => ({ uid, id })));
        log(state, `マホウ「${d.name}」を発動`, p);
        pl.grave.push(c);
        pushFront(state, [{ k: 'mahou', p, id: d.id, src: c.uid }]);
      }
      run(state);
      break;
    }
    case 'declareAttack': {
      if (state.battleUsed) return err('バトルはこのターン1回までです');
      const list = [...new Set(action.attackers || [])];
      if (!list.length) return err('アタッカーを選んでください');
      for (const u of list) {
        const inst = pl.field.find((c) => c.uid === u);
        if (!inst || !canAttackWith(state, p, inst)) return err('そのイジンはアタックできません');
      }
      for (const u of list) pl.field.find((c) => c.uid === u).tapped = true;
      state.battleUsed = true;
      state.battle = { attackers: list, blocks: {} };
      state.phase = 'attack';
      log(state, `${list.map((u) => name(pl.field.find((c) => c.uid === u))).join('・')}でアタック！`, p);
      // アタッカーになったときの能力 → 航海に反応する能力 → ブロックへ
      const items = [];
      for (const u of list) {
        const d = def(pl.field.find((c) => c.uid === u));
        if (ATTACK[d.id]) items.push({ k: 'attack', p, src: u });
        if (d.kw.voyage) {
          for (const q of turnOrder(state)) for (const c of state.players[q].field) if (c.id === 'G-5') items.push({ k: 'voyageEcho', p: q, src: c.uid });
        }
      }
      items.push({ k: 'toBlock' });
      pushFront(state, items);
      run(state);
      break;
    }
    case 'endTurn': {
      state.phase = 'end';
      const items = pl.field.filter((c) => c.id === 'G-10').map((c) => ({ k: 'endStart', p, src: c.uid }));
      items.push({ k: 'finishTurn' });
      pushFront(state, items);
      run(state);
      break;
    }
    default:
      return err('不明な行動です');
  }
  return { ok: true, state };
}

// 今、誰の操作を待っているか
export function waitingFor(state) {
  if (state.phase === 'over') return null;
  if (state.prompt) return state.prompt.p;
  if (state.phase === 'mulligan') return state.mulligan.map((m, i) => (m === null ? i : null)).filter((x) => x !== null);
  if (state.phase === 'block') return opp(state.turn);
  return state.turn;
}

export { findOnBoard };
