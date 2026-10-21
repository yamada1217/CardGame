// イジンデン ルールエンジン（中核）
// 「状態 + 行動 → 新しい状態」。能力は state.queue に積んで順に解決し、選択が必要なら state.prompt を出して止まる。
// カードごとの効果は js/effects/*.js が register() で E に登録する。状態には関数を入れない（同期・複製のため）。
import { CARDS } from './cards.js';

export const E = {};    // カードID → 効果スクリプト
export const TRIG = {}; // トリガーのキー → 定義
export const def = (inst) => CARDS[inst.id];
export const opp = (p) => 1 - p;
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const ownerOf = (uid) => Number(String(uid).split('-')[0]);
export const ALL_COLORS = ['red', 'blue', 'green', 'yellow', 'purple'];
export const COLOR_JA = { red: '赤', blue: '青', green: '緑', yellow: '黄', purple: '紫' };

// ---------- 登録 ----------
// スクリプトの形:
//  aura: [{ zones?, to(s, src, tgt) => grant }]   常在効果（src/tgt は { inst, p, zone }）
//  self(s, src) => grant                          自分だけの常在効果
//  strip(s, src, tgt) => bool                     tgt は能力すべてを失う（能力で失われない側）
//  rules: { key(s, src, ...args) => bool|number }  ルール変更。ruleZones で効く場所
//  trig: [{ on, self?, zones?, if?, run, once?, opt?, voyage?, shippitsu?, kikki?, chobo? }]
//  enter/attack/destroyed/block/blocked/win/tap/mainStart/endStart: trig の省略形
//  mahou: { can?(s, p) => 理由|null, run(s, it) }
//  equip: { from: 'mana'|'field'|'grave', ok?(s, p, ijin), grant(s, holder) => grant, trig? }
//  play: { level?(s, p, lv) => lv }
//  grants: { name: trig }                          他のカードに与えるトリガー
const SELF_EV = { enter: 'enter', attack: 'attack', destroyed: 'destroyed', block: 'block', blocked: 'blocked', win: 'win', tap: 'tap' };
const TURN_EV = { mainStart: 'mainStart', endStart: 'endStart' };

function normTrig(t) { return typeof t === 'function' ? { run: t } : t; }

export function register(scripts) {
  for (const [id, sc] of Object.entries(scripts)) {
    sc.trig = sc.trig || [];
    for (const [k, on] of Object.entries(SELF_EV)) if (sc[k]) sc.trig.push({ on, self: true, ...normTrig(sc[k]) });
    for (const [k, on] of Object.entries(TURN_EV)) if (sc[k]) sc.trig.push({ on, mine: true, ...normTrig(sc[k]) });
    if (sc.self) (sc.aura = sc.aura || []).push({ zones: sc.selfZones, to: (s, src, t) => (t.inst.uid === src.inst.uid ? sc.self(s, src) : null) });
    sc.trig.forEach((t, i) => { t.key = `${id}#${i}`; TRIG[t.key] = t; });
    for (const [n, t] of Object.entries(sc.grants || {})) { t.key = `${id}@${n}`; TRIG[t.key] = t; }
    if (sc.equip) (sc.equip.trig || []).forEach((t, i) => { t.key = `${id}!${i}`; TRIG[t.key] = t; });
    E[id] = sc;
  }
}

// ---------- 乱数・ログ ----------

