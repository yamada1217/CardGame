// カード操作のエフェクト。
// 描画の前に消えるカードの位置を控えておき、描画の後に重ねて再生する
import { def } from './engine.js';
import { cardFace } from './cardview.js';
import { sfx } from './sfx.js';
import { battleStage } from './battle-fx.js';
import { showcase } from './showcase.js';

const ZONES = ['hand', 'mana', 'field', 'guardians', 'grave', 'deck'];
const DURATION = 1100;

function zonesOf(state) {
  const m = new Map();
  state.players.forEach((pl, p) => ZONES.forEach((z) => (pl[z] || []).forEach((c) => m.set(c.uid, { p, z, c }))));
  return m;
}

// 前後の状態と行動から、再生するエフェクトの一覧を作る
export function planFx(before, after, p, action) {
  if (!before || !after || before === after) return [];
  const a = zonesOf(before), b = zonesOf(after);
  const fx = [];
  for (const [uid, x] of a) {
    const y = b.get(uid);
    if (y && y.z === x.z) continue;
    const type = def(x.c).type;
    if (x.z === 'field' && y?.z === 'hand') fx.push({ kind: 'bounce', uid, p: x.p });
    else if (x.z === 'field') fx.push({ kind: 'destroy', uid });
    else if (x.z === 'guardians') fx.push({ kind: 'guard', uid });
    else if (x.z === 'mana') fx.push({ kind: action?.type === 'play' && x.p === p ? 'spend' : 'mana', uid });
    else if (x.z === 'hand' && type === 'mahou') fx.push({ kind: 'magic', uid, c: x.c });
    else if (y?.z === 'field') fx.push({ kind: type === 'haikei' ? 'place' : 'summon', uid, c: x.c, p: y.p });
    else if (y?.z === 'mana') fx.push({ kind: 'charge', uid });
  }
  // 手札から使ったカードは、画面いっぱいに見せる演出を先に流す
  if (action?.type === 'play') {
    const x = a.get(action.uid);
    if (x?.z === 'hand' && def(x.c).type !== 'maryoku') {
      const y = b.get(action.uid);
      fx.unshift({ kind: 'show', uid: action.uid, c: x.c, p: x.p, dz: y?.z, dp: y?.p });
      for (let i = fx.length - 1; i > 0; i--) if (fx[i].uid === action.uid && fx[i].kind === 'magic') fx.splice(i, 1);
      fx.forEach((e) => { if (e.uid === action.uid && e.kind !== 'show') e.shown = true; });
    }
  }
  if (action?.type === 'declareAttack') (action.attackers || []).forEach((uid) => fx.push({ kind: 'attack', uid, p }));
  if (action?.type === 'declareBlocks') {
    // ブロックがあれば、ぶつかり合いの演出にまとめる
    const pairs = Object.entries(action.blocks || {}).filter(([, bs]) => bs?.length).map(([atk, blks]) => ({ atk, blks }));
    if (pairs.length) {
      const outcome = {};
      for (const uid of pairs.flatMap((x) => [x.atk, ...x.blks])) {
        const y = b.get(uid);
        outcome[uid] = y?.z === 'hand' ? 'bounce' : y && (y.z === 'field' || y.z === 'guardians') ? 'stay' : 'destroy';
      }
      fx.push({ kind: 'battle', pairs, outcome, atkOwner: 1 - p });
    }
  }
  return fx;
}

const OLD = new Set(['destroy', 'bounce', 'guard', 'mana', 'spend', 'block']);
const find = (root, uid) => root.querySelector(`[data-uid="${CSS.escape(String(uid))}"]`);

let layer;
function getLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.id = 'fx-layer';
    document.body.appendChild(layer);
  }
  return layer;
}

const COLORS = {
  destroy: ['#fff2c4', '#ff9a4a', '#ff4b2b'], guard: ['#fff6d8', '#f1d48f', '#d8b26a'], mana: ['#ffd2b0', '#ff6a3d'],
  block: ['#e6f4ff', '#78c0ff', '#3d8bff'], bounce: ['#e0f4ff', '#7fd0ff'], magic: ['#f3e8ff', '#b48cff', '#7a4dff'],
  summon: ['#fffbe6', '#ffe08a'], place: ['#e6ffef', '#7fe0a0'], attack: ['#fff0d6', '#ff9a3d'],
};

