// 効果音。音源ファイルは使わず Web Audio で合成する
// 低い音を土台に、衝撃音・風切り音・きらめきを重ね、残響をかけて厚みを出す
const KEY = 'ijinden.mute';
let ctx = null, dry = null, wet = null, noiseBuf = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* 保存できなくても動く */ }
}

// 残響用のインパルス応答（減衰するノイズ）
function impulse(sec, decay) {
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const out = ctx.createGain();
    out.gain.value = .8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    out.connect(comp).connect(ctx.destination);
    dry = ctx.createGain(); dry.gain.value = .8; dry.connect(out);
    const rev = ctx.createConvolver(); rev.buffer = impulse(1.8, 3);
    wet = ctx.createGain(); wet.gain.value = .35;
    wet.connect(rev).connect(out);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ブラウザは操作があるまで音を鳴らせないので、最初のタップで準備する
export function unlockAudio() {
  const once = () => { audio(); window.removeEventListener('pointerdown', once); };
  window.addEventListener('pointerdown', once);
}

function route(node, rev) {
  node.connect(dry);
  if (rev) { const s = ctx.createGain(); s.gain.value = rev; node.connect(s).connect(wet); }
}

function env(g, t, vol, attack, dur) {
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
}

function tone(freq, { at = 0, dur = .3, type = 'sine', vol = .3, to = null, attack = .004, rev = .3, detune = 0 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * .9);
  env(g, t, vol, attack, dur);
  o.connect(g); route(g, rev);
  o.start(t); o.stop(t + dur + .05);
}

function noise({ at = 0, dur = .3, vol = .3, freq = 1200, to = null, q = .8, type = 'bandpass', attack = .003, rev = .3 } = {}) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(freq, t);
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, vol, attack, dur);
  s.connect(fl).connect(g); route(g, rev);
  s.start(t, Math.random()); s.stop(t + dur + .05);
}

// よく使う部品
const sub = (at, f = 55, dur = .7, vol = .9) => tone(f, { at, dur, vol, to: f * .45, rev: .1 });
const thump = (at, vol = .7) => { tone(140, { at, dur: .18, vol, to: 45, rev: .2 }); noise({ at, dur: .08, freq: 2500, vol: vol * .5, type: 'lowpass', rev: .2 }); };
const whoosh = (at, dur = .35, from = 300, to = 2600, vol = .35) => noise({ at, dur, freq: from, to, vol, q: 1.6, attack: dur * .6, rev: .4 });
const shimmer = (at, notes, gap = .045, vol = .08) => notes.forEach((f, i) => { tone(f, { at: at + i * gap, dur: .9, type: 'triangle', vol, rev: .8 }); tone(f * 2, { at: at + i * gap, dur: .5, vol: vol * .3, rev: .9 }); });
const chord = (at, notes, dur, type = 'sawtooth', vol = .05) => notes.forEach((f) => [-8, 8].forEach((dt) => tone(f, { at, dur, type, vol, attack: .02, rev: .6, detune: dt })));

