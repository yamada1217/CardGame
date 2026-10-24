// カード操作のエフェクト。
// 描画の前に消えるカードの位置を控えておき、描画の後に重ねて再生する
import { def } from './engine.js';
import { cardFace, cardBack } from './cardview.js';
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
    else if (x.z === 'deck' && y?.z === 'hand' && before.phase !== 'mulligan') fx.push({ kind: 'draw', uid, p: y.p, c: y.c });
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
  // 引いたカードは、飛んでくるまで手札で隠しておく
  for (const e of fx) if (e.kind === 'draw' && e.p === me) { const t = find(root, e.uid); if (t) t.style.visibility = 'hidden'; }
  const L = getLayer();
  let wait = battle ? battleStage(L, battle, bsnaps, root, me, () => shake(root, true)) : 0;
  let timer = null;
  const play = () => {
    timer = null;
    playFx(root, fx.filter((e) => e.kind !== 'show' && e.kind !== 'draw'), shots, L, me);
    const ms = drawFx(root, fx.filter((e) => e.kind === 'draw'), L, me);
    if (ms) busyUntil = Math.max(busyUntil, Date.now() + ms);
  };
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

// ドロー：山札からカードがするっと引かれて目の前に大きく飛び出し、少し浮いてから手札に収まる。
// 相手のドローは、裏向きのカードが山札から手札の数へ吸い込まれるだけ。戻り値は演出の長さ（ミリ秒）
const DRAW_MS = 1050, DRAW_GAP = 230;
function drawFx(root, draws, L, me) {
  if (!draws.length) return 0;
  const mine = draws.filter((e) => e.p === me), foe = draws.filter((e) => e.p !== me);
  const W = innerWidth, H = innerHeight;
  const meta = root.querySelector('.hand-meta')?.getBoundingClientRect();
  const deck = meta ? { x: meta.right - 24, y: meta.top + meta.height / 2 } : { x: W - 30, y: H * .7 };
  mine.slice(0, 6).forEach((e, i) => setTimeout(() => {
    const target = find(root, e.uid);
    const reveal = () => { if (target) target.style.visibility = ''; };
    const g = document.createElement('div');
    g.className = 'fx-draw';
    g.innerHTML = `${cardFace(e.c, { size: 'm' })}<i class="fx-draw-sheen"></i>`;
    g.firstElementChild.classList.remove('enter', 'can', 'picked', 'playable');
    L.appendChild(g);
    const w = g.offsetWidth || 84, h = g.offsetHeight || 120;
    const at = (x, y, sc, rot = 0) => `translate(${x - w / 2}px, ${y - h / 2}px) scale(${sc}) rotate(${rot}deg)`;
    const big = Math.min(2.1, (H * .34) / h, (W * .5) / w);
    const cx = W / 2 + (i - (mine.length - 1) / 2) * 18, cy = H * .5;
    const tr = target?.getBoundingClientRect();
    const end = tr && tr.width ? at(tr.left + tr.width / 2, tr.top + tr.height / 2, tr.width / w) : at(W / 2, H + h, .6);
    const a = g.animate([
      { transform: at(deck.x, deck.y, .28, 25), opacity: 0, filter: 'brightness(2.2)' },
      { transform: at(deck.x - 20, deck.y - 30, .4, 14), opacity: 1, filter: 'brightness(1.8)', offset: .1 },
      { transform: at(cx, cy, big * 1.06, -3), opacity: 1, filter: 'brightness(1.15)', offset: .36, easing: 'ease-out' },
      { transform: at(cx, cy - 10, big, 1), opacity: 1, filter: 'brightness(1)', offset: .66, easing: 'cubic-bezier(.55,0,.4,1)' },
      { transform: end, opacity: 1, filter: 'brightness(1)' },
    ], { duration: DRAW_MS, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    sfx('whoosh');
    setTimeout(() => {
      const r = g.getBoundingClientRect();
      burst(L, r.left + r.width / 2, r.top + r.height / 2, 'summon', 14, Math.min(W, 420) * .32, 0);
    }, DRAW_MS * .34);
    setTimeout(() => sfx('card'), DRAW_MS * .9);
    a.onfinish = () => { reveal(); g.remove(); if (target) { target.classList.remove('fx-drawn'); void target.offsetWidth; target.classList.add('fx-drawn'); setTimeout(() => target.classList.remove('fx-drawn'), 400); } };
    setTimeout(() => { reveal(); g.remove(); }, DRAW_MS + 400);
  }, i * DRAW_GAP));
  // 相手のドロー
  const counts = root.querySelector('.bar.foe .counts')?.children;
  const from = counts?.[0]?.getBoundingClientRect(), to = counts?.[1]?.getBoundingClientRect();
  if (from && to) foe.slice(0, 6).forEach((e, i) => setTimeout(() => {
    const g = document.createElement('div');
    g.className = 'fx-draw foe';
    g.innerHTML = cardBack('', { size: 'g' });
    L.appendChild(g);
    const w = g.offsetWidth || 46, h = g.offsetHeight || 64;
    const at = (x, y, sc, rot = 0) => `translate(${x - w / 2}px, ${y - h / 2}px) scale(${sc}) rotate(${rot}deg)`;
    const fx0 = from.left + from.width / 2, fy = from.bottom + 6, tx = to.left + to.width / 2;
    g.animate([
      { transform: at(fx0, fy, .4, -10), opacity: 0 },
      { transform: at((fx0 + tx) / 2, fy + 46, 1, 6), opacity: 1, offset: .5 },
      { transform: at(tx, to.top + to.height / 2, .3, 0), opacity: 0 },
    ], { duration: 650, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).onfinish = () => g.remove();
    setTimeout(() => g.remove(), 1000);
    if (!mine.length) sfx('card');
  }, i * 160));
  const n = Math.min(mine.length, 6);
  return n ? (n - 1) * DRAW_GAP + DRAW_MS : foe.length ? 650 : 0;
}
