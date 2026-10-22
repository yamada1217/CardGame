// カードの描画（対戦画面・デッキ構築・拡大表示で共通）
import { artFor } from './art.js';
import { COLORS, LEGACY_TEXT } from './cards.js';
import { def, power, effectiveLevel, stat, findOnBoard } from './engine.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const TYPE_LABEL = { ijin: 'イジン', haikei: 'ハイケイ', mahou: 'マホウ', maryoku: 'マリョク' };

export function kwBadges(d) {
  const k = d.kw || {};
  const list = [];
  if (k.sokuo) list.push('即応');
  if (k.double) list.push('ダブル');
  if (k.voyage) list.push('航海');
  if (k.shippitsu) list.push('執筆');
  if (k.atk) list.push(`攻+${k.atk}`);
  if (k.cannotBlock) list.push('防×');
  return list;
}

const KW_LABEL = {
  sokuo: '即応', watcher: 'ウォッチャー', voyage: '航海', shippitsu: '執筆', kachidoki: '勝鬨', mortal: 'モータル', drain: 'ドレイン',
  attackTapped: '寝たままアタック', noDestroy: '破壊されない', noDestroyAbility: '能力で破壊されない', noBattleDestroy: 'バトルで破壊されない',
  noLeaveAbility: '能力で離れない', noBounce: '手札に戻らない', cannotBlock: 'ブロック不可', cannotAttack: 'アタック不可',
};
const PRESS = { 2: 'ダブル', 3: 'トリプル', 4: 'クアドラプル' };

// 戦場のカードが、ほかのカードの能力によって得ているもの（元のカードに書いていないもの）
export function gains(game, inst) {
  const f = game && inst?.uid && findOnBoard(game, inst.uid);
  if (!f || (f.zone !== 'field' && f.zone !== 'guardians')) return [];
  const d = def(inst), st = stat(game, inst, f), k = d.kw || {}, out = [];
  if (f.zone === 'guardians') { if (!st.types.has('ijin')) return []; out.push('イジン'); }
  if (st.lost) out.push('能力を失っている');
  const base = f.zone === 'guardians' ? {} : k;
  for (const [key, label] of Object.entries(KW_LABEL)) if (st.kw[key] && !base[key]) out.push(label);
  const bp = f.zone === 'guardians' ? 0 : (k.quad ? 4 : k.triple ? 3 : k.double ? 2 : 0);
  if (st.press > bp && PRESS[st.press]) out.push(PRESS[st.press]);
  const at = st.atk - (f.zone === 'guardians' ? 0 : k.atk || 0), bl = st.blk - (f.zone === 'guardians' ? 0 : k.blk || 0);
  if (at) out.push(`アタック${at > 0 ? '+' : ''}${at}`);
  if (bl) out.push(`ブロック${bl > 0 ? '+' : ''}${bl}`);
  const baseTraits = f.zone === 'guardians' ? [] : d.traits || [];
  for (const t of st.traits) if (!baseTraits.includes(t)) out.push(t);
  const baseColors = f.zone === 'guardians' ? [] : d.colors || [];
  const nc = [...st.colors].filter((c) => !baseColors.includes(c));
  if (nc.length) out.push(`色：${nc.map((c) => COLORS[c]?.name || c).join('')}`);
  if (st.unblock.length > (k.unblockIjin && f.zone !== 'guardians' ? 1 : 0)) out.push('ブロックされにくい');
  return out;
}

export const legacyText = (d) => (d.legacy ? LEGACY_TEXT[d.legacy] || d.legacy : '');

// inst: { uid, id, tapped? }。game と p を渡すと、パワーやレベルを今の盤面で計算する
// seen を渡すと、初めて描くカードに登場アニメーションをつける
// card を渡すと CARDS にないカード（デッキ構築の一覧など）も描ける
export function cardFace(inst, { size = 'm', game = null, p = 0, role = null, extra = '', seen = null, card = null } = {}) {
  const d = card || def(inst);
  const color = d.color || 'none';
  const multi = (d.colors?.length || 0) > 1;
  const pw = d.type === 'ijin' && game && !card ? power(game, p, inst, role) : d.power;
  const boosted = d.type === 'ijin' && pw !== d.power;
  let enter = '';
  if (seen && inst.uid) {
    if (!seen.has(inst.uid)) enter = ' enter';
    seen.add(inst.uid);
  }
  const kws = kwBadges(d);
  const gain = game && !card && inst.uid ? gains(game, inst) : [];
  const lv = game && !card && d.type === 'haikei' ? effectiveLevel(game, p, d) : d.level;
  const showText = size === 'l' || size === 'xl';
  return `
    <div class="card ${size} c-${color} r-${esc(d.rarity || 'N')} t-${d.type}${d.type !== 'maryoku' ? ' has-art' : ''}${multi ? ' multi' : ''}${inst.tapped ? ' tapped' : ''}${enter} ${extra}"${multi ? ` style="--c2:var(--${d.colors[1]})"` : ''} data-uid="${inst.uid || ''}" data-id="${d.id}">
      <div class="card-in">
        <div class="art" style='background-image:${artFor(d)}'></div>
        <div class="lv">${lv}</div>
        ${d.type === 'mahou' ? `<div class="cost" title="魔力コスト">${d.cost}</div>` : ''}
        <div class="emblem${multi && d.type === 'maryoku' ? ' duo' : ''}">${esc(d.type === 'maryoku' ? (multi ? d.colors.map((x) => COLORS[x]?.name || '').join('') : COLORS[d.color]?.name || '魔') : d.name[0])}</div>
        <div class="name">${esc(d.name)}</div>
        ${size !== 's' ? `<div class="type">${TYPE_LABEL[d.type]}</div>` : ''}
        ${showText ? `<div class="text">${esc(d.text || '').replace(/\n/g, '<br>')}${d.legacy ? `<span class="legacy">遺業 ${esc(legacyText(d))}</span>` : ''}</div>` : ''}
        ${!showText && size !== 's' && kws.length ? `<div class="kws">${kws.map((k) => `<span>${k}</span>`).join('')}</div>` : ''}
        ${gain.length && !showText ? `<div class="gains">${gain.slice(0, size === 's' ? 2 : 4).map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        ${d.type === 'ijin' ? `<div class="pw${boosted ? (pw < d.power ? ' down' : ' up') : ''}">${pw}</div>` : ''}
      </div>
    </div>`;
}

export function cardBack(uid = '', { size = 'm', extra = '', label = '' } = {}) {
  return `<div class="card back ${size} ${extra}" data-uid="${uid}"><div class="card-in"><div class="crest">偉</div>${label ? `<div class="back-label">${label}</div>` : ''}</div></div>`;
}
