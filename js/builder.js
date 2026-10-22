// デッキ構築（シャドウバースのデッキ編集を参考にした画面）
// 上にデッキの枚数とレベル分布、下にカード一覧。一覧のカードはタップで1枚追加、長押しで拡大表示。
// 「デッキ」タブでは入れたカードを確認して増減できる。編集内容は自動で保存する。
import { CARDS, COLORS, DECKS } from './cards.js';
import { listDecks, getDeck, saveDeck, deleteDeck, newDeck, starterCards, total, copyLimit, capFor, sameName, validate, playable, deckColors, MIN_CARDS, MAX_CARDS } from './decks.js';
import { zoomCard } from './zoom.js';

const TYPE_LABEL = { ijin: 'イジン', haikei: 'ハイケイ', mahou: 'マホウ', maryoku: 'マリョク' };
const TYPE_ORDER = ['ijin', 'haikei', 'mahou', 'maryoku'];
const COLOR_ORDER = ['red', 'blue', 'green', 'yellow', 'purple', null];
const LEVELS = ['1', '2', '3', '4', '5', '6', '7+'];
const LONG_PRESS = 420;

let ctx = null;        // app.js から受け取る道具（描画先・シート・トースト）
let catalog = null;    // 全576種
let deck = null;       // 編集中のデッキ
const f = { colors: new Set(), level: null, type: null, q: '', all: false, tab: 'list' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- カードの一覧データ ----------

const KW = { 即応: 'sokuo', ダブルプレッシャー: 'double', 航海: 'voyage', 執筆: 'shippitsu', ブロッカーになれない: 'cannotBlock' };

// cards.json のカードを、cards.js の CARDS と同じ形にする（拡大表示でそのまま使える）
function normalize(c) {
  if (CARDS[c.id]) return { ...CARDS[c.id], colors: c.colors, set: c.set };
  const kw = {};
  for (const k of c.keywords) {
    if (KW[k]) kw[KW[k]] = true;
    else if (/^アタック\+\d+$/.test(k)) kw.atk = Number(k.match(/\d+/)[0]);
  }
  return {
    id: c.id, name: c.name, type: c.type, color: c.colors[0] || null, colors: c.colors, level: c.level,
    ...(c.type === 'ijin' ? { power: c.power } : {}), ...(c.type === 'mahou' ? { cost: c.cost } : {}),
    traits: c.traits, legacy: c.legacy, kw, text: c.text, rarity: c.rarity, unlimited: !!c.anyNumCopies, set: c.set,
  };
}

async function loadCatalog() {
  if (catalog) return catalog;
  try {
    const res = await fetch('docs/ijinden/cards.json');
    const src = await res.json();
    catalog = src.cards.map(normalize);
  } catch {
    // 読み込めないときは、対戦で使えるカードだけで続ける
    catalog = Object.values(CARDS).map((c) => ({ ...c, colors: c.color ? [c.color] : [] }));
  }
  const rank = (c) => [COLOR_ORDER.indexOf(c.colors[0] ?? null), Math.min(c.level, 99), TYPE_ORDER.indexOf(c.type)];
  catalog.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return a.id.localeCompare(b.id, 'en', { numeric: true });
  });
  return catalog;
}

const byId = (id) => catalog?.find((c) => c.id === id) || CARDS[id];

function matches(c) {
  if (!f.all && !playable(c.id)) return false;
  if (f.colors.size && !(c.colors.length ? c.colors.some((x) => f.colors.has(x)) : f.colors.has('none'))) return false;
  if (f.type && c.type !== f.type) return false;
  if (f.level && (f.level === '7+' ? c.level < 7 : f.level === '1' ? c.level > 1 : c.level !== Number(f.level))) return false;
  if (f.q) {
    const q = f.q.trim();
    if (q && ![c.name, c.text, ...(c.traits || [])].some((s) => s && s.includes(q))) return false;
  }
  return true;
}

// ---------- 入口 ----------

