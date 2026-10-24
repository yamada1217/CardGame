import { CARDS, COLORS, DECKS, LEGACY_TEXT } from './cards.js';
import { createGame, applyAction, def, checkPlay, canAttackWith, canBlockWith, canBlockPair, canStand, power, levelSum, pressure, effectiveLevel, waitingFor, findOnBoard, stat } from './engine.js';
import { cpuAction, CPU_LEVELS } from './ai.js';
import { cardFace as viewCardFace, cardBack, esc } from './cardview.js';
import { zoomCard, closeZoom } from './zoom.js';
import { planFx, runFx, fxWait } from './fx.js';
import { rollDice } from './dice.js';
import { sfx, isMuted, setMuted, unlockAudio } from './sfx.js';
import { onlineAvailable, hostRoom, joinRoom, roomUrl, savedSession } from './online.js';
import { usableDecks, deckForMatch, sanitizeDeck, deckColors, expand } from './decks.js';
import { CPU_DECKS, resolveDeck } from './cpu-decks.js';
import { openDeckList } from './builder.js';
import { syncCode, startSync, joinSync } from './sync.js';
import { openGuide } from './guide.js';
import { myProfile, sendRequest, accept, decline, unfriend, invite, clearInvite, watchFriends, watchInvites, formatCode } from './friends.js';

const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');

// 自分と相手の席。オンラインのゲストは 1 番になる
let ME = 0, FOE = 1;
const CPU_DELAY = 650;

// UI の一時的な状態（ゲームの状態とは分ける）
const ui = {
  screen: 'title',
  myDeck: load('ijinden.deck') || 'R01', // 'R01' などのスターター、または自作の 'u:<id>'
  cpuLevel: load('ijinden.cpuLevel') || 'normal', // CPUの強さ：easy / normal / hard
  cpuFoe: load('ijinden.cpuFoe') || 'random', // CPUの相手：'random' か、デッキのキー
  game: null,
  mode: null,        // null | 'attack'
  picks: [],         // アタッカー選択
  blocks: {},        // { attackerUid: [blockerUid] }
  focusAtk: null,    // ブロック割り当て中のアタッカー
  pending: null,     // 対象を選ぶマホウ
  seen: new Set(),   // 登場アニメーション用
  logOpen: false,
  busy: false,
  name: load('ijinden.name') || '',
  online: null,      // オンライン対戦中の接続
  joinCode: new URLSearchParams(location.search).get('room'),
  waiting: null,     // { code } 相手待ち
  foeOnline: true,
};

function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function store(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できなくても続行 */ } }
const myName = () => (ui.name.trim() || 'プレイヤー').slice(0, 12);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toast(text) {
  $toast.textContent = text;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), 2200);
}

function vibrate(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* 非対応端末 */ }
}

// ---------- カードの描画 ----------

const cardFace = (inst, opts = {}) => viewCardFace(inst, { game: ui.game, p: ME, seen: ui.seen, ...opts });

function manaChip(m) {
  const g = ui.game;
  if (!m.faceUp && g && g.phase === 'block' && g.turn === FOE && canStand(g, ME, m)) {
    const on = Object.values(ui.blocks).some((l) => l.includes(m.uid));
    return `<button class="chip down stand${on ? ' on' : ''}" data-uid="${m.uid}" data-stand="${m.uid}" title="スタンド：${esc(def(m).name)}">立</button>`;
  }
  if (!m.faceUp) return `<span class="chip down" data-uid="${m.uid}" title="裏向き：レベル1">1</span>`;
  const d = def(m);
  return `<span class="chip c-${d.color || 'none'}" data-uid="${m.uid}" title="${esc(d.name)}">${d.level}</span>`;
}

// ---------- 画面 ----------

function render() {
  if (ui.screen === 'title') return renderTitle();
  if (ui.screen === 'waiting') return renderWaiting();
  if (ui.screen === 'builder') return;
  const fx = ui.fx || [];
  ui.fx = null;
  runFx($app, fx, renderGame, ME);
}

function renderTitle() {
  const canOnline = onlineAvailable();
  const join = ui.joinCode;
  $app.innerHTML = `
    <main class="title">
      <div class="title-glow"></div>
      <button class="icon-btn sound-btn" id="sound" aria-label="効果音">${isMuted() ? '🔇' : '🔊'}</button>
      <div class="logo">
        <div class="logo-crest">偉</div>
        <h1>イジンデン</h1>
        <p class="sub">ONLINE</p>
      </div>
      <section class="deck-pick">
        <h2>なまえ</h2>
        <input class="name-input" id="name" maxlength="12" placeholder="プレイヤー" value="${esc(ui.name)}" autocomplete="nickname">
      </section>
      ${join ? `<button class="invite" id="join"><span class="invite-label">招待されています</span><b>部屋 ${esc(join)} に参加する</b><span class="chev">›</span></button>` : ''}
      ${!join && ui.invite ? `<button class="invite" id="fjoin"><span class="invite-label">${esc(ui.invite.name)}さんから対戦の誘い</span><b>部屋 ${esc(ui.invite.room)} に参加する</b><span class="chev">›</span></button>` : ''}
      <nav class="modes">
        <button class="mode" id="start-cpu"><span class="mode-icon cpu">⚔</span><span class="mode-text"><b>CPU対戦</b><small>ひとりで練習</small></span><span class="chev">›</span></button>
        <button class="mode${canOnline ? '' : ' soon'}" id="start-online"><span class="mode-icon friend">⇄</span><span class="mode-text"><b>フレンド対戦</b><small>${canOnline ? 'リンクを送って1対1' : '準備中'}</small></span><span class="chev">›</span></button>
        <button class="mode" id="open-builder"><span class="mode-icon build">▤</span><span class="mode-text"><b>デッキ構築</b><small>自分だけのデッキを作る</small></span><span class="chev">›</span></button>
        <button class="mode${canOnline ? '' : ' soon'}" id="open-friends"><span class="mode-icon pal">☺</span><span class="mode-text"><b>フレンド登録</b><small>${canOnline ? 'コードで登録して対戦に誘う' : '準備中'}</small></span><span class="chev">›</span></button>
      </nav>
      <button class="guide-link" id="open-guide">📖 はじめての方へ：遊び方</button>
      <p class="fine">ルールは公式ルール・Q&amp;Aにもとづいています。</p>
    </main>`;
  const nameEl = document.getElementById('name');
  nameEl.oninput = () => { ui.name = nameEl.value; store('ijinden.name', ui.name); };
  document.getElementById('sound').onclick = (e) => { e.stopPropagation(); setMuted(!isMuted()); e.currentTarget.textContent = isMuted() ? '🔇' : '🔊'; sfx('tap'); };
  document.getElementById('open-guide').onclick = () => { store('ijinden.guided', '1'); openGuide(); };
  // 初めての人は、CPU対戦の前に一度だけ遊び方を見せる
  document.getElementById('start-cpu').onclick = () => (load('ijinden.guided') ? pickDeck('CPU対戦', pickLevel) : (store('ijinden.guided', '1'), openGuide(() => pickDeck('CPU対戦', pickLevel))));
  document.getElementById('start-online').onclick = () => (canOnline ? pickDeck('フレンド対戦', startHost) : toast('オンライン対戦はもうすぐ使えるようになります'));
  document.getElementById('open-builder').onclick = openBuilder;
  document.getElementById('open-friends').onclick = () => (canOnline ? openFriends() : toast('オンライン機能はもうすぐ使えるようになります'));
  const jb = document.getElementById('join');
  if (jb) jb.onclick = () => pickDeck(`部屋 ${join} に参加`, () => startJoin(join));
  const fj = document.getElementById('fjoin');
  if (fj) fj.onclick = () => {
    const inv = ui.invite;
    pickDeck(`${inv.name}さんの部屋に参加`, () => { ui.invite = null; clearInvite(inv.from); startJoin(inv.room); });
  };
}

// ---------- フレンド ----------

