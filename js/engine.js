// イジンデン ゲームエンジン
// 「状態 + 行動 → 新しい状態」の純粋な関数。UI・CPU・オンライン同期はすべてこれを通す。
import { CARDS, DECKS } from './cards.js';

export const def = (inst) => CARDS[inst.id];
const clone = (o) => JSON.parse(JSON.stringify(o));
const opp = (p) => 1 - p;

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
  if (state.log.length > 200) state.log.shift();
}

export function createGame({ seed = Date.now() >>> 0, names = ['あなた', 'あいて'], decks = ['fire', 'wisdom'], first = null } = {}) {
  const state = {
    seed, turn: 0, turnNo: 0, phase: 'main', winner: null, winReason: '',
    rights: { mana: 1, summon: 1 }, battleUsed: false, battle: null, log: [],
    players: [0, 1].map((p) => ({
      name: names[p], deckId: decks[p], deck: DECKS[decks[p]].cards.map((id, n) => ({ uid: `${p}-${n}`, id })),
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
  startTurn(state);
  return state;
}

function draw(state, p, n = 1) {
  const pl = state.players[p];
  for (let i = 0; i < n && pl.deck.length; i++) pl.hand.push(pl.deck.shift());
}

function startTurn(state) {
  const p = state.turn, pl = state.players[p];
  state.turnNo++;
  if (pl.deck.length === 0) return endGame(state, opp(p), `${pl.name}の山札が尽きた`);
  state.rights = { mana: 1, summon: 1 };
  state.battleUsed = false;
  state.phase = 'main';
  for (const c of [...pl.field, ...pl.guardians]) c.tapped = false;
  const skipDraw = p === state.first && pl.turnsTaken === 0;
  if (!skipDraw) draw(state, p);
  pl.turnsTaken++;
  log(state, `― ${pl.name}のターン ―`, p);
}

function endGame(state, winner, reason) {
  state.phase = 'over';
  state.winner = winner;
  state.winReason = reason;
  log(state, `${state.players[winner].name}の勝利！（${reason}）`, winner);
}

// ---- 参照用の計算 ----

export function levelSum(pl) {
  return pl.mana.reduce((s, m) => s + (m.faceUp ? def(m).level : 1), 0);
}

export function hasColor(pl, color) {
  return pl.mana.some((m) => m.faceUp && def(m).color === color);
}

export function power(state, p, inst, role = null) {
  const d = def(inst);
  if (inst.guardian || d.type !== 'ijin') return 0;
  let v = d.power + (inst.temp || 0);
  if (role === 'atk') v += d.kw.atk || 0;
  if (role === 'blk') v += d.kw.blk || 0;
  for (const h of state.players[p].field) {
    const b = def(h).buff;
    if (!b || b.color !== d.color) continue;
    v += b.power || 0;
    if (role === 'atk') v += b.atk || 0;
    if (role === 'blk') v += b.blk || 0;
  }
  return v;
}

// 手札のカードが今使えるか。理由つきで返す
export function checkPlay(state, p, uid) {
  const pl = state.players[p];
  const inst = pl.hand.find((c) => c.uid === uid);
  if (!inst) return { ok: false, why: '手札にありません' };
  if (state.phase !== 'main' || state.turn !== p) return { ok: false, why: '自分のメインフェイズではありません' };
  const d = def(inst);
  if (d.type === 'maryoku') return state.rights.mana > 0 ? { ok: true } : { ok: false, why: 'マリョク配置権がありません' };
  if (d.color && !hasColor(pl, d.color)) return { ok: false, why: `${colorName(d.color)}のマリョクが必要です` };
  if (levelSum(pl) < d.level) return { ok: false, why: `レベル${d.level}が必要です（今は${levelSum(pl)}）` };
  if (d.type === 'ijin' && state.rights.summon < 1) return { ok: false, why: 'このターンはもう召喚しました' };
  if (d.type === 'mahou') {
    if (pl.mana.length < d.cost) return { ok: false, why: `魔力ゾーンに${d.cost}枚必要です` };
    if (d.target === 'enemyIjin' && !targetsFor(state, p, d).length) return { ok: false, why: '対象がいません' };
  }
  return { ok: true };
}

export function targetsFor(state, p, d) {
  if (d.effect === 'destroy3') return state.players[opp(p)].field.filter((c) => def(c).type === 'ijin' && power(state, opp(p), c) <= 3).map((c) => c.uid);
  return [];
}

const colorName = (c) => ({ red: '赤', blue: '青', green: '緑' })[c] || c;

export function canAttackWith(state, p, inst) {
  const d = def(inst);
  return d.type === 'ijin' && !inst.tapped && (inst.enteredTurn !== state.turnNo || d.kw.sokuo);
}

export function canBlockWith(inst) {
  if (inst.guardian) return !inst.tapped;
  const d = def(inst);
  return d.type === 'ijin' && (!inst.tapped || d.kw.watcher);
}

export function attackers(state) {
  return state.battle ? state.battle.attackers : [];
}

// ---- 効果 ----

const EFFECTS = {
  draw1: (state, p) => draw(state, p, 1),
  draw2: (state, p) => draw(state, p, 2),
  destroy3: (state, p, target) => destroy(state, [target]),
  rally: (state, p) => { for (const c of state.players[p].field) if (def(c).type === 'ijin') c.temp = (c.temp || 0) + 2; },
};

function findOnBoard(state, uid) {
  for (const p of [0, 1]) {
    const pl = state.players[p];
    for (const zone of ['field', 'guardians']) {
      const i = pl[zone].findIndex((c) => c.uid === uid);
      if (i >= 0) return { p, zone, i, inst: pl[zone][i] };
    }
  }
  return null;
}

// 同時に破壊して墓地へ。その後に遺業を解決する
function destroy(state, uids) {
  const hits = uids.map((u) => findOnBoard(state, u)).filter(Boolean);
  for (const h of hits) {
    const pl = state.players[h.p];
    pl[h.zone] = pl[h.zone].filter((c) => c.uid !== h.inst.uid);
    const { uid, id } = h.inst;
    pl.grave.push({ uid, id });
    log(state, h.zone === 'guardians' ? `${pl.name}のガーディアン（${def(h.inst).name}）が破壊された` : `${def(h.inst).name}が破壊された`, h.p);
  }
  for (const h of hits) {
    const lg = def(h.inst).legacy;
    if (lg) { log(state, `遺業：${def(h.inst).name}`, h.p); EFFECTS[lg](state, h.p); }
  }
}

// ---- 行動 ----

export function applyAction(prev, p, action) {
  const state = clone(prev);
  const err = (why) => ({ ok: false, why, state: prev });
  if (state.phase === 'over') return err('ゲームは終了しています');
  const pl = state.players[p];

  if (action.type === 'declareBlocks') {
    if (state.phase !== 'block' || p !== opp(state.turn)) return err('ブロックの番ではありません');
    return resolveBattle(state, p, action.blocks || {}, prev);
  }
  if (state.turn !== p) return err('相手のターンです');
  if (state.phase !== 'main') return err('今はその行動ができません');

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
      if (d.type === 'mahou' && d.target && !targetsFor(state, p, d).includes(action.target)) return err('対象を選んでください');
      const [c] = pl.hand.splice(i, 1);
      if (d.type === 'ijin') {
        state.rights.summon--;
        pl.field.push({ ...c, tapped: false, enteredTurn: state.turnNo, temp: 0 });
        log(state, `${d.name}を召喚`, p);
        if (d.onSummon) EFFECTS[d.onSummon](state, p);
      } else if (d.type === 'haikei') {
        pl.field.push({ ...c, tapped: false, enteredTurn: state.turnNo });
        log(state, `ハイケイ「${d.name}」を展開`, p);
      } else {
        // 魔力コスト：裏向き→レベルの低い順に墓地へ（色を残せるように、必要な色の最後の1枚は後回し）
        const order = [...pl.mana].sort((a, b) => manaKeep(pl, a) - manaKeep(pl, b));
        const paid = order.slice(0, d.cost).map((m) => m.uid);
        pl.mana = pl.mana.filter((m) => !paid.includes(m.uid));
        pl.grave.push(...order.slice(0, d.cost).map(({ uid, id }) => ({ uid, id })));
        log(state, `マホウ「${d.name}」を発動`, p);
        EFFECTS[d.effect](state, p, action.target);
        pl.grave.push(c);
      }
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
      state.battle = { attackers: list };
      state.phase = 'block';
      log(state, `${list.map((u) => def(pl.field.find((c) => c.uid === u)).name).join('・')}でアタック！`, p);
      break;
    }
    case 'endTurn': {
      for (const c of pl.field) c.temp = 0;
      state.turn = opp(p);
      startTurn(state);
      break;
    }
    default:
      return err('不明な行動です');
  }
  return { ok: true, state };
}

// 小さいほど先に支払う
function manaKeep(pl, m) {
  if (!m.faceUp) return 0;
  const d = def(m);
  const sameColor = pl.mana.filter((x) => x.faceUp && def(x).color === d.color).length;
  return d.level * 2 + (d.color && sameColor === 1 ? 10 : 0);
}

function resolveBattle(state, d, blocks, prev) {
  const a = state.turn, A = state.players[a], D = state.players[d];
  const used = new Set();
  const plan = [];
  for (const au of state.battle.attackers) {
    const atk = A.field.find((c) => c.uid === au);
    const bl = [...new Set(blocks[au] || [])];
    const blockers = [];
    for (const bu of bl) {
      if (used.has(bu)) return { ok: false, why: '同じカードで2体はブロックできません', state: prev };
      const g = D.guardians.find((c) => c.uid === bu);
      const f = D.field.find((c) => c.uid === bu);
      const inst = g ? { ...g, guardian: true } : f;
      if (!inst || !canBlockWith(inst)) return { ok: false, why: 'そのカードはブロックできません', state: prev };
      used.add(bu);
      blockers.push(inst);
    }
    plan.push({ atk, blockers });
  }
  state.battle = null;
  state.phase = 'main';

  for (const { atk, blockers } of plan) {
    const kw = def(atk).kw;
    const need = kw.double ? 2 : 1;
    if (kw.unblockable || blockers.length < need) {
      log(state, `${def(atk).name}の攻撃が通った！`, a);
      endGame(state, a, `${def(atk).name}の攻撃を防げなかった`);
      return { ok: true, state };
    }
  }

  const losers = [];
  for (const { atk, blockers } of plan) {
    const ap = power(state, a, atk, 'atk');
    const sum = blockers.reduce((s, b) => s + power(state, d, b, 'blk'), 0);
    log(state, `${def(atk).name}(${ap}) vs ${blockers.map((b) => (b.guardian ? 'ガーディアン(0)' : `${def(b).name}(${power(state, d, b, 'blk')})`)).join('＋')}`, a);
    if (sum >= ap) losers.push(atk.uid);
    for (const b of blockers) {
      if (b.guardian ? ap > 0 : power(state, d, b, 'blk') <= ap) losers.push(b.uid);
    }
  }
  destroy(state, losers);
  return { ok: true, state };
}

// オンライン用：相手に見せない情報を伏せた状態
export function viewFor(state, p) {
  const v = clone(state);
  const o = v.players[opp(p)];
  o.hand = o.hand.map(() => ({ hidden: true }));
  o.mana = o.mana.map((m) => (m.faceUp ? m : { faceUp: false, hidden: true }));
  for (const pl of v.players) {
    pl.deck = pl.deck.map(() => ({ hidden: true }));
    pl.guardians = pl.guardians.map((g) => ({ uid: g.uid, tapped: g.tapped, hidden: true }));
  }
  return v;
}
