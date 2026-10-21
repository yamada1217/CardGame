// イジンデン ゲームの進行（ターン・行動・バトル）。効果の中身は js/effects、仕組みは js/core.js
import { CARDS, DECKS } from './cards.js';
import {
  E, ITEMS, def, opp, clone, random, shuffle, log, name, turnOrder, pushFront, findOnBoard, list, stat, active, rule,
  power, pressure, isDouble, levelSum, availableColors, hasColor, move, putOnField, emit, draw, tap, untap, destroy,
  mahouBlocked, ownerOf, payMana, isIjin, ijinsOf, haikeisOf, pick, manaColors, endGame,
} from './core.js';
import './effects/index.js';

export { def, power, isDouble, levelSum, hasColor, findOnBoard, stat, ijinsOf, haikeisOf, pressure };
export const STONE = { red: 'R-13', blue: 'B-13', green: 'G-13', yellow: 'Y-13', purple: 'P-16' };

export function createGame({ seed = Date.now() >>> 0, names = ['あなた', 'あいて'], decks = ['R01', 'B01'], first = null } = {}) {
  const s = {
    seed, turn: 0, turnNo: 0, phase: 'mulligan', winner: null, winReason: '', inc: 0,
    rights: { mana: 1, summon: 1 }, battlesLeft: 1, battle: null, log: [], queue: [], prompt: null, tmp: [], tf: newTf(),
    mulligan: [null, null],
    players: [0, 1].map((p) => ({
      name: names[p], deckId: Array.isArray(decks[p]) ? 'custom' : decks[p],
      deck: (Array.isArray(decks[p]) ? decks[p] : DECKS[decks[p]].cards).map((id, n) => ({ uid: `${p}-${n}`, id })),
      hand: [], mana: [], field: [], guardians: [], grave: [], turnsTaken: 0,
    })),
  };
  for (const pl of s.players) {
    shuffle(s, pl.deck);
    pl.hand = pl.deck.splice(0, 6);
    pl.guardians = pl.deck.splice(0, 4).map((c) => ({ ...c, tapped: false, enteredTurn: 0 }));
  }
  s.turn = first ?? (random(s) < 0.5 ? 0 : 1);
  s.first = s.turn;
  log(s, `${s.players[s.turn].name}の先攻`);
  return s;
}

function newTf() {
  return { once: {}, drewByMana: [false, false], destroyedTypes: [[], []], attackerDestroyed: false, battled: false, used: [0, 0], haikeis: 0, manaFromGrave: false };
}

// ---------- 参照用 ----------

export const canBlockWith = (inst) => !inst.tapped; // 互換用（詳しくは canBlockPair）

// blocker: 防御側のカード（ガーディアンは guardian: true）。d: 防御側
export function canBlockPair(s, d, blocker, attacker) {
  const f = findOnBoard(s, blocker.uid);
  if (!f) return false;
  const bst = stat(s, f.inst, f);
  const isG = f.zone === 'guardians' && !bst.types.has('ijin');
  if (f.zone === 'mana') return canStand(s, d, f.inst);
  if (!isG && !bst.types.has('ijin')) return false;
  if (!isG && (bst.kw.cannotBlock || rule(s, 'cannotBlock', f))) return false;
  if (f.inst.tapped && !bst.kw.watcher) return false;
  const a = opp(d);
  const af = findOnBoard(s, attacker.uid);
  const ast = stat(s, attacker, af);
  for (const u of ast.unblock) {
    if (u.by === 'guardian' && isG) return false;
    if (u.by === 'ijin' && !isG) {
      if (u.powerMin !== undefined && power(s, d, f.inst, 'blk') < u.powerMin) continue;
      if (u.powerMax !== undefined && power(s, d, f.inst, 'blk') > u.powerMax) continue;
      if (u.levelMax !== undefined && def(f.inst).level > u.levelMax) continue;
      if (u.color && !bst.colors.has(u.color)) continue;
      if (u.unequipped && (f.inst.equips || []).length) continue;
      return false;
    }
  }
  if (rule(s, 'cantBlockPair', f, af, a)) return false;
  return true;
}

