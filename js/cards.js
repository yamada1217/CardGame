// 仮のカードデータ。実物の説明書・カード写真が揃ったら差し替える。
// type: ijin | haikei | mahou | maryoku
// kw: sokuo(即応) watcher(ウォッチャー) unblockable(ブロックされない) double(ダブルプレッシャー) atk/blk(アタック+/ブロック+)
// onSummon / legacy / effect は engine.js の EFFECTS のキー

export const COLORS = {
  red: { name: '赤', hex: '#e2503f' },
  blue: { name: '青', hex: '#3f7fe2' },
  green: { name: '緑', hex: '#3fae6a' },
};

const ijin = (id, name, color, level, power, extra = {}) =>
  ({ id, name, type: 'ijin', color, level, power, kw: {}, ...extra });

export const CARDS = Object.fromEntries([
  // 赤
  ijin('r_musashi', '宮本武蔵', 'red', 1, 2, { text: '二刀流の剣豪。' }),
  ijin('r_ryoma', '坂本龍馬', 'red', 1, 1, { legacy: 'draw1', text: '遺業：カードを1枚引く。' }),
  ijin('r_yoshitsune', '源義経', 'red', 2, 2, { kw: { sokuo: true }, text: '即応' }),
  ijin('r_shingen', '武田信玄', 'red', 2, 3, { text: '風林火山。' }),
  ijin('r_nobunaga', '織田信長', 'red', 3, 4, { kw: { sokuo: true }, text: '即応' }),
  ijin('r_napoleon', 'ナポレオン', 'red', 4, 6, { kw: { double: true }, text: 'ダブルプレッシャー' }),
  // 青
  ijin('b_murasaki', '紫式部', 'blue', 1, 1, { legacy: 'draw1', text: '遺業：カードを1枚引く。' }),
  ijin('b_taishi', '聖徳太子', 'blue', 2, 2, { kw: { watcher: true }, text: 'ウォッチャー' }),
  ijin('b_edison', 'エジソン', 'blue', 2, 2, { onSummon: 'draw1', text: '出た時：カードを1枚引く。' }),
  ijin('b_galileo', 'ガリレオ', 'blue', 3, 3, { kw: { watcher: true }, text: 'ウォッチャー' }),
  ijin('b_einstein', 'アインシュタイン', 'blue', 4, 4, { kw: { watcher: true, blk: 2 }, text: 'ウォッチャー／ブロック+2' }),
  // 緑
  ijin('g_hideyoshi', '豊臣秀吉', 'green', 2, 3, { text: '天下人。' }),
  ijin('g_jeanne', 'ジャンヌ・ダルク', 'green', 2, 2, { kw: { atk: 2 }, text: 'アタック+2' }),
  ijin('g_himiko', '卑弥呼', 'green', 3, 3, { kw: { watcher: true }, text: 'ウォッチャー' }),
  ijin('g_ieyasu', '徳川家康', 'green', 3, 3, { kw: { blk: 2 }, text: 'ブロック+2' }),
  ijin('g_genghis', 'チンギス・ハン', 'green', 5, 7, { kw: { double: true, sokuo: true }, text: '即応／ダブルプレッシャー' }),
  // ハイケイ
  { id: 'h_honnoji', name: '本能寺', type: 'haikei', color: 'red', level: 2, buff: { color: 'red', power: 1 }, text: '自分の赤のイジンのパワー+1。' },
  { id: 'h_library', name: '大図書館', type: 'haikei', color: 'blue', level: 2, buff: { color: 'blue', blk: 2 }, text: '自分の青のイジンはブロック+2。' },
  { id: 'h_castle', name: '大坂城', type: 'haikei', color: 'green', level: 3, buff: { color: 'green', power: 1 }, text: '自分の緑のイジンのパワー+1。' },
  // マホウ
  { id: 'm_fire', name: '火計', type: 'mahou', color: 'red', level: 1, cost: 1, effect: 'destroy3', target: 'enemyIjin', text: '相手のパワー3以下のイジン1体を破壊する。' },
  { id: 'm_idea', name: 'ひらめき', type: 'mahou', color: 'blue', level: 1, cost: 1, effect: 'draw2', text: 'カードを2枚引く。' },
  { id: 'm_rally', name: '鬨の声', type: 'mahou', color: 'green', level: 2, cost: 1, effect: 'rally', text: 'このターン、自分のイジンすべてのパワー+2。' },
  // マリョク
  { id: 'k_red', name: '赤のマリョク', type: 'maryoku', color: 'red', level: 1, text: 'レベル1・赤' },
  { id: 'k_blue', name: '青のマリョク', type: 'maryoku', color: 'blue', level: 1, text: 'レベル1・青' },
  { id: 'k_green', name: '緑のマリョク', type: 'maryoku', color: 'green', level: 1, text: 'レベル1・緑' },
  { id: 'k_gold', name: '黄金のマリョク', type: 'maryoku', color: null, level: 2, text: 'レベル2・色なし' },
].map(c => [c.id, c]));

const repeat = (pairs) => pairs.flatMap(([id, n]) => Array(n).fill(id));

export const DECKS = {
  fire: {
    name: '天下布武（赤×緑）',
    cards: repeat([
      ['k_red', 8], ['k_green', 5], ['k_gold', 2],
      ['r_musashi', 3], ['r_ryoma', 2], ['r_yoshitsune', 3], ['r_shingen', 3], ['r_nobunaga', 2], ['r_napoleon', 1],
      ['g_hideyoshi', 2], ['g_jeanne', 2], ['g_genghis', 1],
      ['h_honnoji', 2], ['m_fire', 3], ['m_rally', 1],
    ]),
  },
  wisdom: {
    name: '叡智の光（青×緑）',
    cards: repeat([
      ['k_blue', 8], ['k_green', 5], ['k_gold', 2],
      ['b_murasaki', 3], ['b_taishi', 3], ['b_edison', 3], ['b_galileo', 2], ['b_einstein', 1],
      ['g_himiko', 2], ['g_ieyasu', 2], ['g_hideyoshi', 2],
      ['h_library', 2], ['h_castle', 1], ['m_idea', 3], ['m_rally', 1],
    ]),
  },
};
