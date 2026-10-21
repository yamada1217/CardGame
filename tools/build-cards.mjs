// docs/ijinden/cards.json から、アプリで使うカードデータ js/cards.js を作る。
// 使い方: node tools/build-cards.mjs
// 全カードを入れる。デッキに入れられるのは効果を実装したカード（js/effects の READY）だけ。
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync(new URL('../docs/ijinden/cards.json', import.meta.url)));
const KW = { 即応: 'sokuo', ダブルプレッシャー: 'double', トリプルプレッシャー: 'triple', クアドラプルプレッシャー: 'quad', ブロッカーになれない: 'cannotBlock', 航海: 'voyage', 執筆: 'shippitsu', ウォッチャー: 'watcher', スタンド: 'stand', 消耗: 'shoumou', ドレイン: 'drain', モータル: 'mortal', 決起: 'kikki', 徴募: 'chobo', 勝鬨: 'kachidoki', 冥装: 'meiso', 躍進: 'yakushin', 魔導: 'madou', 枚数制限なし: 'unlimited' };
const cards = src.cards.map((c) => {
  const kw = {};
  if (/^(これは)?ブロッカーになれない。?$/m.test(c.text || '')) kw.cannotBlock = true;
  for (const k of c.keywords) {
    if (KW[k]) kw[KW[k]] = true;
    else if (/^アタック\+(\d+)$/.test(k)) kw.atk = Number(k.match(/\d+/)[0]);
    else if (/^ブロック\+(\d+)$/.test(k)) kw.blk = Number(k.match(/\d+/)[0]);
    else throw new Error(`未対応のキーワード: ${k}`);
  }
  return {
    id: c.id, name: c.name, type: c.type, color: c.colors[0] || null, colors: c.colors, level: c.level,
    ...(c.type === 'ijin' ? { power: c.power } : {}), ...(c.type === 'mahou' ? { cost: c.cost } : {}),
    traits: c.traits, legacy: c.legacy, kw, text: c.text || '', rarity: c.rarity, unlimited: !!c.anyNumCopies, set: c.set,
  };
});
const decks = Object.fromEntries(src.decks.map((d) => [d.id, { name: d.name, cards: d.cards.flatMap((x) => Array(x.count).fill(x.id)) }]));

writeFileSync(new URL('../js/cards.js', import.meta.url), `// tools/build-cards.mjs で docs/ijinden/cards.json から生成。手で編集しない。
export const COLORS = { red: { name: '赤' }, blue: { name: '青' }, green: { name: '緑' }, yellow: { name: '黄' }, purple: { name: '紫' } };

export const LEGACY_TEXT = ${JSON.stringify(src.legacyAbilities)};

export const CARDS = {
${cards.map((c) => ` ${JSON.stringify(c.id)}: ${JSON.stringify(c)},`).join('\n')}
};

export const DECKS = ${JSON.stringify(decks)};
`);
console.log(`${cards.length} cards, ${Object.keys(decks).length} decks`);
