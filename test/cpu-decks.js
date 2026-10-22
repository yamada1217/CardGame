// CPU対戦「ランダム」のデッキ集（js/cpu-decks.js）を確かめる
// - カード名がすべて見つかり、デッキ構築ルールを満たすこと
// - 各デッキで実際に対戦して、エンジンが止まらないこと（CPUの強さ3段階をすべて使う）
// 使い方: node test/cpu-decks.js [--doc]（--doc で docs/cpu-decks.md の出典一覧を書き直す）
import { writeFileSync } from 'node:fs';
import { createGame, applyAction, waitingFor } from '../js/engine.js';
import { cpuAction } from '../js/ai.js';
import { CARDS } from '../js/cards.js';
import { CPU_DECKS, resolveDeck } from '../js/cpu-decks.js';
import { validate, expand } from '../js/decks.js';

let bad = 0;
const decks = CPU_DECKS.map((d) => {
  const r = resolveDeck(d);
  const v = validate(r.cards);
  if (r.missing.length || !v.ok) { bad++; console.log('NG', d.name, r.missing.length ? `見つからないカード: ${r.missing.join('、')}` : v.errors.join(' / ')); }
  if (!d.url || !d.source) { bad++; console.log('NG', d.name, '出典がありません'); }
  return { d, cards: r.cards };
});

const LEVELS = ['easy', 'normal', 'hard'];
let stuck = 0, games = 0;
decks.forEach((a, i) => {
  for (let k = 1; k <= 2; k++) {
    const b = decks[(i + k) % decks.length];
    let s = createGame({ seed: i * 7 + k, decks: [expand(a.cards), expand(b.cards)] });
    for (let steps = 0; s.phase !== 'over' && steps < 3000 && s.turnNo <= 60; steps++) {
      const w = waitingFor(s), p = Array.isArray(w) ? w[0] : w;
      const act = cpuAction(s, p, LEVELS[(i + k + p) % 3]);
      const r = act && applyAction(s, p, act);
      if (!r?.ok) { stuck++; console.log('stuck', a.d.name, 'vs', b.d.name, r?.why || 'no action'); break; }
      s = r.state;
    }
    games++;
  }
});
console.log({ cpuDecks: decks.length, invalid: bad, games, stuck });
if (bad || stuck) process.exitCode = 1;

if (process.argv.includes('--doc')) {
  const color = { red: '赤', blue: '青', green: '緑', yellow: '黄', purple: '紫' };
  const lines = ['# CPU対戦「ランダム」の収録デッキ', '', 'CPU対戦で「ランダム」を選ぶと、次のデッキから1つを使います。', 'デッキの中身は `js/cpu-decks.js` にあり、この一覧は `node test/cpu-decks.js --doc` で作り直せます。', '',
    '| デッキ | 色 | 出典 | 公開日 | メモ |', '|---|---|---|---|---|'];
  for (const { d, cards } of decks) {
    const cols = [...new Set(Object.keys(cards).flatMap((id) => CARDS[id]?.colors || []))].map((c) => color[c]).join('');
    lines.push(`| ${d.name} | ${cols} | [${d.source}](${d.url}) | ${d.date || '—'} | ${d.note || ''} |`);
  }
  writeFileSync(new URL('../docs/cpu-decks.md', import.meta.url), lines.join('\n') + '\n');
  console.log('docs/cpu-decks.md を書き直しました');
}