let friendsOff = null;
async function openFriends() {
  vibrate();
  const s = openSheet('<h3>フレンド登録</h3><div class="friends"><p class="fine">読み込み中…</p></div>', 'tall friends-sheet');
  const box = s.querySelector('.friends');
  let prof;
  try {
    prof = await myProfile(myName());
  } catch (e) {
    console.warn(e);
    box.innerHTML = '<p class="fine">フレンド機能につなげませんでした。通信状態を確認してください。<br><small>（サーバーの設定が終わっていない場合も、この表示になります）</small></p>';
    return;
  }
  store('ijinden.friendsOn', '1');
  startInviteWatch();
  box.innerHTML = `
    <section class="f-me">
      <p class="group-label">あなたのフレンドコード</p>
      <div class="f-code"><b>${formatCode(prof.code)}</b><button class="btn ghost small" data-f="copy">コピー</button></div>
      <p class="fine">コードはこの端末（ブラウザ）に結びついています。端末やブラウザを変えたり、データを消したりすると、別のコードになります。</p>
    </section>
    <section class="f-add">
      <p class="group-label">相手のコードで申請</p>
      <div class="search-row"><input class="name-input" id="f-code" maxlength="9" placeholder="例 ABCD-EFGH" autocomplete="off" autocapitalize="characters"><button class="btn primary small" data-f="send">申請</button></div>
    </section>
    <section class="f-req"></section>
    <section class="f-list"></section>`;
  box.querySelector('[data-f="copy"]').onclick = async () => {
    try { await navigator.clipboard.writeText(formatCode(prof.code)); toast('コピーしました'); } catch { toast(formatCode(prof.code)); }
  };
  const input = box.querySelector('#f-code');
  box.querySelector('[data-f="send"]').onclick = async () => {
    try {
      const r = await sendRequest(input.value, myName());
      input.value = '';
      toast(r === 'accepted' ? 'フレンドになりました' : '申請を送りました。相手が承認するとフレンドになります');
    } catch (e) { toast(e.message || '申請できませんでした'); }
  };
  friendsOff?.();
  friendsOff = watchFriends(({ friends, requests }) => {
    if (!s.isConnected) { friendsOff?.(); friendsOff = null; return; }
    s.querySelector('.f-req').innerHTML = requests.length ? `<p class="group-label">届いた申請</p>${requests.map((r) => `
      <div class="f-row"><span class="f-name">${esc(r.name)}<small>${formatCode(r.code)}</small></span>
        <button class="btn ghost small" data-no="${esc(r.uid)}">拒否</button><button class="btn primary small" data-yes="${esc(r.uid)}">承認</button></div>`).join('')}` : '';
    s.querySelector('.f-list').innerHTML = `<p class="group-label">フレンド ${friends.length}人</p>${friends.map((f) => `
      <div class="f-row"><i class="f-dot ${f.online ? 'on' : ''}" title="${f.online ? 'オンライン' : 'オフライン'}"></i><span class="f-name">${esc(f.name)}<small>${f.online ? 'オンライン' : 'オフライン'}</small></span>
        <button class="icon-btn f-del" data-del="${esc(f.uid)}" aria-label="フレンドから外す">×</button>
        <button class="btn primary small" data-inv="${esc(f.uid)}" ${f.online ? '' : 'disabled'}>対戦に誘う</button></div>`).join('') || '<p class="fine">まだフレンドがいません。コードを教え合って申請しましょう。</p>'}`;
    s.querySelectorAll('[data-yes]').forEach((b) => b.onclick = () => accept(b.dataset.yes).then(() => toast('フレンドになりました')).catch((e) => { console.warn('accept failed', e); toast('承認できませんでした'); }));
    s.querySelectorAll('[data-no]').forEach((b) => b.onclick = () => decline(b.dataset.no));
    s.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      const f = friends.find((x) => x.uid === b.dataset.del);
      if (await confirmSheet(`${f?.name || 'この人'}をフレンドから外しますか？`, '外す')) { await unfriend(b.dataset.del); openFriends(); }
    });
    s.querySelectorAll('[data-inv]').forEach((b) => b.onclick = () => {
      const f = friends.find((x) => x.uid === b.dataset.inv);
      friendsOff?.(); friendsOff = null;
      pickDeck(`${f.name}さんと対戦`, () => startHost((room) => invite(f.uid, room, myName()).then(() => toast(`${f.name}さんに誘いを送りました`)).catch(() => toast('誘いを送れませんでした'))));
    });
  });
}

// 対戦の誘いを見張る（フレンド機能を一度でも使った端末だけ）
let inviteOff = null;
function startInviteWatch() {
  if (inviteOff) return;
  inviteOff = watchInvites((inv) => {
    if (ui.invite?.from === inv.from && ui.invite.room === inv.room) return;
    ui.invite = inv;
    sfx('turn');
    if (ui.screen === 'title') { if ($sheet.querySelector('.friends-sheet')) closeSheet(); render(); toast(`${inv.name}さんから対戦の誘いが届きました`); } else toast(`${inv.name}さんから対戦の誘いが届きました（タイトル画面から参加できます）`);
  });
}

// 対戦の前に使うデッキを選ぶ
function pickDeck(title, onGo) {
  vibrate();
  const decks = usableDecks();
  if (!decks.some((d) => d.key === ui.myDeck && d.ok)) ui.myDeck = 'R01';
  const row = (d) => `
    <button class="deck ${ui.myDeck === d.key ? 'on' : ''}${d.ok ? '' : ' ng'}" data-deck="${esc(d.key)}" ${d.ok ? '' : 'disabled'}>
      <span class="deck-colors">${deckColors(d.cards).map((c) => `<i class="dot c-${c}"></i>`).join('') || '<i class="dot"></i>'}</span>
      <span class="deck-name">${esc(d.name)}${d.ok ? '' : `<small>${esc(d.why)}</small>`}</span>
      <span class="deck-count">${d.cards.length}枚</span>
    </button>`;
  const mine = decks.filter((d) => !d.starter), starters = decks.filter((d) => d.starter);
  const s = openSheet(`<h3>${esc(title)}：デッキを選ぶ</h3>
    <div class="deck-choices">
      ${mine.length ? `<p class="group-label">自作デッキ</p>${mine.map(row).join('')}` : ''}
      <p class="group-label">スターター</p>${starters.map(row).join('')}
      ${onlineAvailable() && !syncCode() ? '<p class="sub-note">ほかの端末で作ったデッキは、両方の「デッキ構築」で引き継ぎコードをつなぐと使えます。</p>' : ''}
    </div>
    <div class="sheet-actions row"><button class="btn ghost" data-go="build">デッキを作る</button><button class="btn primary" data-go="start">このデッキで対戦</button></div>`, 'tall');
  s.querySelectorAll('[data-deck]').forEach((b) => b.onclick = () => {
    ui.myDeck = b.dataset.deck;
    s.querySelectorAll('[data-deck]').forEach((x) => x.classList.toggle('on', x === b));
    vibrate();
  });
  s.querySelector('[data-go="build"]').onclick = () => { closeSheet(); openBuilder(); };
  s.querySelector('[data-go="start"]').onclick = () => { store('ijinden.deck', ui.myDeck); closeSheet(); onGo(); };
}

function openBuilder() {
  ui.screen = 'builder';
  openDeckList({ app: $app, toast, vibrate, openSheet, closeSheet, confirmSheet, exit: () => { ui.screen = 'title'; render(); } });
}

// 選んだデッキの中身（スターターはID、自作はカードIDの配列）。使えなければスターター
const myDeckForMatch = () => deckForMatch(ui.myDeck) || 'R01';

function resetBoardUi() {
  closeZoom();
  Object.assign(ui, { screen: 'game', mode: null, picks: [], blocks: {}, blocksPrev: {}, focusAtk: null, pending: null, seen: new Set(), logOpen: false, fx: null });
  closeSheet();
}