// ctx: { app, toast, vibrate, openSheet, closeSheet, confirmSheet, exit }
export function openDeckList(context) {
  ctx = context;
  deck = null;
  renderList();
}

function renderList() {
  const decks = listDecks();
  ctx.app.innerHTML = `
    <main class="builder list-screen">
      <header class="b-bar">
        <button class="icon-btn" id="b-back" aria-label="もどる">‹</button>
        <h1>デッキ構築</h1>
        <span class="b-bar-space"></span>
      </header>
      <div class="b-scroll">
        <button class="new-deck" id="b-new"><span class="plus">＋</span>新しいデッキを作る</button>
        ${decks.length ? decks.map(deckRow).join('') : `<p class="b-empty">まだ自作デッキはありません。<br>スターターをもとにすると、すぐに作れます。</p>`}
        <p class="b-note">デッキは40枚以上。同じカードは4枚まで（ストーンは何枚でも）。<br>デッキはこの端末に保存されます。</p>
      </div>
    </main>`;
  document.getElementById('b-back').onclick = () => ctx.exit();
  document.getElementById('b-new').onclick = showNewDeck;
  ctx.app.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openEditor(b.dataset.open));
}

function deckRow(d) {
  const v = validate(d.cards);
  return `
    <button class="deck my-deck" data-open="${esc(d.id)}">
      <span class="deck-colors">${deckColors(d.cards).map((c) => `<i class="dot c-${c}"></i>`).join('') || '<i class="dot"></i>'}</span>
      <span class="deck-name">${esc(d.name)}</span>
      <span class="deck-state ${v.ok ? 'ok' : 'ng'}">${v.ok ? `${v.count}枚` : v.count < MIN_CARDS ? `${v.count}/${MIN_CARDS}` : '要修正'}</span>
      <span class="chev">›</span>
    </button>`;
}

function showNewDeck() {
  const s = ctx.openSheet(`<h3>新しいデッキ</h3>
    <p class="sub-note">スターターをもとにして、入れ替えながら作るのがおすすめです。</p>
    <div class="menu">
      ${Object.entries(DECKS).map(([id, d]) => `
        <button class="deck" data-from="${id}">
          <span class="deck-colors">${deckColors(d.cards).map((c) => `<i class="dot c-${c}"></i>`).join('')}</span>
          <span class="deck-name">${esc(d.name)}をもとに</span><span class="chev">›</span>
        </button>`).join('')}
      <button class="deck" data-from=""><span class="deck-colors"><i class="dot"></i></span><span class="deck-name">空のデッキから</span><span class="chev">›</span></button>
    </div>`);
  s.querySelectorAll('[data-from]').forEach((b) => b.onclick = () => {
    const from = b.dataset.from;
    const d = saveDeck(newDeck(from ? DECKS[from].name.replace(/デッキ$/, '') + 'カスタム' : '新しいデッキ', from ? starterCards(from) : {}));
    ctx.closeSheet();
    openEditor(d.id);
  });
}

// ---------- 編集画面 ----------

async function openEditor(id) {
  deck = getDeck(id);
  if (!deck) return renderList();
  ctx.app.innerHTML = `<main class="builder"><p class="b-loading"><span class="spinner"></span>カードを読み込んでいます…</p></main>`;
  await loadCatalog();
  if (!deck || deck.id !== id) return;
  renderEditor();
}

function persist() {
  deck = saveDeck(deck);
}

