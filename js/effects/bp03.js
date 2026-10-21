// 第3弾ブースター
import {
  register, def, opp, pw, lv, D, ijins, haikeis, fieldCards, guardians, grave, hand, mana, ofType, hasCol, trait,
  choose, may, kill, toHand, toTop, toBottom, toMana, toGuard, toGraveBy, toField, drawN, discardN, once, log, addRight, flipManaCost,
  untap, tap, topToMana, topToGuardian, addTmp, grantTmp, tmpFlag, findOnBoard, list, stat, power, isIjin, mill, discard, shuffle,
  faceUpMaryoku, chobo, kikki, shippitsu, choice, enteredF, fieldColors, pick, emit, move, draw, removeAttacker, E, TRIG, ALL_COLORS,
} from './lib.js';
import { drawOnMana, pushAbort } from './starters.js';

const self = (s, it) => findOnBoard(s, it.src);
const mine = (src, t) => t.p === src.p && t.zone === 'field';
const ijinT = (t) => t.zone === 'field' && def(t.inst).type === 'ijin';
const myIjin = (s, f, ev) => { const e = enteredF(s, ev); return ev.p === f.p && e?.zone === 'field' && isIjin(s, e.inst, e) ? e : null; };
const anyIjin = (s, ev) => { const e = enteredF(s, ev); return e?.zone === 'field' && isIjin(s, e.inst, e) ? e : null; };
const auraOn = (s, f) => ({ ...f });
const killUnder = (lim, who = 'opp') => (s, it) => {
  const a = choose(s, it, 't', `破壊する${who === 'opp' ? '相手の' : ''}イジンを選ぶ（パワー${lim}以下）`, ijins(s, it.p, who, (f) => pw(s, f) <= lim));
  if (a?.length) kill(s, it, a);
};
const auraEquip = (color, g) => ({ from: 'grave', grant: (s, h) => (stat(s, h.inst, { ...h, zone: 'hand' }).colors.has(color) || def(h.inst).colors.includes(color) ? g : null) });
const oraMahou = (color, g) => ({ meisoOnUse: true, mahou: { run: (s, it) => drawN(s, it, 1) }, equip: auraEquip(color, g) });
const seed = () => ({ trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp, run: (s, it) => topToMana(s, it.p) }] });

// 「航海」の能力を、アタッカーになったとき以外にも発動させる
function fireVoyage(s, p, uid) {
  const f = findOnBoard(s, uid);
  if (!f || f.zone !== 'field') return;
  const keys = [...(E[f.inst.id]?.trig || []).map((t) => t.key), ...stat(s, f.inst, f).trig].filter((k) => TRIG[k]?.voyage && TRIG[k].on === 'attack');
  s.queue.unshift(...keys.map((key) => ({ k: 'trig', key, p, src: uid, zone: 'field', ev: { uid, p } })));
}