// スタンド：魔力ゾーンに裏向きのこのイジンを、ブロッカーに選べる
export function canStand(s, d, inst) {
  const f = findOnBoard(s, inst.uid);
  if (!f || f.zone !== 'mana' || f.p !== d || inst.faceUp) return false;
  const dd = def(inst);
  if (dd.type !== 'ijin' || !dd.kw.stand) return false;
  return !dd.colors.length || dd.colors.some((c) => hasColor(s, d, c));
}

export function canAttackWith(s, p, inst) {
  const f = findOnBoard(s, inst.uid);
  if (!f || f.p !== p || (f.zone !== 'field' && f.zone !== 'guardians')) return false;
  const st = stat(s, inst, f);
  if (!st.types.has('ijin') || st.kw.cannotAttack || rule(s, 'cannotAttack', f) || rule(s, 'noBattle', p)) return false;
  if (inst.tapped && !st.kw.attackTapped) return false;
  return inst.enteredTurn !== s.turnNo || !!st.kw.sokuo || s.tmp.some((t) => t.sokuoFor === inst.uid);
}

// 手札から使うときのレベル
export function playLevel(s, p, inst) {
  const d = def(inst);
  let lv = d.level;
  const sc = E[d.id];
  if (sc?.play?.level) lv = sc.play.level(s, p, lv, inst);
  lv += rule(s, 'playLevel', p, inst, d) || 0;
  return Math.max(0, lv);
}
export const effectiveLevel = (s, p, d) => playLevel(s, p, { uid: `${p}-x`, id: d.id });

export function playColors(s, p, inst) {
  const d = def(inst);
  if (rule(s, 'colorless', p, inst, d)) return [];
  return d.colors;
}

export function mahouCost(s, p, inst) {
  const d = def(inst);
  if (d.type !== 'mahou') return 0;
  let c = d.cost + (rule(s, 'mahouCost', p, inst, d) || 0);
  if (s.tmp.some((t) => t.flag === 'mahouFree' && t.p === p)) c = 0;
  return Math.max(0, c);
}

// 手札のカードが今使えるか。理由つきで返す
export function checkPlay(s, p, uid) {
  const pl = s.players[p];
  const inst = pl.hand.find((c) => c.uid === uid);
  if (!inst) return { ok: false, why: '手札にありません' };
  if (s.phase !== 'main' || s.turn !== p || s.prompt || s.queue.length) return { ok: false, why: '自分のメインフェイズではありません' };
  const d = def(inst);
  if (d.type === 'maryoku') return s.rights.mana > 0 || (rule(s, 'manaBySummon', p) && s.rights.summon > 0) ? { ok: true } : { ok: false, why: 'マリョク配置権がありません' };
  if (rule(s, 'noPlay', p, inst, d)) return { ok: false, why: '今はこのカードを使えません' };
  const cols = playColors(s, p, inst);
  if (cols.length && !cols.some((c) => hasColor(s, p, c)) && !rule(s, 'ignoreColor', p, inst, d)) return { ok: false, why: `${cols.map((c) => ({ red: '赤', blue: '青', green: '緑', yellow: '黄', purple: '紫' })[c]).join('か')}の表向きマリョクが必要です` };
  const lv = playLevel(s, p, inst), have = levelSum(s, p);
  if (have < lv) {
    const red = (E[d.id]?.play?.reduce?.(s, p, inst) || 0) + (d.type === 'ijin' ? tapReduce(s, p) : 0);
    if (have < lv - red) return { ok: false, why: `レベル${lv}が必要です（今は${have}）` };
  }
  if (d.type === 'ijin' && !summonRight(s, p, inst)) return { ok: false, why: 'イジン召喚権がありません' };
  if (d.type === 'mahou') {
    const cost = mahouCost(s, p, inst);
    const payable = rule(s, 'noFaceDownCost', p) ? pl.mana.filter((m) => m.faceUp).length : pl.mana.length;
    const extra = rule(s, 'discardForCost', p) ? pl.hand.length - 1 : 0;
    if (payable + extra < cost) return { ok: false, why: `魔力ゾーンに${cost}枚必要です` };
    const why = mahouBlocked(s, p, d, inst);
    if (why) return { ok: false, why };
  }
  return { ok: true };
}