function renderEditor() {
  const listCount = catalog.filter(matches).length;
  ctx.app.innerHTML = `
    <main class="builder editor">
      <header class="b-bar">
        <button class="icon-btn" id="b-back" aria-label="デッキ一覧へ">‹</button>
        <button class="deck-title" id="b-rename"><span>${esc(deck.name)}</span><i>✎</i></button>
        <button class="icon-btn" id="b-menu" aria-label="メニュー">⋯</button>
      </header>
      <div class="b-body" id="b-body">
      <section class="summary" id="b-summary">${summaryHtml()}</section>
      <div class="b-sticky">
      <nav class="b-tabs">
        <button data-tab="list" class="${f.tab === 'list' ? 'on' : ''}">カード一覧</button>
        <button data-tab="deck" class="${f.tab === 'deck' ? 'on' : ''}">デッキ <b id="b-tabcount">${total(deck.cards)}</b></button>
      </nav>
      ${f.tab === 'list' ? `
        <div class="filters">
          <div class="chips">
            ${[...COLOR_ORDER.filter(Boolean), 'none'].map((c) => `<button class="chip-btn color ${f.colors.has(c) ? 'on' : ''}" data-color="${c}"><i class="dot c-${c}"></i>${c === 'none' ? '無色' : COLORS[c].name}</button>`).join('')}
          </div>
          <div class="chips">
            <button class="chip-btn ${f.level ? '' : 'on'}" data-level="">Lv すべて</button>
            ${LEVELS.map((l) => `<button class="chip-btn ${f.level === l ? 'on' : ''}" data-level="${l}">${l === '1' ? '〜1' : l}</button>`).join('')}
            <span class="chip-sep"></span>
            <button class="chip-btn ${f.type ? '' : 'on'}" data-type="">種類 すべて</button>
            ${TYPE_ORDER.map((t) => `<button class="chip-btn ${f.type === t ? 'on' : ''}" data-type="${t}">${TYPE_LABEL[t]}</button>`).join('')}
          </div>
          <div class="search-row">
            <input class="b-search" id="b-q" type="search" placeholder="名前・効果・特性で検索" value="${esc(f.q)}" enterkeyhint="search">
            <button class="chip-btn toggle ${f.all ? 'on' : ''}" id="b-all">${f.all ? '✓ ' : ''}準備中も表示</button>
          </div>
        </div>
        <p class="b-hint">タップでデッキに追加・長押しで詳細　<span>${listCount}種</span></p>
      </div>
        <div class="b-grid" id="b-grid"></div>
      ` : `
        <p class="b-hint">名前をタップで詳細・＋−で枚数を変更</p>
      </div>
        <div class="deck-list" id="b-decklist">${deckListHtml()}</div>
      `}
      </div>
    </main>`;
  const grid = document.getElementById('b-grid');
  if (grid) fillGrid(grid, catalog.filter(matches));
  bindEditor();
}

function summaryHtml() {
  const v = validate(deck.cards);
  const n = v.count;
  const byType = Object.fromEntries(TYPE_ORDER.map((t) => [t, 0]));
  const curve = LEVELS.map(() => ({ ijin: 0, haikei: 0, mahou: 0 }));
  for (const [id, k] of Object.entries(deck.cards)) {
    const c = byId(id);
    if (!c) continue;
    byType[c.type] += k;
    if (c.type === 'maryoku') continue;
    const i = c.level >= 7 ? 6 : Math.max(0, c.level - 1);
    curve[i][c.type] += k;
  }
  const peak = Math.max(4, ...curve.map((b) => b.ijin + b.haikei + b.mahou));
  return `
    <div class="count-box ${v.ok ? 'ok' : ''}">
      <div class="count"><b>${n}</b><span>/${MIN_CARDS}</span></div>
      <div class="count-state">${v.ok ? '対戦で使えます' : esc(v.errors[0])}</div>
    </div>
    <div class="curve" aria-label="レベル分布">
      ${curve.map((b, i) => {
        const sum = b.ijin + b.haikei + b.mahou;
        return `<div class="bar-col"><span class="bar-n">${sum || ''}</span><div class="lv-bar">${['mahou', 'haikei', 'ijin'].map((t) => b[t] ? `<i class="seg ${t}" style="height:${(b[t] / peak) * 100}%"></i>` : '').join('')}</div><span class="bar-lv">${LEVELS[i]}</span></div>`;
      }).join('')}
    </div>
    <div class="type-counts">
      ${TYPE_ORDER.map((t) => `<span class="tc ${t}"><i></i>${TYPE_LABEL[t]} <b>${byType[t]}</b></span>`).join('')}
    </div>`;
}

