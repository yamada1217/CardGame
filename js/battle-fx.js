// ブロックされたバトルの演出。
// 盤面から2枚（または複数）のカードを画面中央に呼び出し、剣戟のように何度もぶつけ合って、
// 最後に結果（破壊・持ち場に戻る・手札に戻る）を見せる。状態はもう進んでいるので、上に重ねて見せるだけ。
import { sfx } from './sfx.js';

const SINGLE = 1500, MULTI = 1000, MAX_SHOWN = 3;
const find = (root, uid) => root.querySelector(`[data-uid="${CSS.escape(String(uid))}"]`);
const el = (cls, css = '', html = '') => { const d = document.createElement('div'); d.className = cls; if (css) d.style.cssText = css; if (html) d.innerHTML = html; return d; };
const later = (ms, f) => setTimeout(f, ms * (globalThis.__fxSlow || 1)); // __fxSlow は動作確認用のスロー再生

// 火花を散らす
function sparks(L, x, y, n, spread, cols) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = spread * (.4 + Math.random() * .9);
    const s = el('bf-spark', `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--len:${8 + Math.random() * 22}px;--rot:${a}rad;background:${cols[i % cols.length]}`);
    L.appendChild(s);
    later(700, () => s.remove());
  }
}

// 剣の軌跡（光の線）を斜めに走らせる
function slash(L, x, y, angle, color) {
  const s = el('bf-slash', `left:${x}px;top:${y}px;--a:${angle}deg;--c:${color}`);
  L.appendChild(s);
  later(450, () => s.remove());
}

function shock(L, x, y, big) {
  const s = el(`bf-shock${big ? ' big' : ''}`, `left:${x}px;top:${y}px`);
  L.appendChild(s);
  later(700, () => s.remove());
}

// 魔力の粒子が立ちのぼる
function motes(stage, n) {
  for (let i = 0; i < n; i++) {
    const m = el('bf-mote', `left:${Math.random() * 100}%;top:${55 + Math.random() * 45}%;--d:${1 + Math.random() * 1.2}s;--x:${(Math.random() - .5) * 60}px;animation-delay:${Math.random() * .6}s`);
    stage.appendChild(m);
  }
}

// カードを砕く（破片が飛び散る）
function shatter(L, card, rect) {
  const pieces = [
    '0 0,55% 0,40% 45%,0 30%', '55% 0,100% 0,100% 35%,40% 45%', '0 30%,40% 45%,30% 75%,0 70%',
    '40% 45%,100% 35%,100% 65%,60% 70%', '0 70%,30% 75%,45% 100%,0 100%', '30% 75%,60% 70%,100% 65%,100% 100%,45% 100%',
  ];
  pieces.forEach((poly, i) => {
    const p = el('bf-shard', `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;clip-path:polygon(${poly});--dx:${(i % 2 ? 1 : -1) * (40 + Math.random() * 90)}px;--dy:${(i < 2 ? -1 : i < 4 ? 0 : 1) * (40 + Math.random() * 70)}px;--r:${(Math.random() - .5) * 140}deg`, card.innerHTML);
    L.appendChild(p);
    later(900, () => p.remove());
  });
}

