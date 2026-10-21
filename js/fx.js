// カード操作のエフェクト。
// 描画の前に消えるカードの位置を控えておき、描画の後に重ねて再生する
import { def } from './engine.js';
import { cardFace } from './cardview.js';

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
  for (const s of shots) {
    const delay = clash && s.kind !== 'block' ? 320 : 0;
    const g = document.createElement('div');
    g.className = `fx-ghost fx-${s.kind}${s.p === me ? ' mine' : ' foe'}`;
    Object.assign(g.style, { left: `${s.rect.left}px`, top: `${s.rect.top}px`, width: `${s.rect.width}px`, height: `${s.rect.height}px`, animationDelay: `${delay}ms` });
    g.innerHTML = `${s.kind === 'block' ? '' : s.html}<i class="fx-ring" style="animation-delay:${delay}ms"></i>`;
    if (s.kind !== 'block') g.firstElementChild.classList.remove('enter', 'can', 'picked', 'playable');
    L.appendChild(g);
    setTimeout(() => g.remove(), DURATION + delay);
  }
  for (const e of fx) {
    if (e.kind === 'magic') {
      const g = document.createElement('div');
      g.className = 'fx-magic';
      g.innerHTML = `<div class="fx-magic-card">${cardFace(e.c, { size: 'l' })}</div><i class="fx-wave"></i>`;
      L.appendChild(g);
      setTimeout(() => g.remove(), DURATION + 200);
    }
    if (['summon', 'place', 'attack', 'charge'].includes(e.kind)) {
      const el = find(root, e.uid);
      const host = el?.closest('.slot') || el;
      if (!host) continue;
      const cls = `fx-${e.kind}${e.kind === 'attack' ? (e.p === me ? '-up' : '-down') : ''}`;
      host.classList.add(cls);
      setTimeout(() => host.classList.remove(cls), DURATION);
    }
  }
}