function tileHtml(c) {
  const n = deck.cards[c.id] || 0;
  const ok = playable(c.id);
  const lim = capFor(deck.cards, c);
  const col = c.colors[0] || c.color || 'none';
  return `
    <button class="tile c-${col} r-${esc(c.rarity || 'N')} t-${c.type}${ok ? '' : ' locked'}${n ? ' in' : ''}" data-id="${esc(c.id)}" ${c.colors.length > 1 ? `style="--c2: var(--${c.colors[1]})"` : ''}>
      <span class="t-lv">${c.level}</span>
      ${c.type === 'mahou' ? `<span class="t-cost">${c.cost ?? ''}</span>` : ''}
      <span class="t-emblem">${esc(c.type === 'maryoku' ? (COLORS[c.color]?.name || '魔') : c.name[0])}</span>
      <span class="t-name">${esc(c.name)}</span>
      <span class="t-type">${TYPE_LABEL[c.type]}</span>
      ${c.type === 'ijin' ? `<span class="t-pw">${c.power}</span>` : ''}
      ${ok ? `<span class="t-count" data-count>${n ? `${n}${lim === Infinity ? '' : `/${lim}`}` : ''}</span>` : '<span class="t-lock">準備中</span>'}
    </button>`;
}

function deckRows() {
  const rows = Object.entries(deck.cards).map(([id, k]) => ({ c: byId(id), k })).filter((r) => r.c);
  return rows.sort((a, b) => TYPE_ORDER.indexOf(a.c.type) - TYPE_ORDER.indexOf(b.c.type) || a.c.level - b.c.level || a.c.id.localeCompare(b.c.id, 'en', { numeric: true }));
}

function deckListHtml() {
  const rows = deckRows();
  if (!rows.length) return '<p class="b-empty">まだカードが入っていません。<br>「カード一覧」からタップして追加しましょう。</p>';
  let lastType = null;
  return rows.map(({ c, k }) => {
    const head = c.type !== lastType ? `<h4>${TYPE_LABEL[c.type]}</h4>` : '';
    lastType = c.type;
    const max = capFor(deck.cards, c);
    return `${head}
      <div class="d-row c-${c.color || 'none'}${playable(c.id) ? '' : ' locked'}">
        <span class="d-lv">${c.level}</span>
        <button class="d-name" data-zoom="${esc(c.id)}">${esc(c.name)}${playable(c.id) ? '' : '<small>準備中</small>'}</button>
        <button class="d-btn" data-dec="${esc(c.id)}" aria-label="1枚減らす">−</button>
        <span class="d-n">${k}</span>
        <button class="d-btn" data-inc="${esc(c.id)}" aria-label="1枚増やす" ${k >= max ? 'disabled' : ''}>＋</button>
      </div>`;
  }).join('');
}

function bindEditor() {
  const $ = (id) => document.getElementById(id);
  $('b-back').onclick = () => { deck = null; renderList(); };
  $('b-rename').onclick = rename;
  $('b-menu').onclick = showEditorMenu;
  ctx.app.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { f.tab = b.dataset.tab; rerenderList(); });

  if (f.tab === 'list') {
    ctx.app.querySelectorAll('[data-color]').forEach((b) => b.onclick = () => {
      const c = b.dataset.color;
      if (f.colors.has(c)) f.colors.delete(c); else f.colors.add(c);
      rerenderList();
    });
    ctx.app.querySelectorAll('[data-level]').forEach((b) => b.onclick = () => { f.level = b.dataset.level || null; rerenderList(); });
    ctx.app.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { f.type = b.dataset.type || null; rerenderList(); });
    $('b-all').onclick = () => { f.all = !f.all; rerenderList(); };
    const q = $('b-q');
    q.oninput = () => { f.q = q.value; clearTimeout(q.t); q.t = setTimeout(() => refreshGrid(), 180); };
    bindPress($('b-grid'), '.tile', (el) => add(el.dataset.id, el), (el) => showCard(el.dataset.id));
  } else {
    const list = $('b-decklist');
    list.onclick = (e) => {
      const z = e.target.closest('[data-zoom]'), inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
      if (z) showCard(z.dataset.zoom);
      else if (inc) add(inc.dataset.inc);
      else if (dec) remove(dec.dataset.dec);
    };
  }
}