// battle: { pairs: [{ atk, blks: [uid...] }], outcome: { uid: 'destroy'|'bounce'|'stay' }, atkOwner }
// snaps: { uid: { rect, html } }（描画前の位置と見た目）。戻り値は演出の長さ（ミリ秒）
export function battleStage(L, battle, snaps, root, me, shake) {
  const pairs = battle.pairs.filter((x) => snaps[x.atk] && x.blks.some((b) => snaps[b])).slice(0, MAX_SHOWN);
  if (!pairs.length) return 0;
  const T = pairs.length > 1 ? MULTI : SINGLE;
  const W = innerWidth, H = innerHeight;
  const stage = el('bf-stage', '', '<i class="bf-dim"></i><i class="bf-circle"></i><i class="bf-lines"></i>');
  L.appendChild(stage);
  motes(stage, 18);
  sfx('block');
  pairs.forEach((pair, k) => later(k * T, () => fight(pair)));
  const total = pairs.length * T;
  later(total - 120, () => stage.classList.add('out'));
  later(total + 300, () => stage.remove());
  return total;

  function fight(pair) {
    const atkMine = battle.atkOwner === me;
    const cx = W / 2, cy = H * .46;
    const gap = Math.min(130, H * .14);
    // 自分のカードは下、相手のカードは上から迫る
    const atkY = atkMine ? cy + gap : cy - gap, blkY = atkMine ? cy - gap : cy + gap;
    const blks = pair.blks.filter((b) => snaps[b]);
    const units = [
      { uid: pair.atk, x: cx, y: atkY, dir: atkMine ? -1 : 1, mine: atkMine },
      ...blks.map((b, i) => ({ uid: b, x: cx + (i - (blks.length - 1) / 2) * Math.min(110, W / (blks.length + 1)), y: blkY, dir: atkMine ? 1 : -1, mine: !atkMine })),
    ];
    const scale = Math.min(1.9, (H * .3) / (snaps[pair.atk].rect.height || 120));
    for (const u of units) {
      const s = snaps[u.uid];
      const c = el('bf-card', `left:${s.rect.left}px;top:${s.rect.top}px;width:${s.rect.width}px;height:${s.rect.height}px`, s.html);
      c.firstElementChild?.classList.remove('enter', 'can', 'picked', 'playable', 'tapped', 'blocking');
      L.appendChild(c);
      u.node = c; u.rect = s.rect;
      u.sc = Math.min(scale, (H * .3) / (s.rect.height || 120)) * (blks.length > 2 && u.uid !== pair.atk ? .75 : 1);
      // 盤面の位置から中央へ
      const tx = u.x - (s.rect.left + s.rect.width / 2), ty = u.y - (s.rect.top + s.rect.height / 2);
      u.home = `translate(${tx}px, ${ty}px) scale(${u.sc})`;
      c.animate([{ transform: 'none', opacity: .4 }, { transform: u.home, opacity: 1 }], { duration: T * .18, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'forwards' });
    }
    // 3回ぶつかり合う（最後がいちばん強い）
    const hits = [.26, .42, .58];
    hits.forEach((h, i) => later(T * h, () => {
      const strong = i === hits.length - 1;
      const lunge = Math.max(18, gap - 46) * (strong ? 1.15 : .9);
      for (const u of units) {
        const off = `translate(${(u.x - cx) * -.15}px, ${u.dir * lunge}px)`;
        u.node.animate([{ transform: u.home }, { transform: `${u.home.replace(/ scale.*/, '')} ${off} scale(${u.sc * (strong ? 1.08 : 1.03)})`, offset: .45 }, { transform: u.home }], { duration: T * .14, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' });
      }
      later(T * .06, () => {
        const ang = [-28, 32, -12][i] + (Math.random() - .5) * 10;
        slash(L, cx, cy, ang, strong ? '#ffe9a8' : '#bfe2ff');
        if (strong) slash(L, cx, cy, ang + 74, '#ff9a5a');
        sparks(L, cx, cy, strong ? 34 : 20, strong ? 170 : 110, strong ? ['#fff', '#ffe08a', '#ff9a3d', '#9fd4ff'] : ['#fff', '#cde9ff', '#ffe9a8']);
        shock(L, cx, cy, strong);
        const f = el(`bf-flash${strong ? ' big' : ''}`);
        L.appendChild(f); later(260, () => f.remove());
        sfx(strong ? 'clashBig' : 'clash');
        if (strong) shake();
      });
    }));
    // 結果
    later(T * .72, () => {
      let destroyed = false;
      for (const u of units) {
        const res = battle.outcome[u.uid] || 'stay';
        const r = u.node.getBoundingClientRect();
        if (res === 'destroy') {
          destroyed = true;
          u.node.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(3) saturate(0)' }], { duration: 90, fill: 'forwards' });
          later(90, () => {
            shatter(L, u.node, r);
            u.node.remove();
            sparks(L, r.left + r.width / 2, r.top + r.height / 2, 26, 150, ['#fff2c4', '#ff9a4a', '#ff4b2b']);
            const w = el('fx-word red', `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px`);
            w.textContent = '撃破'; L.appendChild(w); later(900, () => w.remove());
          });
          continue;
        }
        if (res === 'bounce') {
          // 手札へ（自分は下、相手は上へ飛んでいく）
          const ty = u.mine ? H + 40 : -r.height - 40;
          u.node.animate([{ transform: u.home, opacity: 1 }, { transform: `translate(${W / 2 - (u.rect.left + u.rect.width / 2)}px, ${ty - (u.rect.top + u.rect.height / 2)}px) scale(.5) rotate(${u.mine ? 12 : -12}deg)`, opacity: 0 }], { duration: T * .28, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
          const w = el('fx-word blue', `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px`);
          w.textContent = '手札へ'; L.appendChild(w); later(900, () => w.remove());
          later(T * .3, () => u.node.remove());
          continue;
        }
        // 持ち場に戻る：描き直した盤面の位置へ
        const target = find(root, u.uid);
        const tr = target?.getBoundingClientRect() || u.rect;
        u.node.classList.add('bf-win');
        u.node.animate([{ transform: u.home, opacity: 1 }, { transform: `translate(${tr.left - u.rect.left}px, ${tr.top - u.rect.top}px) scale(${tr.width / (u.rect.width || 1)})`, opacity: .9 }], { duration: T * .26, delay: T * .04, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
        later(T * .3, () => u.node.remove());
      }
      if (destroyed) { sfx('destroy'); shake(); }
    });
    // 念のため、どの結果でも演出の終わりには呼び出したカードを片付ける
    later(T * 1.1, () => units.forEach((u) => u.node.remove()));
  }
}
