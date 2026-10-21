// シンプルなCPU。エンジンの行動を1つずつ返す
import { def, checkPlay, targetsFor, canAttackWith, canBlockWith, power, levelSum } from './engine.js';

// 自分のメインフェイズで次にする行動（なければ endTurn）
export function cpuMainAction(state, p) {
  const me = state.players[p], foe = state.players[1 - p];

  if (state.rights.mana > 0) {
    const k = me.hand.find((c) => def(c).type === 'maryoku');
    if (k) return { type: 'placeMana', uid: k.uid, faceUp: true };
    // マリョクがなければ、今は使えない一番重いカードを裏向きで置く（6枚まで）
    if (me.mana.length < 6 && me.hand.length > 1) {
      const heavy = [...me.hand].sort((a, b) => def(b).level - def(a).level)[0];
      if (heavy && def(heavy).level > levelSum(me) + 1) return { type: 'placeMana', uid: heavy.uid, faceUp: false };
    }
  }

  const playable = me.hand.filter((c) => def(c).type !== 'maryoku' && checkPlay(state, p, c.uid).ok);
  const ijin = playable.filter((c) => def(c).type === 'ijin').sort((a, b) => def(b).power - def(a).power)[0];
  if (ijin) return { type: 'play', uid: ijin.uid };
  const haikei = playable.find((c) => def(c).type === 'haikei');
  if (haikei) return { type: 'play', uid: haikei.uid };
  for (const c of playable.filter((c) => def(c).type === 'mahou')) {
    const d = def(c);
    if (d.effect === 'destroy3') {
      const t = targetsFor(state, p, d).sort((x, y) => power(state, 1 - p, find(foe, y)) - power(state, 1 - p, find(foe, x)))[0];
      if (t) return { type: 'play', uid: c.uid, target: t };
    }
    if (d.effect === 'draw2' && me.hand.length <= 4) return { type: 'play', uid: c.uid };
    if (d.effect === 'rally' && !state.battleUsed && me.field.filter((x) => canAttackWith(state, p, x)).length >= 2) return { type: 'play', uid: c.uid };
  }

  if (!state.battleUsed) {
    const ready = me.field.filter((c) => canAttackWith(state, p, c));
    if (ready.length) {
      const foeBlockers = [...foe.field.filter(canBlockWith), ...foe.guardians.filter((g) => !g.tapped)];
      const need = ready.reduce((s, c) => s + (def(c).kw.double ? 2 : 1), 0);
      // 相手の壁より多く攻めれば勝ち
      if (need > foeBlockers.length || ready.some((c) => def(c).kw.unblockable)) return { type: 'declareAttack', attackers: ready.map((c) => c.uid) };
      const best = Math.max(0, ...foe.field.filter(canBlockWith).map((c) => power(state, 1 - p, c, 'blk')));
      const safe = ready.filter((c) => power(state, p, c, 'atk') > best);
      if (safe.length) return { type: 'declareAttack', attackers: safe.map((c) => c.uid) };
    }
  }
  return { type: 'endTurn' };
}

const find = (pl, uid) => pl.field.find((c) => c.uid === uid);

// 相手のアタックに対するブロック割り当て
export function cpuBlocks(state, p) {
  const me = state.players[p], foe = state.players[1 - p];
  const atks = state.battle.attackers.map((u) => foe.field.find((c) => c.uid === u))
    .sort((x, y) => power(state, 1 - p, y, 'atk') - power(state, 1 - p, x, 'atk'));
  let ijins = me.field.filter(canBlockWith);
  let guards = me.guardians.filter((g) => !g.tapped);
  const blocks = {};
  const take = (list, inst) => list.filter((c) => c.uid !== inst.uid);

  for (const a of atks) {
    const ap = power(state, 1 - p, a, 'atk');
    const need = def(a).kw.double ? 2 : 1;
    const picks = [];
    // 勝てるイジン → 相打ちできるイジン → ガーディアン → 残りのイジン
    const pw = (c) => power(state, p, c, 'blk');
    const order = [
      ...ijins.filter((c) => pw(c) > ap).sort((x, y) => pw(x) - pw(y)),
      ...ijins.filter((c) => pw(c) === ap),
      ...guards,
      ...ijins.filter((c) => pw(c) < ap),
    ];
    for (const c of order) {
      if (picks.length >= need) break;
      if (picks.includes(c)) continue;
      picks.push(c);
    }
    for (const c of picks) {
      ijins = take(ijins, c);
      guards = take(guards, c);
    }
    blocks[a.uid] = picks.map((c) => c.uid);
  }
  return blocks;
}