register({
  '3-1': {
    self: (s, src) => ((src.inst.equips || []).length >= 2 ? { press: 2, atk: 4000 } : null),
    trig: [{ on: 'enter', if: (s, f, ev) => { const e = anyIjin(s, ev); return !!e && stat(s, e.inst, e).traits.has('剣術'); }, run: killUnder(2000) }],
  },
  '3-2': { trig: [
    { on: 'manaLeave', if: (s, f, ev) => ev.p === f.p && ev.by != null, run: killUnder(3000) },
    { on: 'toMana', once: true, if: (s, f, ev) => ev.p === f.p && !ev.faceUp, run: (s, it) => drawN(s, it, 1) },
  ] },
  '3-3': {
    mainStart: { if: (s, f) => faceUpMaryoku(s, f.p).length > 0, opt: 'マリョク1つを墓地に置いて、このターン「航海」を戦場に置かれたときにも発動させる？', run: (s, it) => { toGraveBy(s, it, faceUpMaryoku(s, it.p)[0].uid); tmpFlag(s, 'voyageOnEnter', it.p); } },
    trig: [{ on: 'enter', if: (s, f, ev) => ev.p === f.p && s.tmp.some((t) => t.flag === 'voyageOnEnter' && t.p === f.p), run: (s, it) => fireVoyage(s, it.p, it.ev.uid) }],
  },
  '3-4': {
    rules: { noKikki: () => true },
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && def(t.inst).traits.includes('思想') && ijins(s, src.p, 'opp', (f) => !f.inst.tapped).length ? { press: 2 } : null) }],
  },
  '3-5': { trig: [shippitsu((s, it) => {
    const a = choose(s, it, 't', 'イジン1体を選ぶ（緑か「思想」なら起こして+3000、それ以外は寝かせる）', ijins(s, it.p, 'both'));
    if (!a?.length) return;
    const f = findOnBoard(s, a[0]);
    if (hasCol(s, f, 'green') || trait(s, f, '思想')) { untap(s, a[0]); grantTmp(s, a[0], { power: 3000 }); } else tap(s, a[0]);
  }, { once: true, opt: '徳川光圀：能力を使う？', if: (s, f, ev, e) => hasCol(s, e, 'green') })] },
  '3-6': {
    play: {
      reduce: (s, p, inst) => s.players[p].hand.filter((c) => c.uid !== inst.uid && def(c).type === 'haikei').length,
      payReduce: (s, it, have, need) => {
        const a = pick(s, it, 'red', { title: `墓地に置くハイケイを${need - have}つ選ぶ（1つにつきレベル-1）`, options: s.players[it.p].hand.filter((c) => c.uid !== it.uid && def(c).type === 'haikei').map((c) => c.uid), min: need - have, max: need - have });
        if (!a) return undefined;
        a.forEach((u) => move(s, u, 'grave', { by: it.p }));
        s.tmp.push({ until: s.turnNo, flag: 'lvdown', p: it.p, id: '3-6', n: a.length });
        return a;
      },
      level: (s, p, l) => l - s.tmp.filter((t) => t.flag === 'lvdown' && t.p === p && t.id === '3-6').reduce((x, t) => x + t.n, 0),
    },
    enter: (s, it) => { for (const f of fieldCards(s, it.p, 'both', (f) => trait(s, f, '美術') && lv(f) <= 6)) toHand(s, it, f.inst.uid); addRight(s, it.p, 'summon'); },
  },
  '3-7': {
    aura: [{ to: (s, src, t) => (ijinT(t) && def(t.inst).colors.includes('yellow') ? { trig: ['3-7@tk'] } : null) }],
    grants: { tk: { on: 'tap', self: true, run: (s, it) => { const a = choose(s, it, 't', '破壊するパワー4000以下のイジンを選ぶ', ijins(s, it.p, 'both', (f) => pw(s, f) <= 4000)); if (a?.length) kill(s, it, a); } } },
    trig: [shippitsu((s, it) => addTmp(s, { src: '3-7', aura: 'y' }))],
    tmpAura: { y: (s, t, tgt) => (ijinT(tgt) ? { colors: ['yellow'] } : null) },
  },
  '3-8': {
    play: { level: (s, p, l) => l - list(s, p, 'both', 'field', (f) => def(f.inst).type === 'ijin' && stat(s, f.inst, f).kw.shippitsu).length },
    trig: [shippitsu((s, it) => { const a = choose(s, it, 't', '山札の下に戻す相手のイジンを選ぶ', ijins(s, it.p)); if (a?.length) toBottom(s, it, a[0]); })],
  },
  '3-9': hijikata(),
  '3-81': hijikata(),
  '3-10': { trig: [{ on: 'rights', if: (s, f, ev) => ev.p !== f.p, run: (s, it) => {
    if (it.ev.kind === 'mana') mill(s, opp(it.p), 1); else discardN(s, it, 'x', opp(it.p), 1, opp(it.p));
  } }] },
  '3-11': { enter: (s, it) => drawN(s, it, 1) },
  '3-12': { enter: { if: (s, f) => s.players[f.p].mana.some((m) => !m.faceUp), run: (s, it) => {
    const a = choose(s, it, 't', '裏のカード1つを手札に戻して、パワー3000以下の相手のイジンを破壊する（任意）', mana(s, it.p, 'me', (f) => !f.inst.faceUp), 0);
    if (!a?.length) return;
    once(it, 'x', () => toHand(s, it, a[0]));
    killUnder(3000)(s, it);
  } } },
  '3-13': { enter: { if: (s, f) => s.players[f.p].mana.some((m) => m.faceUp), run: (s, it) => {
    const a = choose(s, it, 't', 'マリョク1つを裏にして、相手のパワー1000以下のイジンかハイケイを破壊する（任意）', [...ijins(s, it.p, 'opp', (f) => pw(s, f) <= 1000), ...haikeis(s, it.p)], 0);
    if (!a?.length) return;
    flipManaCost(s, it.p); kill(s, it, a);
  } } },
  '3-14': { enter: { if: (s, f) => s.players[f.p].mana.some((m) => !m.faceUp), run: (s, it) => {
    const a = choose(s, it, 't', '裏のカード1つを手札に戻して、マリョク配置権+1（任意）', mana(s, it.p, 'me', (f) => !f.inst.faceUp), 0);
    if (!a?.length) return;
    toHand(s, it, a[0]); addRight(s, it.p, 'mana');
  } } },
  '3-15': {
    trig: [{ on: 'attackDeclared', if: (s, f, ev) => ev.p === f.p && ev.attackers.length === 1, run: (s, it) => {
      const a = choose(s, it, 't', '破壊するハイケイを選ぶ（3つまで・任意）', haikeis(s, it.p, 'both'), 0, 3);
      if (a?.length) kill(s, it, a);
    } }],
    rules: { graveLock: (s, src, f) => f.p !== src.p && def(f.inst).type === 'haikei' && s.players[src.p].mana.length >= 5 },
  },
  '3-16': { aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && def(t.inst).kw.atk ? { kw: { sokuo: true } } : null) }] },
  '3-17': {
    play: { level: (s, p, l) => l - s.players[opp(p)].field.length },
    trig: [kikki((s, it) => {
      const a = choose(s, it, 't', '山札の上に戻すガーディアンを選ぶ', guardians(s, it.p, 'me'));
      if (!a?.length) return;
      toTop(s, it, a[0]); kill(s, it, haikeis(s, it.p, 'both').map((f) => f.inst.uid));
    })],
  },
  '3-18': {
    play: { level: (s, p, l) => l - faceUpMaryoku(s, opp(p)).length },
    rules: { noManaRight: () => true },
  },
  '3-19': { self: (s, src) => ({ ...(!(src.inst.equips || []).length ? { kw: { cannotBlock: true } } : {}), blk: 1000 * list(s, 0, 'both', 'field', (f) => def(f.inst).type === 'ijin' && def(f.inst).traits.includes('剣術')).length }) },
  '3-20': { attack: { voyage: true, run: (s, it) => { const a = choose(s, it, 't', '手札に戻すイジンかハイケイを選ぶ', fieldCards(s, it.p, 'both')); if (a?.length) toHand(s, it, a[0]); } } },
  '3-22': { trig: [chobo((s, it) => {
    const a = choose(s, it, 't', '手札のパワー2000以下のイジンを戦場に置いて1ドロー（任意）', hand(s, it.p, 'me', (f) => D(f).type === 'ijin' && (D(f).power || 0) <= 2000), 0);
    if (!a?.length) return;
    toField(s, it, a[0]); drawN(s, it, 1);
  })] },
  '3-23': {
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && (t.inst.equips || []).length ? { trig: ['3-23@sv'] } : null) }],
    grants: { sv: { on: 'destroyed', self: true, if: (s, f) => faceUpMaryoku(s, f.p).length > 0, opt: 'マリョク1つを手札に戻して、破壊を取り消す？', run: (s, it) => {
      const m = self(s, it); if (!m?.inst.destroyed) return;
      toHand(s, it, faceUpMaryoku(s, it.p)[0].uid); m.inst.destroyed = false;
    } } },
  },
  '3-24': { trig: [{ on: 'leave', once: true, if: (s, f, ev) => ev.p === f.p && ev.by != null && def(findOnBoard(s, ev.uid)?.inst || { id: 'R-1' }).kw.voyage, run: (s, it) => {
    const a = choose(s, it, 't', '手札のレベル3以下の青のイジンを戦場に置く（任意）', hand(s, it.p, 'me', (f) => D(f).type === 'ijin' && lv(f) <= 3 && D(f).colors.includes('blue')), 0);
    if (a?.length) toField(s, it, a[0]);
  } }] },
  '3-25': { attack: { voyage: true, run: (s, it) => {
    const a = choose(s, it, 't', '相手の魔力ゾーンの裏のカードと、これを手札に戻す（任意）', mana(s, it.p, 'opp', (f) => !f.inst.faceUp), 0);
    if (!a?.length) return;
    toHand(s, it, a[0]); toHand(s, it, it.src);
  } } },
  '3-26': {
    attack: { voyage: true, run: (s, it) => { for (const u of s.battle?.attackers || []) { const f = findOnBoard(s, u); if (f && stat(s, f.inst, f).blk) grantTmp(s, u, { trig: ['3-26@gb'] }); } } },
    grants: { gb: { on: 'blocked', self: true, if: (s, f, ev) => ev.blockers.some((u) => findOnBoard(s, u)?.zone === 'guardians'), run: (s, it) => untap(s, it.src) } },
  },
  '3-27': {
    trig: [shippitsu((s, it) => { const a = choose(s, it, 't', '「美術」「音楽」を与えるイジンを選ぶ（任意）', ijins(s, it.p, 'both'), 0); if (a?.length) grantTmp(s, a[0], { traits: ['美術', '音楽'] }); })],
    destroyed: (s, it) => { for (const f of ijins(s, it.p, 'both', (f) => f.inst.uid !== it.src && (trait(s, f, '美術') || trait(s, f, '音楽')))) toMana(s, it, f.inst.uid); },
  },
  '3-28': { trig: [shippitsu((s, it) => { drawN(s, it, 1); toMana(s, it, it.src); }, { if: (s, f, ev, e) => hasCol(s, e, 'green') })] },
  '3-29': { trig: [
    { on: 'untap', opt: '山札の上から1枚を魔力ゾーンに置く？', if: (s, f, ev) => ev.p === f.p && ev.byAbility, run: (s, it) => topToMana(s, it.p) },
    { on: 'tap', if: (s, f, ev) => ev.p === f.p && ev.byAbility, run: (s, it) => { const a = choose(s, it, 't', '手札に戻す魔力ゾーンのカードを選ぶ（任意）', mana(s, it.p), 0); if (a?.length) toHand(s, it, a[0]); } },
  ] },
  '3-30': { trig: [{ on: 'enter', shippitsu: true, opt: 'これを寝かせて、山札の上から1枚を魔力ゾーンに置く？', if: (s, f, ev) => { const e = enteredF(s, ev); return !f.inst.tapped && !!e && e.zone === 'field' && (def(e.inst).type === 'haikei' || (isIjin(s, e.inst, e) && trait(s, e, '美術'))); }, run: (s, it) => { if (tap(s, it.src)) topToMana(s, it.p); } }] },
  '3-31': {
    strip: (s, src, t) => t.zone === 'field' && def(t.inst).type === 'haikei',
    trig: [{ on: 'enter', shippitsu: true, opt: 'これを寝かせて、ハイケイをパワー7000のイジンにする？', if: (s, f, ev) => { const e = enteredF(s, ev); return !f.inst.tapped && !!e && e.zone === 'field' && (def(e.inst).type === 'haikei' || (isIjin(s, e.inst, e) && hasCol(s, e, 'green'))); }, run: (s, it) => { if (tap(s, it.src)) addTmp(s, { src: '3-31', aura: 'h', p: it.p }); } }],
    tmpAura: { h: (s, t, tgt) => (tgt.zone === 'field' && tgt.p === t.p && def(tgt.inst).type === 'haikei' ? { types: ['ijin'], setPower: 7000 } : null) },
  },
  '3-32': { mainStart: { if: (s, f) => power(s, f.p, f.inst) >= 3000, run: (s, it) => addRight(s, it.p, 'mana') } },
  '3-33': { trig: [{ on: 'blockStart', theirs: true, if: (s, f) => s.players[f.p].mana.length > 0, run: (s, it) => {
    const a = choose(s, it, 't', '魔力ゾーンのカード1つを墓地に置いて、自分の戦場のカードをすべて起こす（任意）', mana(s, it.p), 0);
    if (!a?.length) return;
    toGraveBy(s, it, a[0]);
    for (const c of [...s.players[it.p].field, ...s.players[it.p].guardians]) untap(s, c.uid);
  } }] },
  '3-34': { trig: [{ on: 'enter', opt: 'これを寝かせて、イジン召喚権+1する？', if: (s, f, ev) => { const e = myIjin(s, f, ev); return !!e && !f.inst.tapped && stat(s, e.inst, e).kw.shippitsu; }, run: (s, it) => { if (tap(s, it.src)) addRight(s, it.p, 'summon'); } }] },
  '3-35': {
    enter: (s, it) => { const a = choose(s, it, 't', '山札の下に戻すハイケイか装備カードを選ぶ（任意）', [...haikeis(s, it.p, 'both'), ...list(s, it.p, 'both', 'equip')], 0); if (a?.length) toBottom(s, it, a[0]); },
    endStart: (s, it) => toBottom(s, it, it.src),
  },
  '3-36': { enter: (s, it) => {
    const a = choose(s, it, 't', '山札の下に戻す手札を選ぶ', hand(s, it.p));
    if (!a) return;
    once(it, 'x', () => { if (a[0]) toBottom(s, it, a[0]); drawN(s, it, 1); });
  } },
  '3-37': {
    aura: [{ to: (s, src, t) => (mine(src, t) && def(t.inst).type === 'haikei' ? { traits: ['美術'] } : null) }],
    enter: (s, it) => {
      const a = choose(s, it, 't', '「美術」ハイケイを山札の上に戻して、イジン召喚権+1（任意）', haikeis(s, it.p, 'both', (f) => trait(s, f, '美術')), 0);
      if (!a?.length) return;
      toTop(s, it, a[0]); addRight(s, it.p, 'summon');
    },
  },
  '3-38': { enter: (s, it) => {
    const n = s.players[it.p].guardians.length;
    if (!n) return;
    const a = choose(s, it, 't', `山札の下に戻すイジンを${n}体選ぶ`, ijins(s, it.p, 'both'), n, n);
    if (a) a.forEach((u) => toBottom(s, it, u));
  } },
  '3-39': {
    trig: [{ on: 'destroyed', opt: '破壊されたイジンを山札の下に戻す？', if: (s, f, ev) => ev.uid !== f.inst.uid && ev.zone === 'field' && ev.types.includes('ijin'), run: (s, it) => { const f = findOnBoard(s, it.ev.uid); if (f?.inst.destroyed) f.inst.toBottom = true; } }],
    mainStart: (s, it) => {
      const pl = s.players[it.p];
      const bottom = pl.deck.slice(-2);
      if (!bottom.length) return;
      const a = pick(s, it, 't', { title: '戦場に置くレベル7以下のイジンを選ぶ（残りは手札へ）', options: bottom.filter((c) => def(c).type === 'ijin' && def(c).level <= 7).map((c) => c.uid), min: 0, max: 2, ask: true });
      if (!a) return;
      once(it, 'x', () => bottom.forEach((c) => (a.includes(c.uid) ? toField(s, it, c.uid) : move(s, c.uid, 'hand', { by: it.p }))));
    },
  },
  '3-40': { trig: [{ on: 'enter', opt: '戦場の他のイジンすべてを寝かせて、これを山札の下に戻す？', if: (s, f, ev) => { const e = anyIjin(s, ev); return !!e && lv(e) >= 6 && e.inst.uid !== f.inst.uid; }, run: (s, it) => {
    for (const f of ijins(s, it.p, 'both', (f) => f.inst.uid !== it.src)) tap(s, f.inst.uid);
    toBottom(s, it, it.src);
  } }] },
  '3-41': {
    enter: (s, it) => { for (const f of ijins(s, it.p, 'opp', (x) => x.inst.tapped)) toBottom(s, it, f.inst.uid); },
    trig: [{ on: 'toDeck', once: true, opt: '山札の下から1枚を手札に加える？', run: (s, it) => { const c = s.players[it.p].deck[s.players[it.p].deck.length - 1]; if (c) move(s, c.uid, 'hand', { by: it.p }); } }],
  },
  '3-42': { rules: { summonByMana: (s, src, p) => p === src.p, manaBySummon: (s, src, p) => p === src.p } },
  '3-43': { enter: (s, it) => {
    if (discardN(s, it, 'a', opp(it.p), 1, opp(it.p)) === undefined) return;
    discardN(s, it, 'b', it.p, 1);
  } },
  '3-44': { trig: [{ on: 'enter', opt: '1ドローする（相手も1ドロー）？', if: (s, f, ev) => { const e = myIjin(s, f, ev); return !!e && trait(s, e, '医術'); }, run: (s, it) => { drawN(s, it, 1); draw(s, opp(it.p), 1, { zone: 'field' }); } }] },
  '3-45': { enter: { opt: '自分のガーディアンすべてを手札に戻す？', run: (s, it) => {
    once(it, 'g', () => { for (const g of [...s.players[it.p].guardians]) toHand(s, it, g.uid); });
    const a = choose(s, it, 't', 'ガーディアンにする手札を選ぶ（任意）', hand(s, it.p), 0);
    if (a?.length) toGuard(s, it, a[0]);
  } } },
  '3-46': {
    enter: { opt: '自分のガーディアンすべてを墓地に置く？', run: (s, it) => { for (const g of [...s.players[it.p].guardians]) toGraveBy(s, it, g.uid); } },
    self: (s, src) => (!s.players[src.p].guardians.length ? { kw: { sokuo: true }, press: 2, traits: ['剣術'] } : null),
  },
  '3-47': { trig: [{ on: 'draw', if: (s, f, ev) => ev.p !== f.p && ev.byAbility && ev.zone === 'field', run: (s, it) => discardN(s, it, 'x', opp(it.p), 1, opp(it.p)) }] },
  '3-48': {
    trig: [{ on: 'toGrave', self: true, zones: ['grave'], if: (s, f, ev) => ev.from === 'hand', run: (s, it) => toField(s, it, it.src) }],
    attack: { voyage: true, run: (s, it) => {
      const a = choose(s, it, 't', '表を見る裏のカードを選ぶ（2つまで・任意）', [...guardians(s, it.p, 'both'), ...mana(s, it.p, 'both', (f) => !f.inst.faceUp)], 0, 2);
      if (a?.length) pick(s, it, 'see', { title: 'カードの表', options: a, info: true, reveal: true });
    } },
  },
  '3-49': {
    trig: [{ on: 'attack', self: true, voyage: true, opt: 'ハリス：能力を使う？', run: harris }, { on: 'enter', self: true, opt: 'ハリス：能力を使う？', run: (s, it) => { once(it, 'v', () => emit(s, 'voyage', { uid: it.src, p: it.p })); harris(s, it); } }],
  },
  '3-50': { trig: [{ on: 'blockStart', theirs: true, run: (s, it) => {
    const a = choose(s, it, 't', '「志願」イジンかガーディアンとこれを破壊して、相手のターンを終わらせる（任意）', [...ijins(s, it.p, 'me', (f) => trait(s, f, '志願') && f.inst.uid !== it.src), ...guardians(s, it.p, 'me')], 0);
    if (!a?.length) return;
    kill(s, it, [a[0], it.src]); pushAbort(s);
  } }] },
  '3-51': {
    aura: [{ to: (s, src, t) => (t.p === src.p && ((t.zone === 'field' && def(t.inst).kw.atk) || t.zone === 'guardians') ? { kw: { noLeaveAbility: true } } : null) }],
    destroyed: (s, it) => drawN(s, it, 3),
  },
  '3-52': {
    rules: { manaLock: (s, src, f) => f.p === src.p },
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && s.players[src.p].mana.length >= 5 ? { atk: 2000 } : null) }],
  },
  '3-53': {
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) ? { ...(def(t.inst).kw.blk ? { kw: { noDestroyAbility: true } } : {}), ...(def(t.inst).level <= 3 ? { blk: 1000 } : {}) } : null) }],
    rules: { guardianNoDestroy: (s, src, f) => f.p === src.p },
  },
  '3-54': { endStart: (s, it) => {
    const a = choose(s, it, 't', 'イジン1体を手札に戻して1ドロー（任意）', ijins(s, it.p, 'me'), 0);
    if (!a?.length) return;
    toHand(s, it, a[0]); drawN(s, it, 1);
  } },
  '3-55': { trig: [{ on: 'mainStart', run: (s, it) => {
    const a = choose(s, it, 't', '寝かせるイジンを選ぶ（そのプレイヤーが1ドロー・任意）', ijins(s, it.p, 'both', (f) => !f.inst.tapped && (hasCol(s, f, 'green') || stat(s, f.inst, f).kw.voyage)), 0);
    if (!a?.length) return;
    const owner = findOnBoard(s, a[0]).p;
    tap(s, a[0]); draw(s, owner, 1, { zone: 'field' });
  } }] },
  '3-56': {
    rules: { kodamaPlus: (s, src, p) => p === src.p && ijins(s, src.p, 'me', (f) => trait(s, f, '思想')).length > 0 },
    trig: [shippitsu((s, it) => addTmp(s, { src: '3-56', aura: 't', p: it.p }))],
    tmpAura: { t: (s, t, tgt) => (tgt.zone === 'field' && tgt.p === t.p && def(tgt.inst).type === 'ijin' ? { traits: ['思想'] } : null) },
  },
  '3-57': { enter: { if: (s, f) => list(s, f.p, 'me', 'field', (x) => hasCol(s, x, 'yellow') && trait(s, x, '美術')).length >= 3, opt: '山札の上と下から1枚ずつ魔力ゾーンに置く？', run: (s, it) => {
    const pl = s.players[it.p];
    topToMana(s, it.p);
    const b = pl.deck[pl.deck.length - 1];
    if (b) move(s, b.uid, 'mana', { by: it.p });
  } } },
  '3-58': {
    enter: (s, it) => {
      const a = choose(s, it, 't', '「執筆」を持つイジンを手札に戻して、イジン召喚権+1（任意）', ijins(s, it.p, 'me', (f) => stat(s, f.inst, f).kw.shippitsu), 0);
      if (!a?.length) return;
      toHand(s, it, a[0]); addRight(s, it.p, 'summon');
    },
    rules: { noShippitsu: (s, src, f) => s.turn !== src.p && !stat(s, f.inst, f).colors.has('yellow') },
  },
  '3-59': {
    rules: { noLegacy: (s, src, p, d) => d.legacy !== 'meifu' },
    trig: [{ on: 'toGrave', discards: true, if: (s, f, ev) => (ev.from === 'field' || ev.from === 'guardians') && def(findOnBoard(s, ev.uid)?.inst || { id: 'R-11' }).legacy !== 'meifu', run: (s, it) => discardN(s, it, 'x', it.ev.p, 1, it.ev.p) }],
  },
  '3-60': {
    enter: { if: (s, f) => s.players[f.p].hand.length > 0 && haikeis(s, f.p).length > 0, run: (s, it) => {
      const a = choose(s, it, 'h', '手札1枚を墓地に置いて、相手のハイケイを破壊する（任意）', hand(s, it.p), 0);
      if (!a?.length) return;
      once(it, 'd', () => discard(s, a[0], it.p));
      const b = choose(s, it, 't', '破壊する相手のハイケイを選ぶ', haikeis(s, it.p));
      if (b?.length) kill(s, it, b);
    } },
    equip: { from: 'field', ok: (s, p, ijin) => def(ijin).colors.includes('purple'), grant: () => ({ kw: { voyage: true } }), trig: [{ on: 'attack', self: true, voyage: true, run: (s, it) => {
      const a = choose(s, it, 'a', '手札に戻す自分のガーディアンを選ぶ', guardians(s, it.p, 'me'));
      if (!a?.length) return;
      const b = choose(s, it, 'b', '手札に戻す相手のガーディアンを選ぶ', guardians(s, it.p));
      if (!b) return;
      toHand(s, it, a[0]); if (b[0]) toHand(s, it, b[0]);
    } }] },
  },
  '3-61': {
    mahou: { run: (s, it) => {
      kill(s, it, [...ijins(s, it.p, 'opp', (f) => pw(s, f) <= 4000), ...haikeis(s, it.p)].map((f) => f.inst.uid));
      addTmp(s, { src: '3-61', rule: 'nl', p: opp(it.p) });
    } },
    tmpRules: { nl: (s, t, key, p, d) => key === 'noLegacy' && p === t.p && d.legacy !== 'meifu' },
  },
  '3-62': oraMahou('red', { atk: 4000 }),
  '3-63': {
    play: { level: (s, p, l) => l - (s.players[p].hand.length - 1) },
    mahou: { run: (s, it) => {
      const pl = s.players[it.p];
      for (const c of [...pl.hand]) move(s, c.uid, 'deckTop', { by: it.p, silent: true });
      shuffle(s, pl.deck); drawN(s, it, 7); tmpFlag(s, 'noMahou', it.p);
    } },
  },
  '3-64': oraMahou('blue', { blk: 4000 }),
  '3-65': { mahou: { run: (s, it) => {
    const c = s.players[it.p].deck[0];
    if (!c) return;
    if (['haikei', 'mahou'].includes(def(c).type)) {
      const ok = may(s, it, 'h', `山札の上の「${def(c).name}」を手札に加える？（いいえなら魔力ゾーンへ）`);
      if (ok === undefined) return;
      if (ok) return void move(s, c.uid, 'hand', { by: it.p });
    }
    topToMana(s, it.p);
  } } },
  '3-66': oraMahou('green', { power: 3000 }),
  '3-67': { mahou: {
    can: (s, p) => (ijins(s, p, 'both', (f) => stat(s, f.inst, f).press >= 2).length ? null : '『プレッシャー』を持つイジンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '『プレッシャー』を持つイジンを選ぶ', ijins(s, it.p, 'both', (f) => stat(s, f.inst, f).press >= 2));
      if (!a?.length) return;
      if (s.battle?.attackers.includes(a[0])) toBottom(s, it, a[0]); else tap(s, a[0]);
    },
  } },
  '3-68': oraMahou('yellow', { kw: { watcher: true }, blk: 2000 }),
  '3-69': { mahou: { run: (s, it) => {
    const a = choice(s, it, 'c', 'どちらかを選ぶ', { 'L:me': '自分の山札の上から2枚を墓地へ', 'L:op': '相手の山札の上から2枚を墓地へ' });
    if (!a) return;
    once(it, 'm', () => mill(s, a[0] === 'L:me' ? it.p : opp(it.p), 2));
    const b = choose(s, it, 't', '手札に戻す墓地のイジンを選ぶ', grave(s, it.p, 'me', ofType('ijin')));
    if (b?.length) toHand(s, it, b[0]);
  } } },
  '3-70': oraMahou('purple', { press: 2, atk: 2000 }),
  '3-71': seed(), '3-72': seed(), '3-73': seed(), '3-74': seed(), '3-75': seed(),
  '3-76': { equip: { from: 'mana', grant: (s, h) => ({ traits: ['志願'], ...(!s.players[h.p].guardians.length ? { kw: { sokuo: true }, press: 2 } : {}) }) } },
  '3-77': { trig: [{ on: 'blockStart', theirs: true, zones: ['mana'], faceDown: true, if: (s, f) => !f.inst.faceUp, run: (s, it) => {
    const a = choose(s, it, 't', '遁甲盤を表にして、アタッカーでない状態にするアタッカーを選ぶ（任意）', s.battle?.attackers || [], 0);
    if (!a?.length) return;
    const f = self(s, it); if (f) f.inst.faceUp = true;
    removeAttacker(s, a[0]);
  } }] },
  '3-78': {
    trig: [{ on: 'mainStart', mine: true, zones: ['mana'], run: (s, it) => {
      const a = choose(s, it, 't', '手札のレベル3以下のイジンを戦場に置いて、これを墓地に置く（任意）', hand(s, it.p, 'me', (f) => D(f).type === 'ijin' && lv(f) <= 3), 0);
      if (!a?.length) return;
      toField(s, it, a[0]); toGraveBy(s, it, it.src);
    } }],
    equip: { from: 'grave', grant: () => ({ colors: ALL_COLORS }) },
  },
  '3-79': { equip: { from: 'mana', trig: [{ on: 'enter', self: true, run: (s, it) => drawN(s, it, 1) }] } },
});

function hijikata() {
  return { trig: [
    { on: 'enter', self: true, run: (s, it) => {
      const n = ijins(s, it.p, 'me', (f) => trait(s, f, '志願')).length + s.players[it.p].guardians.length;
      if (!n) return;
      const a = choice(s, it, 'c', `${n}枚ドローするのはどちら？`, { 'L:me': '自分がドロー', 'L:op': '相手がドロー' });
      if (!a) return;
      if (a[0] === 'L:me') drawN(s, it, n); else draw(s, opp(it.p), n, { zone: 'field' });
    } },
    { on: 'enter', self: true, if: (s, f) => !s.players[f.p].guardians.length, run: (s, it) => addRight(s, it.p, 'summon', 2) },
  ] };
}

function harris(s, it) {
  const a = choose(s, it, 't', '手札に戻す自分のガーディアンを選ぶ', guardians(s, it.p, 'me'));
  if (!a?.length) return;
  once(it, 'x', () => toHand(s, it, a[0]));
  const ok = may(s, it, 'g', '山札の上から1枚をガーディアンにする？');
  if (ok) topToGuardian(s, it.p, 1);
}