// 絞り込みを変えたとき：スクロール位置を保ったまま描き直す
function rerenderList() {
  ctx.vibrate(8);
  const x = [...ctx.app.querySelectorAll('.filters .chips')].map((el) => el.scrollLeft);
  const body = document.getElementById('b-body');
  const sticky = ctx.app.querySelector('.b-sticky');
  // 絞り込み欄が上に貼り付いているときは、一覧の先頭が見える位置に戻す
  const top = Math.min(body.scrollTop, sticky.offsetTop);
  renderEditor();
  ctx.app.querySelectorAll('.filters .chips').forEach((el, i) => { el.scrollLeft = x[i] || 0; });
  document.getElementById('b-body').scrollTop = top;
}

// 一覧は画面に見えている所だけを描く（576枚を一度に描くと重い）
// 4行ずつの塊にして、見えた塊から描き、手が空いたときに残りを先回りして描いておく
const GAP = 8, PAD = 12, BLOCK = 4;
const vg = { list: [], cols: 1, rowH: 0, tileH: 0, blocks: new Map(), raf: 0 };
function fillGrid(grid, list) {
  vg.list = list; vg.blocks = new Map();
  if (!list.length) { grid.classList.remove('virtual'); grid.style.height = ''; grid.innerHTML = '<p class="b-empty">条件に合うカードがありません</p>'; return; }
  const w = grid.clientWidth - PAD * 2;
  vg.cols = Math.max(1, Math.floor((w + GAP) / (76 + GAP)));
  vg.tileH = ((w - GAP * (vg.cols - 1)) / vg.cols) * 7 / 5;
  vg.rowH = vg.tileH + GAP;
  grid.classList.add('virtual');
  grid.style.height = `${Math.ceil(list.length / vg.cols) * vg.rowH + 28}px`;
  grid.innerHTML = '';
  const body = document.getElementById('b-body');
  if (body) body.onscroll = () => { if (!vg.raf) vg.raf = requestAnimationFrame(() => { vg.raf = 0; drawBlocks(grid); }); };
  drawBlocks(grid);
}

// 画面の向きや幅が変わったら列数を計算し直す
window.addEventListener('resize', () => { clearTimeout(vg.rt); vg.rt = setTimeout(() => { if (document.getElementById('b-grid')?.classList.contains('virtual')) refreshGrid(); }, 200); });

function drawBlocks(grid) {
  const body = document.getElementById('b-body');
  if (!body || !grid.isConnected || !vg.list.length) return;
  const y = body.getBoundingClientRect().top - grid.getBoundingClientRect().top - 4;
  const per = BLOCK * vg.cols, span = BLOCK * vg.rowH;
  const last = Math.ceil(vg.list.length / per) - 1;
  const from = Math.max(0, Math.floor(y / span) - 1), to = Math.min(last, Math.floor((y + body.clientHeight) / span) + 1);
  for (let b = from; b <= to; b++) drawBlock(grid, b);
  clearTimeout(vg.idle);
  vg.idle = setTimeout(() => prefetch(grid, vg.list), 300);
}

function drawBlock(grid, b) {
  if (vg.blocks.has(b)) return;
  const per = BLOCK * vg.cols;
  const el = document.createElement('div');
  el.className = 'b-part';
  el.style.cssText = `top:${4 + b * BLOCK * vg.rowH}px;grid-template-columns:repeat(${vg.cols},1fr);grid-auto-rows:${vg.tileH}px`;
  el.innerHTML = vg.list.slice(b * per, (b + 1) * per).map(tileHtml).join('');
  grid.appendChild(el);
  vg.blocks.set(b, el);
}

