// 第4弾ブースター
import {
  register, def, opp, pw, lv, D, ijins, haikeis, fieldCards, guardians, grave, hand, mana, ofType, hasCol, trait,
  choose, may, kill, toHand, toTop, toBottom, toMana, toGuard, toGraveBy, toField, drawN, discardN, once, log, addRight, flipManaCost,
  untap, tap, topToMana, topToGuardian, addTmp, grantTmp, tmpFlag, findOnBoard, list, stat, power, isIjin, mill, discard, shuffle,
  faceUpMaryoku, shippitsu, choice, enteredF, fieldColors, madou, pick, move, draw, removeAttacker, endGame, availableColors, E,
} from './lib.js';
import { pushAbort } from './starters.js';

const self = (s, it) => findOnBoard(s, it.src);
const mine = (src, t) => t.p === src.p && t.zone === 'field';
const ijinT = (t) => t.zone === 'field' && def(t.inst).type === 'ijin';
const anyIjin = (s, ev) => { const e = enteredF(s, ev); return e?.zone === 'field' && isIjin(s, e.inst, e) ? e : null; };
const downMana = (s, p, who = 'both') => mana(s, p, who, (f) => !f.inst.faceUp);
const fieldHas = (s, cols) => list(s, 0, 'both', 'field', (f) => def(f.inst).colors.some((c) => cols.includes(c))).length > 0;
const tapMine = (s, it) => {
  const a = choose(s, it, 't', '寝かせる自分のイジンかガーディアンを選ぶ', [...ijins(s, it.p, 'me', (f) => !f.inst.tapped), ...guardians(s, it.p, 'me', (f) => !f.inst.tapped)]);
  if (a?.length) tap(s, a[0]);
  return a;
};
const madouYes = (s, it, color, title) => (madou(s, it.p, color) ? may(s, it, 'md', title) : false);

// 遁甲式：相手のブロックステップ開始時に、魔力ゾーンの裏のこれを表にする
const tonko = (title, run) => ({ trig: [{ on: 'blockStart', theirs: true, zones: ['mana'], faceDown: true, opt: title, if: (s, f) => !f.inst.faceUp && s.players[f.p].guardians.length > 0, run: (s, it) => {
  const a = choose(s, it, 'g', '山札の上に戻す自分のガーディアンを選ぶ', guardians(s, it.p, 'me'));
  if (!a?.length) return;
  once(it, 'x', () => { const f = self(s, it); if (f) f.inst.faceUp = true; toTop(s, it, a[0]); });
  run(s, it);
} }] });
const circle = () => ({
  ruleZones: ['mana'],
  rules: { playLevel: (s, src, p, inst, d) => (p === src.p && d.type === 'ijin' ? -3 : 0) },
  trig: [{ on: 'enter', zones: ['mana'], if: (s, f, ev) => { const e = anyIjin(s, ev); return !!e && e.p === f.p && f.inst.faceUp; }, run: (s, it) => { const f = self(s, it); if (f) f.inst.faceUp = false; } }],
});
const coroll = (pred, title) => ({ trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp, run: (s, it) => {
  const a = choose(s, it, 't', `${title}を山札の下に戻す（このターンはバトルできなくなる・任意）`, ijins(s, it.p, 'both', (f) => pred(s, f)), 0);
  if (!a?.length) return;
  toBottom(s, it, a[0]); tmpFlag(s, 'noBattle', it.p);
} }] });
const solid = (color, title, run) => ({ mahou: { run: (s, it) => {
  once(it, 'd', () => drawN(s, it, 1));
  const ok = madouYes(s, it, color, title);
  if (ok) run(s, it);
} } });

