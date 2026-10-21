// 効果音。音源ファイルは使わず Web Audio で合成する
const KEY = 'ijinden.mute';
let ctx = null, master = null, noiseBuf = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* 保存できなくても動く */ }
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = .5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
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

function tone(freq, { at = 0, dur = .2, type = 'sine', vol = .3, to = null, attack = .005 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + .02);
}

function noise({ at = 0, dur = .3, vol = .3, freq = 1200, to = null, q = 1, type = 'bandpass' } = {}) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(freq, t);
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(fl).connect(g).connect(master);
  s.start(t); s.stop(t + dur + .02);
}

const SOUNDS = {
  tap: () => tone(1400, { dur: .05, type: 'triangle', vol: .12 }),
  card: () => { noise({ dur: .12, freq: 3000, to: 1200, vol: .18 }); tone(660, { at: .02, dur: .08, type: 'triangle', vol: .1 }); },
  summon: () => {
    tone(90, { dur: .45, type: 'sine', vol: .5, to: 45 });
    noise({ dur: .4, freq: 400, to: 3000, vol: .15 });
    [784, 988, 1319].forEach((f, i) => tone(f, { at: .08 + i * .05, dur: .5, type: 'triangle', vol: .09 }));
  },
  place: () => { tone(70, { dur: .5, vol: .5, to: 40 }); noise({ dur: .35, freq: 300, vol: .25, type: 'lowpass' }); tone(523, { at: .05, dur: .6, type: 'triangle', vol: .08 }); },
  attack: () => { noise({ dur: .28, freq: 800, to: 5000, vol: .3, q: 2 }); tone(220, { dur: .25, type: 'sawtooth', vol: .08, to: 440 }); },
  block: () => { [1200, 1810, 2650].forEach((f) => tone(f, { dur: .4, type: 'square', vol: .04 })); noise({ dur: .15, freq: 4000, vol: .2 }); tone(160, { dur: .2, vol: .3 }); },
  destroy: () => {
    noise({ dur: .6, freq: 2500, to: 200, vol: .45, type: 'lowpass' });
    tone(110, { dur: .6, type: 'sine', vol: .6, to: 30 });
    tone(330, { at: .02, dur: .25, type: 'sawtooth', vol: .08, to: 80 });
    noise({ at: .05, dur: .2, freq: 6000, vol: .15, type: 'highpass' });
  },
  guard: () => { noise({ dur: .3, freq: 5000, to: 1500, vol: .3, q: 3 }); [1600, 2400].forEach((f, i) => tone(f, { at: i * .04, dur: .3, type: 'triangle', vol: .07 })); tone(140, { dur: .3, vol: .3, to: 60 }); },
  mana: () => { noise({ dur: .25, freq: 3000, to: 800, vol: .2 }); tone(300, { dur: .2, type: 'square', vol: .05, to: 120 }); },
  charge: () => { tone(880, { dur: .25, type: 'triangle', vol: .12 }); tone(1320, { at: .06, dur: .3, type: 'sine', vol: .1 }); },
  bounce: () => { tone(300, { dur: .35, type: 'sine', vol: .2, to: 1200 }); noise({ dur: .3, freq: 1000, to: 4000, vol: .1 }); },
  magic: () => {
    noise({ dur: .9, freq: 500, to: 6000, vol: .12, q: 4 });
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, { at: i * .055, dur: .6, type: 'triangle', vol: .09 }));
    tone(65, { at: .3, dur: .7, vol: .4, to: 40 });
  },
  turn: () => { [660, 880].forEach((f, i) => tone(f, { at: i * .12, dur: .5, type: 'sine', vol: .18 })); tone(1760, { at: .12, dur: .6, type: 'sine', vol: .04 }); },
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, { at: [0, .12, .24, .36, .6, .72][i], dur: i > 3 ? .7 : .2, type: 'triangle', vol: .16 })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, { at: i * .25, dur: .5, type: 'sine', vol: .18 })),
};

export function sfx(name) {
  if (muted || !SOUNDS[name]) return;
  if (!audio()) return;
  try { SOUNDS[name](); } catch { /* 音が出なくても遊べる */ }
}
