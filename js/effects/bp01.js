// 第1弾ブースター
import {
  register, def, opp, pw, lv, D, ijins, haikeis, fieldCards, guardians, grave, hand, mana, ofType, hasCol, trait,
  choose, may, kill, toHand, toTop, toMana, toGuard, toGraveBy, toField, drawN, discardN, once, log, addRight, flipManaCost,
  untap, tap, topToMana, topToGuardian, addTmp, grantTmp, tmpFlag, findOnBoard, list, stat, power, isIjin, mill, discard,
  faceUpMaryoku, availableColors, manaColors,
} from './lib.js';
import { drawOnMana, haikeiEntered } from './starters.js';

const self = (s, it) => findOnBoard(s, it.src);
const mine = (src, t) => t.p === src.p && t.zone === 'field';
const ijinT = (t) => t.zone === 'field' && def(t.inst).type === 'ijin';
const entered = (s, ev) => findOnBoard(s, ev.uid);
const enteredIjin = (s, ev) => { const e = entered(s, ev); return e?.zone === 'field' && isIjin(s, e.inst, e) ? e : null; };
const musicNames = (s) => new Set(list(s, 0, 'both', 'field', (f) => stat(s, f.inst, f).traits.has('音楽')).map((f) => D(f).name)).size;
const equipBuff = (g) => ({ from: 'mana', grant: () => g });

