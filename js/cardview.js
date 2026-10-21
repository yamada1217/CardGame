// カードの描画（対戦画面・デッキ構築・拡大表示で共通）
import { COLORS, LEGACY_TEXT } from './cards.js';
import { def, power, effectiveLevel } from './engine.js';

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

export const legacyText = (d) => (d.legacy ? LEGACY_TEXT[d.legacy] || d.legacy : '');

// inst: { uid, id, tapped? }。game と p を渡すと、パワーやレベルを今の盤面で計算する
// seen を渡すと、初めて描くカードに登場アニメーションをつける
// card を渡すと CARDS にないカード（デッキ構築の一覧など）も描ける
export function cardFace(inst, { size = 'm', game = null, p = 0, role = null, extra = '', seen = null, card = null } = {}) {
  const d = card || def(inst);
  const color = d.color || 'none';
  const pw = d.type === 'ijin' && game && !card ? power(game, p, inst, role) : d.power;
  const boosted = d.type === 'ijin' && pw !== d.power;
  let enter = '';
  if (seen && inst.uid) {
    if (!seen.has(inst.uid)) enter = ' enter';
    seen.add(inst.uid);
  }
  const kws = kwBadges(d);
  const lv = game && !card && d.type === 'haikei' ? effectiveLevel(game, p, d) : d.level;
  const showText = size === 'l' || size === 'xl';
  return `
    <div class="card ${size} c-${color} t-${d.type}${inst.tapped ? ' tapped' : ''}${enter} ${extra}" data-uid="${inst.uid || ''}" data-id="${d.id}">
      <div class="card-in">
        <div class="lv">${lv}</div>
        ${d.type === 'mahou' ? `<div class="cost" title="魔力コスト">${d.cost}</div>` : ''}
        <div class="emblem">${esc(d.type === 'maryoku' ? (COLORS[d.color]?.name || '魔') : d.name[0])}</div>
        <div class="name">${esc(d.name)}</div>
        ${size !== 's' ? `<div class="type">${TYPE_LABEL[d.type]}</div>` : ''}
        ${showText ? `<div class="text">${esc(d.text || '').replace(/\n/g, '<br>')}${d.legacy ? `<span class="legacy">遺業 ${esc(legacyText(d))}</span>` : ''}</div>` : ''}
        ${!showText && size !== 's' && kws.length ? `<div class="kws">${kws.map((k) => `<span>${k}</span>`).join('')}</div>` : ''}
        ${d.type === 'ijin' ? `<div class="pw${boosted ? ' up' : ''}">${pw}</div>` : ''}
      </div>
    </div>`;
}

export function cardBack(uid = '', { size = 'm', extra = '', label = '' } = {}) {
  return `<div class="card back ${size} ${extra}" data-uid="${uid}"><div class="card-in"><div class="crest">偉</div>${label ? `<div class="back-label">${label}</div>` : ''}</div></div>`;
}