// CPUの強さを選ぶ
// 強さの差は考え方だけ（ルール上の有利・不利はない）
const LEVEL_NOTE = { easy: 'マリョクの置き方が雑で、出し忘れやブロックの見落としがある', normal: '決まった手順で堅実に戦う', hard: '相手の反撃まで先読みして手を選ぶ。手札も見ていない' };
function pickLevel() {
  vibrate();
  if (!CPU_LEVELS[ui.cpuLevel]) ui.cpuLevel = 'normal';
  const s = openSheet(`<h3>CPU対戦：強さを選ぶ</h3>
    <div class="levels">${Object.entries(CPU_LEVELS).map(([k, v], i) => `
      <button class="level lv-${k} ${ui.cpuLevel === k ? 'on' : ''}" data-level="${k}"><span class="stars">${'★'.repeat(i + 1)}${'☆'.repeat(2 - i)}</span><b>${v}</b><small>${LEVEL_NOTE[k]}</small></button>`).join('')}
    </div>
    <div class="sheet-actions row"><button class="btn ghost" data-go="back">戻る</button><button class="btn primary" data-go="next">次へ</button></div>`);
  s.querySelectorAll('[data-level]').forEach((b) => b.onclick = () => {
    ui.cpuLevel = b.dataset.level;
    s.querySelectorAll('[data-level]').forEach((x) => x.classList.toggle('on', x === b));
    vibrate();
  });
  s.querySelector('[data-go="back"]').onclick = () => pickDeck('CPU対戦', pickLevel);
  s.querySelector('[data-go="next"]').onclick = () => { store('ijinden.cpuLevel', ui.cpuLevel); pickFoe(); };
}

// CPUの相手を選ぶ。ランダムは強豪デッキ集から、カスタムはスターターと自作デッキから選ぶ
function pickFoe() {
  const decks = usableDecks().filter((d) => d.ok);
  if (!decks.some((d) => d.key === ui.cpuFoe)) ui.cpuFoe = 'random';
  const row = (d) => `
    <button class="deck ${ui.cpuFoe === d.key ? 'on' : ''}" data-foe="${esc(d.key)}">
      <span class="deck-colors">${deckColors(d.cards).map((c) => `<i class="dot c-${c}"></i>`).join('') || '<i class="dot"></i>'}</span>
      <span class="deck-name">${esc(d.name)}</span>
      <span class="deck-count">${d.cards.length}枚</span>
    </button>`;
  const mine = decks.filter((d) => !d.starter), starters = decks.filter((d) => d.starter);
  const s = openSheet(`<h3>CPU対戦（${CPU_LEVELS[ui.cpuLevel]}）：相手を選ぶ</h3>
    <div class="foe-modes">
      <button class="foe-mode" data-mode="random"><b>ランダム</b><small>大会優勝などの強豪デッキ${CPU_DECKS.length}種から</small></button>
      <button class="foe-mode" data-mode="custom"><b>カスタム</b><small>相手のデッキを選ぶ</small></button>
    </div>
    <div class="deck-choices foe-list">
      ${mine.length ? `<p class="group-label">自作デッキ</p>${mine.map(row).join('')}` : ''}
      <p class="group-label">スターター</p>${starters.map(row).join('')}
    </div>
    <div class="sheet-actions row"><button class="btn ghost" data-go="back">戻る</button><button class="btn primary" data-go="start">対戦開始</button></div>`, 'tall');
  const sync = () => {
    const custom = ui.cpuFoe !== 'random';
    s.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', (b.dataset.mode === 'custom') === custom));
    s.querySelector('.foe-list').classList.toggle('off', !custom);
    s.querySelectorAll('[data-foe]').forEach((x) => x.classList.toggle('on', x.dataset.foe === ui.cpuFoe));
  };
  s.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => {
    ui.cpuFoe = b.dataset.mode === 'random' ? 'random' : (ui.cpuFoe !== 'random' ? ui.cpuFoe : starters.find((d) => d.key !== ui.myDeck)?.key || 'R01');
    sync(); vibrate();
  });
  s.querySelectorAll('[data-foe]').forEach((b) => b.onclick = () => { ui.cpuFoe = b.dataset.foe; sync(); vibrate(); });
  s.querySelector('[data-go="back"]').onclick = () => pickDeck('CPU対戦', pickLevel);
  s.querySelector('[data-go="start"]').onclick = () => { store('ijinden.cpuFoe', ui.cpuFoe); closeSheet(); startCpuGame(); };
  sync();
}

// 相手のデッキと名前を決める。ランダムは毎回引き直す
function foeDeck() {
  if (ui.cpuFoe !== 'random') {
    const deck = deckForMatch(ui.cpuFoe);
    if (deck) return { deck, name: usableDecks().find((d) => d.key === ui.cpuFoe)?.name || 'CPU' };
  }
  const pool = CPU_DECKS.map((d) => ({ d, r: resolveDeck(d) })).filter((x) => !x.r.missing.length);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick ? { deck: expand(pick.r.cards), name: pick.d.name } : { deck: 'R01', name: DECKS.R01.name };
}

function startCpuGame() {
  leaveOnline();
  const foe = foeDeck();
  ME = 0; FOE = 1;
  resetBoardUi();
  ui.game = createGame({ names: [myName(), `CPU（${CPU_LEVELS[ui.cpuLevel] || 'ふつう'}）`], decks: [myDeckForMatch(), foe.deck] });
  render();
  toast(`相手のデッキ：${foe.name}`);
  cpuLoop();
}

// ---------- オンライン ----------

const onlineHandlers = {
  onWaiting(code) { ui.screen = 'waiting'; ui.waiting = { code }; render(); },
  onStart(start, me) {
    ME = me; FOE = 1 - me;
    resetBoardUi();
    ui.waiting = null;
    ui.game = createGame({ seed: start.seed, names: start.names, decks: start.decks.map(sanitizeDeck), first: start.first });
    ui.replaying = true;
    render();
    setTimeout(() => { ui.replaying = false; }, 0);
  },
  onAction(a) {
    const { p, ...action } = a;
    const before = ui.game;
    const r = applyAction(ui.game, p, action);
    if (!r.ok) return; // 両端末で同じように無視されるので、ずれない
    ui.game = r.state;
    if (!ui.replaying) { announce(before, r.state); ui.fx = planAll(before, r.state, p, action); }
    afterChange();
  },
  onPresence(on) {
    if (ui.foeOnline === on) return;
    ui.foeOnline = on;
    clearTimeout(ui.offlineTimer);
    if (ui.screen === 'game') { toast(on ? '相手が戻ってきました' : '相手の接続が切れました'); render(); }
    if (on) { if ($sheet.querySelector('.foe-gone')) closeSheet(); return; }
    // しばらく戻ってこなければ、待つかやめるかを選べるようにする
    ui.offlineTimer = setTimeout(() => {
      if (ui.foeOnline || ui.screen !== 'game' || ui.game?.phase === 'over' || !ui.online) return;
      const s = openSheet(`<div class="foe-gone"><h3>相手の接続が切れています</h3>
        <p class="sub-note">電波の状態などで切れているかもしれません。戻ってくれば、そのまま続きから遊べます。</p>
        <div class="sheet-actions"><button class="btn ghost" data-g="wait">もう少し待つ</button><button class="btn danger" data-g="quit">対戦をやめる</button></div></div>`);
      s.querySelector('[data-g="wait"]').onclick = closeSheet;
      s.querySelector('[data-g="quit"]').onclick = () => { closeSheet(); onAction('title'); };
    }, 45000);
  },
};

async function startHost(onRoom) {
  leaveOnline();
  ui.screen = 'waiting'; ui.waiting = { code: null }; render();
  try {
    ui.online = await hostRoom({ name: myName(), deck: myDeckForMatch() }, onlineHandlers);
    if (typeof onRoom === 'function') onRoom(ui.online.code);
  } catch (e) {
    console.warn(e);
    toast('部屋を作れませんでした。通信状態を確認して、もう一度お試しください');
    ui.screen = 'title'; render();
  }
}

async function startJoin(code) {
  leaveOnline();
  ui.screen = 'waiting'; ui.waiting = { code, joining: true }; render();
  try {
    ui.online = await joinRoom(code, { name: myName(), deck: myDeckForMatch() }, onlineHandlers);
  } catch (e) {
    toast(e.message);
    ui.joinCode = null;
    history.replaceState(null, '', roomUrl('').replace(/[?&]room=[^&]*/, '').replace(/\?$/, ''));
    ui.screen = 'title'; render();
  }
}