const SOUNDS = {
  tap: () => { tone(520, { dur: .07, type: 'triangle', vol: .12, to: 380, rev: .15 }); noise({ dur: .03, freq: 3000, vol: .06, rev: 0 }); },
  card: () => { noise({ dur: .14, freq: 1800, to: 700, vol: .2, q: 1.2, rev: .2 }); tone(330, { at: .01, dur: .1, type: 'triangle', vol: .1, rev: .2 }); },
  summon: () => {
    whoosh(0, .3, 200, 1800, .3);
    sub(.28, 49, .9, 1); thump(.28, .8);
    noise({ at: .28, dur: .7, freq: 900, to: 180, vol: .3, type: 'lowpass', rev: .6 });
    chord(.3, [196, 247, 294], .9);
    shimmer(.32, [784, 988, 1175, 1568], .05, .06);
  },
  place: () => {
    sub(0, 41, 1, 1); thump(0, .9);
    noise({ dur: .9, freq: 400, to: 90, vol: .45, type: 'lowpass', rev: .7 });
    chord(.05, [147, 220, 294], 1.1, 'triangle', .07);
  },
  attack: () => {
    whoosh(0, .22, 400, 4200, .45);
    tone(110, { dur: .35, type: 'sawtooth', vol: .12, to: 330, rev: .3 });
    sub(.18, 62, .45, .7); thump(.2, .6);
  },
  block: () => {
    thump(0, .9); sub(0, 58, .5, .8);
    [523, 784, 1046].forEach((f) => tone(f, { dur: .9, type: 'square', vol: .035, rev: .9 }));
    noise({ dur: .2, freq: 3500, vol: .3, q: 4, rev: .6 });
  },
  destroy: () => {
    sub(0, 46, 1.1, 1.2); thump(0, 1);
    noise({ dur: 1.1, freq: 3000, to: 120, vol: .6, type: 'lowpass', rev: .7 });
    noise({ at: .03, dur: .35, freq: 5000, vol: .25, type: 'highpass', rev: .4 });
    tone(220, { at: .02, dur: .5, type: 'sawtooth', vol: .12, to: 55, rev: .5 });
    thump(.12, .5);
  },
  guard: () => {
    sub(0, 52, .7, .9); thump(0, .8);
    noise({ dur: .45, freq: 4500, to: 900, vol: .4, q: 2.5, rev: .6 });
    [1397, 2093].forEach((f, i) => tone(f, { at: i * .03, dur: .6, type: 'triangle', vol: .05, rev: .9 }));
  },
  // 剣戟：金属の倍音（整数倍でない高い音）を重ねて、短く鋭く鳴らす
  clash: () => {
    thump(0, .6); sub(0, 70, .3, .5);
    noise({ dur: .12, freq: 6000, vol: .35, type: 'highpass', rev: .4 });
    [1180, 1870, 2650, 3420].forEach((f, i) => tone(f * (.97 + Math.random() * .06), { dur: .45 - i * .06, type: i % 2 ? 'triangle' : 'sine', vol: .07, rev: .7 }));
  },
  clashBig: () => {
    sub(0, 48, .9, 1.1); thump(0, 1);
    noise({ dur: .2, freq: 7000, vol: .45, type: 'highpass', rev: .5 });
    noise({ dur: .8, freq: 2500, to: 150, vol: .4, type: 'lowpass', rev: .8 });
    [980, 1560, 2210, 2980, 3870].forEach((f, i) => tone(f * (.97 + Math.random() * .06), { dur: .9 - i * .1, type: i % 2 ? 'triangle' : 'sine', vol: .08, rev: .9 }));
    whoosh(.02, .3, 3000, 500, .3);
  },
  mana: () => { thump(0, .6); noise({ dur: .4, freq: 2500, to: 500, vol: .3, rev: .5 }); tone(196, { dur: .3, type: 'square', vol: .05, to: 82, rev: .4 }); },
  charge: () => { tone(392, { dur: .4, type: 'triangle', vol: .14, rev: .6 }); tone(587, { at: .05, dur: .5, vol: .1, rev: .7 }); sub(0, 82, .3, .4); },
  bounce: () => { whoosh(0, .45, 250, 3500, .35); tone(196, { dur: .45, vol: .2, to: 784, rev: .6 }); },
  magic: () => {
    whoosh(0, .6, 150, 5000, .3);
    chord(0, [131, 196, 262], 1.4, 'sawtooth', .045);
    shimmer(.05, [523, 659, 784, 1047, 1319, 1568, 2093], .05, .07);
    sub(.45, 44, 1.2, 1.1); thump(.45, .8);
    noise({ at: .45, dur: 1.2, freq: 1500, to: 200, vol: .3, type: 'lowpass', rev: .9 });
  },
  turn: () => {
    sub(0, 55, .8, .7);
    chord(0, [220, 277, 330], 1.2, 'triangle', .07);
    shimmer(.1, [880, 1109, 1319], .08, .07);
  },
  win: () => {
    sub(0, 55, 1.2, .9);
    [[262, 330, 392], [294, 370, 440], [330, 415, 494], [392, 494, 587]].forEach((c, i) => chord(i * .22, c, i === 3 ? 2 : .35, 'sawtooth', .05));
    shimmer(.7, [1047, 1319, 1568, 2093], .07, .07);
  },
  lose: () => {
    sub(0, 41, 1.6, 1);
    [[220, 262, 330], [196, 233, 294], [175, 208, 262], [147, 175, 220]].forEach((c, i) => chord(i * .38, c, .9, 'triangle', .07));
  },
};

export function sfx(name) {
  if (muted || !SOUNDS[name]) return;
  if (!audio()) return;
  try { SOUNDS[name](); } catch { /* 音が出なくても遊べる */ }
}
