// 先攻を決めるサイコロの演出。目は createGame で決まっている（g.dice）ので、それを見せるだけ。
// 上が相手、下が自分。同じ目なら「もう一度」と振り直し、大きい目を出した方が先攻。画面をタップすると最後まで飛ばす。
import { sfx } from './sfx.js';

const ROLL = 1100, TIE = 900, RESULT = 1400;
const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
// 面の置き方。見せるときは逆に回す
const FACE = { 1: ['Y', 0], 6: ['Y', 180], 3: ['Y', 90], 4: ['Y', -90], 5: ['X', 90], 2: ['X', -90] };
const later = (ms, f) => setTimeout(f, ms * (globalThis.__fxSlow || 1));

const face = (n) => `<div class="d-face" style="transform:rotate${FACE[n][0]}(${FACE[n][1]}deg) translateZ(var(--h))">${
  Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i + 1) ? 'on' : ''}${n === 1 ? ' one' : ''}"></i>`).join('')}</div>`;
const cube = () => `<div class="die"><div class="d-cube">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div></div>`;
const restOn = (n, spin = 0) => (FACE[n][0] === 'X' ? `rotateX(${spin - FACE[n][1]}deg) rotateY(${spin}deg)` : `rotateX(${spin}deg) rotateY(${spin - FACE[n][1]}deg)`);

// dice: [[p0の目, p1の目], ...]、me: 自分の席。done: 閉じたとき
export function rollDice(dice, me, done) {
  const root = document.createElement('div');
  root.className = 'dice-stage';
  root.innerHTML = `<i class="d-dim"></i>
    <div class="d-side foe"><small>あいて</small>${cube()}<b class="d-num"></b></div>
    <div class="d-msg"><b>サイコロで先攻を決めます</b></div>
    <div class="d-side me"><small>あなた</small>${cube()}<b class="d-num"></b></div>
    <p class="d-skip">タップで飛ばす</p>`;
  document.body.appendChild(root);
  void root.offsetWidth;
  root.classList.add('open');
  const [foeSide, meSide] = [root.querySelector('.d-side.foe'), root.querySelector('.d-side.me')];
  const msg = root.querySelector('.d-msg');
  const timers = [];
  const at = (ms, f) => timers.push(later(ms, f));
  let finished = false;

  const show = (side, n, roll) => {
    const c = side.querySelector('.d-cube');
    side.querySelector('.d-num').textContent = '';
    side.classList.remove('win', 'lose');
    if (!roll) { c.getAnimations().forEach((a) => a.cancel()); c.style.transform = restOn(n); side.querySelector('.d-num').textContent = n; return; }
    const from = c.style.transform || 'rotateX(0deg) rotateY(0deg)';
    const spin = 720 + 360 * Math.floor(Math.random() * 2);
    c.animate([{ transform: from }, { transform: restOn(n, spin) }], { duration: ROLL * (globalThis.__fxSlow || 1), easing: 'cubic-bezier(.2,.7,.25,1)' });
    c.style.transform = restOn(n);
    side.querySelector('.die').animate([
      { transform: 'translateY(-60px) scale(.7)' }, { transform: 'translateY(0) scale(1.08)', offset: .35 },
      { transform: 'translateY(-18px) scale(1)', offset: .55 }, { transform: 'translateY(0) scale(1)', offset: .75 }, { transform: 'none' },
    ], { duration: ROLL * (globalThis.__fxSlow || 1), easing: 'ease-out' });
    at(ROLL, () => { side.querySelector('.d-num').textContent = n; });
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    root.classList.remove('open');
    later(250, () => root.remove());
    done?.();
  };
  const result = (pair) => {
    const mine = pair[me], theirs = pair[1 - me];
    show(meSide, mine, false); show(foeSide, theirs, false);
    const win = mine > theirs;
    meSide.classList.add(win ? 'win' : 'lose'); foeSide.classList.add(win ? 'lose' : 'win');
    msg.innerHTML = `<b class="${win ? 'good' : ''}">${win ? 'あなたが先攻！' : 'あいてが先攻'}</b>`;
    msg.classList.remove('pop'); void msg.offsetWidth; msg.classList.add('pop');
  };

  let t = 300;
  dice.forEach((pair, i) => {
    const last = i === dice.length - 1;
    at(t, () => {
      msg.innerHTML = `<b>${i ? 'もう一度！' : 'サイコロで先攻を決めます'}</b>`;
      sfx('whoosh');
      show(meSide, pair[me], true); show(foeSide, pair[1 - me], true);
    });
    at(t + ROLL * .35, () => sfx('card'));
    at(t + ROLL, () => {
      if (!last) { msg.innerHTML = '<b>同じ目！</b>'; msg.classList.remove('pop'); void msg.offsetWidth; msg.classList.add('pop'); sfx('tap'); return; }
      result(pair);
      sfx(pair[me] > pair[1 - me] ? 'charge' : 'turn');
    });
    t += ROLL + (last ? 0 : TIE);
  });
  at(t + RESULT, finish);

  root.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (finished) return;
    if (root.classList.contains('skipped')) return finish();
    // 1回目のタップで結果を見せ、もう一度で閉じる（少し待っても閉じる）
    root.classList.add('skipped');
    timers.forEach(clearTimeout); timers.length = 0;
    result(dice[dice.length - 1]);
    at(900, finish);
  });
  return t + RESULT;
}