// 描いていない塊を1つずつ、操作の合間に描いておく
function prefetch(grid, list) {
  if (list !== vg.list || !grid.isConnected) return;
  const last = Math.ceil(list.length / (BLOCK * vg.cols)) - 1;
  let b = 0;
  while (b <= last && vg.blocks.has(b)) b++;
  if (b > last) return;
  drawBlock(grid, b);
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 60));
  idle(() => prefetch(grid, list));
}

function refreshGrid() {
  const grid = document.getElementById('b-grid');
  if (!grid) return;
  const list = catalog.filter(matches);
  fillGrid(grid, list);
  const hint = ctx.app.querySelector('.b-hint span');
  if (hint) hint.textContent = `${list.length}種`;
}

// タップと長押しを見分ける（スクロールしたら何もしない）
function bindPress(root, sel, onTap, onLong) {
  let t = null, start = null, el = null, fired = false;
  const cancel = () => { clearTimeout(t); t = null; el?.classList.remove('pressing'); el = null; };
  root.addEventListener('pointerdown', (e) => {
    el = e.target.closest(sel);
    if (!el) return;
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    el.classList.add('pressing');
    const target = el;
    t = setTimeout(() => { fired = true; ctx.vibrate(20); cancel(); onLong(target); }, LONG_PRESS);
  });
  root.addEventListener('pointermove', (e) => {
    if (start && el && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  });
  root.addEventListener('pointerup', cancel);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.addEventListener('click', (e) => {
    const target = e.target.closest(sel);
    if (!target) return;
    if (fired) { fired = false; return; }
    onTap(target);
  });
}

// ---------- 増減 ----------

function add(id, tileEl) {
  const c = byId(id);
  if (!playable(id)) { ctx.toast('このカードは効果を準備中のため、まだデッキに入れられません'); return false; }
  const n = deck.cards[id] || 0;
  if (n >= capFor(deck.cards, c)) { ctx.toast(`同じ名前のカードは合わせて${copyLimit(c)}枚までです`); return false; }
  if (total(deck.cards) >= MAX_CARDS) { ctx.toast(`デッキは${MAX_CARDS}枚までです`); return false; }
  deck.cards[id] = n + 1;
  ctx.vibrate(10);
  persist();
  afterCountChange(id, tileEl);
  return true;
}

function remove(id) {
  const n = deck.cards[id] || 0;
  if (!n) return false;
  if (n === 1) delete deck.cards[id]; else deck.cards[id] = n - 1;
  ctx.vibrate(10);
  persist();
  afterCountChange(id);
  return true;
}

function afterCountChange(id, tileEl) {
  const sum = document.getElementById('b-summary');
  if (sum) sum.innerHTML = summaryHtml();
  const tc = document.getElementById('b-tabcount');
  if (tc) tc.textContent = total(deck.cards);
  const list = document.getElementById('b-decklist');
  if (list) list.innerHTML = deckListHtml();
  // 同じ名前のカード（色違いなど）は上限を分け合うので、まとめて表示を直す
  for (const sid of sameName(byId(id))) {
    const tile = sid === id && tileEl ? tileEl : ctx.app.querySelector(`.tile[data-id="${CSS.escape(sid)}"]`);
    if (!tile) continue;
    const c = byId(sid), n = deck.cards[sid] || 0, lim = capFor(deck.cards, c);
    const cnt = tile.querySelector('[data-count]');
    if (cnt) cnt.textContent = n ? `${n}${lim === Infinity ? '' : `/${lim}`}` : '';
    tile.classList.toggle('in', n > 0);
    if (sid === id) { tile.classList.remove('bump'); void tile.offsetWidth; tile.classList.add('bump'); }
  }
}

// ---------- 拡大表示・メニュー ----------

// 拡大表示中に左右へスワイプすると、いま見ている一覧の隣のカードに切り替わる
function showCard(id, from = 0) {
  const c = byId(id);
  if (!c) return;
  const n = () => deck.cards[id] || 0;
  const ok = playable(id);
  const actions = ok ? [
    { label: '1枚減らす', disabled: !n(), onClick: () => { remove(id); showCard(id); } },
    { label: `1枚追加（いま${n()}枚）`, primary: true, disabled: n() >= capFor(deck.cards, c), onClick: () => { add(id); showCard(id); } },
  ] : [];
  const ids = f.tab === 'list' ? catalog.filter(matches).map((x) => x.id) : deckRows().map((r) => r.c.id);
  const i = ids.indexOf(id);
  zoomCard({ uid: `b-${id}`, id }, { card: c, note: ok ? '' : 'このカードは効果を準備中のため、まだ対戦では使えません。', actions });
  const root = document.getElementById('zoom-root');
  const body = root?.querySelector('.zoom-body');
  if (!body || i < 0 || ids.length < 2) return;
  body.insertAdjacentHTML('afterbegin', `<div class="zoom-pager"><span>‹</span>${i + 1} / ${ids.length}<span>›</span></div>`);
  if (from) body.classList.add(from > 0 ? 'slide-next' : 'slide-prev');
  const go = (d) => {
    const j = i + d;
    if (j < 0 || j >= ids.length) { body.classList.remove('edge'); void body.offsetWidth; body.classList.add('edge'); return; }
    ctx.vibrate(8);
    showCard(ids[j], d);
  };
  let sx = null, sy = 0;
  // 背景をなぞっても切り替わるように、拡大表示全体で受ける（root は使い回されるので上書きで登録）
  root.ontouchstart = (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
  root.ontouchend = (e) => {
    if (sx === null || !root.querySelector('.zoom-pager')) return; // 対戦画面の拡大表示では何もしない
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.preventDefault(); go(dx < 0 ? 1 : -1); }
  };
  document.onkeydown = (e) => {
    if (!root.classList.contains('open') || !root.querySelector('.zoom-pager')) { document.onkeydown = null; return; }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
}

function rename() {
  const s = ctx.openSheet(`<h3>デッキの名前</h3>
    <input class="name-input" id="b-name" maxlength="20" value="${esc(deck.name)}" autocomplete="off">
    <div class="sheet-actions row"><button class="btn ghost" data-c="0">やめる</button><button class="btn primary" data-c="1">決定</button></div>`);
  const input = s.querySelector('#b-name');
  setTimeout(() => input.focus(), 250);
  const done = (save) => {
    if (save && input.value.trim()) { deck.name = input.value.trim().slice(0, 20); persist(); }
    ctx.closeSheet();
    renderEditor();
  };
  s.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => done(b.dataset.c === '1'));
  input.onkeydown = (e) => { if (e.key === 'Enter') done(true); };
}

function showEditorMenu() {
  const s = ctx.openSheet(`<h3>${esc(deck.name)}</h3><div class="menu">
    <button class="btn ghost" data-m="rename">名前を変える</button>
    <button class="btn ghost" data-m="copy">コピーを作る</button>
    <button class="btn ghost" data-m="clear">カードをすべて外す</button>
    <button class="btn ghost danger-text" data-m="delete">デッキを削除</button>
    <button class="btn ghost" data-m="close">閉じる</button></div>`);
  const on = (k, fn) => { s.querySelector(`[data-m="${k}"]`).onclick = fn; };
  on('close', ctx.closeSheet);
  on('rename', () => { ctx.closeSheet(); setTimeout(rename, 230); });
  on('copy', () => {
    const d = saveDeck(newDeck(`${deck.name}のコピー`.slice(0, 20), deck.cards));
    ctx.closeSheet(); ctx.toast('コピーを作りました'); openEditor(d.id);
  });
  on('clear', async () => {
    ctx.closeSheet();
    if (!(await ctx.confirmSheet('このデッキのカードをすべて外しますか？', 'すべて外す'))) return;
    deck.cards = {}; persist(); renderEditor();
  });
  on('delete', async () => {
    ctx.closeSheet();
    if (!(await ctx.confirmSheet(`「${deck.name}」を削除しますか？元に戻せません。`, '削除する'))) return;
    deleteDeck(deck.id); deck = null; ctx.toast('削除しました'); renderList();
  });
}

