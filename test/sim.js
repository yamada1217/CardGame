// CPU同士で大量に対戦させ、エンジンが止まらないか・ルール違反がないかを確かめる
import { createGame, applyAction } from '../js/engine.js';
import { cpuMainAction, cpuBlocks } from '../js/ai.js';

const N = Number(process.argv[2] || 500);
const stats = { wins: [0, 0], reasons: {}, turns: 0, errors: 0 };
for (let g = 0; g < N; g++) {
  let s = createGame({ seed: g + 1 });
  let steps = 0;
  while (s.phase !== 'over' && steps++ < 5000) {
    const p = s.phase === 'block' ? 1 - s.turn : s.turn;
    const act = s.phase === 'block' ? { type: 'declareBlocks', blocks: cpuBlocks(s, p) } : cpuMainAction(s, p);
    const r = applyAction(s, p, act);
    if (!r.ok) { stats.errors++; console.log('error', g, act, r.why); s = applyAction(s, s.turn, { type: 'endTurn' }).state; continue; }
    s = r.state;
  }
  if (s.phase !== 'over') { console.log('stuck', g); process.exitCode = 1; continue; }
  stats.wins[s.winner]++;
  const k = s.winReason.includes('山札') ? 'deckout' : 'attack';
  stats.reasons[k] = (stats.reasons[k] || 0) + 1;
  stats.turns += s.turnNo;
}
console.log({ games: N, ...stats, avgTurns: (stats.turns / N).toFixed(1) });
if (stats.errors) process.exitCode = 1;
