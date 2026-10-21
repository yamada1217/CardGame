// 第6弾（2nd2-）
import {
  register, def, opp, pw, lv, D, ijins, haikeis, fieldCards, guardians, grave, hand, mana, ofType, trait,
  choose, may, kill, toHand, toMana, toField, drawN, discardN, once, log, addRight, flipManaCost, tap, topToMana,
  tmpFlag, grantTmp, findOnBoard, stat, isIjin, mill, discard, shuffle, faceUpMaryoku, shippitsu, choice, enteredF,
  pick, move, draw, rule, pushFront, ijinsOf, haikeisOf, availableColors,
} from './lib.js';
import { drawOnMana } from './starters.js';
import { revealedNames } from './bp04.js';

const yk = (s, p) => !!s.tf.drewByMana[p];
const ijinT = (t) => t.zone === 'field' && def(t.inst).type === 'ijin';
const myIjins = (cond, grant) => ({ aura: [{ to: (s, src, t) => (t.p === src.p && ijinT(t) && cond(s, src, t) ? grant(s, src, t) : null) }] });
const oppIjins = (cond, grant) => ({ aura: [{ to: (s, src, t) => (t.p !== src.p && ijinT(t) && cond(s, src, t) ? grant(s, src, t) : null) }] });
const handN = (s, p) => s.players[p].hand.length;
const graveColors = (s, p) => new Set(s.players[p].grave.flatMap((c) => def(c).colors));
const isHaikeiF = (s, f) => !!f && stat(s, f.inst, f).types.has('haikei');

// 戦場から墓地に置く（遺業も発動しうる）
function toGraveL(s, it, us) {
  const L = [];
  for (const u of us) {
    const f = findOnBoard(s, u);
    if (!f) continue;
    const d = def(f.inst), fromF = f.zone === 'field' || f.zone === 'guardians';
    if (move(s, u, 'grave', { by: it.p }) && fromF && d.legacy && !rule(s, 'noLegacy', f.p, d)) L.push({ k: 'legacy', p: f.p, src: u });
  }
  if (L.length) pushFront(s, L);
}

const kenmo = () => ({ rules: { freeSummon: (s, src, p) => p === src.p && yk(s, p) && ijinsOf(s, p).length <= 4 } });
const seimei = () => ({ enter: { opt: '山札すべてを手札に加えて、レベル8以下のイジンを戦場に置く？', run: (s, it) => {
  const pl = s.players[it.p];
  once(it, 'a', () => { for (const c of [...pl.deck]) move(s, c.uid, 'hand', { silent: true }); log(s, '山札すべてを手札に加えた', it.p); });
  const a = choose(s, it, 't', '戦場に置くレベル8以下のイジンを選ぶ（任意）', hand(s, it.p, 'me', (f) => D(f).type === 'ijin' && lv(f) <= 8), 0);
  if (!a) return;
  once(it, 'b', () => {
    if (a.length) toField(s, it, a[0]);
    for (const c of [...pl.hand]) move(s, c.uid, 'deckBottom', { silent: true });
    shuffle(s, pl.deck);
    log(s, '手札すべてを山札に戻してシャッフル', it.p);
  });
} } });
const hieros = () => ({ trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp, run: (s, it) => { once(it, 'd', () => drawN(s, it, 2, 'mana')); discardN(s, it, 'x', it.p, 2); } }] });
// 冥府発動のマホウが手札／山札から墓地に置かれたときにも発動
const alsoFrom = (from) => ({ on: 'toGrave', self: true, zones: ['grave'], if: (s, f, ev) => ev.from === from, run: (s, it) => pushFront(s, [{ k: 'legacy', p: it.p, src: it.src }]) });

