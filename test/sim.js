// CPU同士で大量に対戦させ、エンジンが止まらないか・ルール違反がないかを確かめる
// 使い方: node test/sim.js [対戦数] [セット名...]（セット名を渡すと、そのセットのカードでランダムなデッキを組む）
import { createGame, applyAction, waitingFor } from '../js/engine.js';
import { cpuAction } from '../js/ai.js';
import { CARDS } from '../js/cards.js';
import { READY } from '../js/effects/index.js';

const N = Number(process.argv[2] || 200);
const SETS = process.argv.slice(3);
const STONES = { red: 'R-13', blue: 'B-13', green: 'G-13', yellow: 'Y-13', purple: 'P-16' };
const stats = { games: 0, stuck: 0, errors: 0, crashes: 0, reasons: {}, turns: 0 };

let rs = 12345;
const rnd = () => ((rs = (rs * 1103515245 + 12345) >>> 0) / 4294967296);

// セットのカードから2色のデッキを作る
function randomDeck(sets) {
  const cols = ['red', 'blue', 'green', 'yellow', 'purple'];
  const c1 = cols[Math.floor(rnd() * 5)], c2 = cols[Math.floor(rnd() * 5)];
  const pool = Object.values(CARDS).filter((c) => READY.has(c.id) && sets.includes(c.set) && (c.colors.length === 0 || c.colors.some((x) => x === c1 || x === c2)) && !c.unlimited);
  const deck = [];
  for (let k = 0; deck.length < 26 && pool.length && k < 500; k++) {
    const c = pool[Math.floor(rnd() * pool.length)];
    if (deck.filter((x) => x === c.id).length < 2) deck.push(c.id);
  }
  while (deck.length < 40) deck.push(STONES[deck.length % 2 ? c1 : c2]);
  return deck;
}

const PAIRS = [['R01', 'B01'], ['B01', 'G01'], ['G01', 'R01']];
for (let g = 0; g < N; g++) {
  const decks = SETS.length ? [randomDeck(SETS), randomDeck(SETS)] : PAIRS[g % PAIRS.length];
  let s = createGame({ seed: g + 1, decks });
  let steps = 0;
  try {
    while (s.phase !== 'over' && steps++ < 3000) {
      const w = waitingFor(s);
      const p = Array.isArray(w) ? w[0] : w;
      const act = cpuAction(s, p);
      if (!act) { console.log('no action', g, s.phase, w, s.prompt); stats.stuck++; break; }
      const r = applyAction(s, p, act);
      if (!r.ok) {
        stats.errors++;
        if (stats.errors < 10) console.log('error', g, JSON.stringify(act), r.why, s.prompt?.title || '');
        const fb = s.prompt ? { type: 'choose', picks: s.prompt.options.slice(0, s.prompt.min) } : s.phase === 'block' ? { type: 'declareBlocks', blocks: {} } : { type: 'endTurn' };
        const r2 = applyAction(s, p, fb);
        if (!r2.ok) { console.log('fallback failed', r2.why); stats.stuck++; break; }
        s = r2.state;
        continue;
      }
      s = r.state;
    }
  } catch (e) {
    stats.crashes++;
    if (stats.crashes < 6) console.log('crash', g, e.stack.split('\n').slice(0, 4).join(' | '));
    continue;
  }
  if (s.phase !== 'over') { if (steps >= 3000) { stats.stuck++; if (stats.stuck < 5) console.log('too long', g, s.log.slice(-5).map((l) => l.text)); } continue; }
  stats.games++;
  const k = s.winReason.includes('山札') ? 'deckout' : s.winReason.includes('防げなかった') ? 'attack' : 'other';
  stats.reasons[k] = (stats.reasons[k] || 0) + 1;
  stats.turns += s.turnNo;
}
console.log({ ...stats, avgTurns: (stats.turns / Math.max(1, stats.games)).toFixed(1) });
if (stats.errors || stats.stuck || stats.crashes) process.exitCode = 1;
