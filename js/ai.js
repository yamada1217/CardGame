// CPU。エンジンの行動を1つずつ返す
// 強さは3段階：easy（やさしい）は迷いと見落としが多い、normal（ふつう）は決まった手順で動く、
// hard（最強）は候補の手をそれぞれ先読みして、ターンの終わりの盤面が一番よくなる手を選ぶ
import { def, checkPlay, canAttackWith, canBlockPair, canStand, power, levelSum, pressure, playLevel, findOnBoard, stat, ijinsOf, rule, applyAction, waitingFor } from './engine.js';

export const CPU_LEVELS = { easy: 'やさしい', normal: 'ふつう', hard: '最強' };

// 今CPUが取るべき行動（なければ null）
export function cpuAction(state, p, level = 'normal') {
  if (level === 'easy') return easyAction(state, p);
  if (level === 'hard') return hardAction(state, p);
  return normalAction(state, p);
}

function normalAction(state, p) {
  if (state.phase === 'over') return null;
  if (state.prompt) return state.prompt.p === p ? { type: 'choose', picks: cpuChoose(state, p) } : null;
  if (state.phase === 'mulligan') {
    if (state.mulligan[p] !== null) return null;
    const stones = state.players[p].hand.filter((c) => def(c).type === 'maryoku').length;
    return { type: 'mulligan', redo: stones === 0 || stones >= 5 };
  }
  if (state.phase === 'block') return state.turn !== p ? { type: 'declareBlocks', blocks: cpuBlocks(state, p) } : null;
  if (state.phase === 'main' && state.turn === p && !state.queue.length) return cpuMainAction(state, p);
  return null;
}

// アタックできるカード（イジン扱いのガーディアンも含む）
const attackers = (s, p) => [...s.players[p].field, ...s.players[p].guardians].filter((c) => canAttackWith(s, p, c));

function cpuMainAction(state, p) {
  const me = state.players[p], foe = state.players[1 - p];

  if (state.rights.mana > 0) {
    const k = me.hand.find((c) => def(c).type === 'maryoku');
    if (k) return { type: 'placeMana', uid: k.uid, faceUp: !rule(state, 'noFaceUpMana', p) };
    if (me.hand.length > 1) {
      // マリョクがなければ、当分使えない一番重いカードを裏向きで置く
      const heavy = [...me.hand].sort((a, b) => def(b).level - def(a).level)[0];
      if (heavy && def(heavy).level > levelSum(state, p) + 2) return { type: 'placeMana', uid: heavy.uid, faceUp: false };
    }
  }

  const playable = me.hand.filter((c) => def(c).type !== 'maryoku' && checkPlay(state, p, c.uid).ok);
  const ijin = playable.filter((c) => def(c).type === 'ijin').sort((a, b) => def(b).level - def(a).level)[0];
  if (ijin) return { type: 'play', uid: ijin.uid };
  const haikei = playable.filter((c) => def(c).type === 'haikei' && !['B-10', 'G-9'].includes(c.id))
    .sort((a, b) => playLevel(state, p, b) - playLevel(state, p, a))[0];
  if (haikei) return { type: 'play', uid: haikei.uid };
  for (const c of playable.filter((x) => def(x).type === 'mahou')) {
    if (['B-12', 'G-11'].includes(c.id) && me.hand.length <= 5) return { type: 'play', uid: c.uid };
    if (c.id === 'R-11' && me.hand.length <= 3 && me.guardians.length >= 3) return { type: 'play', uid: c.uid };
    if (c.id === 'R-12' && foe.guardians.length <= 2 && ijinsOf(state, p).some((x) => def(x).level <= 2)) return { type: 'play', uid: c.uid };
    if (c.id === 'B-11' && state.battlesLeft > 0 && attackers(state, p).length >= 2) return { type: 'play', uid: c.uid };
    // ほかのマホウは、使える手札が少ないうちに使う
    if (!['B-12', 'G-11', 'R-11', 'R-12', 'B-11', '1-54'].includes(c.id) && ((state.seed + state.turnNo) % 3 === 0 || me.hand.length >= 6)) return { type: 'play', uid: c.uid };
  }

  if (state.battlesLeft > 0) {
    const ready = attackers(state, p);
    if (ready.length) {
      const blockers = [...foe.guardians, ...foe.field].filter((c) => {
        const f = findOnBoard(state, c.uid);
        return f.zone === 'guardians' ? !c.tapped : stat(state, c, f).types.has('ijin') && (!c.tapped || stat(state, c, f).kw.watcher) && !stat(state, c, f).kw.cannotBlock;
      }).length;
      const need = ready.reduce((t, c) => t + pressure(state, p, c), 0);
      if (need > blockers) return { type: 'declareAttack', attackers: ready.map((c) => c.uid) };
      const best = Math.max(0, ...ijinsOf(state, 1 - p).filter((c) => !c.tapped).map((c) => power(state, 1 - p, c, 'blk')));
      const safe = ready.filter((c) => power(state, p, c, 'atk') > best);
      if (safe.length) return { type: 'declareAttack', attackers: safe.map((c) => c.uid) };
    }
  }
  return { type: 'endTurn' };
}

