// カードの拡大表示。どの画面からでも zoomCard(カード) で開ける。
// 背景か「閉じる」をタップすると閉じる。actions を渡すとボタンを並べる（押すと閉じてから実行）。
import { def } from './engine.js';
import { COLORS } from './cards.js';
import { cardFace, esc, TYPE_LABEL, legacyText, gains } from './cardview.js';

let root = null;

function ensureRoot() {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'zoom-root';
  document.body.appendChild(root);
  return root;
}

export function closeZoom() {
  if (!root) return;
  root.classList.remove('open');
  const r = root;
  setTimeout(() => { if (!r.classList.contains('open')) r.innerHTML = ''; }, 200);
}

export const isZoomOpen = () => !!root?.classList.contains('open');

// inst: { uid?, id, tapped? }。game と p を渡すと、今のパワーも表示する
// card にカードデータを渡すと、CARDS にないカードも表示できる
export function zoomCard(inst, { game = null, p = 0, note = '', actions = [], card = null } = {}) {
  const d = card || def(inst);
  const el = ensureRoot();
  const stats = [
    TYPE_LABEL[d.type],
    d.color ? `${COLORS[d.color]?.name || d.color}` : '色なし',
    `レベル ${d.level}`,
    d.type === 'ijin' ? `パワー ${d.power}` : '',
    d.type === 'mahou' ? `魔力コスト ${d.cost}` : '',
  ].filter(Boolean);
  el.innerHTML = `
    <div class="zoom-scrim"></div>
    <div class="zoom-body" role="dialog" aria-label="${esc(d.name)}">
      <div class="zoom-card">${cardFace({ ...inst, tapped: false }, { size: 'xl', game, p, card })}</div>
      <div class="zoom-info">
        <div class="zoom-scroll">
        <div class="zoom-name">${esc(d.name)}${d.rarity ? `<span class="zoom-rarity">${esc(d.rarity)}</span>` : ''}</div>
        <div class="zoom-stats">${stats.map((s) => `<span>${esc(s)}</span>`).join('')}${(d.traits || []).map((t) => `<span class="trait">${esc(t)}</span>`).join('')}</div>
        ${(() => { const g = game && !card ? gains(game, inst) : []; return g.length ? `<p class="zoom-gains"><b>ほかのカードから得ている</b>${g.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''; })()}
        ${d.text ? `<p class="zoom-text">${esc(d.text).replace(/\n/g, '<br>')}</p>` : ''}
        ${d.legacy ? `<p class="zoom-legacy"><b>遺業</b>${esc(legacyText(d))}</p>` : ''}
        ${note ? `<p class="zoom-note">${esc(note)}</p>` : ''}
        </div>
        <div class="zoom-actions">
          ${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : 'ghost'}" data-za="${i}" ${a.disabled ? 'disabled' : ''}>${esc(a.label)}</button>`).join('')}
          <button class="btn ghost" data-zclose>閉じる</button>
        </div>
      </div>
    </div>`;
  void el.offsetWidth;
  el.classList.add('open');
  el.querySelector('.zoom-scrim').onclick = closeZoom;
  el.querySelector('.zoom-card').onclick = closeZoom;
  el.querySelector('[data-zclose]').onclick = closeZoom;
  el.querySelectorAll('[data-za]').forEach((b) => b.onclick = () => { closeZoom(); actions[Number(b.dataset.za)].onClick(); });
}