export function random(s) {
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function log(s, text, p = null) {
  s.log.push({ text, p });
  if (s.log.length > 300) s.log.shift();
}

export const name = (inst) => def(inst).name;
export const turnOrder = (s) => [s.turn, opp(s.turn)];
export const pushFront = (s, items) => s.queue.unshift(...items);

// ---------- 場所 ----------

const ZONES = ['field', 'guardians', 'mana', 'hand', 'grave', 'deck'];

export function findOnBoard(s, uid) {
  for (const p of [0, 1]) {
    const pl = s.players[p];
    for (const zone of ZONES) {
      const i = pl[zone].findIndex((c) => c.uid === uid);
      if (i >= 0) return { p, zone, i, inst: pl[zone][i] };
    }
    for (const h of pl.field) {
      const i = (h.equips || []).findIndex((c) => c.uid === uid);
      if (i >= 0) return { p, zone: 'equip', i, inst: h.equips[i], holder: h };
    }
  }
  return null;
}

// 条件に合うカード { inst, p, zone } の一覧。who: 'me' | 'opp' | 'both'
export function list(s, p, who, zone, pred = null) {
  const ps = who === 'me' ? [p] : who === 'opp' ? [opp(p)] : [p, opp(p)];
  const out = [];
  for (const q of ps) {
    if (zone === 'equip') {
      for (const h of s.players[q].field) for (const e of h.equips || []) { const f = { inst: e, p: q, zone: 'equip', holder: h }; if (!pred || pred(f)) out.push(f); }
      continue;
    }
    for (const c of s.players[q][zone]) { const f = { inst: c, p: q, zone }; if (!pred || pred(f)) out.push(f); }
  }
  return out;
}
export const uids = (fs) => fs.map((f) => f.inst.uid);

// ---------- 状態の計算（常在効果） ----------

const guard = new Set();

function baseStat(s, inst, zone) {
  const d = def(inst);
  const onField = zone === 'field';
  const st = {
    types: new Set(zone === 'guardians' ? [] : [d.type]), colors: new Set(zone === 'guardians' || (zone === 'mana' && !inst.faceUp) ? [] : d.colors),
    traits: new Set(zone === 'guardians' ? [] : d.traits), power: zone === 'guardians' ? 0 : d.power || 0, atk: 0, blk: 0, level: d.level,
    press: 0, kw: {}, unblock: [], trig: [], lost: false, setPower: null, guardian: zone === 'guardians',
  };
  if (onField || zone === 'mana' || zone === 'grave' || zone === 'hand') {
    const k = d.kw || {};
    Object.assign(st.kw, k);
    st.atk = k.atk || 0; st.blk = k.blk || 0;
    st.press = k.quad ? 4 : k.triple ? 3 : k.double ? 2 : 0;
    if (k.unblockIjin) st.unblock.push({ by: 'ijin' });
  }
  return st;
}

function applyGrant(st, g) {
  if (!g) return;
  if (g.power) st.power += g.power;
  if (g.atk) st.atk += g.atk;
  if (g.blk) st.blk += g.blk;
  if (g.level) st.level += g.level;
  if (g.setPower !== undefined) st.setPower = g.setPower;
  if (g.press) st.press = Math.max(st.press, g.press);
  if (g.kw) Object.assign(st.kw, g.kw);
  if (g.traits) g.traits.forEach((t) => st.traits.add(t));
  if (g.colors) g.colors.forEach((c) => st.colors.add(c));
  if (g.loseColors) st.colors.clear();
  if (g.types) g.types.forEach((t) => st.types.add(t));
  if (g.unblock) st.unblock.push(...g.unblock);
  if (g.trig) st.trig.push(...g.trig);
  if (g.losePress) st.losePress = true;
}

// 効果の発生源になれるカード（戦場・魔力ゾーン表・墓地・手札）
function* auraSources(s) {
  for (const p of [0, 1]) {
    const pl = s.players[p];
    for (const c of pl.field) if (E[c.id]?.aura) yield { inst: c, p, zone: 'field' };
    for (const c of pl.mana) if (c.faceUp && E[c.id]?.aura) yield { inst: c, p, zone: 'mana' };
    for (const c of pl.grave) if (E[c.id]?.aura) yield { inst: c, p, zone: 'grave' };
    for (const c of pl.hand) if (E[c.id]?.aura) yield { inst: c, p, zone: 'hand' };
  }
}

// tgt が能力すべてを失っているか
export function stripped(s, tgt) {
  for (const p of [0, 1]) {
    for (const zone of ['field', 'grave']) {
      for (const c of s.players[p][zone]) {
        const sc = E[c.id];
        if (!sc?.strip || c.uid === tgt.inst.uid) continue;
        if ((sc.stripZones || ['field']).includes(zone) && sc.strip(s, { inst: c, p, zone }, tgt)) return true;
      }
    }
  }
  return s.tmp.some((t) => t.strip && E[t.src]?.tmpStrip?.[t.strip]?.(s, t, tgt));
}

export function stat(s, x, where = null) {
  const f = where || findOnBoard(s, typeof x === 'string' ? x : x.uid);
  if (!f) return baseStat(s, x, 'hand');
  const { inst, zone } = f;
  const st = baseStat(s, inst, zone);
  if (guard.has(inst.uid) || zone === 'deck') return st;
  guard.add(inst.uid);
  try {
    const tgt = { inst, p: f.p, zone };
    if ((zone === 'field' || zone === 'grave') && stripped(s, tgt)) {
      st.lost = true; st.kw = {}; st.atk = 0; st.blk = 0; st.press = 0; st.unblock = [];
    }
    for (const src of auraSources(s)) {
      if (st.lost && src.inst.uid === inst.uid) continue;
      for (const a of E[src.inst.id].aura) {
        if (!(a.zones || ['field']).includes(src.zone)) continue;
        if (src.inst.uid !== inst.uid && !active(s, src)) continue;
        const g = a.to(s, src, tgt);
        if (g && !st.lost) applyGrant(st, g);
        else if (g && st.lost) applyGrant(st, { types: g.types, setPower: g.setPower, ...(g.keep ? g : {}) });
      }
    }
    if (zone === 'field' && !st.lost) {
      for (const e of inst.equips || []) {
        const eq = E[e.id]?.equip;
        if (eq?.grant) applyGrant(st, eq.grant(s, tgt, e));
        if (eq?.trig) st.trig.push(...eq.trig.map((t) => t.key));
      }
    }
    for (const t of s.tmp) {
      if (t.uid === inst.uid && t.inc === inst.inc && t.grant && !st.lost) applyGrant(st, t.grant);
      if (t.aura && !st.lost) applyGrant(st, E[t.src].tmpAura[t.aura](s, t, tgt));
    }
    const post = E[inst.id]?.post;
    if (post && !st.lost && zone === 'field') applyGrant(st, post(s, tgt, st));
    if (st.losePress) st.press = 0;
    if (st.kw.noSokuo) st.kw.sokuo = false;
  } finally { guard.delete(inst.uid); }
  return st;
}

// 能力を持っていて、失っていない
export function active(s, f) {
  if (f.zone === 'field' || f.zone === 'grave') return !stripped(s, f);
  return true;
}

export const isIjin = (s, inst, f = null) => stat(s, inst, f).types.has('ijin');
export const isHaikei = (s, inst, f = null) => stat(s, inst, f).types.has('haikei');
export const ijinsOf = (s, p) => s.players[p].field.filter((c) => isIjin(s, c, { inst: c, p, zone: 'field' }));
export const haikeisOf = (s, p) => s.players[p].field.filter((c) => isHaikei(s, c, { inst: c, p, zone: 'field' }));
export const colorsOf = (s, inst) => stat(s, inst).colors;
export const hasTrait = (s, inst, t) => stat(s, inst).traits.has(t);
export const kw = (s, inst) => stat(s, inst).kw;

// ルール変更の問い合わせ。どれか1つでも当てはまれば true（数値なら合計）
export function rule(s, key, ...args) {
  let hit = false, sum = 0;
  for (const p of [0, 1]) {
    const pl = s.players[p];
    for (const zone of ['field', 'mana', 'grave', 'hand']) {
      for (const c of pl[zone]) {
        const sc = E[c.id];
        const fn = sc?.rules?.[key];
        if (!fn) continue;
        if (!(sc.ruleZones || ['field']).includes(zone) || (zone === 'mana' && !c.faceUp)) continue;
        const src = { inst: c, p, zone };
        if (!active(s, src)) continue;
        const v = fn(s, src, ...args);
        if (typeof v === 'number') sum += v; else if (v) hit = true;
      }
    }
    for (const h of pl.field) for (const e of h.equips || []) {
      const fn = E[e.id]?.equip?.rules?.[key];
      if (fn) { const v = fn(s, { inst: h, p, zone: 'field', equip: e }, ...args); if (typeof v === 'number') sum += v; else if (v) hit = true; }
    }
  }
  for (const t of s.tmp) {
    const fn = t.rule && E[t.src]?.tmpRules?.[t.rule];
    if (fn) { const v = fn(s, t, key, ...args); if (typeof v === 'number') sum += v; else if (v) hit = true; }
    if (t.flag === key && (t.p === undefined || args[0] === t.p)) hit = true;
  }
  return sum || hit;
}

// このターンの間（until 省略）の効果。uid を渡すとそのカードだけ
export function addTmp(s, t) {
  if (t.uid) { const f = findOnBoard(s, t.uid); t.inc = f?.inst.inc; }
  s.tmp.push({ until: s.turnNo, ...t });
}
export const tmpFlag = (s, flag, p) => addTmp(s, { flag, p });
export const grantTmp = (s, uid, grant, until) => addTmp(s, { uid, grant, ...(until ? { until } : {}) });

export function power(s, p, inst, role = null) {
  const f = findOnBoard(s, inst.uid);
  const st = stat(s, inst, f);
  if (!st.types.has('ijin')) return 0;
  let v = st.setPower ?? st.power;
  if (st.setPower !== null) v += st.power - (st.guardian ? 0 : def(inst).power || 0);
  const r = role ?? (s.battle?.attackers.includes(inst.uid) ? 'atk' : s.battle && Object.values(s.battle.blocks || {}).some((l) => l.includes(inst.uid)) ? 'blk' : null);
  if (r === 'atk') v += st.atk;
  if (r === 'blk') v += st.blk;
  return v;
}

export const pressure = (s, p, inst) => Math.max(1, stat(s, inst).press || 1);
export const isDouble = (s, p, inst) => pressure(s, p, inst) >= 2;

// ---------- 魔力 ----------

export function manaColors(s, p, m) {
  if (!m.faceUp) return new Set();
  return stat(s, m, { inst: m, p, zone: 'mana' }).colors;
}

export function availableColors(s, p) {
  const set = new Set();
  for (const m of s.players[p].mana) manaColors(s, p, m).forEach((c) => set.add(c));
  return set;
}

export const hasColor = (s, p, color) => availableColors(s, p).has(color);
export const faceUpMaryoku = (s, p) => s.players[p].mana.filter((m) => m.faceUp && def(m).type === 'maryoku');
export const isStone = (inst) => def(inst).name.endsWith('ストーン') && def(inst).type === 'maryoku';

export function levelSum(s, p) {
  if (s.players === undefined) return 0;
  const pl = s.players[p];
  let v = 0;
  for (const m of pl.mana) v += m.faceUp ? stat(s, m, { inst: m, p, zone: 'mana' }).level : 1;
  return v + (rule(s, 'manaLevel', p) || 0);
}

// ---------- 移動 ----------

function stripInst(inst) { return { uid: inst.uid, id: inst.id }; }

// 戦場を離れるときの後始末（装備品は元の場所へ、バトルの役割も外れる）
function detach(s, f) {
  const inst = f.inst;
  for (const e of inst.equips || []) {
    const pl = s.players[ownerOf(e.uid)];
    if (e.from === 'mana') pl.mana.push({ uid: e.uid, id: e.id, faceUp: e.faceUp !== false });
    else if (e.from === 'field') pl.field.push({ uid: e.uid, id: e.id, tapped: false, enteredTurn: s.turnNo, inc: ++s.inc });
    else pl.grave.push(stripInst(e));
  }
  if (s.battle) {
    s.battle.attackers = s.battle.attackers.filter((u) => u !== inst.uid);
    for (const k of Object.keys(s.battle.blocks || {})) s.battle.blocks[k] = s.battle.blocks[k].filter((u) => u !== inst.uid);
  }
}

// 戦場からの移動を止める効果
function blockedLeave(s, f, to, by) {
  if (by === undefined || by === null) return false;
  if (f.zone !== 'field' && f.zone !== 'guardians') return false;
  const st = stat(s, f.inst, f);
  if (st.kw.noLeaveAbility) return true;
  if (st.kw.noLeaveOpp && by !== f.p) return true;
  if (to === 'hand' && (st.kw.noBounce || rule(s, 'noBounce', f))) return true;
  return false;
}

// カードを移動する。to: hand | grave | deckTop | deckBottom | mana | manaUp | guardian | field
// by: 能力の使い手（ルールによる移動なら null）
export function move(s, uid, to, { by = null, from = null, tapped = false, silent = false } = {}) {
  const f = findOnBoard(s, uid);
  if (!f) return false;
  if (from && f.zone !== from) return false;
  if (blockedLeave(s, f, to, by)) return false;
  if (f.zone === 'grave' && by !== null && rule(s, 'graveLock', f, to, by)) return false;
  if (f.zone === 'mana' && by !== null && rule(s, 'manaLock', f, to, by)) return false;
  const p = ownerOf(uid), pl = s.players[p];
  if (f.zone === 'equip') f.holder.equips.splice(f.i, 1);
  else s.players[f.p][f.zone].splice(f.i, 1);
  if (f.zone === 'field') { detach(s, f); s.tmp = s.tmp.filter((t) => t.uid !== uid); }
  const card = stripInst(f.inst);
  const fromZone = f.zone;
  if (to === 'hand') pl.hand.push(card);
  else if (to === 'grave') pl.grave.push(card);
  else if (to === 'deckTop') pl.deck.unshift(card);
  else if (to === 'deckBottom') pl.deck.push(card);
  else if (to === 'mana' || to === 'manaUp') pl.mana.push({ ...card, faceUp: to === 'manaUp' });
  else if (to === 'guardian') return placeGuardian(s, p, card, { from: fromZone, tapped }), true;
  else if (to === 'field') return putOnField(s, p, card, { from: fromZone, by, tapped }), true;
  if (!silent) {
    const ev = { uid, p, from: fromZone, to, by };
    if (fromZone === 'field' || fromZone === 'guardians') emit(s, 'leave', ev);
    if (fromZone === 'grave') emit(s, 'graveLeave', ev);
    if (fromZone === 'mana') emit(s, 'manaLeave', ev);
    if (to === 'grave') emit(s, 'toGrave', ev);
    if (to === 'mana' || to === 'manaUp') emit(s, 'toMana', { ...ev, faceUp: to === 'manaUp' });
    if (to === 'deckTop' || to === 'deckBottom') emit(s, 'toDeck', ev);
  }
  return true;
}

export function putOnField(s, p, card, { summoned = false, from = null, by = null, tapped = false, noEmit = false } = {}) {
  p = ownerOf(card.uid);
  if (from === 'grave' && by !== null && by !== undefined && rule(s, 'noGraveToField', p, by)) {
    s.players[p].grave.push(stripInst(card));
    return null;
  }
  const inst = { uid: card.uid, id: card.id, tapped: false, enteredTurn: s.turnNo, inc: ++s.inc };
  s.players[p].field.push(inst);
  if (tapped || rule(s, 'enterTapped', { inst, p, zone: 'field' }, { summoned, by })) inst.tapped = true;
  const d = def(inst);
  log(s, d.type === 'haikei' ? `ハイケイ「${d.name}」を展開` : `${d.name}を${summoned ? '召喚' : '戦場に'}`, p);
  if (!noEmit) emit(s, 'enter', { uid: inst.uid, p, summoned, from, by });
  return inst;
}

export function placeGuardian(s, p, card, { from = null, tapped = false } = {}) {
  p = ownerOf(card.uid);
  const g = { uid: card.uid, id: card.id, tapped: false, enteredTurn: s.turnNo };
  s.players[p].guardians.push(g);
  if (tapped || rule(s, 'guardianTapped', p)) g.tapped = true;
  emit(s, 'guardian', { uid: g.uid, p, from });
  return g;
}

export function topToGuardian(s, p, n = 1) {
  let k = 0;
  for (; k < n && s.players[p].deck.length; k++) placeGuardian(s, p, s.players[p].deck.shift(), { from: 'deck' });
  if (k) log(s, `山札の上から${k}枚をガーディアンにした`, p);
  checkDeckEmpty(s, p);
  return k;
}

export function topToMana(s, p, n = 1, faceUp = false) {
  const pl = s.players[p];
  let k = 0;
  for (; k < n && pl.deck.length; k++) {
    const c = pl.deck.shift();
    pl.mana.push({ ...c, faceUp });
    emit(s, 'toMana', { uid: c.uid, p, from: 'deck', faceUp });
  }
  if (k) log(s, `山札の上から${k}枚を裏向きで魔力ゾーンへ`, p);
  checkDeckEmpty(s, p);
  return k;
}

function checkDeckEmpty(s, p) {
  if (!s.players[p].deck.length && !s.deckEmptyFired?.[p]) {
    s.deckEmptyFired = { ...s.deckEmptyFired, [p]: true };
    emit(s, 'deckEmpty', { p });
  }
}

// ドロー。byAbility: 能力によるか、zone: 能力の場所（躍進用）
export function draw(s, p, n = 1, { byAbility = true, zone = null } = {}) {
  const pl = s.players[p];
  if (rule(s, 'noDraw', p, { byAbility })) return 0;
  if (byAbility && !s.noBeikoku) n += rule(s, 'drawPlus', p) || 0;
  // 米百俵：能力によるドローを、マリョク配置権に替えてもよい
  if (byAbility && !s.noBeikoku && rule(s, 'beikoku', p) && s.turn === p) { s.queue.unshift({ k: 'beikoku', p, n, zone }); return 0; }
  let k = 0;
  for (; k < n && pl.deck.length; k++) pl.hand.push(pl.deck.shift());
  if (k && byAbility && zone === 'mana') s.tf.drewByMana[p] = true;
  if (k) emit(s, 'draw', { p, n: k, byAbility, zone });
  checkDeckEmpty(s, p);
  return k;
}

// 山札の上からN枚を墓地へ
export function mill(s, p, n) {
  const pl = s.players[p];
  if (rule(s, 'noMill', p)) return [];
  const out = [];
  for (let k = 0; k < n && pl.deck.length; k++) {
    const c = pl.deck.shift();
    pl.grave.push(c);
    out.push(c);
    emit(s, 'toGrave', { uid: c.uid, p, from: 'deck', to: 'grave' });
  }
  if (out.length) log(s, `山札の上から${out.length}枚を墓地へ`, p);
  checkDeckEmpty(s, p);
  return out;
}

// 手札を墓地へ（能力による）
export function discard(s, uid, by = null) {
  const f = findOnBoard(s, uid);
  if (!f || f.zone !== 'hand') return false;
  log(s, `${name(f.inst)}を手札から墓地へ`, f.p);
  return move(s, uid, 'grave', { by: by ?? f.p });
}

export function tap(s, uid, byAbility = true) {
  const f = findOnBoard(s, uid);
  if (!f || f.inst.tapped || (f.zone !== 'field' && f.zone !== 'guardians')) return false;
  f.inst.tapped = true;
  emit(s, 'tap', { uid, p: f.p, zone: f.zone, byAbility });
  return true;
}

export function untap(s, uid, byAbility = true) {
  const f = findOnBoard(s, uid);
  if (!f || !f.inst.tapped || (f.zone !== 'field' && f.zone !== 'guardians')) return false;
  if (s.tmp.some((t) => t.noUntap === uid && t.until >= s.turnNo)) return false;
  f.inst.tapped = false;
  emit(s, 'untap', { uid, p: f.p, zone: f.zone, byAbility });
  return true;
}

export function untapAll(s, p, byAbility = true) {
  for (const c of [...s.players[p].field, ...s.players[p].guardians]) untap(s, c.uid, byAbility);
}

export function addRight(s, p, kind, n = 1, byAbility = true) {
  if (s.turn !== p) return;
  if (kind === 'mana' && byAbility && rule(s, 'noManaRight', p)) return;
  s.rights[kind] += n;
  log(s, `${kind === 'mana' ? 'マリョク配置権' : 'イジン召喚権'}+${n}`, p);
  if (byAbility) emit(s, 'rights', { p, kind, n });
}

// 魔力ゾーンの表向きマリョク1つを裏にする（コスト）。残したい色を考えて選ぶ
export function flipManaCost(s, p) {
  const pl = s.players[p];
  const ups = pl.mana.filter((m) => m.faceUp);
  if (!ups.length) return false;
  ups.sort((a, b) => manaKeep(s, p, a) - manaKeep(s, p, b))[0].faceUp = false;
  return true;
}

export function manaKeep(s, p, m) {
  if (!m.faceUp) return 0;
  const d = def(m);
  const same = s.players[p].mana.filter((x) => x.faceUp && d.colors.some((c) => def(x).colors.includes(c))).length;
  return d.level * 2 + (d.colors.length && same === 1 ? 10 : 0) + (d.type !== 'maryoku' ? 5 : 0);
}

// 魔力ゾーンのカードを n 枚墓地へ（コスト）。裏向き・価値の低いものから
export function payMana(s, p, n, { faceDownOk = true } = {}) {
  const pl = s.players[p];
  const pool = pl.mana.filter((m) => faceDownOk || m.faceUp).sort((x, y) => manaKeep(s, p, x) - manaKeep(s, p, y)).slice(0, n);
  for (const m of pool) move(s, m.uid, 'grave', { silent: true });
  return pool.length;
}

// ---------- 破壊 ----------

function destroyable(s, f, by) {
  if (f.zone === 'guardians') {
    if (by.battle) return true;
    return !rule(s, 'guardianNoDestroy', f, by);
  }
  const st = stat(s, f.inst, f);
  if (st.kw.noDestroy) return false;
  if (by.battle) return !st.kw.noBattleDestroy;
  if (st.kw.noDestroyAbility) return false;
  if (st.kw.noDestroyOpp && by.p !== undefined && by.p !== f.p) return false;
  return !rule(s, 'noDestroy', f, by);
}

// 破壊：破壊されている状態にして、「破壊されたとき」→ まとめて墓地 → 遺業 の順に積む
// by: { p: 能力の使い手, battle, drain, toBottom }
export function destroy(s, list_, by = {}) {
  const hits = [];
  for (const u of list_) {
    const f = findOnBoard(s, u);
    if (!f || (f.zone !== 'field' && f.zone !== 'guardians') || f.inst.destroyed) continue;
    if (!destroyable(s, f, by)) continue;
    f.inst.destroyed = true;
    if (by.drain) f.inst.noLegacy = true;
    if (by.toBottom) f.inst.toBottom = true;
    hits.push(f);
  }
  if (!hits.length) return [];
  pushFront(s, [{ k: 'toGrave', uids: hits.map((h) => h.inst.uid) }]);
  for (const h of hits.reverse()) {
    const st = stat(s, h.inst, h);
    emit(s, 'destroyed', { uid: h.inst.uid, p: h.p, zone: h.zone, types: [...st.types], colors: [...st.colors], level: def(h.inst).level, battle: !!by.battle, by: by.p });
  }
  return hits.map((h) => h.inst.uid);
}

function toGraveAll(s, list_) {
  const legacy = [];
  for (const u of list_) {
    const f = findOnBoard(s, u);
    if (!f || !f.inst.destroyed || (f.zone !== 'field' && f.zone !== 'guardians')) continue;
    const { noLegacy, toBottom, meiso } = f.inst;
    const d = def(f.inst);
    s.players[f.p][f.zone].splice(f.i, 1);
    if (f.zone === 'field') { detach(s, f); s.tmp = s.tmp.filter((t) => t.uid !== u); }
    const pl = s.players[f.p];
    if (toBottom) { pl.deck.push(stripInst(f.inst)); log(s, `${d.name}を山札の下へ`, f.p); continue; }
    pl.grave.push(meiso ? { ...stripInst(f.inst), meiso } : stripInst(f.inst));
    log(s, f.zone === 'guardians' ? `${pl.name}のガーディアン（${d.name}）が破壊された` : `${d.name}が破壊された`, f.p);
    if (f.zone === 'field') s.tf.destroyedTypes[f.p].push(d.type);
    emit(s, 'toGrave', { uid: u, p: f.p, from: f.zone, to: 'grave', destroyed: true });
    if (d.legacy && !noLegacy && legacyAllowed(s, f.p, u)) legacy.push({ k: 'legacy', p: f.p, src: u });
  }
  legacy.sort((a, b) => (a.p === s.turn ? 0 : 1) - (b.p === s.turn ? 0 : 1));
  pushFront(s, legacy);
}

export function legacyAllowed(s, p, uid) {
  const f = findOnBoard(s, uid);
  if (!f) return false;
  if (!active(s, f)) return false;
  return !rule(s, 'noLegacy', p, def(f.inst));
}

// ---------- 選択 ----------

// 選択肢つきの問い合わせ。選び終わっていれば答え（配列）を返し、まだなら問い合わせを出して undefined を返す
// 効果の関数は undefined が返ったらすぐ return する（選択後に最初から呼び直される）
// opts: { p, title, options: [uid|ラベルキー], labels: { key: 文字 }, min, max, info }
export function pick(s, it, key, opts) {
  it.ans = it.ans || {};
  if (it.ans[key] !== undefined) return it.ans[key];
  const options = (opts.options || []).map((o) => (typeof o === 'object' ? o.inst.uid : o));
  const min = Math.min(opts.min ?? 1, options.length), max = opts.info ? 0 : Math.min(opts.max ?? Math.max(1, min), options.length);
  if (!opts.info && (options.length === 0 || (options.length <= min && !opts.ask))) { it.ans[key] = options.slice(0, min); return it.ans[key]; }
  s.prompt = { p: opts.p ?? it.p, title: opts.title, options, min, max, labels: opts.labels || null, info: !!opts.info, reveal: !!opts.reveal, src: opts.src ?? it.src ?? null };
  it.waiting = key;
  s.queue.unshift(it);
  return undefined;
}

// はい／いいえ。はい=true、いいえ=false、待ち=undefined
export function confirm(s, it, key, title, p = it.p) {
  it.ans = it.ans || {};
  if (it.ans[key] !== undefined) return it.ans[key].length > 0;
  s.prompt = { p, title, options: [], min: 0, max: 1, confirm: true, src: it.src ?? null };
  it.waiting = key;
  s.queue.unshift(it);
  return undefined;
}

// 一度だけ実行（選択で呼び直されても繰り返さない）
export function once(it, key, fn) {
  it.done = it.done || {};
  if (it.done[key]) return it.done[key].v;
  const v = fn();
  it.done[key] = { v: v === undefined ? null : v };
  return v;
}

// ---------- トリガー ----------

function* trigSources(s, q) {
  const pl = s.players[q];
  for (const c of pl.field) {
    const f = { inst: c, p: q, zone: 'field' };
    const st = stat(s, c, f);
    if (st.lost) continue;
    for (const t of E[c.id]?.trig || []) yield [f, t];
    for (const k of st.trig) yield [f, TRIG[k]];
  }
  for (const zone of ['mana', 'grave', 'hand']) {
    for (const c of pl[zone]) {
      const ts = E[c.id]?.trig;
      if (!ts) continue;
      const f = { inst: c, p: q, zone };
      for (const t of ts) {
        if (!(t.zones || []).includes(zone)) continue;
        if (zone === 'mana' && !c.faceUp && !t.faceDown) continue;
        if (zone === 'grave' && !active(s, f)) continue;
        yield [f, t];
      }
    }
  }
}

function trigAllowed(s, f, t) {
  const fieldLike = f.zone === 'field' || f.zone === 'mana';
  if (fieldLike && rule(s, 'noFieldTrig', f, t)) return false;
  if (t.shippitsu && rule(s, 'noShippitsu', f)) return false;
  if (t.kikki && rule(s, 'noKikki', f)) return false;
  if (t.discards && rule(s, 'noDiscardTrig', f)) return false;
  return true;
}

export function emit(s, on, ev = {}) {
  if (s.phase === 'over') return;
  const items = [];
  for (const q of turnOrder(s)) {
    for (const [f, t] of trigSources(s, q)) {
      if (!t || t.on !== on) continue;
      if (f.zone === 'field' && t.zones && !t.zones.includes('field')) continue;
      if (t.self && ev.uid !== f.inst.uid) continue;
      if (t.mine && ev.p !== q) continue;
      if (t.theirs && ev.p === q) continue;
      if (t.once && s.tf.once[f.inst.uid + t.key]) continue;
      if (!trigAllowed(s, f, t)) continue;
      if (t.if && !t.if(s, f, ev)) continue;
      items.push({ k: 'trig', key: t.key, p: q, src: f.inst.uid, zone: f.zone, ev });
    }
  }
  pushFront(s, items);
}

export function endGame(s, winner, reason) {
  if (s.phase === 'over') return;
  s.phase = 'over';
  s.winner = winner;
  s.winReason = reason;
  s.prompt = null;
  s.queue = [];
  log(s, `${s.players[winner].name}の勝利！（${reason}）`, winner);
}

// ---------- 遺業 ----------

export const LEGACY = {
  draw1: (s, it) => { draw(s, it.p, 1, { zone: 'grave' }); log(s, `遺業（${name(it.card)}）：1ドロー`, it.p); },
  manaize: (s, it) => { if (move(s, it.src, 'mana', { by: it.p })) log(s, `遺業（${name(it.card)}）：魔力化`, it.p); },
  restore: (s, it) => { if (move(s, it.src, 'manaUp', { by: it.p })) log(s, `遺業（${name(it.card)}）：復元`, it.p); },
  returnToHand: (s, it) => { if (move(s, it.src, 'hand', { by: it.p })) log(s, `遺業（${name(it.card)}）：手札に戻した`, it.p); },
  returnToDeckTopOrBottom: (s, it) => {
    const a = pick(s, it, 'tb', { title: `遺業（${name(it.card)}）：山札の上か下に戻す`, options: ['L:top', 'L:bottom'], labels: { 'L:top': '山札の上', 'L:bottom': '山札の下' } });
    if (!a) return;
    move(s, it.src, a[0] === 'L:top' ? 'deckTop' : 'deckBottom', { by: it.p });
  },
  meifu: (s, it) => {
    const d = def(it.card);
    if (mahouBlocked(s, it.p, d, it.card, true)) return;
    const ok = confirm(s, it, 'go', `冥府発動：${d.name}を使う？`);
    if (ok === undefined || !ok) return;
    log(s, `冥府発動：マホウ「${d.name}」`, it.p);
    pushFront(s, [{ k: 'mahou', p: it.p, id: d.id, src: it.src, free: true }]);
  },
  hangon: (s, it) => {
    const alt = haikeisOf(s, it.p).filter((c) => c.id === '2-49');
    const opts = [...s.players[it.p].guardians.map((g) => g.uid), ...alt.map((c) => c.uid)];
    if (!opts.length) return;
    const a = pick(s, it, 'g', { title: `反魂（${name(it.card)}）：山札の下に戻すガーディアンを選ぶ（任意）`, options: opts, min: 0 });
    if (!a?.length) return;
    move(s, a[0], 'deckBottom', { by: it.p });
    move(s, it.src, 'field', { by: it.p });
  },
  kodama: (s, it) => {
    const lv = def(it.card).level + (rule(s, 'kodamaPlus', it.p) ? 1 : 0);
    const opts = [...list(s, it.p, 'me', 'hand'), ...list(s, it.p, 'me', 'grave')].filter((f) => f.inst.uid !== it.src && def(f.inst).type === 'ijin' && def(f.inst).level < lv);
    const a = pick(s, it, 'c', { title: `木霊（${name(it.card)}）：レベル${lv - 1}以下のイジンを戦場に置く（任意）`, options: opts, min: 0 });
    if (!a?.length) return;
    move(s, a[0], 'field', { by: it.p });
  },
  soshin: (s, it) => {
    if (!s.battle) return;
    const a = pick(s, it, 'a', { title: `喪神（${name(it.card)}）：アタッカーでない状態にするアタッカーを選ぶ（任意）`, options: s.battle.attackers, min: 0 });
    if (!a?.length) return;
    removeAttacker(s, a[0]);
  },
};

export function removeAttacker(s, uid) {
  if (!s.battle) return;
  s.battle.attackers = s.battle.attackers.filter((u) => u !== uid);
  delete s.battle.blocks[uid];
  log(s, `${name(findOnBoard(s, uid)?.inst || { id: uid.split('-')[0] })}はアタッカーでなくなった`);
}

// ---------- マホウ ----------

export function mahouBlocked(s, p, d, inst, free = false) {
  const m = E[d.id]?.mahou;
  if (!m) return null;
  if (rule(s, 'noMahou', p)) return 'マホウを使えません';
  return m.can ? m.can(s, p, inst) : null;
}

// ---------- 処理キュー ----------

export const ITEMS = {
  trig: (s, it) => {
    const t = TRIG[it.key];
    const f = findOnBoard(s, it.src);
    if (!f || f.zone !== it.zone) return;
    if (t.once && !it.started) { if (s.tf.once[it.src + it.key]) return; s.tf.once[it.src + it.key] = true; }
    it.started = true;
    if (t.opt) {
      const ok = confirm(s, it, '_opt', `${name(f.inst)}：${typeof t.opt === 'string' ? t.opt : '能力を使う？'}`);
      if (!ok) return;
    }
    if (t.voyage) once(it, '_v', () => emit(s, 'voyage', { uid: it.src, p: it.p }));
    t.run(s, it, f);
  },
  mahou: (s, it) => E[it.id]?.mahou?.run(s, it),
  toGrave: (s, it) => toGraveAll(s, it.uids),
  legacy: (s, it) => {
    const f = findOnBoard(s, it.src);
    if (f?.zone !== 'grave') return;
    it.card = it.card || { uid: f.inst.uid, id: f.inst.id };
    once(it, '_ev', () => emit(s, 'legacy', { uid: it.src, p: it.p }));
    LEGACY[def(f.inst).legacy]?.(s, it);
  },
  fn: (s, it) => E[it.id].steps[it.step](s, it),
  beikoku: (s, it) => {
    const a = pick(s, it, 'c', { title: `米百俵：${it.n}枚引くかわりに、マリョク配置権を増やす？`, options: ['L:d', 'L:m'], labels: { 'L:d': `${it.n}ドロー`, 'L:m': `マリョク配置権+${it.n}` }, min: 1, max: 1 });
    if (!a) return;
    if (a[0] === 'L:m') { addRight(s, it.p, 'mana', it.n); return; }
    s.noBeikoku = true;
    try { draw(s, it.p, it.n, { zone: it.zone }); } finally { s.noBeikoku = false; }
  },
};