// 相手のアタックに対するブロック割り当て
export function cpuBlocks(state, p) {
  const me = state.players[p], foe = state.players[1 - p];
  const atks = state.battle.attackers.map((u) => findOnBoard(state, u)?.inst).filter(Boolean)
    .sort((x, y) => power(state, 1 - p, y, 'atk') - power(state, 1 - p, x, 'atk'));
  let pool = [...me.field, ...me.guardians, ...me.mana.filter((m) => canStand(state, p, m))];
  const isG = (c) => findOnBoard(state, c.uid)?.zone === 'guardians';
  const pw = (c) => (isG(c) ? -1 : findOnBoard(state, c.uid)?.zone === 'mana' ? def(c).power : power(state, p, c, 'blk'));
  const blocks = {};
  for (const a of atks) {
    const ap = power(state, 1 - p, a, 'atk');
    const need = pressure(state, 1 - p, a);
    const ok = pool.filter((c) => canBlockPair(state, p, c, a));
    // 勝てるイジン → 相打ち → ガーディアン → 残りのイジン
    const order = [
      ...ok.filter((c) => !isG(c) && pw(c) > ap).sort((x, y) => pw(x) - pw(y)),
      ...ok.filter((c) => !isG(c) && pw(c) === ap),
      ...ok.filter((c) => isG(c)),
      ...ok.filter((c) => !isG(c) && pw(c) < ap),
    ];
    const picks = order.slice(0, need);
    if (picks.length < need) { blocks[a.uid] = []; continue; }
    pool = pool.filter((c) => !picks.includes(c));
    blocks[a.uid] = picks.map((c) => c.uid);
  }
  return blocks;
}

// 能力の選択
function cpuChoose(state, p) {
  const pr = state.prompt;
  if (pr.info) return [];
  if (pr.confirm) return ['yes'];
  if (pr.labels) return pr.options.slice(0, Math.max(1, pr.min));
  const card = (u) => findOnBoard(state, u);
  const val = (u) => {
    const f = card(u);
    if (!f) return 0;
    const d = def(f.inst);
    const mine = f.p === p;
    let v = d.type === 'ijin' && f.zone === 'field' ? power(state, f.p, f.inst) / 1000 + d.level : d.level;
    if (f.zone === 'guardians') v = 1;
    return mine ? v : -v;
  };
  const n = Math.max(pr.min, Math.min(pr.max, pr.min === 0 ? 1 : pr.min));
  // 墓地・山札・手札から（自分のものを）拾うなら強い順、それ以外は「相手の強い順／自分の弱い順」
  const fromPile = pr.options.every((u) => ['grave', 'deck'].includes(card(u)?.zone) && card(u)?.p === p);
  if (fromPile) return [...pr.options].sort((a, b) => val(b) - val(a)).slice(0, n);
  return [...pr.options].sort((a, b) => val(a) - val(b)).slice(0, n);
}

// ---------- やさしい ----------
const rand = (a) => a[Math.floor(Math.random() * a.length)];

function easyAction(state, p) {
  const base = normalAction(state, p);
  if (!base) return base;
  if (base.type === 'choose') {
    const pr = state.prompt;
    if (pr.info || pr.confirm || pr.labels) return base;
    const n = Math.max(pr.min, Math.min(pr.max, pr.min === 0 ? 1 : pr.min));
    return { type: 'choose', picks: [...pr.options].sort(() => Math.random() - .5).slice(0, n) };
  }
  if (base.type === 'mulligan') return { type: 'mulligan', redo: false };
  if (base.type === 'placeMana' && Math.random() < .35) {
    // マリョクの置き方が雑：手札から適当な1枚を置いてしまう
    const c = rand(state.players[p].hand);
    if (c) return { type: 'placeMana', uid: c.uid, faceUp: def(c).type === 'maryoku' && !rule(state, 'noFaceUpMana', p) };
  }
  if (base.type === 'declareBlocks') {
    // ブロックは半分くらい見落とす
    const blocks = {};
    for (const [a, us] of Object.entries(base.blocks)) blocks[a] = Math.random() < .5 ? us : [];
    return { type: 'declareBlocks', blocks };
  }
  if (base.type === 'play') {
    // 出すカードは適当に選び、ときどき出し忘れる
    if (Math.random() < .3) return { type: 'endTurn' };
    const me = state.players[p];
    const opts = me.hand.filter((c) => def(c).type !== 'maryoku' && checkPlay(state, p, c.uid).ok);
    return opts.length ? { type: 'play', uid: rand(opts).uid } : base;
  }
  if (base.type === 'declareAttack') {
    if (Math.random() < .35) return { type: 'endTurn' };
    const ready = attackers(state, p);
    const some = ready.filter(() => Math.random() < .6);
    return { type: 'declareAttack', attackers: (some.length ? some : [rand(ready)]).map((c) => c.uid) };
  }
  return base;
}

