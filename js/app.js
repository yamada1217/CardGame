import { CARDS, COLORS, DECKS, LEGACY_TEXT } from './cards.js';
import { createGame, applyAction, def, checkPlay, canAttackWith, canBlockWith, canBlockPair, power, levelSum, isDouble, effectiveLevel, waitingFor, findOnBoard } from './engine.js';
import { cpuAction } from './ai.js';
import { onlineAvailable, hostRoom, joinRoom, roomUrl, savedSession } from './online.js';

const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');

// 自分と相手の席。オンラインのゲストは 1 番になる
let ME = 0, FOE = 1;
const CPU_DELAY = 650;

// UI の一時的な状態（ゲームの状態とは分ける）
const ui = {
  screen: 'title',
  myDeck: 'R01',
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

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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

const TYPE_LABEL = { ijin: 'イジン', haikei: 'ハイケイ', mahou: 'マホウ', maryoku: 'マリョク' };

function kwBadges(d) {
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

function cardFace(inst, { size = 'm', p = ME, role = null, extra = '' } = {}) {
  const d = def(inst);
  const color = d.color || 'none';
  const pw = d.type === 'ijin' && ui.game ? power(ui.game, p, inst, role) : d.power;
  const boosted = d.type === 'ijin' && pw !== d.power;
  const enter = !ui.seen.has(inst.uid) ? ' enter' : '';
  ui.seen.add(inst.uid);
  const kws = kwBadges(d);
  return `
    <div class="card ${size} c-${color} t-${d.type}${inst.tapped ? ' tapped' : ''}${enter} ${extra}" data-uid="${inst.uid}">
      <div class="card-in">
        <div class="lv">${ui.game && d.type === 'haikei' ? effectiveLevel(ui.game, p, d) : d.level}</div>
        ${d.type === 'mahou' ? `<div class="cost" title="魔力コスト">${d.cost}</div>` : ''}
        <div class="emblem">${esc(d.type === 'maryoku' ? (COLORS[d.color]?.name || '魔') : d.name[0])}</div>
        <div class="name">${esc(d.name)}</div>
        ${size !== 's' ? `<div class="type">${TYPE_LABEL[d.type]}</div>` : ''}
        ${size === 'l' ? `<div class="text">${esc(d.text || '').replace(/\n/g, '<br>')}${d.legacy ? `<span class="legacy">遺業 ${esc(LEGACY_TEXT[d.legacy] || d.legacy)}</span>` : ''}</div>` : ''}
        ${size !== 's' && kws.length && size !== 'l' ? `<div class="kws">${kws.map((k) => `<span>${k}</span>`).join('')}</div>` : ''}
        ${d.type === 'ijin' ? `<div class="pw${boosted ? ' up' : ''}">${fmtPower(pw)}</div>` : ''}
      </div>
    </div>`;
}

// 6000 → 6k のように短く（大きいカードでは省略しない）
const fmtPower = (v) => String(v);

function cardBack(uid = '', { size = 'm', extra = '', label = '' } = {}) {
  return `<div class="card back ${size} ${extra}" data-uid="${uid}"><div class="card-in"><div class="crest">偉</div>${label ? `<div class="back-label">${label}</div>` : ''}</div></div>`;
}

function manaChip(m) {
  if (!m.faceUp) return `<span class="chip down" title="裏向き：レベル1">1</span>`;
  const d = def(m);
  return `<span class="chip c-${d.color || 'none'}" title="${esc(d.name)}">${d.level}</span>`;
}

// ---------- 画面 ----------

function render() {
  if (ui.screen === 'title') return renderTitle();
  if (ui.screen === 'waiting') return renderWaiting();
  renderGame();
}

function renderTitle() {
  const canOnline = onlineAvailable();
  const join = ui.joinCode;
  $app.innerHTML = `
    <main class="title">
      <div class="title-glow"></div>
      <div class="logo">
        <div class="logo-crest">偉</div>
        <h1>イジンデン</h1>
        <p class="sub">ONLINE</p>
      </div>
      <section class="deck-pick">
        <h2>なまえ</h2>
        <input class="name-input" id="name" maxlength="12" placeholder="プレイヤー" value="${esc(ui.name)}" autocomplete="nickname">
        <h2>デッキを選ぶ</h2>
        ${Object.entries(DECKS).map(([id, dk]) => `
          <button class="deck ${ui.myDeck === id ? 'on' : ''}" data-deck="${id}">
            <span class="deck-colors">${[...new Set(dk.cards.map((c) => CARDS[c].color).filter(Boolean))].map((c) => `<i class="dot c-${c}"></i>`).join('')}</span>
            <span class="deck-name">${esc(dk.name)}</span>
            <span class="deck-count">${dk.cards.length}枚</span>
          </button>`).join('')}
      </section>
      <div class="title-actions">
        ${join ? `<button class="btn primary big" id="join">部屋 ${esc(join)} に参加</button>` : ''}
        <button class="btn ${join ? 'ghost' : 'primary'} big" id="start-cpu">CPUと対戦</button>
        ${join ? '' : `<button class="btn ghost big" id="start-online" ${canOnline ? '' : 'aria-disabled="true"'}>友達と対戦${canOnline ? '' : '<small>準備中</small>'}</button>`}
      </div>
      <p class="fine">スターター3種の全カードを収録。ルールは公式ルール・Q&Aにもとづいています。</p>
    </main>`;
  const nameEl = document.getElementById('name');
  nameEl.oninput = () => { ui.name = nameEl.value; store('ijinden.name', ui.name); };
  $app.querySelectorAll('[data-deck]').forEach((b) => b.onclick = () => { ui.myDeck = b.dataset.deck; vibrate(); renderTitle(); });
  document.getElementById('start-cpu').onclick = startCpuGame;
  const on = document.getElementById('start-online');
  if (on) on.onclick = () => (canOnline ? startHost() : toast('オンライン対戦はもうすぐ使えるようになります'));
  const jb = document.getElementById('join');
  if (jb) jb.onclick = () => startJoin(join);
}

function resetBoardUi() {
  Object.assign(ui, { screen: 'game', mode: null, picks: [], blocks: {}, blocksPrev: {}, focusAtk: null, pending: null, seen: new Set(), logOpen: false });
  closeSheet();
}

function startCpuGame() {
  leaveOnline();
  const others = Object.keys(DECKS).filter((k) => k !== ui.myDeck);
  const other = others[Math.floor(Math.random() * others.length)];
  ME = 0; FOE = 1;
  resetBoardUi();
  ui.game = createGame({ names: [myName(), 'CPU'], decks: [ui.myDeck, other] });
  render();
  cpuLoop();
}

// ---------- オンライン ----------

const onlineHandlers = {
  onWaiting(code) { ui.screen = 'waiting'; ui.waiting = { code }; render(); },
  onStart(start, me) {
    ME = me; FOE = 1 - me;
    resetBoardUi();
    ui.waiting = null;
    ui.game = createGame({ seed: start.seed, names: start.names, decks: start.decks, first: start.first });
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
    if (!ui.replaying) announce(before, r.state);
    afterChange();
  },
  onPresence(on) {
    if (ui.foeOnline === on) return;
    ui.foeOnline = on;
    if (ui.screen === 'game') { toast(on ? '相手が戻ってきました' : '相手の接続が切れました'); render(); }
  },
};

async function startHost() {
  leaveOnline();
  ui.screen = 'waiting'; ui.waiting = { code: null }; render();
  try {
    ui.online = await hostRoom({ name: myName(), deck: ui.myDeck }, onlineHandlers);
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
    ui.online = await joinRoom(code, { name: myName(), deck: ui.myDeck }, onlineHandlers);
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
  const lastLogs = g.log.slice(-2).map((l) => `<div class="log-line ${l.p === FOE ? 'foe' : l.p === ME ? 'mine' : ''}">${esc(l.text)}</div>`).join('');

  const fieldCard = (c, p) => {
    const d = def(c);
    let extra = '';
    let badge = '';
    if (p === ME && ui.mode === 'attack' && canAttackWith(g, ME, c)) extra += ui.picks.includes(c.uid) ? ' picked' : ' can';
    if (p === FOE && atkSet.has(c.uid)) { extra += ' attacking'; badge = `<b class="badge atk">${atkIndex(c.uid)}</b>`; if (ui.focusAtk === c.uid) extra += ' focus'; }
    if (p === ME && atkSet.has(c.uid)) extra += ' attacking';
    if (p === ME && g.phase === 'block' && g.turn === FOE && blockableNow(g, c)) extra += ' can';
    if (assigned.has(c.uid)) { extra += ' blocking'; badge = `<b class="badge blk">${atkIndex(assigned.get(c.uid))}</b>`; }
    return `<div class="slot">${cardFace(c, { p, size: 's', role: atkSet.has(c.uid) ? 'atk' : null, extra })}${badge}</div>`;
  };
  const guardian = (c, p) => {
    let extra = c.tapped ? ' tapped' : '';
    let badge = '';
    if (p === ME && g.phase === 'block' && g.turn === FOE && blockableNow(g, { ...c, guardian: true })) extra += ' can';
    if (assigned.has(c.uid)) { extra += ' blocking'; badge = `<b class="badge blk">${atkIndex(assigned.get(c.uid))}</b>`; }
    return `<div class="slot">${cardBack(c.uid, { size: 'g', extra: `guardian${extra}` })}${badge}</div>`;
  };

  const ijins = (pl) => pl.field.filter((c) => def(c).type === 'ijin');
  const haikeis = (pl) => pl.field.filter((c) => def(c).type === 'haikei');

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
        <div class="mana-row">${cpu.mana.map(manaChip).join('')}<span class="lvsum">Lv ${levelSum(cpu)}</span></div>
        <div class="row guardians">${cpu.guardians.map((c) => guardian(c, FOE)).join('') || '<span class="empty">ガーディアンなし</span>'}</div>
        <div class="row field">${ijins(cpu).map((c) => fieldCard(c, FOE)).join('')}${haikeis(cpu).map((c) => fieldCard(c, FOE)).join('')}</div>
      </section>

      <div class="center">
        <div class="phase-pill ${g.turn === ME ? 'mine' : 'foe'}">${phaseText(g)}</div>
        <button class="log-peek" id="log-open">${lastLogs}</button>
      </div>

      <section class="side mine">
        <div class="row field">${ijins(me).map((c) => fieldCard(c, ME)).join('')}${haikeis(me).map((c) => fieldCard(c, ME)).join('')}</div>
        <div class="row guardians">${me.guardians.map((c) => guardian(c, ME)).join('') || '<span class="empty">ガーディアンなし</span>'}</div>
        <div class="mana-row">${me.mana.map(manaChip).join('')}<span class="lvsum">Lv ${levelSum(me)}</span>
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
  if (g.phase === 'over') showGameOver();
  else syncDecisionSheet(g);
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
    return `<div class="hint">${ui.focusAtk ? '光っている自分のカードをタップしてブロッカーにする' : '相手のアタッカーをタップして選ぶ'}</div>
      <button class="btn danger" data-act="block">${missing ? `確定（未割当 ${missing}）` : 'ブロック確定'}</button>`;
  }
  if (g.phase === 'block') return `<div class="hint wait"><span class="spinner"></span>${ui.online ? '相手がブロックを選んでいます…' : 'CPUが考え中…'}</div>`;
  if (g.turn !== ME) return `<div class="hint wait"><span class="spinner"></span>${ui.online ? '相手の番です…' : 'CPUが考え中…'}</div>`;
  if (ui.mode === 'attack') return `<button class="btn ghost" data-act="cancel">やめる</button><button class="btn danger" data-act="attack" ${ui.picks.length ? '' : 'disabled'}>アタック（${ui.picks.length}体）</button>`;
  const canBattle = !g.battleUsed && g.players[ME].field.some((c) => canAttackWith(g, ME, c));
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
  $app.querySelectorAll('.side .card').forEach((el) => el.onclick = () => onBoardTap(el));
}

function onBoardTap(el) {
  const g = ui.game, uid = el.dataset.uid;
  const mine = el.closest('.side').classList.contains('mine');
  const pl = g.players[mine ? ME : FOE];
  const inst = pl.field.find((c) => c.uid === uid);
  const guard = pl.guardians.find((c) => c.uid === uid);

  if (ui.mode === 'attack' && mine && inst && canAttackWith(g, ME, inst)) {
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
    const one = g.battle.attackers.find((x) => (ui.blocks[x] || []).length === 1 && isDouble(g, FOE, g.players[FOE].field.find((c) => c.uid === x)));
    if (one) return toast('ダブルプレッシャーは2体以上でブロックしてください');
    const missing = g.battle.attackers.filter((x) => !(ui.blocks[x] || []).length).length;
    if (missing && !(await confirmSheet('ブロックしていないアタッカーがいます。このままだと負けます。確定しますか？', '確定する'))) return;
    const blocks = ui.blocks;
    ui.blocks = {}; ui.blocksPrev = {}; ui.focusAtk = null;
    return act({ type: 'declareBlocks', blocks }, ME);
  }
  if (a === 'again') {
    if (!ui.online) return startCpuGame();
    ui.online.rematch();
    return toast('再戦を申し込みました');
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

// バトル結果などの大事なログをトーストで知らせる
function announce(before, after) {
  const fresh = after.log.slice(before.log.length - (before.log.length >= 200 ? 1 : 0));
  const key = fresh.reverse().find((l) => /破壊|通った|勝利|アタック/.test(l.text));
  if (key) toast(key.text);
}

async function cpuLoop() {
  if (ui.busy || ui.online) return;
  ui.busy = true;
  try {
    while (ui.game.phase !== 'over' && ui.screen === 'game') {
      const w = waitingFor(ui.game);
      if (!(Array.isArray(w) ? w.includes(FOE) : w === FOE)) break;
      await sleep(CPU_DELAY);
      if (ui.screen !== 'game') break;
      const action = cpuAction(ui.game, FOE);
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
    <div class="grid pick-grid">${hand.map((c) => cardFace(c, { size: 's' })).join('')}</div>
    <div class="sheet-actions row"><button class="btn ghost" data-m="1">引き直す</button><button class="btn primary" data-m="0">このまま始める</button></div>`, 'tall locked');
  s.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { ui.sheetKey = null; closeSheet(); act({ type: 'mulligan', redo: b.dataset.m === '1' }); });
}

function optionCard(uid) {
  const f = findOnBoard(ui.game, uid);
  if (!f) return '';
  const where = { field: '戦場', guardians: 'ガーディアン', mana: '魔力ゾーン', hand: '手札', grave: '墓地', deck: '山札' }[f.zone];
  const side = f.p === ME ? '自分' : '相手';
  const hidden = f.zone === 'guardians' || (f.zone === 'mana' && !f.inst.faceUp && f.p !== ME);
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
  const picks = new Set();
  const s = openSheet(`<h3>${pr.min === 0 ? '能力の発動（任意）' : '選んでください'}</h3>${head}
    <div class="grid pick-grid">${pr.options.map(optionCard).join('')}</div>
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
  s.querySelectorAll('[data-opt]').forEach((b) => b.onclick = () => {
    const u = b.dataset.opt;
    if (picks.has(u)) picks.delete(u);
    else { if (pr.max === 1) picks.clear(); if (picks.size < pr.max) picks.add(u); }
    vibrate(); refresh();
  });
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
  const myMain = g.turn === ME && g.phase === 'main' && !ui.mode;
  const chk = checkPlay(g, ME, c.uid);
  const verb = { ijin: '召喚する', haikei: '展開する', mahou: '発動する' }[d.type];
  const btns = [];
  if (d.type === 'maryoku') btns.push(`<button class="btn primary" data-do="up" ${myMain && g.rights.mana ? '' : 'disabled'}>表向きで配置</button>`);
  else btns.push(`<button class="btn primary" data-do="play" ${myMain && chk.ok ? '' : 'disabled'}>${verb}</button>`);
  btns.push(`<button class="btn ghost" data-do="down" ${myMain && g.rights.mana ? '' : 'disabled'}>裏向きでマリョクに</button>`);
  const why = !myMain ? '自分のメインフェイズに使えます' : (d.type !== 'maryoku' && !chk.ok ? chk.why : '');
  const sheet = openSheet(`
    <div class="detail">
      ${cardFace(c, { size: 'l' })}
      <div class="detail-info">
        ${conditions(d)}
        ${why ? `<p class="why">${esc(why)}</p>` : ''}
        <div class="sheet-actions">${btns.join('')}</div>
      </div>
    </div>`);
  sheet.querySelectorAll('[data-do]').forEach((b) => b.onclick = () => {
    closeSheet();
    const k = b.dataset.do;
    if (k === 'up' || k === 'down') return act({ type: 'placeMana', uid: c.uid, faceUp: k === 'up' });
    act({ type: 'play', uid: c.uid });
  });
}

function conditions(d) {
  const rows = [];
  if (d.color && d.type !== 'maryoku') rows.push(`<span><i class="dot c-${d.color}"></i>${COLORS[d.color].name}のマリョクが必要</span>`);
  if (d.type !== 'maryoku') rows.push(`<span>レベル ${ui.game ? effectiveLevel(ui.game, ME, d) : d.level} 以上</span>`);
  if (d.type === 'mahou') rows.push(`<span>魔力ゾーンから ${d.cost} 枚を墓地へ</span>`);
  return rows.length ? `<div class="conds">${rows.join('')}</div>` : '';
}

function showCardDetail(inst, p) {
  const d = def(inst);
  openSheet(`
    <div class="detail">
      ${cardFace(inst, { size: 'l', p })}
      <div class="detail-info">
        ${d.type === 'ijin' ? `<p class="stat">現在のパワー <b>${power(ui.game, p, inst)}</b>${inst.tapped ? '・寝ている' : ''}</p>` : ''}
        ${conditions(d)}
        <div class="sheet-actions"><button class="btn ghost" data-close>閉じる</button></div>
      </div>
    </div>`).querySelector('[data-close]').onclick = closeSheet;
}

function showLog() {
  const g = ui.game;
  openSheet(`<h3>ログ</h3><div class="log-list">${g.log.slice().reverse().map((l) => `<div class="log-line ${l.p === FOE ? 'foe' : l.p === ME ? 'mine' : ''}">${esc(l.text)}</div>`).join('')}</div>`, 'tall');
}

function showGrave(p) {
  const pl = ui.game.players[p];
  openSheet(`<h3>${esc(pl.name)}の墓地（${pl.grave.length}）</h3><div class="grid">${pl.grave.map((c) => cardFace(c, { size: 's' })).join('') || '<p class="empty">まだありません</p>'}</div>`, 'tall');
}

function showMenu() {
  const s = openSheet(`<h3>メニュー</h3><div class="menu">
    <button class="btn ghost" data-m="rules">ルールのおさらい</button>
    <button class="btn ghost" data-m="resign">降参してタイトルへ</button>
    <button class="btn ghost" data-m="close">閉じる</button></div>`);
  s.querySelector('[data-m="close"]').onclick = closeSheet;
  s.querySelector('[data-m="resign"]').onclick = () => { closeSheet(); leaveOnline(); ui.joinCode = null; ui.screen = 'title'; render(); };
  s.querySelector('[data-m="rules"]').onclick = showRules;
}

function showRules() {
  openSheet(`<h3>ルールのおさらい</h3><div class="rules">
    <p><b>勝ち方</b>：アタックして、相手がブロックできないアタッカーを通せば勝ち。山札切れでも負け。</p>
    <p><b>1ターンにできること</b>：マリョク配置1回・イジン召喚1回・バトル1回。ハイケイとマホウは条件を満たせば何枚でも。</p>
    <p><b>使う条件</b>：同じ色の表向きマリョクがあり、魔力ゾーンのレベル合計（裏向きは1）がカードのレベル以上。</p>
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
window.__ijinden = { ui, act, seat: () => ({ ME, FOE }) };

// 対戦中に再読み込みしても、同じ部屋に戻る
try {
  const sess = savedSession();
  if (ui.joinCode && sess?.code === ui.joinCode) startJoin(ui.joinCode);
  else render();
} catch { render(); }