register({
  '2nd2-1': { enter: (s, it) => {
    const a = choose(s, it, 'r', '相手に見せる手札の「音楽」イジンを選ぶ（任意）', hand(s, it.p, 'me', (f) => D(f).type === 'ijin' && D(f).traits.includes('音楽')), 0, 99);
    if (!a?.length) return;
    const sum = a.reduce((n, u) => n + def(findOnBoard(s, u).inst).level, 0);
    once(it, 'l', () => log(s, `「音楽」イジンを見せた（レベル合計${sum}）`, it.p));
    if (sum >= 6) return kill(s, it, ijins(s, it.p).map((f) => f.inst.uid));
    const b = choose(s, it, 't', '破壊する相手のイジンを選ぶ', ijins(s, it.p));
    if (b?.length) kill(s, it, b);
  } },
  '2nd2-2': { trig: [{ on: 'resolveStart', mine: true, opt: 'パワー10000未満のイジンすべてとハイケイすべてを破壊する？', if: (s, f) => s.turn === f.p, run: (s, it) => {
    kill(s, it, [...ijins(s, it.p, 'both', (f) => pw(s, f) < 10000), ...haikeis(s, it.p, 'both')].map((f) => f.inst.uid));
  } }] },
  '2nd2-3': { ruleZones: ['field', 'grave'], rules: { colorless: (s, src, p, inst, d) => p === src.p && d.type === 'ijin' && d.level <= 6 } },
  '2nd2-4': kenmo(), '2nd2-74': kenmo(),
  '2nd2-5': { trig: [shippitsu((s, it) => { drawN(s, it, 1); addRight(s, it.p, 'summon'); addRight(s, it.p, 'mana'); }, { once: true, opt: '執筆：1ドロー、召喚権+1、配置権+1する？' })] },
  '2nd2-6': { trig: [{ on: 'attackDeclared', if: (s, f, ev) => ev.p === f.p && mana(s, f.p, 'me', (m) => !m.inst.faceUp).length > 0, run: (s, it) => {
    const c = choose(s, it, 'c', '手札に戻す魔力ゾーンの裏のカードを選ぶ（任意・能力を使う）', mana(s, it.p, 'me', (m) => !m.inst.faceUp), 0);
    if (!c?.length) return;
    once(it, 'x', () => { toHand(s, it, c[0]); for (const f of fieldCards(s, it.p, 'me')) tap(s, f.inst.uid); });
    const n = fieldCards(s, it.p, 'me', (f) => !(s.battle?.attackers || []).includes(f.inst.uid)).length;
    const opts = fieldCards(s, it.p, 'opp', (f) => !f.inst.tapped);
    if (!n || !opts.length) return;
    const a = choose(s, it, 't', `寝かせる相手の戦場のカードを${Math.min(n, opts.length)}つ選ぶ`, opts, Math.min(n, opts.length), n);
    if (a) a.forEach((u) => tap(s, u));
  } }] },
  '2nd2-7': myIjins((s, src, t) => s.players[src.p].grave.length >= 19 && def(t.inst).colors.includes('yellow'), () => ({ kw: { sokuo: true }, press: 3 })),
  '2nd2-8': { self: (s, src) => (yk(s, src.p) && haikeis(s, src.p, 'both').length >= 4 ? { unblock: [{ by: 'guardian' }] } : null) },
  '2nd2-9': { rules: { noDraw: (s, src, p) => p !== src.p && handN(s, p) >= 3 } },
  '2nd2-10': seimei(), '2nd2-75': seimei(),
  '2nd2-11': {
    trig: [{ on: 'enter', zones: ['hand'], opt: 'これも一緒に戦場に置く？', if: (s, f, ev) => {
      const e = enteredF(s, ev);
      return ev.p === f.p && ev.summoned && ev.uid !== f.inst.uid && !!e && def(e.inst).type === 'ijin' && def(e.inst).level <= 3;
    }, run: (s, it) => toField(s, it, it.src) }],
    endStart: (s, it) => { const a = choose(s, it, 't', '手札に戻す自分のレベル3以下のイジンを選ぶ', ijins(s, it.p, 'me', (f) => lv(f) <= 3)); if (a?.length) toHand(s, it, a[0]); },
  },
  '2nd2-12': {
    self: (s, src) => (yk(s, src.p) ? { power: 2000 * grave(s, src.p, 'both', ofType('ijin')).length } : null),
    post: (s, src, st) => ((st.setPower ?? st.power) >= 7000 ? { kw: { sokuo: true }, press: 2 } : null),
  },
  '2nd2-13': { win: (s, it) => {
    const a = choose(s, it, 't', '破壊する自分のイジンかガーディアンを選ぶ', [...ijins(s, it.p, 'me'), ...guardians(s, it.p, 'me')]);
    if (!a) return;
    once(it, 'x', () => { kill(s, it, a); addRight(s, it.p, 'summon'); });
  } },
  '2nd2-14': { self: (s, src) => (yk(s, src.p) ? { press: 2 } : null) },
  '2nd2-15': { self: (s, src) => ({ ...(s.turn === src.p ? { types: ['haikei'] } : {}), power: 1000 * haikeisOf(s, src.p).filter((c) => c.uid !== src.inst.uid).length + (s.turn === src.p ? 1000 : 0) }) },
  '2nd2-16': oppIjins((s, src, t) => def(t.inst).level <= 4, () => ({ power: -3000 })),
  '2nd2-17': { rules: { twoManaRights: (s, src, p) => p === src.p } },
  '2nd2-18': myIjins((s, src) => s.turn === src.p, (s) => ({ power: 2000 * Math.max(0, s.rights.mana) })),
  '2nd2-19': { trig: [shippitsu((s, it) => { for (const f of ijins(s, it.p, 'both', (x) => !stat(s, x.inst, x).kw.shippitsu)) tap(s, f.inst.uid); }, { opt: '執筆：「執筆」を持たないイジンすべてを寝かせる？', if: (s, f, ev, e) => def(e.inst).level >= 3 })] },
  '2nd2-20': { rules: { mahouCost: (s, src, p) => 2 * graveColors(s, p).size } },
  '2nd2-21': { trig: [shippitsu((s, it) => {
    const top = s.players[it.p].deck[0];
    if (!top) return;
    log(s, `山札の上をめくった：${def(top).name}`, it.p);
    if (def(top).type === 'haikei') toField(s, it, top.uid);
  }, { opt: '執筆：山札の上をめくる？' })] },
  '2nd2-22': { rules: { freeSummon: (s, src, p, inst) => p === src.p && !!def(inst).kw.yakushin } },
  '2nd2-23': myIjins((s, src, t) => def(t.inst).traits.includes('医術'), () => ({ unblock: [{ by: 'ijin', powerMax: 1000 }] })),
  '2nd2-24': oppIjins((s, src) => (s.battle?.attackers || []).some((u) => findOnBoard(s, u)?.p === src.p), (s, src) => ({ power: -1000 * s.battle.attackers.filter((u) => findOnBoard(s, u)?.p === src.p).length })),
  '2nd2-25': { endStart: (s, it) => {
    const q = opp(it.p), names = revealedNames(s, q);
    if (!names.length || !guardians(s, it.p).length) return;
    const lab = Object.fromEntries(names.map((n, i) => [`L:${i}`, n]));
    const a = pick(s, it, 'n', { title: 'カード名を宣言する（任意）', options: Object.keys(lab), labels: lab, min: 0, max: 1 });
    if (!a?.length) return;
    const g = choose(s, it, 'g', 'めくる相手のガーディアンを選ぶ', guardians(s, it.p));
    if (!g?.length) return;
    const gc = findOnBoard(s, g[0]).inst;
    log(s, `「${lab[a[0]]}」を宣言 → ガーディアンは「${def(gc).name}」`, it.p);
    if (def(gc).name === lab[a[0]]) toGraveL(s, it, [...fieldCards(s, it.p), ...guardians(s, it.p)].map((f) => f.inst.uid));
  } },
  '2nd2-26': { self: (s, src) => (yk(s, src.p) ? { kw: { sokuo: true } } : null) },
  '2nd2-28': { enter: (s, it) => { draw(s, opp(it.p), 1); drawN(s, it, 1); } },
  '2nd2-29': { self: (s, src) => (handN(s, opp(src.p)) >= 6 ? { kw: { sokuo: true } } : null) },
  '2nd2-31': { block: (s, it) => { const a = choose(s, it, 't', 'パワー-2000する相手のイジンを選ぶ（任意）', ijins(s, it.p), 0); if (a?.length) grantTmp(s, a[0], { power: -2000 }); } },
  '2nd2-32': { enter: (s, it) => { for (const f of mana(s, it.p, 'both', (m) => !m.inst.faceUp)) move(s, f.inst.uid, 'guardian', { by: it.p }); } },
  '2nd2-33': { self: (s, src) => (yk(s, src.p) ? { unblock: [{ by: 'ijin' }] } : null) },
  '2nd2-35': myIjins((s, src) => yk(s, src.p), () => ({ power: 1000 })),
  '2nd2-36': { self: (s, src) => (s.turn !== src.p ? { power: 1000 } : null) },
  '2nd2-37': {
    enter: (s, it) => { addRight(s, it.p, 'summon'); drawN(s, it, haikeis(s, it.p, 'me').length); },
    rules: { noDestroy: (s, src, f) => f.p === src.p && f.zone === 'field' && isHaikeiF(s, f) },
  },
  '2nd2-39': { self: (s, src) => (yk(s, src.p) ? { kw: { drain: true } } : null) },
  '2nd2-41': { self: () => ({ unblock: [{ by: 'ijin', powerMax: 0 }] }) },
  '2nd2-42': oppIjins((s, src) => yk(s, src.p), () => ({ power: -1000 })),
  '2nd2-44': myIjins((s, src) => s.turn === src.p && handN(s, opp(src.p)) > handN(s, src.p), () => ({ power: 5000 })),
  '2nd2-45': { endStart: { opt: 'マリョク1つを裏にして、相手の手札1つを墓地に置かせる？', if: (s, f) => faceUpMaryoku(s, f.p).length > 0 && handN(s, opp(f.p)) > 0, run: (s, it) => {
    once(it, 'c', () => flipManaCost(s, it.p));
    discardN(s, it, 'x', opp(it.p), 1, opp(it.p));
  } } },
  '2nd2-46': { endStart: { opt: '山札の上から1つを魔力ゾーンに置く？', if: (s, f) => ijins(s, f.p, 'me', (x) => pw(s, x) >= 4000).length > 0, run: (s, it) => topToMana(s, it.p, 1) } },
  '2nd2-47': { trig: [{ on: 'toGrave', once: true, zones: ['field', 'grave'], if: (s, f, ev) => ev.p === f.p && ev.from === 'hand' && def(enteredF(s, ev)?.inst || { id: 'R-1' }).legacy === 'meifu', run: (s, it) => pushFront(s, [{ k: 'legacy', p: it.p, src: it.ev.uid }]) }] },
  '2nd2-48': oppIjins((s, src) => handN(s, opp(src.p)) <= 3, () => ({ power: -2000 })),
  '2nd2-49': { mahou: {
    can: (s, p) => (ijins(s, p, 'me').length + guardians(s, p, 'me').length ? null : '自分のイジンかガーディアンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 'm', '破壊する自分のイジンかガーディアンを選ぶ', [...ijins(s, it.p, 'me'), ...guardians(s, it.p, 'me')]);
      if (!a) return;
      const b = choose(s, it, 'o', '破壊する相手の戦場のカードを選ぶ', [...fieldCards(s, it.p), ...guardians(s, it.p)], 0);
      if (!b) return;
      kill(s, it, [...a, ...b]);
    },
  } },
  '2nd2-50': {
    mahou: {
      can: (s, p) => (grave(s, p, 'me', (f) => D(f).type === 'ijin' && lv(f) <= 7).length ? null : '墓地にレベル7以下のイジンが必要です'),
      run: (s, it) => { const a = choose(s, it, 't', '戦場に置く墓地のイジンを選ぶ', grave(s, it.p, 'me', (f) => D(f).type === 'ijin' && lv(f) <= 7 && f.inst.uid !== it.src)); if (a?.length) toField(s, it, a[0]); },
    },
    ruleZones: ['grave'],
    rules: { noDestroy: (s, src, f, by) => f.p === src.p && f.zone === 'field' && !by?.battle && by?.p !== undefined && by.p !== f.p && isIjin(s, f.inst, f) },
  },
  '2nd2-51': { mahou: {
    can: (s) => (s.players[0].mana.length + s.players[1].mana.length ? null : '魔力ゾーンにカードが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '手札に戻す魔力ゾーンのカードを選ぶ', mana(s, it.p, 'both'));
      if (!a) return;
      once(it, 'x', () => { if (a.length) move(s, a[0], 'hand', { by: it.p }); tmpFlag(s, 'noMahou', it.p); });
    },
  } },
  '2nd2-52': { mahou: { run: (s, it) => {
    once(it, 'd', () => { for (const c of [...s.players[it.p].hand]) if (c.uid !== it.src) discard(s, c.uid, it.p); });
    const g = grave(s, it.p, 'me', (f) => f.inst.uid !== it.src);
    const n = Math.min(4, g.length);
    const a = n ? choose(s, it, 't', `手札に加える墓地のカードを${n}つ選ぶ`, g, n, n) : [];
    if (!a) return;
    once(it, 'x', () => { a.forEach((u) => toHand(s, it, u)); tmpFlag(s, 'noMahou', it.p); });
  } } },
  '2nd2-53': {
    play: { level: (s, p, l) => l + handN(s, opp(p)) },
    mahou: { run: (s, it) => {
      const q = opp(it.p);
      for (const m of s.players[q].mana) m.faceUp = true;
      toGraveL(s, it, s.players[q].mana.filter((m) => def(m).type !== 'maryoku').map((m) => m.uid));
      log(s, '相手の魔力ゾーンを表にした', it.p);
    } },
  },
  '2nd2-54': { mahou: { run: (s, it) => {
    once(it, 'd', () => drawN(s, it, 1));
    discardN(s, it, 'x', it.p, availableColors(s, it.p).size);
  } } },
  '2nd2-55': { mahou: { run: (s, it) => {
    for (const f of ijins(s, it.p, 'both')) move(s, f.inst.uid, 'grave', { by: it.p });
    tmpFlag(s, 'noBattle', it.p);
  } } },
  '2nd2-56': { mahou: {
    can: (s, p) => (fieldCards(s, p, 'both').length ? null : '戦場にカードが必要です'),
    run: (s, it) => {
      const all = fieldCards(s, it.p, 'both');
      const top = Math.max(...all.map((f) => stat(s, f.inst, f).level));
      const a = choose(s, it, 't', '手札に戻す最もレベルが高いカードを選ぶ', all.filter((f) => stat(s, f.inst, f).level === top));
      if (a?.length) toHand(s, it, a[0]);
    },
  } },
  '2nd2-57': { mahou: { run: (s, it) => {
    for (const f of mana(s, it.p, 'both', (m) => m.inst.faceUp && D(m).type === 'maryoku')) move(s, f.inst.uid, 'hand', { by: it.p });
    tmpFlag(s, 'noPlay', it.p);
  } } },
  '2nd2-58': {
    mahou: {
      can: (s, p, inst) => (handN(s, opp(p)) > handN(s, p) - (s.players[p].hand.some((c) => c.uid === inst?.uid) ? 1 : 0) ? null : '相手の手札が自分より多いときだけ使えます'),
      run: (s, it) => { const n = handN(s, opp(it.p)) - handN(s, it.p); if (n > 0) drawN(s, it, n); tmpFlag(s, 'noBattle', it.p); },
    },
    trig: [alsoFrom('hand')],
  },
  '2nd2-59': {
    mahou: {
      can: (s, p) => (grave(s, p, 'me', ofType('maryoku')).length ? null : '墓地にマリョクが必要です'),
      run: (s, it) => {
        const pl = s.players[it.p];
        topToMana(s, it.p, pl.grave.filter((c) => def(c).type === 'maryoku').length);
        for (const c of pl.grave.filter((x) => def(x).type === 'maryoku')) move(s, c.uid, 'deckBottom', { by: it.p, silent: true });
        shuffle(s, pl.deck);
      },
    },
    trig: [alsoFrom('deck')],
  },
  '2nd2-60': hieros(), '2nd2-61': hieros(), '2nd2-62': hieros(), '2nd2-63': hieros(), '2nd2-64': hieros(),
  '2nd2-65': drawOnMana(true), '2nd2-66': drawOnMana(true), '2nd2-67': drawOnMana(true), '2nd2-68': drawOnMana(true), '2nd2-69': drawOnMana(true),
  '2nd2-70': { trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp, run: (s, it) => topToMana(s, it.p, 2) }] },
  '2nd2-71': { ruleZones: ['mana'], rules: { ignoreColor: (s, src, p, inst, d) => p === src.p && d.type === 'ijin' } },
  '2nd2-72': {
    trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp && ev.placement, run: (s, it) => mill(s, it.p, 1) }],
    selfZones: ['mana'], self: (s, src) => ({ colors: [...graveColors(s, src.p)] }),
  },
  '2nd2-73': { ruleZones: ['mana'], rules: { playLevel: (s, src, p, inst, d) => (p === src.p && d.type === 'mahou' ? 2 : 0) } },
});