// ---------- 最強 ----------
// 重み：ガーディアン > マリョク > 戦場 > 手札（マリョクは先の展開につながるので重め）
const W = { g: 12, f: 1, h: 1, m: 3 };
// 盤面の点数（p から見て）
function evaluate(s, p) {
  if (s.phase === 'over') return s.winner === p ? 1e6 : -1e6;
  const side = (q) => {
    const pl = s.players[q];
    const field = ijinsOf(s, q).reduce((t, c) => t + power(s, q, c) / 1000 * 2 + def(c).level, 0);
    return pl.guardians.length * W.g + field * W.f + pl.hand.length * W.h + Math.min(pl.mana.length, 9) * W.m + Math.min(pl.deck.length, 6) * 1.5;
  };
  return side(p) - side(1 - p);
}

// 両者「ふつう」で until を満たすまで進める
function rollout(s, until, cap = 400) {
  for (let i = 0; i < cap && s.phase !== 'over' && !until(s); i++) {
    const w = waitingFor(s), q = Array.isArray(w) ? w[0] : w;
    if (q == null) break;
    const act = normalAction(s, q);
    const r = act && applyAction(s, q, act);
    if (!r?.ok) break;
    s = r.state;
  }
  return s;
}

// 先読みは、CPUに見えない情報（相手の手札・山札・伏せたガーディアン、自分の山札と伏せたガーディアン）を
// 見えない札どうしで混ぜ直した盤面で行う。人と同じ条件で考えるため（相手の手札を覗かない）
function determinize(state, p, keepMyDeck = false) {
  const s = JSON.parse(JSON.stringify(state));
  const mix = (zones) => {
    const slots = zones.flatMap((z) => z.map((c, i) => ({ z, i })));
    const ids = slots.map(({ z, i }) => z[i].id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    slots.forEach(({ z, i }, k) => { z[i].id = ids[k]; });
  };
  const me = s.players[p], foe = s.players[1 - p];
  mix([foe.hand, foe.deck, foe.guardians.filter((c) => !c.faceUp)]);
  if (!keepMyDeck) mix([me.deck, me.guardians.filter((c) => !c.faceUp)]);
  return s;
}

// 候補の手を試して一番よいものを返す
function best(state, p, cands, until, keepMyDeck = false) {
  let top = null, topV = -Infinity;
  state = determinize(state, p, keepMyDeck);
  const seen = new Set();
  for (const a of cands) {
    const key = JSON.stringify(a);
    if (seen.has(key)) continue;
    seen.add(key);
    const r = applyAction(state, p, a);
    if (!r.ok) continue;
    const v = evaluate(rollout(r.state, until), p);
    if (v > topV) { topV = v; top = a; }
  }
  return top;
}

function hardAction(state, p) {
  const base = normalAction(state, p);
  if (!base) return base;
  // 相手の次のターンが終わるまで先読みする（反撃まで見る）
  const turnNo = state.turnNo;
  const endOfTurn = (s) => s.turnNo >= turnNo + 2;
  if (base.type === 'choose') {
    const pr = state.prompt;
    if (pr.info || pr.labels || pr.options.length > 10 || !(pr.min === 1 && pr.max === 1)) return base;
    return best(state, p, [base, ...pr.options.map((u) => ({ type: 'choose', picks: [u] }))], endOfTurn, true) || base; // 選択肢に出ている札は見えている
  }
  if (base.type === 'declareBlocks') {
    const guardOnly = {};
    let gs = state.players[p].guardians.filter((c) => !c.tapped);
    for (const u of state.battle.attackers) {
      const a = findOnBoard(state, u)?.inst;
      const need = a ? pressure(state, 1 - p, a) : 1;
      const ok = gs.filter((c) => a && canBlockPair(state, p, c, a)).slice(0, need);
      guardOnly[u] = ok.length === need ? ok.map((c) => c.uid) : [];
      gs = gs.filter((c) => !guardOnly[u].includes(c.uid));
    }
    return best(state, p, [base, { type: 'declareBlocks', blocks: {} }, { type: 'declareBlocks', blocks: guardOnly }], endOfTurn) || base;
  }
  if (state.phase !== 'main' || state.turn !== p) return base;
  const me = state.players[p];
  const cands = [base, { type: 'endTurn' }];
  if (state.rights.mana > 0) {
    const kinds = new Map();
    for (const c of me.hand) if (!kinds.has(c.id)) kinds.set(c.id, c);
    for (const c of kinds.values()) {
      if (def(c).type === 'maryoku') cands.push({ type: 'placeMana', uid: c.uid, faceUp: !rule(state, 'noFaceUpMana', p) });
      else if (me.hand.length > 2) cands.push({ type: 'placeMana', uid: c.uid, faceUp: false });
    }
  }
  const played = new Set();
  for (const c of me.hand) {
    if (played.has(c.id) || def(c).type === 'maryoku' || !checkPlay(state, p, c.uid).ok) continue;
    played.add(c.id);
    cands.push({ type: 'play', uid: c.uid });
  }
  if (state.battlesLeft > 0) {
    const ready = attackers(state, p);
    if (ready.length) {
      cands.push({ type: 'declareAttack', attackers: ready.map((c) => c.uid) });
      for (const c of ready) cands.push({ type: 'declareAttack', attackers: [c.uid] });
    }
  }
  return best(state, p, cands, endOfTurn) || base;
}