function leaveOnline() {
  if (ui.online) ui.online.leave();
  ui.online = null;
  ui.foeOnline = true;
}

function renderWaiting() {
  const code = ui.waiting?.code;
  const url = code ? roomUrl(code) : '';
  $app.innerHTML = `
    <main class="title waiting">
      <div class="title-glow"></div>
      <div class="logo"><div class="logo-crest small">偉</div></div>
      ${ui.waiting?.joining ? `<p class="wait-msg"><span class="spinner"></span>部屋に入っています…</p>` : code ? `
        <section class="room">
          <p class="room-label">部屋コード</p>
          <p class="room-code">${esc(code)}</p>
          <p class="room-help">このリンクを友達に送ってください。相手が開くと対戦が始まります。</p>
          <div class="room-url">${esc(url)}</div>
          <div class="title-actions">
            ${navigator.share ? '<button class="btn primary big" id="share">リンクを送る</button>' : ''}
            <button class="btn ${navigator.share ? 'ghost' : 'primary'} big" id="copy">リンクをコピー</button>
          </div>
        </section>
        <p class="wait-msg"><span class="spinner"></span>相手を待っています</p>` : `<p class="wait-msg"><span class="spinner"></span>部屋を作っています…</p>`}
      <button class="btn ghost" id="back">やめる</button>
    </main>`;
  document.getElementById('back').onclick = () => { leaveOnline(); ui.joinCode = null; ui.screen = 'title'; render(); };
  const copy = document.getElementById('copy');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('コピーしました'); } catch { toast(url); }
  };
  const share = document.getElementById('share');
  if (share) share.onclick = () => navigator.share({ title: 'イジンデンで対戦しよう', text: `部屋コード ${code}`, url }).catch(() => {});
}

function phaseText(g) {
  if (g.phase === 'over') return g.winner === ME ? '勝利' : '敗北';
  if (g.phase === 'mulligan') return '手札の確認';
  if (g.prompt) return g.prompt.p === ME ? '選択してください' : '相手が選択中…';
  if (g.phase === 'block') return g.turn === ME ? '相手がブロック中…' : 'ブロックを割り当てる';
  if (ui.mode === 'attack') return 'アタッカーを選ぶ';
  return g.turn === ME ? 'あなたのターン' : `${g.players[FOE].name}のターン`;
}

function renderGame() {
  const g = ui.game;
  const me = g.players[ME], cpu = g.players[FOE];
  const myTurn = g.turn === ME && g.phase === 'main';
  const atkSet = new Set(g.battle?.attackers || []);
  const assigned = new Map();
  Object.entries(ui.blocks).forEach(([a, list]) => list.forEach((b) => assigned.set(b, a)));
  const atkIndex = (uid) => [...atkSet].indexOf(uid) + 1;
  // ブロッカーの番号：何体目のブロッカーか（アタッカーが複数なら「アタッカー番号-何体目」）
  const blkLabel = (uid) => {
    const a = assigned.get(uid);
    const k = (ui.blocks[a] || []).indexOf(uid) + 1;
    return atkSet.size > 1 ? `${atkIndex(a)}-${k}` : `${k}`;
  };
  const blkCount = (c, p) => {
    const n = (ui.blocks[c.uid] || []).length, need = pressure(g, p, c);
    return n || need > 1 ? `<b class="badge cnt${n >= need ? ' ok' : ''}">🛡${n}${need > 1 ? `/${need}` : ''}</b>` : '';
  };
  const lastLogs = g.log.slice(-2).map((l) => `<div class="log-line ${l.p === FOE ? 'foe' : l.p === ME ? 'mine' : ''}">${esc(l.text)}</div>`).join('');

  const fieldCard = (c, p) => {
    const d = def(c);
    let extra = '';
    let badge = '';
    if (p === ME && ui.mode === 'attack' && canAttackWith(g, ME, c)) extra += ui.picks.includes(c.uid) ? ' picked' : ' can';
    if (p === FOE && atkSet.has(c.uid)) { extra += ' attacking'; badge = `<b class="badge atk">${atkIndex(c.uid)}</b>${g.phase === 'block' && g.turn === FOE ? blkCount(c, p) : ''}`; if (ui.focusAtk === c.uid) extra += ' focus'; }
    if (p === ME && atkSet.has(c.uid)) extra += ' attacking';
    if (p === ME && g.phase === 'block' && g.turn === FOE && blockableNow(g, c)) extra += ' can';
    if (assigned.has(c.uid)) { extra += ' blocking'; badge = `<b class="badge blk">${blkLabel(c.uid)}</b>`; }
    return `<div class="slot">${cardFace(c, { p, size: 's', role: atkSet.has(c.uid) ? 'atk' : null, extra })}${badge}</div>`;
  };
  const guardian = (c, p) => {
    let extra = c.tapped ? ' tapped' : '';
    let badge = '';
    // 円形闘技場などでイジンになっているガーディアン
    const gst = stat(g, c, { inst: c, p, zone: 'guardians' });
    if (gst.types.has('ijin')) { extra += ' as-ijin'; badge += `<b class="badge gpw">${power(g, p, c, atkSet.has(c.uid) ? 'atk' : null)}</b>`; }
    if (p === ME && ui.mode === 'attack' && canAttackWith(g, ME, c)) extra += ui.picks.includes(c.uid) ? ' picked' : ' can';
    if (atkSet.has(c.uid)) { extra += ' attacking'; if (p === FOE) { badge += `<b class="badge atk">${atkIndex(c.uid)}</b>${g.phase === 'block' && g.turn === FOE ? blkCount(c, p) : ''}`; if (ui.focusAtk === c.uid) extra += ' focus'; } }
    if (p === ME && g.phase === 'block' && g.turn === FOE && blockableNow(g, { ...c, guardian: true })) extra += ' can';
    if (assigned.has(c.uid)) { extra += ' blocking'; badge = `<b class="badge blk">${blkLabel(c.uid)}</b>`; }
    return `<div class="slot">${cardBack(c.uid, { size: 'g', extra: `guardian${extra}` })}${badge}</div>`;
  };

  const ijins = (pl) => pl.field.filter((c) => def(c).type === 'ijin');
  const haikeis = (pl) => pl.field.filter((c) => def(c).type === 'haikei');
  // 左にハイケイの束、中央にイジン、右に墓地
  const fieldWrap = (pl, p) => {
    const hk = haikeis(pl);
    const step = hk.length > 1 ? Math.min(16, 44 / (hk.length - 1)) : 0;
    const top = pl.grave[pl.grave.length - 1];
    return `<div class="field-wrap">
      <button class="hk-stack${hk.length ? '' : ' empty'}" data-stack="${p}" aria-label="ハイケイ">
        ${hk.map((c, i) => `<div class="slot" style="top:${Math.round(i * step)}px">${cardFace(c, { p, size: 's' })}</div>`).join('') || '<span>ハイケイ</span>'}
        ${hk.length ? `<b class="pile-count">${hk.length}</b>` : ''}
      </button>
      <div class="row field">${ijins(pl).map((c) => fieldCard(c, p)).join('')}</div>
      <button class="grave-pile${top ? '' : ' empty'}" data-grave="${p}" aria-label="墓地">
        ${top ? cardFace(top, { size: 's', extra: 'pile-top' }) : ''}<span class="pile-label">墓地 ${pl.grave.length}</span>
      </button>
    </div>`;
  };

  $app.innerHTML = `
    <main class="game ${g.turn === ME ? 'my-turn' : 'foe-turn'} mode-${ui.mode || 'none'} phase-${g.phase}">
      <header class="bar foe">
        <button class="icon-btn" id="menu" aria-label="メニュー">☰</button>
        <div class="who"><span class="avatar foe">${esc(cpu.name[0] || '?')}</span>${ui.online && !ui.foeOnline ? '<span class="offline">切断中</span>' : ''}<span>${esc(cpu.name)}</span></div>
        <div class="counts">
          <span title="山札">山 ${cpu.deck.length}</span><span title="手札">手 ${cpu.hand.length}</span><span title="墓地" data-grave="1">墓 ${cpu.grave.length}</span>
        </div>
      </header>

      <section class="side foe">
        <div class="mana-row">${cpu.mana.map(manaChip).join('')}<span class="lvsum">Lv ${levelSum(g, FOE)}</span></div>
        <div class="row guardians">${cpu.guardians.map((c) => guardian(c, FOE)).join('') || '<span class="empty">ガーディアンなし</span>'}</div>
        ${fieldWrap(cpu, FOE)}
      </section>

      <div class="center">
        <div class="phase-pill ${g.turn === ME ? 'mine' : 'foe'}">${phaseText(g)}</div>
        <button class="log-peek" id="log-open">${lastLogs}</button>
      </div>

      <section class="side mine">
        ${fieldWrap(me, ME)}
        <div class="row guardians">${me.guardians.map((c) => guardian(c, ME)).join('') || '<span class="empty">ガーディアンなし</span>'}</div>
        <div class="mana-row">${me.mana.map(manaChip).join('')}<span class="lvsum">Lv ${levelSum(g, ME)}</span>
          <span class="rights"><i class="${g.turn === ME && g.rights.mana ? 'on' : ''}">魔</i><i class="${g.turn === ME && g.rights.summon ? 'on' : ''}">召</i><i class="${g.turn === ME && !g.battleUsed ? 'on' : ''}">戦</i></span>
        </div>
      </section>

      <section class="hand ${myTurn && !ui.mode ? 'active' : ''}">
        ${me.hand.map((c) => {
          const d = def(c);
          const ok = myTurn && !ui.mode && (d.type === 'maryoku' ? g.rights.mana > 0 : checkPlay(g, ME, c.uid).ok);
          return cardFace(c, { size: 'm', extra: ok ? 'playable' : '' });
        }).join('')}
        <div class="hand-meta">山札 ${me.deck.length}・墓地 <button class="link" data-grave="0">${me.grave.length}</button></div>
      </section>

      <footer class="actions">${actionButtons(g)}</footer>
    </main>`;

  bindGame();
  fitBoard();
  if (g.phase === 'over') showGameOver();
  else if (!diceFirst(g)) syncDecisionSheet(g);
}