function tapReduceOpts(s, p) {
  return rule(s, 'tapReduce', p) ? ijinsOf(s, p).filter((c) => !c.tapped).map((c) => c.uid).slice(0, 99) : [];
}
function tapReduce(s, p) { return Math.min(3, tapReduceOpts(s, p).length); }

function summonRight(s, p, inst) {
  if (s.rights.summon > 0) return 'summon';
  if (rule(s, 'freeSummon', p, inst)) return 'free';
  if (rule(s, 'summonByMana', p) && s.rights.mana > 0) return 'mana';
  return null;
}

// ---------- ターン ----------

function startTurn(s) {
  const p = s.turn, pl = s.players[p];
  s.turnNo++;
  s.tmp = s.tmp.filter((t) => t.until >= s.turnNo);
  s.tf = newTf();
  s.deckEmptyFired = null;
  if (pl.deck.length === 0) return endGame(s, opp(p), `${pl.name}の山札が尽きた`);
  s.rights = { mana: rule(s, 'twoManaRights', p) ? 2 : 1, summon: 1 };
  s.battlesLeft = 1;
  s.phase = 'start';
  for (const m of pl.mana) if (m.faceUp && def(m).kw.shoumou) m.faceUp = false; // 消耗
  for (const c of [...pl.field, ...pl.guardians]) untap(s, c.uid, false);
  log(s, `― ${pl.name}のターン ―`, p);
  pushFront(s, [{ k: 'phase', step: 'startEnd' }, { k: 'phase', step: 'draw' }, { k: 'phase', step: 'main' }]);
  run(s);
}

const PHASE = {
  startEnd: (s) => emit(s, 'startEnd', { p: s.turn }),
  draw: (s) => {
    const p = s.turn, pl = s.players[p];
    s.phase = 'draw';
    pushFront(s, [{ k: 'phase', step: 'doDraw' }]);
    emit(s, 'drawStart', { p });
  },
  doDraw: (s) => {
    const p = s.turn, pl = s.players[p];
    const skip = p === s.first && pl.turnsTaken === 0;
    pl.turnsTaken++;
    if (!skip && !rule(s, 'noPhaseDraw', p)) draw(s, p, 1, { byAbility: false });
  },
  main: (s) => {
    s.phase = 'main';
    pushFront(s, [{ k: 'phase', step: 'mainReady' }]);
    emit(s, 'mainStart', { p: s.turn });
  },
  mainReady: (s) => { s.phase = 'main'; },
  end: (s) => {
    s.phase = 'end';
    pushFront(s, [{ k: 'phase', step: 'finish' }]);
    emit(s, 'endStart', { p: s.turn });
    if (s.tmp.some((t) => t.flag === 'loseAtEnd' && t.p === s.turn)) endGame(s, opp(s.turn), 'ファイナルアタックの代償');
  },
  finish: (s) => { s.turn = opp(s.turn); startTurn(s); },
  toBlock: (s) => { if (s.battle) s.phase = 'block'; },
  blockStart: (s) => { if (s.battle) emit(s, 'blockStart', { p: s.turn }); },
  afterBlocks: (s) => {
    if (!s.battle) return;
    const b = s.battle;
    const items = [{ k: 'phase', step: 'resolveStart' }];
    pushFront(s, items);
    for (const [a, bl] of Object.entries(b.blocks)) {
      if (bl.length) emit(s, 'blocked', { uid: a, p: s.turn, blockers: bl });
      for (const u of bl) emit(s, 'block', { uid: u, p: opp(s.turn), attacker: a, guardian: findOnBoard(s, u)?.zone === 'guardians' });
    }
  },
  resolveStart: (s) => {
    if (!s.battle) return;
    s.phase = 'resolve';
    pushFront(s, [...s.battle.attackers.map((uid) => ({ k: 'resolveBattle', uid })), { k: 'phase', step: 'battleEnd' }]);
    emit(s, 'resolveStart', { p: s.turn });
  },
  battleEnd: (s) => { s.battle = null; s.phase = 'main'; s.tf.battled = true; },
};