register({
  '4-1': { self: (s, src) => (ijins(s, src.p).length ? { atk: 3000 } : null) },
  '4-2': {
    enter: (s, it) => { for (const f of mana(s, it.p, 'both', (x) => x.inst.faceUp && D(x).type === 'maryoku' && lv(x) >= 2)) f.inst.faceUp = false; },
    attack: (s, it) => { const a = choose(s, it, 't', '手札に戻す魔力ゾーンの裏のカードを選ぶ（任意）', downMana(s, it.p), 0); if (a?.length) toHand(s, it, a[0]); },
  },
  '4-3': {
    self: (s, src) => (ijins(s, src.p, 'me', (f) => f.inst.uid !== src.inst.uid && trait(s, f, '音楽')).length ? { kw: { noDestroy: true } } : null),
    trig: [{ on: 'tap', if: (s, f, ev) => ev.zone === 'guardians', run: (s, it) => {
      const n = guardians(s, it.p, 'both', (f) => f.inst.tapped).length;
      const a = choose(s, it, 't', `手札に戻すイジンを選ぶ（${n}体まで・任意）`, ijins(s, it.p, 'both'), 0, n);
      if (a) a.forEach((u) => toHand(s, it, u));
    } }],
  },
  '4-4': {
    enter: (s, it) => { for (const c of [...s.players[it.p].hand]) discard(s, c.uid, it.p); },
    trig: [
      { on: 'endStart', mine: true, run: (s, it) => { const a = choose(s, it, 't', '墓地のレベル5以下のイジンかレベル6以下のハイケイを戦場に置く（任意）', grave(s, it.p, 'me', (f) => (D(f).type === 'ijin' && lv(f) <= 5) || (D(f).type === 'haikei' && lv(f) <= 6)), 0); if (a?.length) toField(s, it, a[0]); } },
      { on: 'endStart', mine: true, run: (s, it) => { const a = choose(s, it, 't', '墓地のカードを裏向きで戦場に置く（任意）', grave(s, it.p), 0); if (a?.length) toGuard(s, it, a[0]); } },
    ],
  },
  '4-5': {
    rules: { enterTapped: (s, src, f, how) => f.p !== src.p && def(f.inst).type === 'ijin' && how.by != null },
    strip: (s, src, t) => t.p !== src.p && t.zone === 'field' && def(t.inst).type === 'ijin' && t.inst.tapped && def(t.inst).level <= 5,
  },
  '4-6': {
    enter: (s, it) => {
      const a = choice(s, it, 'c', '伊能忠敬：どちらかを選ぶ', { 'L:m': 'マリョク配置権+1', 'L:h': '墓地のハイケイすべてを手札に戻す' });
      if (!a) return;
      if (a[0] === 'L:m') addRight(s, it.p, 'mana'); else for (const f of grave(s, it.p, 'me', ofType('haikei'))) toHand(s, it, f.inst.uid);
    },
    rules: { ignoreColor: (s, src, p, inst, d) => p === src.p && d.type === 'haikei' },
  },
  '4-7': {
    aura: [{ to: (s, src, t) => (t.zone === 'mana' && t.p === src.p && def(t.inst).type === 'maryoku' ? { colors: ['red', 'blue'] } : null) }],
    destroyed: { if: (s, f) => s.players[f.p].deck.length >= 2, opt: '山札の上から2枚を墓地に置いて、破壊を取り消す？', run: (s, it) => { const m = self(s, it); if (!m?.inst.destroyed) return; mill(s, it.p, 2); m.inst.destroyed = false; } },
  },
  '4-8': {
    play: { level: (s, p, l) => l - grave(s, p, 'me', (f) => D(f).type === 'mahou' && D(f).kw.madou).length },
    enter: (s, it) => { for (const f of grave(s, it.p, 'me', (x) => D(x).type === 'mahou' && D(x).kw.madou)) toHand(s, it, f.inst.uid); },
  },
  '4-9': {
    enter: (s, it) => mill(s, opp(it.p), 5),
    self: (s) => (s.players[0].grave.length + s.players[1].grave.length >= 30 ? { kw: { sokuo: true, mortal: true } } : null),
  },
  '4-10': karl(), '4-81': karl(),
  '4-11': { play: { level: (s, p, l) => l - ijins(s, p, 'opp', (f) => !f.inst.tapped).length }, enter: (s, it) => addRight(s, it.p, 'summon') },
  '4-12': { trig: [{ on: 'enter', once: true, if: (s, f, ev) => { const e = anyIjin(s, ev); return !!e && !hasCol(s, e, 'red'); }, run: (s, it) => drawN(s, it, 1) }] },
  '4-13': { trig: [{ on: 'attackDeclared', if: (s, f, ev) => ev.p === f.p && ev.attackers.length === 1 && def(findOnBoard(s, ev.attackers[0])?.inst || { id: 'R-2' }).level >= 6, run: (s, it) => { for (const u of s.battle?.attackers || []) grantTmp(s, u, { unblock: [{ by: 'ijin' }] }); } }] },
  '4-14': {
    play: { level: (s, p, l) => (s.players[p].mana.some((m) => !m.faceUp) ? l : 3) },
    enter: (s, it) => { const a = choose(s, it, 't', '手札に戻す魔力ゾーンの裏のカードを選ぶ', downMana(s, it.p)); if (a?.length) toHand(s, it, a[0]); },
  },
  '4-15': { mainStart: (s, it) => {
    const a = choose(s, it, 't', '手札のレベル5以下の赤のイジンを戦場に置いて、これを手札に戻す（任意）', hand(s, it.p, 'me', (f) => D(f).type === 'ijin' && lv(f) <= 5 && D(f).colors.includes('red')), 0);
    if (!a?.length) return;
    toField(s, it, a[0]); toHand(s, it, it.src);
  } },
  '4-16': { enter: (s, it) => {
    const a = choose(s, it, 'a', 'パワー6000以下の相手のイジンを破壊する（任意）', ijins(s, it.p, 'opp', (f) => pw(s, f) <= 6000), 0);
    if (!a?.length) return;
    const b = choose(s, it, 'b', 'さらに破壊する相手の起きているイジンを選ぶ', ijins(s, it.p, 'opp', (f) => !f.inst.tapped && f.inst.uid !== a[0]));
    if (b) kill(s, it, [...a, ...b]);
  } },
  '4-17': { self: (s) => ({ kw: { ...(fieldHas(s, ['red', 'purple']) ? { sokuo: true } : {}), ...(fieldHas(s, ['green', 'yellow']) ? { watcher: true } : {}) } }) },
  '4-18': { enter: { if: (s, f) => [...list(s, f.p, 'me', 'field'), ...grave(s, f.p)].some((x) => D(x).traits.includes('思想')), run: (s, it) => {
    const a = choose(s, it, 't', '裏向きで戦場に置く手札を選ぶ（任意）', hand(s, it.p), 0);
    if (a?.length) toGuard(s, it, a[0]);
  } } },
  '4-19': { trig: [{ on: 'enter', if: (s, f, ev) => !!anyIjin(s, ev) && list(s, 0, 'both', 'equip').length > 0, run: (s, it) => {
    const a = choose(s, it, 't', '手札に戻す装備カードを選ぶ（1ドロー・任意）', list(s, it.p, 'both', 'equip'), 0);
    if (!a?.length) return;
    toHand(s, it, a[0]); drawN(s, it, 1);
  } }] },
  '4-20': { enter: tapMine, strip: (s, src, t) => t.zone === 'field' && def(t.inst).type === 'ijin' && def(t.inst).level <= 3 && def(t.inst).colors.includes('red') },
  '4-21': { enter: tapMine },
  '4-22': { enter: (s, it) => { const a = tapMine(s, it); if (a) once(it, 'd', () => drawN(s, it, 1)); } },
  '4-23': { attack: { voyage: true, run: (s, it) => {
    const n = fieldColors(s, it.p, 'opp').size;
    if (!n) return;
    drawN(s, it, n);
    for (const f of ijins(s, it.p, 'me')) untap(s, f.inst.uid);
  } } },
  '4-24': { trig: [{ on: 'enter', opt: 'これを寝かせて、寝ているイジンかガーディアンを墓地に置く？', if: (s, f, ev) => { const e = anyIjin(s, ev); return !!e && !f.inst.tapped && trait(s, e, '音楽'); }, run: (s, it) => {
    if (!once(it, 't0', () => tap(s, it.src))) return;
    const a = choose(s, it, 't', '墓地に置く寝ているイジンかガーディアンを選ぶ', [...ijins(s, it.p, 'both', (f) => f.inst.tapped), ...guardians(s, it.p, 'both', (f) => f.inst.tapped)]);
    if (a?.length) toGraveBy(s, it, a[0]);
  } }] },
  '4-25': { enter: (s, it) => {
    const cols = new Set();
    for (const f of haikeis(s, it.p, 'both')) stat(s, f.inst, f).colors.forEach((c) => cols.add(c));
    if (!cols.size) return;
    const a = choose(s, it, 't', `手札に戻す裏のカードを選ぶ（${cols.size}つまで）`, [...guardians(s, it.p, 'both'), ...downMana(s, it.p)], 0, cols.size);
    if (a) a.forEach((u) => toHand(s, it, u));
  } },
  '4-26': { trig: [{ on: 'tap', once: true, opt: 'ターンプレイヤーが1ドローする？', if: (s, f, ev) => { const t = findOnBoard(s, ev.uid); return t?.zone === 'field' && isIjin(s, t.inst, t); }, run: (s, it) => { draw(s, s.turn, 1, { zone: 'field' }); } }] },
  '4-27': { enter: { if: (s, f) => s.players[f.p].mana.some((m) => !m.faceUp), run: (s, it) => {
    const a = choose(s, it, 't', '裏のカード1つを手札に戻して、山札の上から1枚を魔力ゾーンに置く（任意）', downMana(s, it.p, 'me'), 0);
    if (!a?.length) return;
    toHand(s, it, a[0]); topToMana(s, it.p);
  } } },
  '4-28': { enter: (s, it) => {
    once(it, 'd', () => drawN(s, it, 2));
    const art = hand(s, it.p, 'me', (f) => D(f).traits.includes('美術'));
    const a = art.length ? choice(s, it, 'c', '墓地に置く手札を選ぶ', { 'L:2': '好きなカード2つ', 'L:1': '「美術」カード1つ' }) : ['L:2'];
    if (!a) return;
    if (a[0] === 'L:1') discardN(s, it, 'x', it.p, 1, it.p, (f) => D(f).traits.includes('美術'));
    else discardN(s, it, 'x', it.p, 2);
  } },
  '4-29': { enter: (s, it) => {
    const a = choose(s, it, 't', '墓地のマリョクでないカードを山札の下に戻して1ドロー（任意）', grave(s, it.p, 'both', (f) => D(f).type !== 'maryoku'), 0);
    if (!a?.length) return;
    toBottom(s, it, a[0]); drawN(s, it, 1);
  } },
  '4-30': { ruleZones: ['field', 'grave'], rules: { noDiscardTrig: () => true } },
  '4-31': { enter: (s, it) => {
    const a = choose(s, it, 't', '魔力ゾーンの裏のレベル4以下のハイケイを戦場に置く（任意）', mana(s, it.p, 'me', (f) => !f.inst.faceUp && D(f).type === 'haikei' && lv(f) <= 4), 0);
    if (!a?.length) return;
    once(it, 'x', () => toField(s, it, a[0]));
    const b = choose(s, it, 'b', '山札の下に戻す相手のイジンを選ぶ', ijins(s, it.p));
    if (!b) return;
    if (b[0]) toBottom(s, it, b[0]);
    addRight(s, it.p, 'summon');
  } },
  '4-32': { trig: [shippitsu((s, it) => drawN(s, it, 1), { if: (s, f, ev, e) => hasCol(s, e, 'yellow') })] },
  '4-33': {
    play: { level: (s, p, l) => l - grave(s, p, 'both', ofType('ijin')).length },
    trig: [shippitsu((s, it) => {
      const a = choose(s, it, 'a', '破壊するハイケイを選ぶ（任意）', haikeis(s, it.p, 'both'), 0);
      if (!a?.length) return;
      const b = choose(s, it, 'b', '破壊する相手のパワー5000以下のイジンを選ぶ', ijins(s, it.p, 'opp', (f) => pw(s, f) <= 5000));
      if (b) kill(s, it, [...a, ...b]);
    }, { once: true })],
  },
  '4-34': { trig: [{ on: 'destroyed', if: (s, f, ev) => ev.p === f.p && ev.uid !== f.inst.uid && ev.zone === 'field' && ev.types.includes('ijin'), run: (s, it) => grantTmp(s, it.src, { power: 1000 }) }] },
  '4-35': {
    enter: { if: (s, f) => !s.players[f.p].guardians.length, run: (s, it) => { const a = choose(s, it, 't', '破壊するレベル5以上のイジンを選ぶ（任意）', ijins(s, it.p, 'both', (f) => lv(f) >= 5), 0); if (a?.length) kill(s, it, a); } },
    attack: (s, it) => mill(s, opp(it.p), 2),
  },
  '4-36': {
    enter: (s, it) => { topToMana(s, it.p); drawN(s, it, 2); },
    trig: [{ on: 'toGrave', self: true, zones: ['grave'], if: (s, f, ev) => ev.from === 'field' && s.players[f.p].grave.length >= 5, run: (s, it) => endGame(s, opp(it.p), 'ジョバンニ＝ディ＝メディチの代償') }],
  },
  '4-37': { enter: { if: (s, f, ev) => ev.from === 'grave', run: (s, it) => topToGuardian(s, it.p, 1) } },
  '4-38': { endStart: (s, it) => {
    const names = revealedNames(s, opp(it.p));
    if (!names.length || !s.players[opp(it.p)].deck.length) return;
    const lab = Object.fromEntries(names.map((n, i) => [`L:${i}`, n]));
    const a = pick(s, it, 'n', { title: 'カード名を宣言する（任意）', options: Object.keys(lab), labels: lab, min: 0, max: 1 });
    if (!a?.length) return;
    const top = s.players[opp(it.p)].deck[0];
    log(s, `「${lab[a[0]]}」を宣言 → めくったのは「${def(top).name}」`, it.p);
    if (def(top).name !== lab[a[0]]) return;
    for (const f of [...ijins(s, it.p, 'both'), ...haikeis(s, it.p, 'both')]) move(s, f.inst.uid, 'deckTop', { by: it.p });
    shuffle(s, s.players[0].deck); shuffle(s, s.players[1].deck);
    mill(s, opp(it.p), 5);
  } },
  '4-39': { enter: (s, it) => {
    const a = choice(s, it, 'c', 'レントゲン：どちらかを選ぶ', { 'L:k': '寝ているイジン1体を破壊', 'L:me': '自分の山札をイジンが出るまでめくって墓地へ', 'L:op': '相手の山札をイジンが出るまでめくって墓地へ' });
    if (!a) return;
    if (a[0] === 'L:k') { const b = choose(s, it, 't', '破壊する寝ているイジンを選ぶ（任意）', ijins(s, it.p, 'both', (f) => f.inst.tapped), 0); if (b?.length) kill(s, it, b); return; }
    const q = a[0] === 'L:me' ? it.p : opp(it.p);
    once(it, 'm', () => { const pl = s.players[q]; let n = 0; while (pl.deck.length) { const c = pl.deck[0]; n++; if (def(c).type === 'ijin') break; } mill(s, q, n); });
  } },
  '4-40': { attack: { voyage: true, run: (s, it) => {
    const mortal = ijins(s, it.p, 'me', (f) => stat(s, f.inst, f).kw.mortal).length > 0;
    if (mortal) { const a = choose(s, it, 't', '破壊する相手のイジンかガーディアンを選ぶ', [...ijins(s, it.p), ...guardians(s, it.p)]); if (a?.length) kill(s, it, a); return; }
    const a = choose(s, it, 't', '手札に戻す自分のイジンかガーディアンを選ぶ', [...ijins(s, it.p, 'me'), ...guardians(s, it.p, 'me')]);
    if (a?.length) toHand(s, it, a[0]);
  } } },
  '4-41': { trig: [{ on: 'enter', opt: 'そのイジンを破壊して、これを墓地に置く？', if: (s, f, ev) => { const e = anyIjin(s, ev); return !!e && lv(e) <= 2 && !hasCol(s, e, 'red'); }, run: (s, it) => { kill(s, it, it.ev.uid); toGraveBy(s, it, it.src); } }] },
  '4-42': {
    enter: { if: (s) => downMana(s, 0).length >= 2, run: (s, it) => drawN(s, it, 1) },
    trig: [{ on: 'endStart', run: (s, it) => {
      if (!downMana(s, it.p).length) return void kill(s, it, it.src);
      const a = choose(s, it, 't', '手札に戻す魔力ゾーンの裏のカードを選ぶ', downMana(s, it.p));
      if (a?.length) toHand(s, it, a[0]);
    } }],
  },
  '4-43': { aura: [{ to: (s, src, t) => {
    if (!ijinT(t)) return null;
    if (t.p === src.p && def(t.inst).colors.includes('blue')) return { unblock: [{ by: 'ijin', color: 'red' }] };
    if (t.p !== src.p && def(t.inst).level <= 2) return { colors: ['red'] };
    return null;
  } }] },
  '4-44': {
    enter: { opt: '山札の上から3枚を墓地に置いて、墓地のカード1つを山札の上に戻す？', run: (s, it) => {
      once(it, 'm', () => mill(s, it.p, 3));
      const a = choose(s, it, 't', '山札の上に戻す墓地のカードを選ぶ', grave(s, it.p));
      if (a?.length) toTop(s, it, a[0]);
    } },
    mainStart: { opt: '山札の上から1枚を墓地に置いて、墓地のカード1つを手札に戻す？', run: (s, it) => {
      once(it, 'm', () => mill(s, it.p, 1));
      const a = choose(s, it, 't', '手札に戻す墓地のカードを選ぶ', grave(s, it.p));
      if (a?.length) toHand(s, it, a[0]);
    } },
  },
  '4-45': { rules: { playLevel: (s, src, p, inst, d) => (p === src.p && d.type === 'ijin' ? -fieldColors(s, src.p, 'opp').size : 0) } },
  '4-46': {
    play: { level: (s, p, l) => l - haikeis(s, p, 'both').reduce((t, f) => t + lv(f), 0) },
    mainStart: { if: (s) => new Set(haikeis(s, 0, 'both').map((f) => D(f).name)).size >= 6, run: (s, it) => endGame(s, it.p, '大日本沿海輿地全図の完成') },
  },
  '4-47': {
    trig: [shippitsu((s, it) => {
      const n = Math.floor(list(s, it.p, 'me', 'field', (f) => hasCol(s, f, 'yellow')).length / 3);
      if (n) drawN(s, it, n);
      kill(s, it, it.src);
    }, { opt: 'マザーグース：能力を使う？' })],
    equip: { from: 'grave', grant: () => ({ traits: ['音楽'] }) },
  },
  '4-48': {
    trig: [
      { on: 'toGrave', self: true, zones: ['grave'], opt: 'このターン山札が墓地に置かれなくなり、ターンが終わる。使う？', if: (s, f, ev) => ev.from === 'deck' && s.turn === f.p, run: (s, it) => { tmpFlag(s, 'noMill', it.p); pushAbort(s); } },
      { on: 'endStart', mine: true, opt: 'これを山札の上に戻す？', run: (s, it) => toTop(s, it, it.src) },
    ],
  },
  '4-49': {
    strip: (s, src, t) => t.p === src.p && t.zone === 'field' && def(t.inst).type === 'ijin' && def(t.inst).traits.includes('志願'),
    aura: [{ to: (s, src, t) => {
      if (!mine(src, t) || !ijinT(t)) return null;
      const g = def(t.inst).traits.includes('志願') ? { kw: { mortal: true }, keep: true } : {};
      if (!s.players[src.p].guardians.length && def(t.inst).level <= 4) g.traits = ['志願'];
      return g;
    } }],
  },
  '4-50': { trig: [{ on: 'mainStart', run: (s, it) => {
    const tp = s.turn;
    if (!ijins(s, tp, 'me').length) return void kill(s, it, it.src);
    const a = pick(s, it, 't', { p: tp, title: '喀血の流行り病：破壊する自分のイジンを選ぶ', options: ijins(s, tp, 'me'), min: 1 });
    if (a?.length) kill(s, it, a);
  } }] },
  '4-51': { mahou: {
    can: (s, p) => (haikeis(s, p, 'both').length || list(s, p, 'both', 'equip').length ? null : 'ハイケイか装備カードが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '破壊するハイケイか装備カードを選ぶ（山札の下へ）', [...haikeis(s, it.p, 'both'), ...list(s, it.p, 'both', 'equip')]);
      if (!a?.length) return;
      if (findOnBoard(s, a[0])?.zone === 'equip') toBottom(s, it, a[0]); else kill(s, it, a, { toBottom: true });
    },
  } },
  '4-52': {
    mahou: { run: (s, it) => {
      const a = choice(s, it, 'c', 'ソーラーフレア：どちらかを選ぶ', { 'L:m': 'このターン、相手の魔力ゾーンの能力は発動しない', 'L:d': '手札1枚を墓地に置いて1ドロー' });
      if (!a) return;
      if (a[0] === 'L:m') return void addTmp(s, { src: '4-52', rule: 'nm', p: opp(it.p) });
      if (discardN(s, it, 'x', it.p, 1) === undefined) return;
      once(it, 'd', () => drawN(s, it, 1));
    } },
    tmpRules: { nm: (s, t, key, f) => key === 'noFieldTrig' && f.zone === 'mana' && f.p === t.p },
  },
  '4-53': { mahou: { run: (s, it) => {
    const sum = grave(s, it.p, 'me', ofType('mahou')).reduce((t, f) => t + lv(f), 0);
    if (sum >= 1) discardN(s, it, 'x', it.p, 1); else drawN(s, it, 1);
  } } },
  '4-54': { mahou: { run: (s, it) => {
    const a = choose(s, it, 't', '相手の手札からレベル3以上のカードを墓地に置く', hand(s, it.p, 'opp', (f) => lv(f) >= 3));
    if (a?.length) once(it, 'x', () => discard(s, a[0], it.p));
  } } },
  '4-55': { mahou: {
    can: (s, p) => (ijins(s, p, 'me', (f) => !f.inst.tapped).length && ijins(s, p).length ? null : '自分の起きているイジンと相手のイジンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 'a', '自分の起きているイジンを選ぶ', ijins(s, it.p, 'me', (f) => !f.inst.tapped)); if (!a) return;
      const b = choose(s, it, 'b', '相手のイジンを選ぶ', ijins(s, it.p)); if (!b) return;
      const fa = findOnBoard(s, a[0]), fb = findOnBoard(s, b[0]);
      const pa = pw(s, fa), pb = pw(s, fb);
      if (pa === pb) { tap(s, a[0]); tap(s, b[0]); return; }
      const [hi, lo] = pa > pb ? [a[0], b[0]] : [b[0], a[0]];
      tap(s, hi); toGraveBy(s, it, lo);
    },
  } },
  '4-56': { mahou: {
    can: (s, p, inst) => (s.players[p].hand.some((c) => c.uid !== inst?.uid && def(c).type === 'haikei') ? null : '手札にハイケイが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '墓地に置くハイケイを選ぶ（レベル合計5につき1ドロー）', hand(s, it.p, 'me', ofType('haikei')), 1, 99);
      if (!a) return;
      once(it, 'x', () => {
        const sum = a.reduce((t, u) => t + def(findOnBoard(s, u).inst).level, 0);
        a.forEach((u) => discard(s, u, it.p));
        const n = Math.floor(sum / 5); if (n) drawN(s, it, n);
      });
    },
  } },
  '4-57': { mahou: { run: (s, it) => {
    once(it, 'x', () => {
      const pl = s.players[it.p];
      for (const f of grave(s, it.p, 'me', ofType('ijin'))) move(s, f.inst.uid, 'deckTop', { by: it.p, silent: true });
      shuffle(s, pl.deck);
      const c = pl.deck[0];
      if (c) { log(s, `山札の上は「${def(c).name}」`, it.p); if (def(c).type === 'ijin') move(s, c.uid, 'hand', { by: it.p }); }
    });
    if (!madou(s, it.p, 'red')) return;
    const a = choose(s, it, 't', '山札の下に戻す相手の墓地のカードを選ぶ（3つまで）', grave(s, it.p, 'opp', (f) => D(f).type !== 'maryoku'), 0, 3);
    if (a) a.forEach((u) => toBottom(s, it, u));
  } } },
  '4-58': { mahou: {
    can: (s, p) => (lunaOpts(s, p).length ? null : '相手のレベル3以下のイジンかハイケイが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '裏にするカードを選ぶ', lunaOpts(s, it.p));
      if (!a) return;
      once(it, 'x', () => { if (a[0]) toGuard(s, it, a[0]); });
      if (!madou(s, it.p, 'blue')) return;
      const b = choose(s, it, 'b', '相手のガーディアン1体を手札に戻す（任意）', guardians(s, it.p), 0);
      if (b?.length) toHand(s, it, b[0]);
    },
  } },
  '4-59': { mahou: {
    can: (s, p) => (ijins(s, p, 'me').length ? null : '自分のイジンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '手札に戻す自分のイジンを選ぶ（1体につきイジン召喚権+1）', ijins(s, it.p, 'me'), 1, 99);
      if (!a) return;
      once(it, 'x', () => { let n = 0; a.forEach((u) => { if (toHand(s, it, u)) n++; }); if (n) addRight(s, it.p, 'summon', n); });
    },
  } },
  '4-60': { mahou: { run: (s, it) => {
    const q = opp(it.p), pl = s.players[q];
    const pool = [...pl.hand, ...pl.field, ...pl.grave].filter((c) => def(c).type !== 'maryoku');
    const cnt = {};
    pool.forEach((c) => { cnt[def(c).name] = (cnt[def(c).name] || 0) + 1; });
    for (const c of [...pl.hand, ...pl.field]) if (def(c).type !== 'maryoku' && cnt[def(c).name] >= 2) move(s, c.uid, 'grave', { by: it.p });
    log(s, 'ドッペルゲンガー：同じ名前のカードを墓地へ', it.p);
  } } },
  '4-61': solid('red', '赤魔導：戦場のハイケイ1つを破壊する？', (s, it) => { const a = choose(s, it, 't', '破壊するハイケイを選ぶ', haikeis(s, it.p, 'both')); if (a?.length) kill(s, it, a); }),
  '4-62': solid('blue', '青魔導：1ドローして、手札2つを墓地に置く？', (s, it) => { once(it, 'd2', () => drawN(s, it, 1)); discardN(s, it, 'x', it.p, 2); }),
  '4-63': solid('green', '緑魔導：これを裏にして魔力ゾーンに置く？', (s, it) => toMana(s, it, it.src)),
  '4-64': solid('yellow', '黄魔導：墓地のマリョクでないカード1つを山札の上か下に戻す？', (s, it) => {
    const a = choose(s, it, 't', '山札に戻す墓地のカードを選ぶ', grave(s, it.p, 'both', (f) => D(f).type !== 'maryoku' && f.inst.uid !== it.src));
    if (!a?.length) return;
    const b = choice(s, it, 'tb', '山札の上か下か', { 'L:t': '山札の上', 'L:b': '山札の下' });
    if (b) move(s, a[0], b[0] === 'L:t' ? 'deckTop' : 'deckBottom', { by: it.p });
  }),
  '4-65': solid('purple', '紫魔導：自分のガーディアン1体を手札に戻す？', (s, it) => { const a = choose(s, it, 't', '手札に戻すガーディアンを選ぶ', guardians(s, it.p, 'me')); if (a?.length) toHand(s, it, a[0]); }),
  '4-66': tonko('遁甲式烈火：表にして、相手の起きているイジンすべてを破壊する？', (s, it) => kill(s, it, ijins(s, it.p, 'opp', (f) => !f.inst.tapped).map((f) => f.inst.uid))),
  '4-68': tonko('遁甲式水鏡：表にして、寝ているイジンすべてを手札に戻す？', (s, it) => { for (const f of ijins(s, it.p, 'both', (x) => x.inst.tapped)) toHand(s, it, f.inst.uid); }),
  '4-70': tonko('遁甲式木蓮：表にして、アタッカーすべてをアタッカーでない状態にする？', (s) => { for (const u of [...(s.battle?.attackers || [])]) removeAttacker(s, u); }),
  '4-67': circle(), '4-69': circle(), '4-71': circle(), '4-73': circle(), '4-75': circle(),
  '4-72': coroll((s, f) => lv(f) <= 2, 'レベル2以下のイジン'),
  '4-74': coroll((s, f) => pw(s, f) <= 1000, 'パワー1000以下のイジン'),
  '4-76': { trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp, run: (s, it) => {
    const opts = hand(s, it.p, 'me', (f) => D(f).type === 'ijin' && lv(f) <= 2);
    const a = opts.length ? choice(s, it, 'c', 'トランスポーター：どちらかを選ぶ', { 'L:f': '手札のレベル2以下のイジンを戦場に置く', 'L:d': '1ドロー' }) : ['L:d'];
    if (!a) return;
    if (a[0] === 'L:d') return void drawN(s, it, 1, 'mana');
    const b = choose(s, it, 't', '戦場に置くイジンを選ぶ', opts);
    if (b?.length) toField(s, it, b[0]);
  } }] },
  '4-77': { trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp, run: (s, it) => {
    const a = choose(s, it, 't', '表にする『サークル』を選ぶ（任意）', mana(s, it.p, 'me', (f) => !f.inst.faceUp && D(f).name.endsWith('サークル')), 0, 99);
    if (a) a.forEach((u) => { findOnBoard(s, u).inst.faceUp = true; });
  } }] },
  '4-78': { equip: { from: 'mana', rules: { noDestroy: (s, src, f, by) => !!s.battle && f.p === src.p && !by.battle && by.p !== undefined && by.p !== f.p } } },
  '4-79': { trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp && s.players[f.p].mana.length <= s.players[opp(f.p)].mana.length, run: (s, it) => {
    const a = choose(s, it, 't', '魔力ゾーンに置くマリョクを選ぶ（任意）', [...hand(s, it.p), ...grave(s, it.p)].filter((f) => D(f).type === 'maryoku'), 0);
    if (a?.length) toMana(s, it, a[0], true);
  } }] },
  '4-80': {
    trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp && s.players[f.p].hand.length > 0, run: (s, it) => {
      const a = choose(s, it, 't', '手札のカードを選ぶ（任意）', hand(s, it.p), 0);
      if (!a?.length) return;
      const b = choice(s, it, 'c', 'そのカードをどうする？', { 'L:g': '墓地に置く', 'L:m': '裏向きで魔力ゾーンに置く' });
      if (!b) return;
      if (b[0] === 'L:g') discard(s, a[0], it.p); else toMana(s, it, a[0]);
    } }],
    selfZones: ['mana'],
    self: (s, src) => ({ colors: [...new Set(s.players[src.p].grave.flatMap((c) => def(c).colors))] }),
  },
});

function karl() {
  return {
    play: { level: (s, p, l) => l - 2 * availableColors(s, opp(p)).size },
    endStart: { opt: '相手の山札の上をめくる？', run: (s, it) => {
      const c = s.players[opp(it.p)].deck[0];
      if (!c) return;
      log(s, `めくったのは「${def(c).name}」`, it.p);
      for (const f of ijins(s, it.p, 'opp', (x) => def(c).colors.some((col) => hasCol(s, x, col)))) toGuard(s, it, f.inst.uid);
    } },
  };
}

function lunaOpts(s, p) {
  return [...ijins(s, p, 'opp', (f) => lv(f) <= 3), ...haikeis(s, p)];
}

// 宣言できるカード名（相手の公開されているカード）
export function revealedNames(s, q) {
  const pl = s.players[q];
  return [...new Set([...pl.grave, ...pl.field, ...pl.mana.filter((m) => m.faceUp)].map((c) => def(c).name))].slice(0, 40);
}