// 縦が足りずに盤面のカードが中央にはみ出すときは、段階的に詰める（描画のたびに実際の高さで判断）
function fitBoard() {
  const game = $app.querySelector('.game');
  if (!game) return;
  const sides = [...game.querySelectorAll('.side')];
  const over = () => sides.some((s) => s.scrollHeight > s.clientHeight + 1);
  for (const lv of ['', 'fit1', 'fit2']) {
    game.classList.remove('fit1', 'fit2');
    if (lv) game.classList.add(lv);
    if (!over()) break;
  }
}

// 手札を決める前に、サイコロで先攻を決める演出を一度だけ見せる（見ている間は手札のシートを出さない）
function diceFirst(g) {
  if (ui.diceBusy) return true;
  if (g.phase !== 'mulligan' || !g.dice || g.mulligan[ME] !== null || ui.diceSeen === g.seed) return false;
  ui.diceBusy = true;
  rollDice(g.dice, ME, () => { ui.diceBusy = false; ui.diceSeen = g.seed; if (ui.screen === 'game' && ui.game?.seed === g.seed) render(); });
  return true;
}

// 割り当て中のアタッカーに対してブロックできるか
function blockableNow(g, inst) {
  const atk = ui.focusAtk && g.players[FOE].field.find((c) => c.uid === ui.focusAtk);
  return atk ? canBlockPair(g, ME, inst, atk) : canBlockWith(inst);
}

function actionButtons(g) {
  if (g.phase === 'over') return `<button class="btn primary" data-act="again">もう一度</button><button class="btn ghost" data-act="title">タイトルへ</button>`;
  if (g.phase === 'mulligan') return g.mulligan[ME] === null ? `<button class="btn primary" data-act="decide">手札を確認する</button>` : `<div class="hint wait"><span class="spinner"></span>相手が手札を確認しています…</div>`;
  if (g.prompt) return g.prompt.p === ME ? `<button class="btn primary" data-act="decide">選択する</button>` : `<div class="hint wait"><span class="spinner"></span>相手が選んでいます…</div>`;
  if (g.phase === 'block' && g.turn === FOE) {
    const missing = g.battle.attackers.filter((a) => !(ui.blocks[a] || []).length).length;
    const fa = ui.focusAtk && findOnBoard(g, ui.focusAtk);
    const n = fa ? (ui.blocks[ui.focusAtk] || []).length : 0, need = fa ? pressure(g, FOE, fa.inst) : 1;
    const focusText = fa ? `${esc(def(fa.inst).name)}を<b>${n}体</b>でブロック中${need > 1 ? `（${need}体以上必要）` : ''}<br><small>光るカードをタップで追加・もう一度で解除</small>` : '';
    return `<div class="hint">${fa ? focusText : '相手のアタッカーをタップして選ぶ'}</div>
      <button class="btn danger" data-act="block">${missing ? `確定（未割当 ${missing}）` : 'ブロック確定'}</button>`;
  }
  if (g.phase === 'block') return `<div class="hint wait"><span class="spinner"></span>${ui.online ? '相手がブロックを選んでいます…' : 'CPUが考え中…'}</div>`;
  if (g.turn !== ME) return `<div class="hint wait"><span class="spinner"></span>${ui.online ? '相手の番です…' : 'CPUが考え中…'}</div>`;
  if (ui.mode === 'attack') return `<button class="btn ghost" data-act="cancel">やめる</button><button class="btn danger" data-act="attack" ${ui.picks.length ? '' : 'disabled'}>アタック（${ui.picks.length}体）</button>`;
  const canBattle = !g.battleUsed && [...g.players[ME].field, ...g.players[ME].guardians].some((c) => canAttackWith(g, ME, c));
  return `<button class="btn ghost" data-act="battle" ${canBattle ? '' : 'disabled'}>バトル</button><button class="btn primary" data-act="end">ターン終了</button>`;
}