ITEMS.phase = (s, it) => PHASE[it.step](s, it);
ITEMS.resolveBattle = (s, it) => resolveAttacker(s, it);
ITEMS.playCard = (s, it) => playCard(s, it);
ITEMS.abort = (s) => abortTurn(s);

export function run(s) {
  let guardN = 0;
  while (!s.prompt && s.queue.length && s.phase !== 'over') {
    if (++guardN > 5000) { s.queue = []; log(s, '処理が長すぎるため中断しました'); break; }
    const it = s.queue.shift();
    ITEMS[it.k](s, it);
  }
}


// ターンを途中で終える（タイムディレイション等）
export function abortTurn(s) {
  s.queue = [];
  s.battle = null;
  s.prompt = null;
  log(s, 'ターンを終了した');
  s.turn = opp(s.turn);
  pushFront(s, [{ k: 'phase', step: 'begin' }]);
}
PHASE.begin = (s) => startTurn(s);

// ---------- バトル解決 ----------

function resolveAttacker(s, it) {
  const a = s.turn, d = opp(a);
  const b = s.battle;
  if (!b || !b.attackers.includes(it.uid)) return;
  const af = findOnBoard(s, it.uid);
  if (!af || (af.zone !== 'field' && af.zone !== 'guardians') || af.inst.destroyed) return;
  const atk = af.inst;
  const blockers = (it.again ? [] : (b.blocks[it.uid] || [])).map((u) => findOnBoard(s, u))
    .filter((f) => f && (f.zone === 'field' || f.zone === 'guardians') && !f.inst.destroyed && f.p === d);
  const need = pressure(s, a, atk);
  if (blockers.length < need || blockers.length === 0) {
    log(s, `${name(atk)}の攻撃が通った！`, a);
    return endGame(s, a, `${name(atk)}の攻撃を防げなかった`);
  }
  const ap = power(s, a, atk, 'atk');
  const bp = (f) => (f.zone === 'guardians' && !stat(s, f.inst, f).types.has('ijin') ? 0 : power(s, d, f.inst, 'blk'));
  const isG = (f) => f.zone === 'guardians' && !stat(s, f.inst, f).types.has('ijin');
  const sum = blockers.reduce((t, f) => t + bp(f), 0);
  log(s, `${name(atk)}(${ap}) vs ${blockers.map((f) => (isG(f) ? 'ガーディアン' : `${name(f.inst)}(${bp(f)})`)).join('＋')}`, a);
  const ast = stat(s, atk, af);
  const atkLoses = sum >= ap || (blockers.some(isG) && rule(s, 'guardWard', d, ap));
  const lostTo = [];
  for (const f of blockers) if (isG(f) ? ap > 0 : bp(f) <= ap) lostTo.push(f.inst.uid);
  const fleet = s.tmp.some((t) => t.flag === 'fleet' && t.p === a);
  // 負けたアタッカーは、ブロッカーにドレイン・韓信がいれば特別な扱い
  const bDrain = blockers.some((f) => stat(s, f.inst, f).kw.drain);
  const toBottom = blockers.some((f) => rule(s, 'loserToBottom', f));
  if (atkLoses && !fleet) {
    const hit = destroy(s, [atk.uid], { battle: true, drain: bDrain, toBottom });
    if (hit.length) s.tf.attackerDestroyed = true;
  }
  destroy(s, lostTo, { battle: true, drain: !!ast.kw.drain, p: a });
  if (!atkLoses) {
    emit(s, 'win', { uid: atk.uid, p: a });
    if (ast.kw.mortal) {
      const i = s.queue.findIndex((q) => q.k === 'phase' && q.step === 'battleEnd');
      if (i >= 0) s.queue.splice(i, 0, { k: 'resolveBattle', uid: atk.uid, again: true });
    }
  }
}

// ---------- 使う ----------

