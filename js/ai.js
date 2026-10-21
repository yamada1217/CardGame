// シンプルなCPU。エンジンの行動を1つずつ返す
import { def, checkPlay, canAttackWith, canBlockPair, canStand, power, levelSum, pressure, playLevel, findOnBoard, stat, ijinsOf } from './engine.js';

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

// アタックできるカード（イジン扱いのガーディアンも含む）
const attackers = (s, p) => [...s.players[p].field, ...s.players[p].guardians].filter((c) => canAttackWith(s, p, c));

function cpuMainAction(state, p) {
  const me = state.players[p], foe = state.players[1 - p];

  if (state.rights.mana > 0) {
    const k = me.hand.find((c) => def(c).type === 'maryoku');
    if (k) return { type: 'placeMana', uid: k.uid, faceUp: true };
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