function bindGame() {
  const g = ui.game;
  $app.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => onAction(b.dataset.act));
  document.getElementById('menu').onclick = showMenu;
  document.getElementById('log-open').onclick = showLog;
  $app.querySelectorAll('[data-grave]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); showGrave(Number(b.dataset.grave)); });

  $app.querySelectorAll('.hand .card').forEach((el) => el.onclick = () => {
    const c = g.players[ME].hand.find((x) => x.uid === el.dataset.uid);
    if (c) showHandCard(c);
  });
  $app.querySelectorAll('[data-stack]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); showHaikei(Number(b.dataset.stack)); });
  $app.querySelectorAll('.side .row .card').forEach((el) => el.onclick = () => { if (!ui.longPressed) onBoardTap(el); ui.longPressed = false; });
  // スタンド：魔力ゾーンの裏向きイジンをブロッカーにする
  $app.querySelectorAll('[data-stand]').forEach((el) => el.onclick = () => {
    const uid = el.dataset.stand;
    if (!ui.focusAtk) return toast('先に相手のアタッカーをタップ');
    if (!canBlockPair(g, ME, findOnBoard(g, uid).inst, findOnBoard(g, ui.focusAtk).inst)) return toast('このカードではブロックできません');
    const was = (ui.blocks[ui.focusAtk] || []).includes(uid);
    for (const k of Object.keys(ui.blocks)) ui.blocks[k] = ui.blocks[k].filter((u) => u !== uid);
    if (!was) ui.blocks[ui.focusAtk] = [...(ui.blocks[ui.focusAtk] || []), uid];
    vibrate(); render();
  });
  bindLongPress();
}

// アタック・ブロックの選択中でも、長押しでカードを拡大できる
function bindLongPress() {
  $app.querySelectorAll('.side .row .card[data-id]').forEach((el) => {
    let t = null;
    const start = () => {
      ui.longPressed = false;
      t = setTimeout(() => {
        const f = findOnBoard(ui.game, el.dataset.uid);
        if (!f) return;
        ui.longPressed = true;
        vibrate(20);
        showCardDetail(f.inst, f.p);
      }, 450);
    };
    const cancel = () => clearTimeout(t);
    el.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, cancel));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

function onBoardTap(el) {
  const g = ui.game, uid = el.dataset.uid;
  const mine = el.closest('.side').classList.contains('mine');
  const pl = g.players[mine ? ME : FOE];
  const inst = pl.field.find((c) => c.uid === uid);
  const guard = pl.guardians.find((c) => c.uid === uid);

  if (ui.mode === 'attack' && mine && (inst || guard) && canAttackWith(g, ME, inst || guard)) {
    ui.picks = ui.picks.includes(uid) ? ui.picks.filter((u) => u !== uid) : [...ui.picks, uid];
    vibrate();
    return render();
  }
  if (g.phase === 'block' && g.turn === FOE) {
    if (!mine && g.battle.attackers.includes(uid)) { ui.focusAtk = uid; vibrate(); return render(); }
    if (mine && ui.focusAtk && (guard || inst)) {
      const ok = blockableNow(g, guard ? { ...guard, guardian: true } : inst);
      if (!ok) return toast('このカードではこのアタッカーをブロックできません');
      for (const k of Object.keys(ui.blocks)) ui.blocks[k] = ui.blocks[k].filter((u) => u !== uid);
      const cur = ui.blocks[ui.focusAtk] || [];
      const wasHere = (ui.blocksPrev || {})[uid] === ui.focusAtk;
      ui.blocks[ui.focusAtk] = wasHere ? cur : [...cur, uid];
      ui.blocksPrev = {};
      Object.entries(ui.blocks).forEach(([a, l]) => l.forEach((b) => ui.blocksPrev[b] = a));
      vibrate();
      return render();
    }
    if (mine && !ui.focusAtk) return toast('先に相手のアタッカーをタップ');
  }
  if (inst) showCardDetail(inst, mine ? ME : FOE);
  else if (guard) toast('ガーディアン：裏向きのカード。パワー0の壁として1回ブロックできる');
}

async function onAction(a) {
  const g = ui.game;
  vibrate();
  if (a === 'battle') { ui.mode = 'attack'; ui.picks = []; return render(); }
  if (a === 'cancel') { ui.mode = null; ui.picks = []; return render(); }
  if (a === 'attack') { const picks = ui.picks; ui.mode = null; ui.picks = []; return act({ type: 'declareAttack', attackers: picks }); }
  if (a === 'end') return act({ type: 'endTurn' });
  if (a === 'decide') { ui.sheetKey = null; return syncDecisionSheet(g, true); }
  if (a === 'block') {
    const one = g.battle.attackers.find((x) => { const n = (ui.blocks[x] || []).length; const f = findOnBoard(g, x); return f && n > 0 && n < pressure(g, FOE, f.inst); });
    if (one) return toast(`このアタッカーは${pressure(g, FOE, findOnBoard(g, one).inst)}体以上でブロックしてください`);
    const missing = g.battle.attackers.filter((x) => !(ui.blocks[x] || []).length).length;
    if (missing && !(await confirmSheet('ブロックしていないアタッカーがいます。このままだと負けます。確定しますか？', '確定する'))) return;
    const blocks = ui.blocks;
    ui.blocks = {}; ui.blocksPrev = {}; ui.focusAtk = null;
    return act({ type: 'declareBlocks', blocks }, ME);
  }
  if (a === 'again') {
    if (!ui.online) return startCpuGame();
    ui.online.rematch();
    return toast('再戦を始めます');
  }
  if (a === 'title') { leaveOnline(); ui.joinCode = null; ui.screen = 'title'; closeSheet(); return render(); }
}

function act(action, p = ME) {
  const r = applyAction(ui.game, p, action);
  if (!r.ok) { toast(r.why); return render(); }
  // オンラインでは送るだけ。自分の行動も届いた順に反映する
  if (ui.online) { ui.online.send(action); return render(); }
  const before = ui.game;
  ui.game = r.state;
  announce(before, r.state);
  ui.fx = planAll(before, r.state, p, action);
  afterChange();
}

function afterChange() {
  const g = ui.game;
  if (g.phase === 'block' && g.turn === FOE && !ui.focusAtk) {
    ui.focusAtk = g.battle.attackers[0];
    if (!ui.replaying) vibrate(40);
  }
  if (g.phase !== 'block') { ui.focusAtk = null; ui.blocks = {}; ui.blocksPrev = {}; }
  render();
  if (!ui.online) cpuLoop();
}

// 盤面のエフェクトに加えて、ターン開始と決着の音を鳴らす
function planAll(before, after, p, action) {
  if (after.phase === 'over' && before.phase !== 'over') setTimeout(() => sfx(after.winner === ME ? 'win' : 'lose'), 500);
  else if (after.turn === ME && before.turn !== ME && after.phase === 'main') setTimeout(() => sfx('turn'), 250);
  return planFx(before, after, p, action);
}

// バトル結果などの大事なログをトーストで知らせる
function announce(before, after) {
  const fresh = after.log.slice(before.log.length - (before.log.length >= 200 ? 1 : 0));
  const key = fresh.reverse().find((l) => /破壊|通った|勝利|アタック/.test(l.text));
  // バトル演出の途中で結果を言わないよう、演出が終わってから出す
  if (key) setTimeout(() => fxWait().then(() => toast(key.text)), 0);
}

async function cpuLoop() {
  if (ui.busy || ui.online) return;
  ui.busy = true;
  try {
    while (ui.game.phase !== 'over' && ui.screen === 'game') {
      const w = waitingFor(ui.game);
      if (!(Array.isArray(w) ? w.includes(FOE) : w === FOE)) break;
      await sleep(CPU_DELAY);
      await fxWait();
      if (ui.screen !== 'game') break;
      const action = cpuAction(ui.game, FOE, ui.cpuLevel);
      if (!action) break;
      step(FOE, action);
    }
  } finally {
    ui.busy = false;
  }
  if (ui.game.phase === 'block' && ui.game.turn === FOE && !ui.focusAtk) afterChange();
}

function step(p, action) {
  const before = ui.game;
  const r = applyAction(ui.game, p, action);
  if (!r.ok) {
    // 万一CPUが不正な行動を返しても止まらないようにする
    const g = ui.game;
    const fb = g.prompt ? { type: 'choose', picks: g.prompt.options.slice(0, g.prompt.min) } : g.phase === 'block' ? { type: 'declareBlocks', blocks: {} } : { type: 'endTurn' };
    ui.game = applyAction(g, p, fb).state;
  } else ui.game = r.state;
  announce(before, ui.game);
  ui.fx = planAll(before, ui.game, p, action);
  if (ui.game.phase !== 'block') { ui.focusAtk = null; ui.blocks = {}; ui.blocksPrev = {}; }
  render();
}

// ---------- 引き直し・能力の選択 ----------

// 自分の判断が必要なときは、選択用のシートを出しておく
function syncDecisionSheet(g, force = false) {
  const mine = (g.phase === 'mulligan' && g.mulligan[ME] === null) || g.prompt?.p === ME;
  if (!mine) {
    if (ui.sheetKey) { ui.sheetKey = null; closeSheet(); }
    return;
  }
  const key = JSON.stringify([g.phase, g.prompt, g.turnNo, g.log.length]);
  if (!force && ui.sheetKey === key) return;
  if (!force && ui.sheetDismissed === key) return;
  ui.sheetKey = key;
  if (g.phase === 'mulligan') return showMulligan(g);
  showPrompt(g, key);
}

function showMulligan(g) {
  const hand = g.players[ME].hand;
  const s = openSheet(`<h3>最初の手札</h3>
    <p class="sub-note">${g.first === ME ? 'あなたが先攻です' : 'あなたは後攻です'}。1回だけ、6枚すべてを山札に戻して引き直せます。</p>
    <p class="zoom-hint">カードをタップすると効果を読めます</p>
    <div class="grid pick-grid">${hand.map((c) => cardFace(c, { size: 's' })).join('')}</div>
    <div class="sheet-actions row"><button class="btn ghost" data-m="1">引き直す</button><button class="btn primary" data-m="0">このまま始める</button></div>`, 'tall locked');
  s.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { ui.sheetKey = null; closeSheet(); act({ type: 'mulligan', redo: b.dataset.m === '1' }); });
  zoomOnTap(s, (uid) => hand.find((c) => c.uid === uid), ME);
}

// シートの中のカードをタップしたら拡大する
function zoomOnTap(container, find, p) {
  container.querySelectorAll('.card[data-uid]').forEach((el) => el.onclick = (e) => {
    const inst = find(el.dataset.uid);
    if (!inst) return;
    e.stopPropagation();
    zoomCard(inst, { game: ui.game, p });
  });
}

function optionCard(uid, pr = {}) {
  if (pr.labels?.[uid]) return `<button class="opt label" data-opt="${esc(uid)}"><span class="opt-text">${esc(pr.labels[uid])}</span></button>`;
  const f = findOnBoard(ui.game, uid);
  if (!f) return '';
  const where = { field: '戦場', guardians: 'ガーディアン', mana: '魔力ゾーン', hand: '手札', grave: '墓地', deck: '山札' }[f.zone];
  const side = f.p === ME ? '自分' : '相手';
  const hidden = !pr.reveal && (f.zone === 'guardians' || (f.zone === 'mana' && !f.inst.faceUp && f.p !== ME));
  const face = hidden ? cardBack(uid, { size: 's', label: where }) : cardFace(f.inst, { size: 's', p: f.p });
  return `<button class="opt" data-opt="${uid}">${face}<span class="opt-label">${side}の${where}</span></button>`;
}

function showPrompt(g, key) {
  const pr = g.prompt;
  const src = pr.src && findOnBoard(g, pr.src);
  const head = src ? `<div class="prompt-src">${cardFace({ ...src.inst, tapped: false }, { size: 's', p: src.p })}<p>${esc(pr.title)}</p></div>` : `<p>${esc(pr.title)}</p>`;
  if (pr.confirm) {
    const s = openSheet(`<h3>能力の発動</h3>${head}<div class="sheet-actions row"><button class="btn ghost" data-c="0">使わない</button><button class="btn primary" data-c="1">使う</button></div>`, 'locked');
    s.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { closeSheet(); act({ type: 'choose', picks: b.dataset.c === '1' ? ['yes'] : [] }); });
    return;
  }
  if (pr.info) {
    const s = openSheet(`<h3>カードを見る</h3>${head}<div class="grid pick-grid">${pr.options.map((u) => optionCard(u, pr)).join('')}</div><div class="sheet-actions row"><button class="btn primary" data-ok>確認</button></div>`, 'tall locked');
    s.querySelector('[data-ok]').onclick = () => { closeSheet(); act({ type: 'choose', picks: [] }); };
    return;
  }
  const picks = new Set();
  const s = openSheet(`<h3>${pr.min === 0 ? '能力の発動（任意）' : '選んでください'}</h3>${head}
    <p class="zoom-hint">カードをタップすると拡大して選べます</p>
    <div class="grid pick-grid">${pr.options.map((u) => optionCard(u, pr)).join('')}</div>
    <div class="sheet-actions row">
      ${pr.min === 0 ? '<button class="btn ghost" data-skip>使わない</button>' : ''}
      <button class="btn ghost" data-peek>盤面を見る</button>
      <button class="btn primary" data-ok disabled>決定</button>
    </div>`, 'tall locked');
  const ok = s.querySelector('[data-ok]');
  const refresh = () => {
    s.querySelectorAll('[data-opt]').forEach((b) => b.classList.toggle('on', picks.has(b.dataset.opt)));
    ok.disabled = picks.size < Math.max(1, pr.min) || picks.size > pr.max;
    ok.textContent = pr.max > 1 ? `決定（${picks.size}/${pr.max}）` : '決定';
  };
  const toggle = (u) => {
    if (picks.has(u)) picks.delete(u);
    else { if (pr.max === 1) picks.clear(); if (picks.size < pr.max) picks.add(u); }
    vibrate(); refresh();
  };
  // 表向きのカードは拡大して効果を読んでから選べる。裏向きはそのまま選ぶ
  s.querySelectorAll('[data-opt]').forEach((b) => b.onclick = () => {
    const u = b.dataset.opt;
    const f = findOnBoard(ui.game, u);
    if (!f || b.querySelector('.card.back') || pr.labels?.[u]) return toggle(u);
    zoomCard(f.inst, { game: ui.game, p: f.p, actions: [{ label: picks.has(u) ? '選択を外す' : 'これを選ぶ', primary: !picks.has(u), onClick: () => toggle(u) }] });
  });
  const srcEl = s.querySelector('.prompt-src .card');
  if (srcEl && src) srcEl.onclick = () => zoomCard(src.inst, { game: ui.game, p: src.p });
  ok.onclick = () => { closeSheet(); act({ type: 'choose', picks: [...picks] }); };
  const skip = s.querySelector('[data-skip]');
  if (skip) skip.onclick = () => { closeSheet(); act({ type: 'choose', picks: [] }); };
  s.querySelector('[data-peek]').onclick = () => { ui.sheetDismissed = key; ui.sheetKey = null; closeSheet(); };
}

