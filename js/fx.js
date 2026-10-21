// カード操作のエフェクト。
// 描画の前に消えるカードの位置を控えておき、描画の後に重ねて再生する
import { def } from './engine.js';
import { cardFace } from './cardview.js';
import { sfx } from './sfx.js';

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
    else if (y?.z === 'field') fx.push({ kind: type === 'haikei' ? 'place' : 'summon', uid });
    else if (y?.z === 'mana') fx.push({ kind: 'charge', uid });
  }
  if (action?.type === 'declareAttack') (action.attackers || []).forEach((uid) => fx.push({ kind: 'attack', uid, p }));
  if (action?.type === 'declareBlocks') Object.values(action.blocks || {}).flat().forEach((uid) => fx.push({ kind: 'block', uid }));
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
export function runFx(root, fx, render, me) {
  if (!fx.length) return render();
  const shots = fx.filter((e) => OLD.has(e.kind)).map((e) => {
    const el = find(root, e.uid);
    return el && { ...e, rect: el.getBoundingClientRect(), html: el.outerHTML };
  }).filter(Boolean);
  render();
  const L = getLayer();
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
    if (s.kind === 'destroy') { burst(L, cx, cy, 'destroy', 18, 110, delay + 120); deco(L, 'fx-cross', s.rect, delay); big = Math.max(big, 2); }
    if (s.kind === 'guard') { burst(L, cx, cy, 'guard', 12, 80, delay + 100); big = Math.max(big, 1); }
    if (s.kind === 'mana') burst(L, cx, cy, 'mana', 10, 60, delay);
    if (s.kind === 'block') burst(L, cx, cy, 'block', 12, 70);
    if (s.kind === 'bounce') burst(L, cx, cy, 'bounce', 10, 70);
  }
  if (big) setTimeout(() => shake(root, big > 1), clash ? 320 : 60);
  if (big > 1) { const f = document.createElement('div'); f.className = 'fx-flash red'; L.appendChild(f); setTimeout(() => f.remove(), 700); }
  for (const e of fx) {
    if (e.kind === 'magic') {
      const g = document.createElement('div');
      g.className = 'fx-magic';
      g.innerHTML = `<i class="fx-circle"></i><div class="fx-magic-card">${cardFace(e.c, { size: 'l' })}</div><i class="fx-wave"></i><i class="fx-wave w2"></i>`;
      L.appendChild(g);
      setTimeout(() => g.remove(), DURATION + 400);
      burst(L, innerWidth / 2, innerHeight / 2, 'magic', 24, Math.min(innerWidth, 420) * .55, 300);
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
      if (e.kind === 'summon') { deco(L, 'fx-pillar', r); burst(L, cx, cy, 'summon', 12, 70, 150); }
      if (e.kind === 'place') { deco(L, 'fx-quake', r, 250); burst(L, cx, r.bottom, 'place', 12, 70, 300); }
      if (e.kind === 'attack') { deco(L, `fx-streak ${e.p === me ? 'up' : 'down'}`, r); burst(L, cx, cy, 'attack', 8, 50, 120); }
      if (e.kind === 'charge') burst(L, cx, cy, 'summon', 6, 30);
    }
  }
}