function playCard(s, it) {
  const p = it.p, pl = s.players[p];
  const inst = pl.hand.find((c) => c.uid === it.uid);
  if (!inst && !it.placed) return;
  const d = def(inst || it.card);
  const sc = E[d.id];
  // レベルが足りないときの軽減（任意のコスト）
  if (!it.placed && sc?.play?.payReduce && levelSum(s, p) < playLevel(s, p, inst)) {
    const r = sc.play.payReduce(s, it, levelSum(s, p), playLevel(s, p, inst));
    if (r === undefined) return;
  }
  // 劉備：自分のイジンを寝かせてレベルを下げる
  if (!it.placed && d.type === 'ijin' && levelSum(s, p) < playLevel(s, p, inst) - (it.tapRed || 0)) {
    const need = playLevel(s, p, inst) - levelSum(s, p);
    const a = pick(s, it, 'tapRed', { title: `寝かせるイジンを${need}体選ぶ（1体につきレベル-1）`, options: tapReduceOpts(s, p), min: need, max: need });
    if (!a) return;
    for (const u of a) tap(s, u);
    it.tapRed = a.length;
  }
  // 千利休：手札を墓地に置いて魔力コストを減らす
  if (!it.placed && d.type === 'mahou') {
    const payable = rule(s, 'noFaceDownCost', p) ? pl.mana.filter((m) => m.faceUp).length : pl.mana.length;
    const need = mahouCost(s, p, inst) - payable;
    if (need > 0) {
      const a = pick(s, it, 'disc', { title: `魔力コストのかわりに墓地に置く手札を${need}枚選ぶ`, options: pl.hand.filter((c) => c.uid !== inst.uid).map((c) => c.uid), min: need, max: need });
      if (!a) return;
      it.reduced = need;
      for (const u of a) move(s, u, 'grave', { by: p });
    }
  }
  if (!it.placed) {
    it.placed = true;
    it.card = { uid: inst.uid, id: inst.id };
    pl.hand.splice(pl.hand.indexOf(inst), 1);
    s.tf.used[p]++;
    if (d.type === 'ijin') {
      const r = summonRight(s, p, inst);
      if (r === 'summon') s.rights.summon--; else if (r === 'mana') s.rights.mana--;
      const fi = putOnField(s, p, inst, { summoned: true, noEmit: true });
      it.fieldUid = fi.uid;
    } else if (d.type === 'haikei') {
      s.tf.haikeis++;
      putOnField(s, p, inst);
      return;
    } else {
      const cost = mahouCost(s, p, inst) - (it.reduced || 0);
      payMana(s, p, cost, { faceDownOk: !rule(s, 'noFaceDownCost', p) });
      log(s, `マホウ「${d.name}」を発動`, p);
      pl.grave.push(sc?.meisoOnUse ? { uid: inst.uid, id: inst.id, meiso: true } : { uid: inst.uid, id: inst.id });
      pushFront(s, [{ k: 'mahou', p, id: d.id, src: inst.uid }]);
      emit(s, 'mahouUsed', { uid: inst.uid, p });
      return;
    }
  }
  // イジン召喚：装備させるカードを選ぶ → 戦場に置かれたとき
  const holder = findOnBoard(s, it.fieldUid);
  if (!holder || holder.zone !== 'field') return;
  const opts = equipOptions(s, p, holder.inst);
  const a = opts.length ? pick(s, it, 'equip', { title: `${d.name}に装備させるカードを選ぶ（任意）`, options: opts, min: 0, max: opts.length, src: it.fieldUid }) : [];
  if (!a) return;
  for (const u of a) {
    const f = findOnBoard(s, u);
    if (!f) continue;
    s.players[f.p][f.zone].splice(f.i, 1);
    (holder.inst.equips = holder.inst.equips || []).push({ uid: u, id: f.inst.id, from: f.zone, faceUp: f.inst.faceUp });
    log(s, `${name(f.inst)}を${d.name}に装備`, p);
    if (f.zone === 'mana') emit(s, 'manaLeave', { uid: u, p, from: 'mana', to: 'equip', by: p });
  }
  emit(s, 'enter', { uid: holder.inst.uid, p, summoned: true, from: 'hand' });
  emit(s, 'summoned', { uid: holder.inst.uid, p });
}