// 中心 (x, y) から粒を飛ばす
function burst(L, x, y, kind, n, spread = 90, delay = 0) {
  const cols = COLORS[kind] || COLORS.destroy;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const ang = (Math.PI * 2 * i) / n + Math.random() * .6;
    const dist = spread * (.5 + Math.random() * .7);
    s.className = 'fx-spark';
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist}px;--s:${3 + Math.random() * 5}px;background:${cols[i % cols.length]};animation-delay:${delay}ms`;
    L.appendChild(s);
    setTimeout(() => s.remove(), 900 + delay);
  }
}

// 位置に重ねる一時的な飾り
function deco(L, cls, r, delay = 0, ms = DURATION) {
  const d = document.createElement('div');
  d.className = cls;
  Object.assign(d.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, animationDelay: `${delay}ms` });
  L.appendChild(d);
  setTimeout(() => d.remove(), ms + delay);
  return d;
}

// アニメ風の演出：集中線・インパクトフレーム・カットイン・文字
function layerEl(L, cls, ms, css = '') {
  const d = document.createElement('div');
  d.className = cls;
  if (css) d.style.cssText = css;
  L.appendChild(d);
  setTimeout(() => d.remove(), ms);
  return d;
}
const speedLines = (L, x, y, color = '#fff', delay = 0) => layerEl(L, 'fx-speed', 700 + delay, `--x:${x}px;--y:${y}px;--col:${color};animation-delay:${delay}ms`);
const impact = (L, delay = 0) => setTimeout(() => layerEl(L, 'fx-impact', 160), delay);
function cutIn(L, title, sub, color, side) {
  const d = layerEl(L, `fx-cutin ${side}`, 1300, `--col:${color}`);
  d.innerHTML = `<div class="fx-band"><b>${title}</b><small>${sub}</small></div>`;
}
const word = (L, r, text, cls, delay = 0) => layerEl(L, `fx-word ${cls}`, 900 + delay, `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;animation-delay:${delay}ms`).textContent = text;
const HUE = { red: '#ff5a3c', blue: '#4c8dff', green: '#3fd27a', yellow: '#ffd23c', purple: '#b06bff' };

function shake(root, strong) {
  const g = root.querySelector('.game');
  if (!g) return;
  const cls = strong ? 'fx-shake-hard' : 'fx-shake';
  g.classList.remove('fx-shake', 'fx-shake-hard');
  void g.offsetWidth;
  g.classList.add(cls);
  setTimeout(() => g.classList.remove(cls), 500);
}

// render() を挟んでエフェクトを再生する
let busyUntil = 0;
// 演出が終わるまで待つ（CPUが演出の途中で次の手を指さないように）
// 早送りで終わりが早まることもあるので、少しずつ確かめる
export async function fxWait() {
  while (busyUntil > Date.now()) await new Promise((res) => setTimeout(res, Math.min(100, busyUntil - Date.now())));
}

export function runFx(root, fx, render, me) {
  if (!fx.length) return render();
  const battle = fx.find((e) => e.kind === 'battle');
  let bsnaps = null;
  if (battle) {
    const inv = new Set(battle.pairs.flatMap((x) => [x.atk, ...x.blks]));
    bsnaps = {};
    for (const uid of inv) { const e = find(root, uid); if (e) bsnaps[uid] = { rect: e.getBoundingClientRect(), html: e.outerHTML }; }
    fx = fx.filter((e) => e.kind !== 'battle' && !(inv.has(e.uid) && ['destroy', 'bounce', 'guard', 'block'].includes(e.kind)));
  }
  const shots = fx.filter((e) => OLD.has(e.kind)).map((e) => {
    const el = find(root, e.uid);
    return el && { ...e, rect: el.getBoundingClientRect(), html: el.outerHTML };
  }).filter(Boolean);
  const show = fx.find((e) => e.kind === 'show');
  const from = show && find(root, show.uid)?.getBoundingClientRect();
  render();
  const L = getLayer();
  let wait = battle ? battleStage(L, battle, bsnaps, root, me, () => shake(root, true)) : 0;
  let timer = null;
  const play = () => { timer = null; playFx(root, fx.filter((e) => e.kind !== 'show'), shots, L, me); };
  if (show) {
    // 戻り先（戦場のカード、マホウなら墓地）は、演出の間は隠しておく
    const target = () => {
      if (show.dz === 'field') { const t = find(root, show.uid); return t?.closest('.slot') || t; }
      if (show.dz === 'grave') return root.querySelector(`.grave-pile[data-grave="${show.dp}"]`);
      return null;
    };
    const hidden = target();
    if (hidden) hidden.style.visibility = 'hidden';
    wait = showcase(show, from && from.width ? from : null, () => target()?.getBoundingClientRect() || null, me, (rest) => {
      busyUntil = Date.now() + rest;
      if (timer) { clearTimeout(timer); timer = setTimeout(reveal, rest); }
    });
    const reveal = () => { const t = target(); if (t) t.style.visibility = ''; if (hidden) hidden.style.visibility = ''; play(); };
    busyUntil = Date.now() + wait;
    timer = setTimeout(reveal, wait);
    return;
  }
  if (wait) busyUntil = Date.now() + wait;
  if (wait) setTimeout(play, wait); else play();
}

function playFx(root, fx, shots, L, me) {
  // ブロックの直後は、ぶつかってから壊れるように少し遅らせる
  const clash = fx.some((e) => e.kind === 'block');
  for (const k of new Set(fx.map((e) => e.kind))) if (k !== 'spend') setTimeout(() => sfx(k), clash && k !== 'block' ? 320 : 0);
  let big = 0;
  for (const s of shots) {
    const delay = clash && s.kind !== 'block' ? 320 : 0;
    const g = document.createElement('div');
    g.className = `fx-ghost fx-${s.kind}${s.p === me ? ' mine' : ' foe'}`;
    Object.assign(g.style, { left: `${s.rect.left}px`, top: `${s.rect.top}px`, width: `${s.rect.width}px`, height: `${s.rect.height}px`, animationDelay: `${delay}ms` });
    g.innerHTML = `${s.kind === 'block' ? '<b class="fx-shield"></b>' : s.html}<i class="fx-ring" style="animation-delay:${delay}ms"></i>`;
    if (s.kind !== 'block') g.firstElementChild.classList.remove('enter', 'can', 'picked', 'playable');
    L.appendChild(g);
    setTimeout(() => g.remove(), DURATION + delay);
    const cx = s.rect.left + s.rect.width / 2, cy = s.rect.top + s.rect.height / 2;
    if (s.kind === 'destroy') {
      burst(L, cx, cy, 'destroy', 26, 150, delay + 100); deco(L, 'fx-cross', s.rect, delay);
      speedLines(L, cx, cy, '#fff', delay); impact(L, delay + 60); word(L, s.rect, '撃破', 'red', delay + 80); big = Math.max(big, 2);
    }
    if (s.kind === 'guard') { burst(L, cx, cy, 'guard', 16, 100, delay + 100); word(L, s.rect, '破', 'gold', delay + 60); big = Math.max(big, 1); }
    if (s.kind === 'mana') burst(L, cx, cy, 'mana', 10, 60, delay);
    if (s.kind === 'block') { burst(L, cx, cy, 'block', 16, 90); impact(L, 0); word(L, s.rect, 'ガード', 'blue'); }
    if (s.kind === 'bounce') burst(L, cx, cy, 'bounce', 10, 70);
  }
  if (big) setTimeout(() => shake(root, big > 1), clash ? 320 : 60);
  if (big > 1) { const f = document.createElement('div'); f.className = 'fx-flash red'; L.appendChild(f); setTimeout(() => f.remove(), 700); }
  for (const e of fx) {
    if (e.kind === 'magic' && !e.shown) {
      const g = document.createElement('div');
      g.className = 'fx-magic';
      g.innerHTML = `<i class="fx-circle"></i><div class="fx-magic-card">${cardFace(e.c, { size: 'l' })}</div><i class="fx-wave"></i><i class="fx-wave w2"></i>`;
      L.appendChild(g);
      setTimeout(() => g.remove(), DURATION + 400);
      burst(L, innerWidth / 2, innerHeight / 2, 'magic', 32, Math.min(innerWidth, 420) * .6, 300);
      speedLines(L, innerWidth / 2, innerHeight / 2, '#d9c4ff', 200);
      cutIn(L, 'マホウ発動', def(e.c).name, HUE[def(e.c).color] || '#b48cff', 'right');
      const f = document.createElement('div'); f.className = 'fx-flash violet'; L.appendChild(f); setTimeout(() => f.remove(), 700);
    }
    if (['summon', 'place', 'attack', 'charge'].includes(e.kind)) {
      const el = find(root, e.uid);
      const host = el?.closest('.slot') || el;
      if (!host) continue;
      const cls = `fx-${e.kind}${e.kind === 'attack' ? (e.p === me ? '-up' : '-down') : ''}`;
      host.classList.add(cls);
      setTimeout(() => host.classList.remove(cls), DURATION);
      const r = host.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (e.kind === 'summon') {
        deco(L, 'fx-pillar', r); burst(L, cx, cy, 'summon', 16, 90, 150);
        // レベル5以上は登場カットイン
        const d = def(e.c);
        if (d.level >= 5 && !e.shown) { cutIn(L, '降臨', d.name, HUE[d.color] || '#ffd36b', e.p === me ? 'left' : 'right'); speedLines(L, cx, cy, '#ffe9a8', 100); impact(L, 380); setTimeout(() => shake(root, true), 380); }
      }
      if (e.kind === 'place') { deco(L, 'fx-quake', r, 250); burst(L, cx, r.bottom, 'place', 12, 70, 300); }
      if (e.kind === 'attack') { deco(L, `fx-streak ${e.p === me ? 'up' : 'down'}`, r); burst(L, cx, cy, 'attack', 12, 70, 120); speedLines(L, cx, cy, '#ffc28a'); }
      if (e.kind === 'charge') burst(L, cx, cy, 'summon', 6, 30);
    }
  }
}
