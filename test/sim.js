// CPU同士で大量に対戦させ、エンジンが止まらないか・ルール違反がないかを確かめる
import { createGame, applyAction, waitingFor } from '../js/engine.js';
import { cpuAction } from '../js/ai.js';

const N = Number(process.argv[2] || 300);
const PAIRS = [['R01', 'B01'], ['B01', 'G01'], ['G01', 'R01'], ['R01', 'R01'], ['B01', 'B01'], ['G01', 'G01']];
const stats = { games: 0, stuck: 0, errors: 0, reasons: {}, wins: {}, turns: 0 };

for (let g = 0; g < N; g++) {
  const decks = PAIRS[g % PAIRS.length];
  let s = createGame({ seed: g + 1, decks });
  let steps = 0;
  while (s.phase !== 'over' && steps++ < 4000) {
    const w = waitingFor(s);
    const p = Array.isArray(w) ? w[0] : w;
    const act = cpuAction(s, p);
    if (!act) { console.log('no action', g, s.phase, w, s.prompt); stats.stuck++; break; }
    const r = applyAction(s, p, act);
    if (!r.ok) {
      stats.errors++;
      if (stats.errors < 10) console.log('error', g, decks, JSON.stringify(act), r.why, s.prompt?.title || '');
      // 進められないなら、選択はスキップ・ターンは終了させる
      const fb = s.prompt ? { type: 'choose', picks: s.prompt.options.slice(0, s.prompt.min) } : s.phase === 'block' ? { type: 'declareBlocks', blocks: {} } : { type: 'endTurn' };
      const r2 = applyAction(s, p, fb);
      if (!r2.ok) { console.log('fallback failed', r2.why); stats.stuck++; break; }
      s = r2.state;
      continue;
    }
    s = r.state;
  }
  if (s.phase !== 'over') { if (steps >= 4000) { stats.stuck++; console.log('too long', g, decks); } continue; }
  stats.games++;
  const k = s.winReason.includes('山札') ? 'deckout' : 'attack';
  stats.reasons[k] = (stats.reasons[k] || 0) + 1;
  const wd = `${decks[s.winner]} (vs ${decks[1 - s.winner]})`;
  stats.wins[wd] = (stats.wins[wd] || 0) + 1;
  stats.turns += s.turnNo;
}
console.log({ ...stats, avgTurns: (stats.turns / Math.max(1, stats.games)).toFixed(1) });
if (stats.errors || stats.stuck) process.exitCode = 1;
