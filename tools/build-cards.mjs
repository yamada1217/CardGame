// docs/ijinden/cards.json から、アプリで使うカードデータ js/cards.js を作る。
// 使い方: node tools/build-cards.mjs
// 効果まで実装済みのスターター3種（R01/B01/G01）だけを入れる。
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync(new URL('../docs/ijinden/cards.json', import.meta.url)));
const STARTERS = new Set(src.decks.map((d) => d.id));
const cards = src.cards.filter((c) => STARTERS.has(c.set)).map((c) => {
  const kw = {};
  if (c.id === 'B-3') kw.cannotBlock = true; // 好太王：ブロッカーになれない（本文のみに記載）
  for (const k of c.keywords) {
    if (k === '即応') kw.sokuo = true;
    else if (k === 'ダブルプレッシャー') kw.double = true;
    else if (k === 'ブロッカーになれない') kw.cannotBlock = true;
    else if (k === '航海') kw.voyage = true;
    else if (k === '執筆') kw.shippitsu = true;
    else if (k === '枚数制限なし') kw.unlimited = true;
    else if (/^アタック\+(\d+)$/.test(k)) kw.atk = Number(k.match(/\d+/)[0]);
    else throw new Error(`未対応のキーワード: ${k}`);
  }
  return {
    id: c.id, name: c.name, type: c.type, color: c.colors[0] || null, level: c.level,
    ...(c.type === 'ijin' ? { power: c.power } : {}), ...(c.type === 'mahou' ? { cost: c.cost } : {}),
    traits: c.traits, legacy: c.legacy, kw, text: c.text, rarity: c.rarity, unlimited: !!c.anyNumCopies,
  };
});
const decks = Object.fromEntries(src.decks.map((d) => [d.id, { name: d.name, cards: d.cards.flatMap((x) => Array(x.count).fill(x.id)) }]));

writeFileSync(new URL('../js/cards.js', import.meta.url), `// tools/build-cards.mjs で docs/ijinden/cards.json から生成。手で編集しない。
export const COLORS = { red: { name: '赤' }, blue: { name: '青' }, green: { name: '緑' }, yellow: { name: '黄' }, purple: { name: '紫' } };

export const LEGACY_TEXT = ${JSON.stringify(src.legacyAbilities, null, 2)};

export const CARDS = ${JSON.stringify(Object.fromEntries(cards.map((c) => [c.id, c])), null, 1)};

export const DECKS = ${JSON.stringify(decks, null, 1)};
`);
console.log(`${cards.length} cards, ${Object.keys(decks).length} decks`);