// ---------- シート（下から出るパネル） ----------

function openSheet(html, cls = '') {
  $sheet.innerHTML = `<div class="scrim"></div><div class="sheet ${cls}"><div class="grabber"></div>${html}</div>`;
  void $sheet.offsetWidth; // 再計算させてから開くと、アニメーションが効く（rAFだと裏タブで止まる）
  $sheet.classList.add('open');
  if (!cls.includes('locked')) $sheet.querySelector('.scrim').onclick = closeSheet;
  return $sheet.querySelector('.sheet');
}

function closeSheet() {
  $sheet.classList.remove('open');
  setTimeout(() => { if (!$sheet.classList.contains('open')) $sheet.innerHTML = ''; }, 220);
}

function showHandCard(c) {
  const g = ui.game, d = def(c);
  const myMain = g.turn === ME && g.phase === 'main' && !ui.mode && !g.prompt && !g.queue.length;
  const chk = checkPlay(g, ME, c.uid);
  const verb = { ijin: '召喚する', haikei: '展開する', mahou: '発動する' }[d.type];
  const actions = [];
  if (d.type === 'maryoku') actions.push({ label: '表向きで配置', primary: true, disabled: !(myMain && g.rights.mana), onClick: () => act({ type: 'placeMana', uid: c.uid, faceUp: true }) });
  else actions.push({ label: verb, primary: true, disabled: !(myMain && chk.ok), onClick: () => act({ type: 'play', uid: c.uid }) });
  actions.push({ label: '裏向きでマリョクに', disabled: !(myMain && g.rights.mana), onClick: () => act({ type: 'placeMana', uid: c.uid, faceUp: false }) });
  const why = !myMain ? '自分のメインフェイズに使えます' : (d.type !== 'maryoku' && !chk.ok ? chk.why : '');
  zoomCard(c, { game: g, p: ME, note: [conditionText(d), why].filter(Boolean).join('\n'), actions });
}

function conditionText(d) {
  if (d.type === 'maryoku') return '';
  const parts = [];
  if (d.color) parts.push(`${COLORS[d.color].name}の表向きマリョクが1枚以上`);
  parts.push(`魔力ゾーンのレベル合計${effectiveLevel(ui.game, ME, d)}以上（裏向きも1ずつ数える）`);
  if (d.type === 'mahou') parts.push(`魔力ゾーンから${d.cost}枚を墓地へ`);
  return `使う条件：${parts.join('・')}`;
}