function equipOptions(s, p, ijin) {
  const pl = s.players[p];
  const out = [];
  const cand = [...pl.mana.filter((m) => m.faceUp).map((c) => [c, 'mana']), ...pl.field.filter((c) => c.uid !== ijin.uid).map((c) => [c, 'field']), ...pl.grave.map((c) => [c, 'grave'])];
  for (const [c, zone] of cand) {
    const eq = E[c.id]?.equip;
    if (!eq) continue;
    const from = eq.from || 'mana';
    if (zone === 'grave' ? !(from === 'grave' || c.meiso) : from !== zone) continue;
    if (zone !== 'grave' && !active(s, { inst: c, p, zone })) continue;
    if (eq.ok && !eq.ok(s, p, ijin)) continue;
    out.push(c.uid);
  }
  return out;
}

// ---------- 行動 ----------

export function applyAction(prev, p, action) {
  const s = clone(prev);
  const err = (why) => ({ ok: false, why, state: prev });
  if (s.phase === 'over') return err('ゲームは終了しています');
  const pl = s.players[p];

  if (action.type === 'mulligan') {
    if (s.phase !== 'mulligan' || s.mulligan[p] !== null) return err('今は引き直しできません');
    s.mulligan[p] = !!action.redo;
    if (action.redo) {
      pl.deck.push(...pl.hand); pl.hand = [];
      shuffle(s, pl.deck);
      pl.hand = pl.deck.splice(0, 6);
      log(s, `${pl.name}は手札を引き直した`, p);
    }
    if (s.mulligan.every((m) => m !== null)) startTurn(s);
    return { ok: true, state: s };
  }

  if (action.type === 'choose') {
    const pr = s.prompt;
    if (!pr || pr.p !== p) return err('今は選べません');
    const picks = [...new Set(action.picks || [])];
    if (pr.confirm) {
      if (picks.length > 1) return err('選び方が正しくありません');
    } else if (!pr.info) {
      if (picks.length < pr.min || picks.length > pr.max || picks.some((u) => !pr.options.includes(u))) return err(`${pr.min === pr.max ? pr.min : `${pr.min}〜${pr.max}`}つ選んでください`);
    }
    s.prompt = null;
    const q0 = s.queue[0];
    q0.ans = { ...(q0.ans || {}), [q0.waiting]: pr.confirm ? (picks.length ? ['yes'] : []) : pr.info ? [] : picks };
    run(s);
    return { ok: true, state: s };
  }

  if (s.prompt) return err('選択を待っています');

  if (action.type === 'declareBlocks') {
    if (s.phase !== 'block' || p !== opp(s.turn)) return err('ブロックの番ではありません');
    const blocks = {};
    const used = new Set();
    const A = s.turn;
    const stands = [];
    for (const au of s.battle.attackers) {
      const af = findOnBoard(s, au);
      const list_ = [...new Set((action.blocks || {})[au] || [])];
      for (const bu of list_) {
        if (used.has(bu)) return err('同じカードで2体はブロックできません');
        const f = findOnBoard(s, bu);
        if (!f || f.p !== p || !af || !canBlockPair(s, p, f.inst, af.inst)) return err('そのカードではブロックできません');
        if (f.zone === 'mana') stands.push(bu);
        used.add(bu);
      }
      if (af && list_.length && list_.length < pressure(s, A, af.inst)) return err(`${name(af.inst)}は${pressure(s, A, af.inst)}体以上でないとブロックできません`);
      blocks[au] = list_;
    }
    // 山田長政など：決められたブロッカー
    for (const f of s.tmp.filter((t) => t.mustBlock)) {
      const bf = findOnBoard(s, f.mustBlock.blocker), af = findOnBoard(s, f.mustBlock.attacker);
      if (!bf || !af || !s.battle.attackers.includes(af.inst.uid) || !canBlockPair(s, p, bf.inst, af.inst)) continue;
      for (const k of Object.keys(blocks)) blocks[k] = blocks[k].filter((u) => u !== bf.inst.uid);
      blocks[af.inst.uid] = [...(blocks[af.inst.uid] || []), bf.inst.uid];
    }
    for (const u of stands) {
      const f = findOnBoard(s, u);
      s.players[p].mana.splice(f.i, 1);
      log(s, `スタンド：${name(f.inst)}`, p);
      putOnField(s, p, { uid: u, id: f.inst.id }, { from: 'mana' });
    }
    s.battle.blocks = blocks;
    pushFront(s, [{ k: 'phase', step: 'afterBlocks' }]);
    run(s);
    return { ok: true, state: s };
  }

  if (s.turn !== p) return err('相手のターンです');
  if (s.phase !== 'main' || s.queue.length) return err('今はその行動ができません');

  switch (action.type) {
    case 'placeMana': {
      const fromGrave = pl.grave.some((c) => c.uid === action.uid);
      const zone = fromGrave ? pl.grave : pl.hand;
      const i = zone.findIndex((c) => c.uid === action.uid);
      if (i < 0) return err('手札にありません');
      const faceUp = !!action.faceUp;
      const d = def(zone[i]);
      if (faceUp && d.type !== 'maryoku') return err('表向きに置けるのはマリョクだけです');
      if (faceUp && rule(s, 'noFaceUpMana', p)) return err('今は表向きでマリョク配置できません');
      if (fromGrave && (!faceUp || !rule(s, 'manaFromGrave', p) || s.tf.manaFromGrave)) return err('墓地からは置けません');
      if (s.rights.mana > 0) s.rights.mana--;
      else if (rule(s, 'manaBySummon', p) && s.rights.summon > 0) s.rights.summon--;
      else return err('マリョク配置権がありません');
      if (fromGrave) s.tf.manaFromGrave = true;
      const [c] = zone.splice(i, 1);
      pl.mana.push({ ...c, faceUp });
      log(s, faceUp ? `${d.name}を配置` : 'カードを裏向きで魔力ゾーンに配置', p);
      emit(s, 'toMana', { uid: c.uid, p, from: fromGrave ? 'grave' : 'hand', faceUp, placement: true });
      emit(s, 'manaPlaced', { uid: c.uid, p, faceUp });
      run(s);
      break;
    }
    case 'play': {
      const chk = checkPlay(s, p, action.uid);
      if (!chk.ok) return err(chk.why);
      if (def(pl.hand.find((c) => c.uid === action.uid)).type === 'maryoku') return err('マリョクは配置してください');
      pushFront(s, [{ k: 'playCard', p, uid: action.uid }]);
      run(s);
      break;
    }
    case 'declareAttack': {
      if (s.battlesLeft < 1) return err('バトルはこのターン1回までです');
      if (rule(s, 'noBattle', p)) return err('このターンはバトルできません');
      const list_ = [...new Set(action.attackers || [])];
      if (!list_.length) return err('アタッカーを選んでください');
      for (const u of list_) {
        const f = findOnBoard(s, u);
        if (!f || !canAttackWith(s, p, f.inst)) return err('そのイジンはアタックできません');
      }
      s.battlesLeft--;
      s.battle = { attackers: list_, blocks: {} };
      s.phase = 'attack';
      log(s, `${list_.map((u) => name(findOnBoard(s, u).inst)).join('・')}でアタック！`, p);
      pushFront(s, [{ k: 'phase', step: 'blockStart' }, { k: 'phase', step: 'toBlock' }]);
      emit(s, 'attackDeclared', { p, attackers: list_ });
      for (const u of [...list_].reverse()) emit(s, 'attack', { uid: u, p });
      for (const u of list_) { const f = findOnBoard(s, u); f.inst.tapped = true; emit(s, 'tap', { uid: u, p, zone: f.zone, byAbility: false }); }
      run(s);
      break;
    }
    case 'endTurn': {
      pushFront(s, [{ k: 'phase', step: 'end' }]);
      run(s);
      break;
    }
    default:
      return err('不明な行動です');
  }
  return { ok: true, state: s };
}

// 今、誰の操作を待っているか
export function waitingFor(s) {
  if (s.phase === 'over') return null;
  if (s.prompt) return s.prompt.p;
  if (s.phase === 'mulligan') return s.mulligan.map((m, i) => (m === null ? i : null)).filter((x) => x !== null);
  if (s.phase === 'block') return opp(s.turn);
  return s.turn;
}

export { list, availableColors, manaColors, isIjin, CARDS, rule };
