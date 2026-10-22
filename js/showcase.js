// カードを使ったときの演出（自分・相手とも）。
// 使ったカードが画面いっぱいの大きさでシュンと飛び出し、ゆっくり浮遊してから、置かれた場所へ戻っていく。
// 全体で約3秒。画面をタップすると早送りして、すぐに戻る。
import { def } from './engine.js';
import { cardFace } from './cardview.js';
import { sfx } from './sfx.js';

export const SHOW_MS = 3000;
const IN = 380, OUT = 420;
const BASE_W = 200, BASE_H = 286; // .card.xl の大きさ
const HUE = { red: '#ff5a3c', blue: '#4c8dff', green: '#3fd27a', yellow: '#ffd23c', purple: '#b06bff' };
const LABEL = { ijin: 'イジン召喚', haikei: 'ハイケイ', mahou: 'マホウ発動' };
const later = (ms, f) => setTimeout(f, ms * (globalThis.__fxSlow || 1));
const el = (cls, css = '', html = '') => { const d = document.createElement('div'); d.className = cls; if (css) d.style.cssText = css; if (html) d.innerHTML = html; return d; };
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// e: { uid, c, p, type }。from: 出す前のカードの位置（相手の手札など見えなければ null）
// dest(): 戻り先の位置を返す（描画し直した盤面から探す）。onSkip(残りミリ秒): 早送りしたとき
export function showcase(e, from, dest, me, onSkip) {
  const d = def(e.c);
  const mine = e.p === me;
  const W = innerWidth, H = innerHeight;
  const col = HUE[d.color] || '#f1d48f';
  const col2 = HUE[d.colors?.[1]] || col;
  const scale = Math.min((W * 0.86) / BASE_W, (H * 0.66) / BASE_H, 2.6);
  const cx = W / 2, cy = H * 0.5;
  const start = from || { left: cx - 30, top: mine ? H + 20 : -110, width: 60, height: 86 };
  const s0 = center(start);
  const at = (p, sc, extra = '') => `translate(${p.x - BASE_W / 2}px, ${p.y - BASE_H / 2}px) scale(${sc}) ${extra}`;

  const stage = el(`sc-stage ${mine ? 'mine' : 'foe'} t-${d.type}`, `--col:${col};--col2:${col2}`);
  stage.innerHTML = `<i class="sc-dim"></i><i class="sc-rays"></i><i class="sc-circle"></i><i class="sc-circle c2"></i>
    <div class="sc-label"><small>${mine ? 'あなた' : 'あいて'}</small><b>${LABEL[d.type] || ''}</b></div>`;
  document.body.appendChild(stage);
  for (let i = 0; i < 22; i++) {
    stage.appendChild(el('sc-mote', `left:${Math.random() * 100}%;--d:${1.6 + Math.random() * 1.4}s;--x:${(Math.random() - .5) * 80}px;animation-delay:${Math.random() * 1.2}s;--s:${2 + Math.random() * 4}px`));
  }
  const card = el('sc-card', '', cardFace({ ...e.c, tapped: false }, { size: 'xl' }));
  card.firstElementChild?.classList.remove('enter', 'can', 'picked', 'playable', 'tapped');
  card.appendChild(el('sc-sheen'));
  stage.appendChild(card);

  // シュンと飛び出す
  card.animate([
    { transform: at(s0, start.width / BASE_W, 'rotate(-8deg)'), opacity: .5, filter: 'brightness(2.4) blur(2px)' },
    { transform: at({ x: cx, y: cy }, scale * 1.1, 'rotate(1deg)'), opacity: 1, filter: 'brightness(1.6) blur(0)', offset: .6 },
    { transform: at({ x: cx, y: cy }, scale), opacity: 1, filter: 'brightness(1)' },
  ], { duration: IN, easing: 'cubic-bezier(.15,.9,.25,1)', fill: 'forwards' });
  sfx('whoosh');
  later(IN * .55, () => {
    sfx(d.type === 'mahou' ? 'magic' : d.type === 'haikei' ? 'place' : 'summon');
    stage.appendChild(el('sc-flash'));
    stage.appendChild(el('sc-shock'));
    stage.appendChild(el('sc-shock s2'));
    burst(stage, cx, cy, 30, Math.min(W, 520) * .55, [col, col2, '#fff', '#ffe9a8']);
    lines(stage, cx, cy, col);
  });
  // ゆっくり浮遊
  let floatAnim = null;
  later(IN, () => {
    floatAnim = card.animate([
      { transform: at({ x: cx, y: cy }, scale) },
      { transform: at({ x: cx, y: cy - 12 }, scale * 1.015, 'rotate(-1.2deg)'), offset: .5 },
      { transform: at({ x: cx, y: cy + 4 }, scale, 'rotate(.8deg)') },
    ], { duration: 1500, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
  });

  let done = false, timer = null;
  const back = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    floatAnim?.cancel();
    const r = dest();
    const fromT = at({ x: cx, y: cy }, scale);
    const toT = r ? at(center(r), r.width / BASE_W) : at({ x: cx, y: mine ? H + 120 : -160 }, .4);
    card.animate([
      { transform: fromT, opacity: 1 },
      { transform: `${fromT.replace(/scale\([^)]*\)/, `scale(${scale * 1.06})`)}`, opacity: 1, offset: .18 },
      { transform: toT, opacity: r ? 1 : 0 },
    ], { duration: OUT, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' });
    stage.classList.add('out');
    later(OUT * .7, () => sfx('card'));
    later(OUT, () => {
      if (r) {
        const ring = el('sc-land', `left:${center(r).x}px;top:${center(r).y}px;--col:${col}`);
        document.body.appendChild(ring);
        later(500, () => ring.remove());
      }
      stage.remove();
    });
  };
  timer = later(SHOW_MS - OUT, back);
  stage.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    if (done) return;
    back();
    onSkip?.(OUT);
  });
  return SHOW_MS;
}

function burst(L, x, y, n, spread, cols) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, dd = spread * (.35 + Math.random() * .8);
    const s = el('sc-spark', `left:${x}px;top:${y}px;--dx:${Math.cos(a) * dd}px;--dy:${Math.sin(a) * dd}px;--len:${10 + Math.random() * 26}px;--rot:${a}rad;background:${cols[i % cols.length]}`);
    L.appendChild(s);
    later(900, () => s.remove());
  }
}

function lines(L, x, y, col) {
  const g = el('sc-lines', `left:${x}px;top:${y}px`);
  for (let i = 0; i < 28; i++) g.appendChild(el('', `--a:${(i / 28) * 360 + Math.random() * 8}deg;--l:${30 + Math.random() * 40}vmax;background:linear-gradient(90deg, transparent, ${i % 3 ? '#fff' : col})`));
  L.appendChild(g);
  later(700, () => g.remove());
}