function conditions(d) {
  const rows = [];
  if (d.color && d.type !== 'maryoku') rows.push(`<span><i class="dot c-${d.color}"></i>${COLORS[d.color].name}の表向きマリョク1枚以上</span>`);
  if (d.type !== 'maryoku') rows.push(`<span>レベル ${ui.game ? effectiveLevel(ui.game, ME, d) : d.level} 以上</span>`);
  if (d.type === 'mahou') rows.push(`<span>魔力ゾーンから ${d.cost} 枚を墓地へ</span>`);
  return rows.length ? `<div class="conds">${rows.join('')}</div>` : '';
}

function showCardDetail(inst, p) {
  const d = def(inst);
  const note = d.type === 'ijin' ? `今のパワー ${power(ui.game, p, inst)}${inst.tapped ? '・寝ている' : ''}` : '';
  zoomCard(inst, { game: ui.game, p, note });
}

function showLog() {
  const g = ui.game;
  openSheet(`<h3>ログ</h3><div class="log-list">${g.log.slice().reverse().map((l) => `<div class="log-line ${l.p === FOE ? 'foe' : l.p === ME ? 'mine' : ''}">${esc(l.text)}</div>`).join('')}</div>`, 'tall');
}

// 墓地：新しい順に、種類ごとに絞り込める
function showGrave(p, tab = 'all') {
  const pl = ui.game.players[p];
  const list = [...pl.grave].reverse();
  const tabs = [['all', 'すべて'], ['ijin', 'イジン'], ['mahou', 'マホウ'], ['haikei', 'ハイケイ'], ['maryoku', 'マリョク']];
  const of = (t) => (t === 'all' ? list : list.filter((c) => def(c).type === t));
  const s = openSheet(`<h3>${esc(pl.name)}の墓地（${list.length}枚）</h3>
    <div class="seg">${tabs.map(([k, l]) => `<button class="seg-btn${k === tab ? ' on' : ''}" data-tab="${k}" ${of(k).length || k === 'all' ? '' : 'disabled'}>${l}<small>${of(k).length}</small></button>`).join('')}</div>
    <p class="zoom-hint">新しい順に並んでいます。タップで拡大</p>
    <div class="grid pile-grid">${of(tab).map((c) => cardFace(c, { size: 'm' })).join('') || '<p class="empty">まだありません</p>'}</div>`, 'tall');
  s.querySelectorAll('[data-tab]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); showGrave(p, b.dataset.tab); });
  zoomOnTap(s, (uid) => pl.grave.find((c) => c.uid === uid), p);
}

function showHaikei(p) {
  const pl = ui.game.players[p];
  const list = pl.field.filter((c) => def(c).type === 'haikei');
  const s = openSheet(`<h3>${esc(pl.name)}のハイケイ（${list.length}枚）</h3>
    <p class="zoom-hint">置いた順に並んでいます。タップで拡大</p>
    <div class="grid pile-grid">${list.map((c) => cardFace(c, { p, size: 'm' })).join('') || '<p class="empty">まだありません</p>'}</div>`, 'tall');
  zoomOnTap(s, (uid) => list.find((c) => c.uid === uid), p);
}

function showMenu() {
  const s = openSheet(`<h3>メニュー</h3><div class="menu">
    <button class="btn ghost" data-m="sound">効果音：${isMuted() ? 'オフ' : 'オン'}</button>
    <button class="btn ghost" data-m="guide">遊び方ガイド</button>
    <button class="btn ghost" data-m="rules">ルールのおさらい</button>
    <button class="btn ghost" data-m="resign">${ui.game?.phase === 'over' ? 'タイトルへ' : '降参する'}</button>
    <button class="btn ghost" data-m="close">閉じる</button></div>`);
  s.querySelector('[data-m="close"]').onclick = closeSheet;
  s.querySelector('[data-m="resign"]').onclick = async () => {
    closeSheet();
    if (ui.game && ui.game.phase !== 'over') {
      if (!(await confirmSheet('降参しますか？相手の勝ちになります。', '降参する'))) return;
      // 相手にも負けを知らせる（オンラインは送ってから抜ける）
      if (ui.online) { try { await ui.online.send({ type: 'resign' }); } catch { /* 送れなくても抜ける */ } }
      else { const before = ui.game; ui.game = applyAction(ui.game, ME, { type: 'resign' }).state; ui.fx = planAll(before, ui.game, ME, { type: 'resign' }); return afterChange(); }
    }
    leaveOnline(); ui.joinCode = null; ui.screen = 'title'; render();
  };
  s.querySelector('[data-m="rules"]').onclick = showRules;
  s.querySelector('[data-m="guide"]').onclick = () => { closeSheet(); openGuide(); };
  s.querySelector('[data-m="sound"]').onclick = (e) => { setMuted(!isMuted()); e.currentTarget.textContent = `効果音：${isMuted() ? 'オフ' : 'オン'}`; sfx('tap'); };
}

function showRules() {
  openSheet(`<h3>ルールのおさらい</h3><div class="rules">
    <p><b>勝ち方</b>：アタックして、相手がブロックできないアタッカーを通せば勝ち。山札切れでも負け。</p>
    <p><b>1ターンにできること</b>：マリョク配置1回・イジン召喚1回・バトル1回。ハイケイとマホウは条件を満たせば何枚でも。</p>
    <p><b>使う条件</b>：同じ色の表向きマリョクが魔力ゾーンに1枚以上あり、「表向きマリョクのレベル合計＋裏向きカードの枚数」がカードのレベル以上。色さえ1枚表向きなら、残りは裏向きでもレベルに数えます。</p>
    <p><b>ガーディアン</b>：最初に4枚伏せる壁。パワー0なので、ブロックすると1回で壊れる。</p>
    <p><b>バトル</b>：パワーが大きい方が勝ち、同じなら相打ち。複数でブロックするとパワーを合計できる。</p>
  </div>`, 'tall');
}

function confirmSheet(text, ok) {
  return new Promise((res) => {
    const s = openSheet(`<p class="confirm">${esc(text)}</p><div class="sheet-actions"><button class="btn ghost" data-c="0">戻る</button><button class="btn danger" data-c="1">${esc(ok)}</button></div>`);
    s.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { closeSheet(); res(b.dataset.c === '1'); });
  });
}

function showGameOver() {
  const g = ui.game;
  if ($sheet.querySelector('.result')) return;
  const win = g.winner === ME;
  const s = openSheet(`<div class="result ${win ? 'win' : 'lose'}">
      <div class="result-title">${win ? '勝利' : '敗北'}</div>
      <p>${esc(g.winReason)}</p>
      <div class="sheet-actions"><button class="btn ghost" data-r="title">タイトルへ</button><button class="btn primary" data-r="again">もう一度</button></div>
    </div>`);
  s.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { closeSheet(); onAction(b.dataset.r); });
}

// ---------- 起動 ----------

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// 自動テスト用の入口
window.__ijinden = { ui, act, render, seat: () => ({ ME, FOE }) };

// 画面のタップ音（ボタンとカード）
unlockAudio();
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, .card, .opt');
  if (!t || t.id === 'sound' || t.dataset.m === 'sound') return;
  sfx(t.classList.contains('card') || t.classList.contains('opt') ? 'card' : 'tap');
}, true);

// フレンド機能を使ったことがあれば、対戦の誘いを受け取れるようにしておく
if (load('ijinden.friendsOn') && onlineAvailable()) myProfile(myName()).then(startInviteWatch).catch(() => {});

// 引き継ぎコード：保存してあれば同期を始める。リンク（?sync=コード）で開いたらつなぐ
{
  const q = new URLSearchParams(location.search), code = q.get('sync');
  if (code && onlineAvailable()) {
    q.delete('sync');
    history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`);
    joinSync(code).then(() => toast('引き継ぎコードでつなぎました。自作デッキをそろえました')).catch((e) => toast(e?.message || '引き継ぎコードでつなげませんでした'));
  } else if (syncCode() && onlineAvailable()) startSync().catch(() => {});
}

// 対戦中に再読み込みしても、同じ部屋に戻る
try {
  const sess = savedSession();
  if (ui.joinCode && sess?.code === ui.joinCode) startJoin(ui.joinCode);
  else render();
} catch { render(); }
addEventListener('resize', fitBoard);
