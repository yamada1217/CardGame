// スターター（赤 R01・青 B01・緑 G01・黄 Y01・紫 P01）
import {
  register, def, opp, me, pw, lv, D, ijins, haikeis, fieldCards, guardians, grave, hand, mana, ofType, hasCol, trait, tapped,
  choose, may, labels, kill, toHand, toBottom, toTop, toMana, toGuard, toGraveBy, toField, drawN, discardN, once, log, name,
  addRight, flipManaCost, untap, untapAll, tap, topToMana, topToGuardian, placeGuardian, addTmp, grantTmp, tmpFlag, removeAttacker,
  findOnBoard, list, stat, power, isIjin, mill, move, kikkiOk, isStone, faceUpMaryoku, emit, discard, pick, draw,
} from './lib.js';

const self = (s, it) => findOnBoard(s, it.src);

register({
  'R-1': { attack: (s, it) => {
    const m = self(s, it); if (!m) return;
    const lim = power(s, it.p, m.inst, 'atk');
    const a = choose(s, it, 't', `破壊する相手のイジンを選ぶ（パワー${lim}以下）`, ijins(s, it.p, 'opp', (f) => pw(s, f) <= lim));
    if (a) kill(s, it, a);
  } },
  'R-4': { attack: (s, it) => {
    if (!faceUpMaryoku(s, it.p).length && !s.players[it.p].mana.some((m) => m.faceUp)) return;
    const a = choose(s, it, 't', 'マリョク1つを裏にして、パワー2000以下のイジンを破壊する（任意）', ijins(s, it.p, 'opp', (f) => pw(s, f) <= 2000), 0);
    if (!a?.length) return;
    flipManaCost(s, it.p); kill(s, it, a);
  } },
  'R-6': { enter: (s, it) => addRight(s, it.p, 'summon') },
  'R-7': { attack: (s, it) => { const n = haikeis(s, it.p).length; if (n) drawN(s, it, n); } },
  'R-8': { attack: (s, it) => {
    const n = s.battle?.attackers.length || 1;
    const opts = haikeis(s, it.p);
    const a = choose(s, it, 't', `破壊する相手のハイケイを選ぶ（${n}つまで）`, opts, Math.min(n, opts.length), n);
    if (a) kill(s, it, a);
  } },
  'R-9': { trig: [{ on: 'destroyed', opt: '破壊された赤のイジンを魔力ゾーンに置く？', if: (s, f, ev) => ev.p === f.p && ev.zone === 'field' && ev.types.includes('ijin') && ev.colors.includes('red'), run: (s, it) => toMana(s, it, it.ev.uid) }] },
  'R-10': {
    play: { level: (s, p, l) => (ijins(s, p, 'me', (f) => trait(s, f, '剣術')).length ? 1 : l) },
    aura: [{ to: (s, src, t) => (t.p === src.p && t.zone === 'field' && t.inst.uid !== src.inst.uid && def(t.inst).type === 'ijin' ? { power: 1000 } : null) }],
  },
  'R-11': { mahou: { run: (s, it) => {
    const opts = [...ijins(s, it.p, 'me', (f) => trait(s, f, '剣術')), ...guardians(s, it.p, 'me')];
    const a = choose(s, it, 't', '剣術イジンを破壊するか、ガーディアンを山札の上に戻す', opts);
    if (!a) return;
    once(it, 'x', () => {
      const f = a[0] && findOnBoard(s, a[0]);
      if (f?.zone === 'guardians') toTop(s, it, a[0]); else if (f) kill(s, it, a);
      drawN(s, it, 3);
    });
  } } },
  'R-12': { mahou: {
    can: (s, p) => (ijins(s, p, 'me').length && guardians(s, p).length ? null : '自分のイジンと相手のガーディアンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 'a', '破壊する自分のイジンを選ぶ', ijins(s, it.p, 'me'));
      if (!a) return;
      const b = choose(s, it, 'b', '破壊する相手のガーディアンを選ぶ', guardians(s, it.p));
      if (b) kill(s, it, [...a, ...b]);
    },
  } },
  'B-1': { enter: (s, it) => {
    const a = choose(s, it, 't', '墓地から戦場に置くカードを選ぶ（任意）', grave(s, it.p, 'me', (f) => (D(f).type === 'ijin' && lv(f) <= 6) || (D(f).type === 'haikei' && lv(f) <= 5)), 0);
    if (a?.length) toField(s, it, a[0]);
  } },
  'B-2': { attack: { voyage: true, run: (s, it) => {
    once(it, 'd', () => drawN(s, it, 1));
    discardN(s, it, 'x', it.p, 1);
  } } },
  'B-3': { self: () => ({ unblock: [{ by: 'ijin', powerMax: 1000 }] }) },
  'B-4': { attack: { voyage: true, run: (s, it) => discardN(s, it, 'x', opp(it.p), 1, opp(it.p)) } },
  'B-5': { enter: (s, it) => {
    const a = choose(s, it, 't', '墓地から手札に戻すカードを選ぶ', grave(s, it.p, 'me', (f) => ['ijin', 'haikei'].includes(D(f).type)));
    if (a?.length) toHand(s, it, a[0]);
  } },
  'B-6': {
    trig: [{ on: 'mainStart', if: (s, f) => s.players[f.p].mana.some((m) => m.faceUp), opt: 'マリョク1つを裏にして、このターン「執筆」を止める？', run: (s, it) => { flipManaCost(s, it.p); tmpFlag(s, 'noShippitsu'); log(s, 'このターン「執筆」は発動しない', it.p); } }],
    self: (s, src) => (s.turn !== src.p ? { power: 2000 } : null),
  },
  'B-7': { self: (s, src) => {
    const n = s.players[src.p].field.filter((c) => def(c).type === 'ijin').length;
    return { power: 1000 * n, ...(def(src.inst).power + 1000 * n >= 5000 ? { press: 2 } : {}) };
  } },
  'B-8': {
    enter: (s, it) => {
      const a = choose(s, it, 't', '破壊して3ドローするイジンを選ぶ（任意）', ijins(s, it.p, 'me'), 0);
      if (!a?.length) return;
      once(it, 'x', () => { drawN(s, it, 3); kill(s, it, a); });
    },
    self: (s, src) => (s.players[src.p].hand.length >= 5 ? { unblock: [{ by: 'ijin' }] } : null),
  },
  'B-9': { mainStart: (s, it) => {
    const a = choose(s, it, 't', '手札の「美術」カードを墓地に置いて1ドロー（任意）', hand(s, it.p, 'me', (f) => D(f).traits.includes('美術')), 0);
    if (!a?.length) return;
    once(it, 'x', () => { discard(s, a[0], it.p); drawN(s, it, 1); });
  } },
  'B-10': {
    trig: [{ on: 'destroyed', if: (s, f, ev) => ev.zone === 'field' && ev.types.includes('ijin'), run: (s, it) => drawN(s, it, 1) }],
    mainStart: (s, it) => {
      const a = choose(s, it, 't', '自分のイジン1体を破壊する（任意）', ijins(s, it.p, 'me'), 0);
      if (a?.length) kill(s, it, a);
    },
  },
  'B-11': {
    mahou: { run: (s, it) => { tmpFlag(s, 'fleet', it.p); addTmp(s, { src: 'B-11', aura: 'fleet' }); log(s, 'このターン、アタッカーはバトルで破壊されない', it.p); } },
    tmpAura: { fleet: (s, t, tgt) => (tgt.zone === 'field' && stat(s, tgt.inst, tgt).kw.voyage ? { atk: 2000 } : null) },
  },
  'B-12': { mahou: { run: (s, it) => drawN(s, it, 2) } },
  'G-1': {
    enter: (s, it) => { untapAll(s, it.p); log(s, '戦場のカードをすべて起こした', it.p); },
    destroyed: { if: (s, f) => s.players[f.p].mana.some((m) => m.faceUp), opt: 'マリョク1つを裏にして、破壊を取り消す？', run: (s, it) => { const m = self(s, it); if (!m) return; flipManaCost(s, it.p); m.inst.destroyed = false; log(s, `${name(m.inst)}の破壊を取り消した`, it.p); } },
  },
  'G-2': { enter: (s, it) => topToMana(s, it.p) },
  'G-3': { trig: [{ on: 'enter', if: (s, f, ev) => { const e = findOnBoard(s, ev.uid); return e && isIjin(s, e.inst, e) && stat(s, e.inst, e).traits.has('剣術'); }, run: (s, it) => untap(s, it.src) }] },
  'G-4': { trig: [{ on: 'enter', shippitsu: true, if: haikeiEntered, run: (s, it) => toMana(s, it, it.src) }] },
  'G-5': { trig: [{ on: 'voyage', run: (s, it) => { drawN(s, it, 1); untap(s, it.src); } }] },
  'G-6': { enter: (s, it) => {
    const a = choose(s, it, 't', '墓地から手札に戻すハイケイを選ぶ（2つまで・任意）', grave(s, it.p, 'me', ofType('haikei')), 0, 2);
    if (a) a.forEach((u) => toHand(s, it, u));
  } },
  'G-7': { trig: [{ on: 'enter', shippitsu: true, if: haikeiEntered, run: (s, it) => untapAll(s, it.p) }] },
  'G-8': { attack: { voyage: true, run: (s, it) => {
    const a = choose(s, it, 't', 'ハイケイ1つを手札に戻し、イジン全員にダブルプレッシャー（任意）', haikeis(s, it.p, 'me'), 0);
    if (!a?.length) return;
    toHand(s, it, a[0]);
    for (const f of ijins(s, it.p, 'me')) grantTmp(s, f.inst.uid, { press: 2 });
    log(s, 'このターン、イジン全員がダブルプレッシャー', it.p);
  } } },
  'G-9': { mainStart: (s, it) => {
    const a = choose(s, it, 't', '戦場か魔力ゾーンのカード1つを手札に戻す（任意）', [...fieldCards(s, it.p, 'me', (f) => f.inst.uid !== it.src), ...mana(s, it.p)], 0);
    if (a?.length) toHand(s, it, a[0]);
  } },
  'G-10': {
    aura: [{ to: (s, src, t) => (t.p === src.p && t.zone === 'field' && def(t.inst).type === 'ijin' ? { power: 1000 } : null) }],
    endStart: (s, it) => { untapAll(s, it.p); log(s, '毘盧遮那仏像：戦場のカードをすべて起こした', it.p); },
  },
  'G-11': { mahou: { run: (s, it) => topToMana(s, it.p) } },
  'G-12': { mahou: { run: (s, it) => {
    for (const g of [...s.players[it.p].guardians]) toHand(s, it, g.uid);
    topToGuardian(s, it.p, 2);
  } } },

  // 黄
  'Y-1': {
    enter: { opt: '山札の下から1枚を見る？', run: (s, it) => {
      const pl = s.players[it.p];
      const c = pl.deck[pl.deck.length - 1];
      if (!c) return;
      if (def(c).type !== 'haikei') { const a = pick(s, it, 'see', { title: '山札の下のカード', options: [c.uid], info: true }); return; }
      const ok = may(s, it, 'put', `山札の下の「${def(c).name}」を戦場に置く？`);
      if (ok) toField(s, it, c.uid);
    } },
    trig: [{ on: 'enter', if: (s, f, ev) => ev.p === f.p && def({ id: findOnBoard(s, ev.uid)?.inst.id || 'R-1' }).type === 'haikei' && hasCol(s, findOnBoard(s, ev.uid), 'yellow'), run: (s, it) => drawN(s, it, 1) }],
  },
  'Y-2': { destroyed: (s, it) => {
    const a = choose(s, it, 't', '破壊するハイケイを選ぶ（任意）', haikeis(s, it.p, 'both'), 0);
    if (a?.length) kill(s, it, a);
  } },
  'Y-3': { self: (s, src) => ({
    ...(s.players[opp(src.p)].grave.length <= 5 ? { kw: { watcher: true } } : {}),
    atk: 1000 * s.players[src.p].field.filter((c) => def(c).type === 'ijin' && def(c).kw.sokuo).length,
  }) },
  'Y-4': { trig: [{ on: 'tap', opt: '手札1枚を墓地に置いて1ドローする？', if: (s, f, ev) => { const t = findOnBoard(s, ev.uid); return ev.p === f.p && t?.zone === 'field' && isIjin(s, t.inst, t) && hasCol(s, t, 'red'); }, run: (s, it) => {
    if (!s.players[it.p].hand.length) return;
    const a = discardN(s, it, 'x', it.p, 1);
    if (a) once(it, 'd', () => drawN(s, it, 1));
  } }] },
  'Y-5': { trig: [{ on: 'manaPlaced', kikki: true, opt: '決起：相手のガーディアンを寝かせる？', if: (s, f, ev) => ev.p === f.p && kikkiOk(s, f.p), run: (s, it) => {
    let n = ijins(s, it.p).length;
    for (const g of guardians(s, it.p, 'opp', (f) => !f.inst.tapped)) if (n-- > 0) tap(s, g.inst.uid);
  } }] },
  'Y-6': { enter: (s, it) => {
    const a = choose(s, it, 't', 'ガーディアンにする『ストーン』マリョクを選ぶ（2つまで）', mana(s, it.p, 'me', (f) => f.inst.faceUp && isStone(f.inst)), 0, 2);
    if (a) a.forEach((u) => toGuard(s, it, u));
  } },
  'Y-7': { trig: [{ on: 'legacy', once: true, opt: '1ドローする？', if: (s, f, ev) => ev.p === f.p, run: (s, it) => drawN(s, it, 1) }] },
  'Y-8': { enter: (s, it) => {
    const a = choose(s, it, 'g', '墓地に置く自分のガーディアンを選ぶ', guardians(s, it.p, 'me'));
    if (!a) return;
    once(it, 'x', () => { if (a[0]) toGraveBy(s, it, a[0]); topToGuardian(s, it.p, 1); });
  } },
  'Y-9': {
    aura: [{ to: (s, src, t) => (t.p === src.p && t.zone === 'field' && def(t.inst).type === 'ijin' && def(t.inst).colors.includes('yellow') ? { colors: ['red', 'blue', 'green'] } : null) }],
    trig: [{ on: 'attackDeclared', if: (s, f, ev) => ev.p !== f.p && ev.attackers.length >= 3, run: (s, it) => {
      const a = choose(s, it, 't', 'アタッカーでない状態にするアタッカーを選ぶ（任意）', s.battle?.attackers || [], 0);
      if (!a?.length) return;
      removeAttacker(s, a[0]); kill(s, it, it.src);
    } }],
  },
  'Y-10': { rules: { manaFromGrave: (s, src, p) => p === src.p } },
  'Y-11': { mahou: {
    can: (s, p) => (tappedCards(s, p).length ? null : '寝ているカードが必要です'),
    run: (s, it) => { const a = choose(s, it, 't', '山札の下に戻す寝ているカードを選ぶ', tappedCards(s, it.p)); if (a?.length) toBottom(s, it, a[0]); },
  } },
  'Y-12': { mahou: {
    can: (s, p) => (grave(s, p, 'both', (f) => D(f).type !== 'maryoku').length >= 4 ? null : '墓地のマリョクでないカードが4つ必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '山札の下に戻す墓地のカードを4つ選ぶ', grave(s, it.p, 'both', (f) => D(f).type !== 'maryoku' && f.inst.uid !== it.src), 4, 4);
      if (!a) return;
      once(it, 'x', () => { a.forEach((u) => toBottom(s, it, u)); drawN(s, it, 1); });
    },
  } },

  // 紫
  'P-1': { enter: { if: (s, f) => s.players[opp(f.p)].hand.length > s.players[f.p].hand.length, run: (s, it) => {
    const n = s.players[opp(it.p)].hand.length - s.players[it.p].hand.length;
    if (n > 0) discardN(s, it, 'x', opp(it.p), n, opp(it.p));
  } } },
  'P-2': { enter: (s, it) => {
    const a = choose(s, it, 't', '表を見る裏のカードを選ぶ', guardians(s, it.p, 'both'));
    if (a?.length) pick(s, it, 'see', { title: 'カードの表', options: a, info: true, reveal: true });
  } },
  'P-3': { enter: (s, it) => {
    const a = choose(s, it, 't', '山札の上に戻すカードを選ぶ（任意）', [...guardians(s, it.p, 'me'), ...grave(s, it.p)], 0);
    if (a?.length) toTop(s, it, a[0]);
  } },
  'P-4': { trig: [{ on: 'toGrave', if: (s, f, ev) => ev.from === 'hand' && ev.by != null && def(findOnBoard(s, ev.uid)?.inst || { id: 'R-1' }).type !== 'ijin', run: (s, it) => mill(s, it.ev.p, 1) }] },
  'P-5': {
    enter: (s, it) => { const n = ijins(s, it.p, 'me', (f) => trait(s, f, '美術')).length; if (n) drawN(s, it, n); },
    destroyed: (s, it) => { const n = ijins(s, it.p, 'me', (f) => trait(s, f, '医術') && f.inst.uid !== it.src).length; if (n) discardN(s, it, 'x', s.turn, n, s.turn); },
  },
  'P-6': { trig: [{ on: 'toGrave', if: (s, f, ev) => ev.from === 'hand' && ev.by != null && def(findOnBoard(s, ev.uid)?.inst || { id: 'R-13' }).type === 'ijin', run: (s, it) => { draw(s, it.ev.p, 1); } }] },
  'P-7': {
    self: (s, src) => ({ power: 2000 * s.players[opp(src.p)].grave.filter((c) => def(c).type === 'ijin').length }),
    tap: { if: (s, f) => power(s, f.p, f.inst) >= 6000, run: (s, it) => {
      const a = choose(s, it, 't', '破壊するイジンかガーディアンを選ぶ', [...ijins(s, it.p, 'both'), ...guardians(s, it.p, 'both')]);
      if (a?.length) kill(s, it, a);
    } },
  },
  'P-8': { trig: [{ on: 'destroyed', if: (s, f, ev) => ev.uid !== f.inst.uid && s.players[f.p].mana.some((m) => m.faceUp), opt: 'マリョク1つを裏にして、破壊されたカードを手札に戻す？', run: (s, it) => {
    const t = findOnBoard(s, it.ev.uid);
    if (!t?.inst.destroyed) return;
    flipManaCost(s, it.p); toHand(s, it, it.ev.uid);
  } }] },
  'P-9': { trig: [{ on: 'toGrave', discards: true, opt: '虎狼痢：手札を1枚ずつ見せ合う？', if: (s, f, ev) => ev.from === 'hand' && ev.by != null && s.players[0].hand.length && s.players[1].hand.length, run: (s, it) => {
    if (!s.players[0].hand.length || !s.players[1].hand.length) return;
    const a = choose(s, it, 'a', '見せる手札を1枚選ぶ', hand(s, it.p));
    if (!a) return;
    const b = pick(s, it, 'b', { p: opp(it.p), title: '見せる手札を1枚選ぶ', options: hand(s, opp(it.p)), min: 1 });
    if (!b) return;
    const la = def(findOnBoard(s, a[0]).inst).level, lb = def(findOnBoard(s, b[0]).inst).level;
    const [hi, lo] = la >= lb ? [a[0], b[0]] : [b[0], a[0]];
    discard(s, hi, it.p); toTop(s, it, lo);
  } }] },
  'P-10': { mainStart: (s, it) => {
    const n = Math.min(3, s.players[it.p].deck.length);
    if (!n) return;
    const opts = { 'L:0': '置かない', 'L:1': '1枚', 'L:2': '2枚', 'L:3': '3枚' };
    for (let k = n + 1; k <= 3; k++) delete opts[`L:${k}`];
    const a = choose(s, it, 'n', '山札の上から墓地に置く枚数を選ぶ', labels(opts).options, 1, 1, { labels: opts });
    if (!a) return;
    const k = mill(s, it.p, Number(a[0].slice(2))).length;
    if (k >= 1) addRight(s, it.p, 'mana');
    if (k >= 2) addRight(s, it.p, 'summon');
    if (k >= 3) drawN(s, it, 1);
  } },
  'P-11': { mahou: { run: (s, it) => {
    const a = choose(s, it, 't', '手札に戻す自分のガーディアンを選ぶ', guardians(s, it.p, 'me'));
    if (!a) return;
    if (a[0]) toHand(s, it, a[0]);
    mill(s, opp(it.p), 2); addRight(s, it.p, 'mana');
  } } },
  'P-12': { mahou: { run: (s, it) => { toMana(s, it, it.src); log(s, 'タイムディレイション：ターンを終える', it.p); pushAbort(s); } } },
  'P-13': drawOnMana(),
  'P-14': { equip: { from: 'mana', grant: (s, h) => ({ power: 500 * s.players[h.p].mana.filter((m) => m.faceUp && def(m).type === 'maryoku').length }) } },
});

function haikeiEntered(s, f, ev) {
  const e = findOnBoard(s, ev.uid);
  return !!e && e.zone === 'field' && stat(s, e.inst, e).types.has('haikei');
}

function tappedCards(s, p) {
  return [...list(s, p, 'both', 'field', tapped), ...list(s, p, 'both', 'guardians', tapped)];
}

export function drawOnMana(placementOnly = false) {
  return { trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp && (!placementOnly || ev.placement), run: (s, it) => drawN(s, it, 1, 'mana') }] };
}

export function pushAbort(s) {
  s.queue.unshift({ k: 'abort' });
}

export { haikeiEntered, tappedCards };
