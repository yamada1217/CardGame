// シンプルなCPU。エンジンの行動を1つずつ返す
import { def, checkPlay, canAttackWith, canBlockPair, power, levelSum, isDouble, effectiveLevel, findOnBoard } from './engine.js';

const ijins = (pl) => pl.field.filter((c) => def(c).type === 'ijin');

// 今CPUが取るべき行動（なければ null）
export function cpuAction(state, p) {
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

function cpuMainAction(state, p) {
  const me = state.players[p], foe = state.players[1 - p];

  if (state.rights.mana > 0) {
    const k = me.hand.find((c) => def(c).type === 'maryoku');
    if (k) return { type: 'placeMana', uid: k.uid, faceUp: true };
    if (me.hand.length > 1) {
      // マリョクがなければ、当分使えない一番重いカードを裏向きで置く
      const heavy = [...me.hand].sort((a, b) => def(b).level - def(a).level)[0];
      if (heavy && def(heavy).level > levelSum(me) + 2) return { type: 'placeMana', uid: heavy.uid, faceUp: false };
    }
  }

  const playable = me.hand.filter((c) => def(c).type !== 'maryoku' && checkPlay(state, p, c.uid).ok);
  const ijin = playable.filter((c) => def(c).type === 'ijin').sort((a, b) => def(b).level - def(a).level)[0];
  if (ijin) return { type: 'play', uid: ijin.uid };
  const haikei = playable.filter((c) => def(c).type === 'haikei' && !['B-10', 'G-9'].includes(c.id))
    .sort((a, b) => effectiveLevel(state, p, def(b)) - effectiveLevel(state, p, def(a)))[0];
  if (haikei) return { type: 'play', uid: haikei.uid };
  for (const c of playable.filter((x) => def(x).type === 'mahou')) {
    if (['B-12', 'G-11'].includes(c.id) && me.hand.length <= 5) return { type: 'play', uid: c.uid };
    if (c.id === 'R-11' && me.hand.length <= 3 && me.guardians.length >= 3) return { type: 'play', uid: c.uid };
    if (c.id === 'R-12' && foe.guardians.length <= 2 && ijins(me).some((x) => def(x).level <= 2)) return { type: 'play', uid: c.uid };
    if (c.id === 'B-11' && !state.battleUsed && ijins(me).filter((x) => canAttackWith(state, p, x)).length >= 2) return { type: 'play', uid: c.uid };
  }

  if (!state.battleUsed) {
    const ready = ijins(me).filter((c) => canAttackWith(state, p, c));
    if (ready.length) {
      const walls = foe.guardians.filter((g) => !g.tapped).length + ijins(foe).filter((c) => !c.tapped && !def(c).kw.cannotBlock).length;
      const need = ready.reduce((s, c) => s + (isDouble(state, p, c) ? 2 : 1), 0);
      if (need > walls) return { type: 'declareAttack', attackers: ready.map((c) => c.uid) };
      const best = Math.max(0, ...ijins(foe).filter((c) => !c.tapped).map((c) => power(state, 1 - p, c, 'blk')));
      const safe = ready.filter((c) => power(state, p, c, 'atk') > best);
      if (safe.length) return { type: 'declareAttack', attackers: safe.map((c) => c.uid) };
    }
  }
  return { type: 'endTurn' };
}

// 相手のアタックに対するブロック割り当て
export function cpuBlocks(state, p) {
  const me = state.players[p], foe = state.players[1 - p];
  const atks = state.battle.attackers.map((u) => foe.field.find((c) => c.uid === u)).filter(Boolean)
    .sort((x, y) => power(state, 1 - p, y, 'atk') - power(state, 1 - p, x, 'atk'));
  let pool = [...me.field.filter((c) => def(c).type === 'ijin'), ...me.guardians.map((g) => ({ ...g, guardian: true }))];
  const pw = (c) => power(state, p, c, 'blk');
  const blocks = {};
  for (const a of atks) {
    const ap = power(state, 1 - p, a, 'atk');
    const need = isDouble(state, 1 - p, a) ? 2 : 1;
    const ok = pool.filter((c) => canBlockPair(state, p, c, a));
    // 勝てるイジン → 相打ち → ガーディアン → 残りのイジン
    const order = [
      ...ok.filter((c) => !c.guardian && pw(c) > ap).sort((x, y) => pw(x) - pw(y)),
      ...ok.filter((c) => !c.guardian && pw(c) === ap),
      ...ok.filter((c) => c.guardian),
      ...ok.filter((c) => !c.guardian && pw(c) < ap),
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
  const src = pr.src && findOnBoard(state, pr.src)?.inst;
  const sid = src?.id;
  if (pr.confirm) return ['G-1', 'R-9'].includes(sid) || pr.title.startsWith('冥府') ? ['yes'] : [];
  if (pr.min === 0 && ['B-10', 'G-9', 'B-8', 'G-8'].includes(sid)) return [];
  const card = (u) => findOnBoard(state, u);
  const val = (u) => {
    const f = card(u);
    if (!f) return 0;
    const d = def(f.inst);
    const mine = f.p === p;
    let v = d.type === 'ijin' ? power(state, f.p, f.inst) / 1000 + d.level : d.level;
    if (f.zone === 'guardians') v = 1;
    return mine ? v : -v;
  };
  // 相手のカードを壊すなら強い順、自分のカードを手放すなら弱い順
  const sorted = [...pr.options].sort((a, b) => val(a) - val(b));
  const n = Math.max(pr.min, Math.min(pr.max, pr.min === 0 ? 1 : pr.min));
  const fromGraveOrHand = pr.options.every((u) => ['grave'].includes(card(u)?.zone));
  if (fromGraveOrHand) return [...pr.options].sort((a, b) => val(b) - val(a)).slice(0, n);
  return sorted.slice(0, n);
}