register({
  '1-1': {
    self: (s, src) => (s.players[opp(src.p)].guardians.length <= 1 ? { losePress: true, traits: ['剣術'] } : null),
    endStart: { if: (s, f) => f.inst.tapped, run: (s, it) => kill(s, it, it.src) },
  },
  '1-2': {
    enter: { opt: '戦場のハイケイすべてを破壊する？', run: (s, it) => kill(s, it, haikeis(s, it.p, 'both').map((f) => f.inst.uid)) },
    trig: [{ on: 'destroyed', if: (s, f, ev) => ev.types.includes('haikei'), run: (s, it) => drawN(s, it, 1) }],
  },
  '1-3': {
    rules: { noFaceDownCost: (s, src, p) => p !== src.p },
    self: (s, src) => (s.turn !== src.p ? { power: 3000 } : null),
  },
  '1-4': { self: () => ({ unblock: [{ by: 'ijin' }] }), attack: { voyage: true, run: (s, it) => addRight(s, it.p, 'summon') } },
  '1-5': { strip: (s, src, t) => t.p !== src.p && ((t.zone === 'field' && def(t.inst).type === 'ijin' && stat(s, t.inst, t).traits.has('音楽')) || t.zone === 'grave') },
  '1-6': { trig: [{ on: 'enter', shippitsu: true, if: haikeiEntered, run: (s, it) => {
    const a = choose(s, it, 't', '魔力ゾーンに置く相手のイジンを選ぶ', ijins(s, it.p));
    if (a?.length) toMana(s, it, a[0]);
  } }] },
  '1-7': { self: (s, src) => (list(s, src.p, 'both', 'field', (f) => f.inst.uid !== src.inst.uid && def(f.inst).type === 'ijin' && def(f.inst).colors.includes('red')).length ? { kw: { sokuo: true } } : null) },
  '1-8': { enter: (s, it) => { const a = choose(s, it, 't', '山札の上に戻すガーディアンを選ぶ', guardians(s, it.p, 'me')); if (a?.length) toTop(s, it, a[0]); } },
  '1-9': { attack: { voyage: true, run: (s, it) => { const a = choose(s, it, 't', '破壊する相手のハイケイを選ぶ', haikeis(s, it.p)); if (a?.length) kill(s, it, a); } } },
  '1-10': { enter: (s, it) => addRight(s, it.p, 'summon') },
  '1-11': { aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && stat(s, t.inst, t).traits.has('剣術') ? { atk: 2000 } : null) }] },
  '1-12': { trig: [{ on: 'enter', shippitsu: true, if: haikeiEntered, run: (s, it) => {
    const h = entered(s, it.ev); const L = h ? D(h).level : 0;
    const a = choose(s, it, 't', `レベル${L}以下の墓地のマホウを手札に戻す（任意）`, grave(s, it.p, 'me', (f) => D(f).type === 'mahou' && lv(f) <= L), 0);
    if (a?.length) toHand(s, it, a[0]);
  } }] },
  '1-13': {
    enter: (s, it) => {
      const m = self(s, it); const lim = m ? power(s, it.p, m.inst) : 0;
      const a = choose(s, it, 't', `破壊する相手のイジンを選ぶ（パワー${lim}以下）`, ijins(s, it.p, 'opp', (f) => pw(s, f) <= lim));
      if (a?.length) kill(s, it, a);
    },
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && stat(s, t.inst, t).traits.has('剣術') ? { power: 1000 } : null) }],
  },
  '1-14': { aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && def(t.inst).kw.sokuo ? { atk: 1000 } : null) }] },
  '1-15': { enter: { if: (s, f) => s.players[f.p].deck.length >= 5, opt: '山札の上から5枚を墓地に置いて、このターン「即応」を得る？', run: (s, it) => { mill(s, it.p, 5); grantTmp(s, it.src, { kw: { sokuo: true } }); } } },
  '1-16': { enter: { if: (s, f) => s.players[f.p].guardians.length > 0, run: (s, it) => {
    const a = choose(s, it, 't', 'ガーディアン1体を魔力ゾーンに置いて、イジン召喚権+1（任意）', guardians(s, it.p, 'me'), 0);
    if (!a?.length) return;
    toMana(s, it, a[0]); addRight(s, it.p, 'summon');
  } } },
  '1-17': { enter: (s, it) => {
    const n = availableColors(s, it.p).size;
    if (!n) return;
    const a = choose(s, it, 't', `墓地のマホウを${n}つまで手札に戻す`, grave(s, it.p, 'me', ofType('mahou')), n, n);
    if (a) a.forEach((u) => toHand(s, it, u));
  } },
  '1-18': { enter: (s, it) => { const a = choose(s, it, 't', '破壊する相手のイジンを選ぶ（パワー4000以下）', ijins(s, it.p, 'opp', (f) => pw(s, f) <= 4000)); if (a?.length) kill(s, it, a); } },
  '1-19': { enter: { if: (s, f) => s.players[opp(f.p)].hand.length >= 6, run: (s, it) => grantTmp(s, it.src, { kw: { sokuo: true } }) } },
  '1-20': {
    block: (s, it) => drawN(s, it, 1),
    trig: [{ on: 'attack', if: (s, f, ev) => { const a = findOnBoard(s, ev.uid); return ev.p !== f.p && a && stat(s, a.inst, a).kw.sokuo; }, run: (s, it) => untap(s, it.src) }],
  },
  '1-21': { attack: { voyage: true, run: (s, it) => { drawN(s, it, 1); kill(s, it, it.src); } } },
  '1-22': { enter: (s, it) => mill(s, it.p, 3), destroyed: (s, it) => discardN(s, it, 'x', it.p, 1) },
  '1-23': { enter: (s, it) => { once(it, 'd', () => drawN(s, it, 1)); discardN(s, it, 'x', it.p, 1); } },
  '1-24': {
    trig: [{ on: 'guardian', if: (s, f, ev) => ev.p === f.p, run: (s, it) => { const a = choose(s, it, 't', '寝かせる相手のガーディアンを選ぶ', guardians(s, it.p, 'opp', (f) => !f.inst.tapped)); if (a?.length) tap(s, a[0]); } }],
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) ? { blk: 1000 } : null) }],
  },
  '1-25': {
    enter: { if: (s, f) => s.players[f.p].mana.some((m) => m.faceUp), run: (s, it) => {
      const a = choose(s, it, 't', '自分のマリョク1つを裏にして、相手のマリョク1つを裏にする（任意）', mana(s, it.p, 'opp', (f) => f.inst.faceUp), 0);
      if (!a?.length) return;
      flipManaCost(s, it.p); findOnBoard(s, a[0]).inst.faceUp = false;
    } },
    rules: { noShippitsu: () => true },
  },
  '1-26': { enter: (s, it) => {
    const a = choose(s, it, 't', '相手の手札からマリョクでないカードを墓地に置く', hand(s, it.p, 'opp', (f) => D(f).type !== 'maryoku'));
    if (a?.length) once(it, 'x', () => discard(s, a[0], it.p));
  } },
  '1-27': {
    trig: [{ on: 'enter', if: (s, f, ev) => ev.p !== f.p && !!enteredIjin(s, ev), run: (s, it) => topToGuardian(s, it.p, 1) }],
    rules: { cantBlockPair: (s, src, b, a) => b.p === src.p && b.zone === 'guardians' && power(s, a.p, a.inst, 'atk') >= 6000 },
  },
  '1-28': {
    self: (s, src) => ({ power: 500 * s.players[src.p].grave.filter((c) => def(c).type === 'ijin').length }),
    trig: [{ on: 'destroyed', if: (s, f, ev) => ev.p !== f.p && ev.zone === 'guardians', run: (s, it) => drawN(s, it, 1) }],
  },
  '1-29': { attack: { voyage: true, run: (s, it) => topToGuardian(s, it.p, 1) } },
  '1-30': { enter: (s, it) => { for (const m of mana(s, it.p, 'me', (f) => !f.inst.faceUp)) toGuard(s, it, m.inst.uid); } },
  '1-31': { enter: (s, it) => { const a = choose(s, it, 't', 'ガーディアンにする墓地のカードを選ぶ', grave(s, it.p)); if (a?.length) toGuard(s, it, a[0]); } },
  '1-32': { destroyed: (s, it) => { for (const g of guardians(s, it.p, 'both')) tap(s, g.inst.uid); } },
  '1-33': {
    enter: { if: (s) => list(s, 0, 'both', 'field', (f) => def(f.inst).type === 'ijin' && def(f.inst).colors.includes('red')).length > 0, run: (s, it) => addRight(s, it.p, 'summon') },
    rules: { discardForCost: (s, src, p) => p === src.p },
  },
  '1-34': { enter: { if: (s) => list(s, 0, 'both', 'field', (f) => def(f.inst).type === 'ijin' && stat(s, f.inst, f).traits.has('剣術')).length > 0, run: (s, it) => drawN(s, it, 1) } },
  '1-35': {
    self: (s, src) => ({ power: 500 * s.players[src.p].guardians.length }),
    destroyed: { if: (s, f) => s.players[f.p].guardians.length > 0, run: (s, it) => {
      const a = choose(s, it, 't', 'ガーディアン1体を墓地に置いて、破壊を取り消す（任意）', guardians(s, it.p, 'me'), 0);
      if (!a?.length) return;
      const m = self(s, it); if (!m?.inst.destroyed) return;
      toGraveBy(s, it, a[0]); m.inst.destroyed = false; log(s, '破壊を取り消した', it.p);
    } },
  },
  '1-36': { trig: [{ on: 'enter', shippitsu: true, opt: 'そのハイケイを魔力ゾーンに置く？', if: (s, f, ev) => haikeiEntered(s, f, ev) && s.tf.haikeis === 2, run: (s, it) => toMana(s, it, it.ev.uid) }] },
  '1-37': { rules: { guardianTapped: () => true } },
  '1-38': {
    play: { level: (s, p, l) => (list(s, p, 'me', 'field', (f) => def(f.inst).type === 'ijin').length ? l : 2) },
    trig: [{ on: 'enter', shippitsu: true, once: true, opt: 'そのハイケイをガーディアンにする？', if: haikeiEntered, run: (s, it) => toGuard(s, it, it.ev.uid) }],
  },
  '1-39': { aura: [{ to: (s, src, t) => (t.zone === 'field' && ['ijin', 'haikei'].includes(def(t.inst).type) ? { traits: ['音楽'] } : null) }] },
  '1-40': {
    trig: [{ on: 'enter', shippitsu: true, if: haikeiEntered, run: (s, it) => drawN(s, it, 1) }],
    self: (s, src) => ({ power: 1000 * s.players[src.p].field.filter((c) => def(c).type === 'haikei').length }),
  },
  '1-41': { rules: { noGraveToField: (s, src, owner, by) => by === opp(src.p) && musicNames(s) >= 2 } },
  '1-42': { attack: { voyage: true, run: (s, it) => {
    const a = choose(s, it, 't', 'ハイケイ1つを手札に戻して、このターン「ダブルプレッシャー」を得る（任意）', haikeis(s, it.p, 'me'), 0);
    if (!a?.length) return;
    toHand(s, it, a[0]); grantTmp(s, it.src, { press: 2 });
  } } },
  '1-43': {
    enter: (s, it) => {
      const cols = availableColors(s, it.p);
      const a = choose(s, it, 't', '魔力ゾーンに置くイジンを選ぶ（任意）', ijins(s, it.p, 'both', (f) => [...stat(s, f.inst, f).colors].some((c) => cols.has(c))), 0);
      if (a?.length) toMana(s, it, a[0]);
    },
    trig: [{ on: 'enter', shippitsu: true, if: haikeiEntered, run: (s, it) => {
      const a = choose(s, it, 't', '手札に戻す魔力ゾーンのカードを選ぶ（任意）', mana(s, it.p, 'both'), 0);
      if (a?.length) toHand(s, it, a[0]);
    } }],
  },
  '1-44': { rules: { graveLock: (s, src, f, to, by) => to === 'hand' && by === opp(src.p) && musicNames(s) >= 3 } },
  '1-45': {
    enter: (s, it) => { addRight(s, it.p, 'summon'); const n = s.players[it.p].field.filter((c) => def(c).type === 'haikei').length; if (n) drawN(s, it, n); },
    aura: [{ to: (s, src, t) => (mine(src, t) && def(t.inst).type === 'haikei' ? { kw: { noDestroy: true } } : null) }],
  },
  '1-46': { aura: [{ to: (s, src, t) => {
    if (!mine(src, t) || !ijinT(t)) return null;
    const ken = def(t.inst).level <= 2 || stat(s, t.inst, t).traits.has('剣術');
    return ken ? { traits: ['剣術'], kw: { sokuo: true } } : null;
  } }] },
  '1-47': { trig: [{ on: 'attackDeclared', if: (s, f, ev) => ev.p === f.p && ev.attackers.length >= 3, run: (s, it) => {
    const a = choose(s, it, 't', '「イジンにブロックされない」を与えるアタッカーを選ぶ（任意）', s.battle?.attackers || [], 0);
    if (a?.length) grantTmp(s, a[0], { unblock: [{ by: 'ijin' }] });
  } }] },
  '1-48': { aura: [{ to: (s, src, t) => (t.p === src.p && t.zone === 'guardians' && s.turn === src.p ? { types: ['ijin'], setPower: 3000, kw: { sokuo: true } } : null) }] },
  '1-49': { trig: [{ on: 'startEnd', mine: true, run: (s, it) => addRight(s, it.p, 'mana') }] },
  '1-50': { rules: { guardWard: (s, src, d, ap) => d === src.p && ap <= 4000 } },
  '1-51': { mainStart: (s, it) => {
    const a = choose(s, it, 't', '墓地の遺業を持つハイケイを戦場に置く（任意）', grave(s, it.p, 'me', (f) => D(f).type === 'haikei' && !!D(f).legacy), 0);
    if (a?.length) toField(s, it, a[0]);
  } },
  '1-52': { mahou: {
    can: (s, p) => (ijins(s, p, 'me').length && ijins(s, p).length ? null : '自分と相手のイジンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 'a', '破壊する自分のイジンを選ぶ', ijins(s, it.p, 'me')); if (!a) return;
      const b = choose(s, it, 'b', '破壊する相手のイジンを選ぶ', ijins(s, it.p)); if (!b) return;
      kill(s, it, [...a, ...b]);
    },
  } },
  '1-53': { mahou: {
    can: (s, p) => (ijins(s, p, 'me').length ? null : '自分のイジンが必要です'),
    run: (s, it) => { const a = choose(s, it, 't', '「イジンにブロックされない」を与えるイジンを選ぶ', ijins(s, it.p, 'me')); if (a?.length) grantTmp(s, a[0], { unblock: [{ by: 'ijin' }] }); },
  } },
  '1-54': { mahou: { run: (s, it) => {
    tmpFlag(s, 'loseAtEnd', it.p);
    for (const f of ijins(s, it.p, 'me')) untap(s, f.inst.uid);
    s.battlesLeft++;
    log(s, '追加でバトルできる（エンドフェイズに敗北）', it.p);
  } } },
  '1-55': { mahou: {
    can: (s, p) => (ijins(s, p, 'both').length ? null : 'イジンが必要です'),
    run: (s, it) => { const a = choose(s, it, 't', '手札に戻すイジンを選ぶ', ijins(s, it.p, 'both')); if (a?.length) toHand(s, it, a[0]); },
  } },
  '1-56': { mahou: {
    can: (s, p) => (revivalOpts(s, p).length ? null : '対象のカードが墓地にありません'),
    run: (s, it) => {
      const a = choose(s, it, 't', '手札に戻すカードを選ぶ', revivalOpts(s, it.p)); if (!a?.length) return;
      if (ijins(s, it.p, 'me', (f) => trait(s, f, '美術')).length) {
        const ok = may(s, it, 'f', '手札に戻す代わりに戦場に置く？'); if (ok === undefined) return;
        if (ok) return void toField(s, it, a[0]);
      }
      toHand(s, it, a[0]);
    },
  } },
  '1-57': { mahou: {
    can: (s, p) => (ijins(s, p).length ? null : '相手のイジンが必要です'),
    run: (s, it) => { const a = choose(s, it, 't', '魔力ゾーンに置く相手のイジンを選ぶ', ijins(s, it.p)); if (a?.length) toMana(s, it, a[0]); },
  } },
  '1-58': drawOnMana(),
  '1-59': { equip: equipBuff({ atk: 2000 }) },
  '1-60': { equip: equipBuff({ traits: ['剣術'], atk: 1000 }) },
  '1-62': drawOnMana(),
  '1-63': { equip: equipBuff({ blk: 2000 }) },
  '1-64': { equip: { from: 'mana', ok: (s, p, ijin) => !!def(ijin).kw.voyage, trig: [{ on: 'destroyed', self: true, if: (s, f) => faceUpMaryoku(s, f.p).length > 0, opt: 'マリョク1つを墓地に置いて、破壊を取り消す？', run: (s, it) => {
    const m = self(s, it); if (!m?.inst.destroyed) return;
    const pay = faceUpMaryoku(s, it.p)[0]; if (!pay) return;
    toGraveBy(s, it, pay.uid); m.inst.destroyed = false; log(s, '羅針盤：破壊を取り消した', it.p);
  } }] } },
  '1-66': drawOnMana(),
  '1-67': { equip: equipBuff({ power: 1000 }) },
  '1-68': { equip: { from: 'mana', ok: (s, p, ijin) => !!def(ijin).kw.shippitsu, rules: { manaLevel: (s, src, p) => (p === src.p ? 2 : 0) } } },
  '1-70': { attack: (s, it) => { const a = choose(s, it, 't', '破壊する自分のイジンを選ぶ', ijins(s, it.p, 'me')); if (a?.length) kill(s, it, a); } },
  '1-71': { attack: { if: (s, f) => s.players[f.p].hand.some((c) => def(c).type === 'mahou'), opt: '手札のマホウを見せて「パワー5000以上のイジンにブロックされない」を得る？', run: (s, it) => grantTmp(s, it.src, { unblock: [{ by: 'ijin', powerMin: 5000 }] }) } },
  '1-72': { trig: [{ on: 'destroyed', if: (s, f, ev) => ev.p !== f.p && ev.zone === 'field' && ev.types.includes('ijin'), run: (s, it) => drawN(s, it, 1) }] },
  '1-73': { rules: { enterTapped: (s, src, f) => f.p !== src.p && def(f.inst).type === 'ijin' } },
  '1-74': { self: (s, src) => ({ atk: 1000 * s.players[opp(src.p)].mana.filter((m) => !m.faceUp).length }) },
  '1-75': { enter: { if: (s, f) => s.players[f.p].field.filter((c) => def(c).type === 'ijin').length <= 2, run: (s, it) => { drawN(s, it, 1); addRight(s, it.p, 'summon'); } } },
  '1-76': {
    self: (s, src) => ({ power: 1000 * s.players[src.p].grave.filter((c) => def(c).traits.includes('美術')).length }),
    attack: { if: (s, f) => power(s, f.p, f.inst) >= 7000, run: (s, it) => untap(s, it.src) },
  },
  '1-78': { enter: { if: (s, f) => s.players[f.p].hand.some((c) => def(c).type === 'haikei'), opt: '手札のハイケイを見せて1ドローする？', run: (s, it) => drawN(s, it, 1) } },
  '1-79': {
    attack: { voyage: true, opt: '山札の上から1枚を魔力ゾーンに置く？', run: (s, it) => topToMana(s, it.p) },
    self: (s, src) => (s.players[src.p].mana.length >= 6 ? { press: 2 } : null),
  },
  '1-80': { trig: [{ on: 'voyage', run: (s, it) => { const a = choose(s, it, 't', '魔力ゾーンに置く相手のガーディアンを選ぶ', guardians(s, it.p)); if (a?.length) toMana(s, it, a[0]); } }] },
});

function revivalOpts(s, p) {
  return grave(s, p, 'me', (f) => (D(f).type === 'ijin' && lv(f) <= 6) || (D(f).type === 'haikei' && lv(f) <= 5));
}
