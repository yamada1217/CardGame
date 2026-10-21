// 第5弾（2nd1-）
import {
  register, def, opp, pw, lv, D, ijins, haikeis, fieldCards, guardians, grave, hand, mana, ofType, hasCol, trait,
  choose, may, kill, toHand, toTop, toBottom, toMana, toGuard, toGraveBy, toField, drawN, discardN, once, log, addRight, flipManaCost,
  untap, tap, topToMana, topToGuardian, addTmp, grantTmp, tmpFlag, findOnBoard, list, stat, power, isIjin, mill, discard, shuffle,
  faceUpMaryoku, shippitsu, choice, enteredF, fieldColors, pick, move, draw, levelSum, isStone, stones, availableColors, E, ALL_COLORS,
} from './lib.js';
import { drawOnMana } from './starters.js';

const self = (s, it) => findOnBoard(s, it.src);
const mine = (src, t) => t.p === src.p && t.zone === 'field';
const ijinT = (t) => t.zone === 'field' && def(t.inst).type === 'ijin';
const downMana = (s, p, who = 'opp') => mana(s, p, who, (f) => !f.inst.faceUp);
const killWhere = (title, pred, who = 'opp') => (s, it) => { const a = choose(s, it, 't', title, ijins(s, it.p, who, (f) => pred(s, f))); if (a?.length) kill(s, it, a); };
const destroyedIjin = (who) => (s, f, ev) => (who === 'me' ? ev.p === f.p : true) && ev.zone === 'field' && ev.types.includes('ijin');
const kachidoki = (s, f) => stat(s, f.inst, f).kw.kachidoki;
const pillar = () => ({ ruleZones: ['mana'], rules: { noFieldTrig: () => true, noMahou: (s, src, p) => p === src.p } });
const shingen = () => ({ self: (s, src) => (ijins(s, src.p, 'me', (f) => kachidoki(s, f)).length >= 2 ? { press: 4 } : null) });
const victoria = () => ({ enter: { opt: 'ヴィクトリア女王：能力を使う？', run: (s, it) => {
  const a = choice(s, it, 'c', 'ヴィクトリア女王：どちらかを選ぶ', { 'L:i': '相手のパワー1000以下のイジンすべてを破壊', 'L:h': '相手のハイケイすべてを破壊' });
  if (!a) return;
  kill(s, it, (a[0] === 'L:i' ? ijins(s, it.p, 'opp', (f) => pw(s, f) <= 1000) : haikeis(s, it.p)).map((f) => f.inst.uid));
} } });
const okada = {
  self: (s, src) => ({ power: 2000 * s.players[opp(src.p)].grave.filter((c) => def(c).type === 'ijin').length }),
  tap: { if: (s, f) => power(s, f.p, f.inst) >= 6000, run: (s, it) => {
    const a = choose(s, it, 't', '破壊するイジンかガーディアンを選ぶ', [...ijins(s, it.p, 'both'), ...guardians(s, it.p, 'both')]);
    if (a?.length) kill(s, it, a);
  } },
};

register({
  '2nd1-1': shingen(), '2nd1-110': shingen(),
  '2nd1-2': victoria(), '2nd1-111': victoria(),
  '2nd1-3': { trig: [{ on: 'destroyed', opt: '相手のガーディアンすべてを寝かせる？', if: destroyedIjin('me'), run: (s, it) => { for (const g of guardians(s, it.p)) tap(s, g.inst.uid); } }] },
  '2nd1-4': { self: () => ({ unblock: [{ by: 'ijin', color: 'red' }, { by: 'ijin', color: 'blue' }] }) },
  '2nd1-5': { strip: (s, src, t) => t.zone === 'field' && def(t.inst).type === 'ijin' && !def(t.inst).colors.includes('green') },
  '2nd1-6': { mainStart: { opt: '相手のパワー4000以下のイジンを魔力ゾーンへ、自分のイジンを手札に戻す？', run: (s, it) => {
    for (const f of ijins(s, it.p, 'opp', (x) => pw(s, x) <= 4000)) toMana(s, it, f.inst.uid);
    for (const f of ijins(s, it.p, 'me')) toHand(s, it, f.inst.uid);
  } } },
  '2nd1-8': { rules: { noPlay: (s, src, p, inst, d) => p !== src.p && ['mahou', 'haikei'].includes(d.type) && s.tf.mh[p] >= 1 } },
  '2nd1-9': {
    endStart: (s, it) => {
      const a = choose(s, it, 't', '破壊する自分のガーディアンを選ぶ', guardians(s, it.p, 'me'));
      if (!a) return;
      once(it, 'x', () => { kill(s, it, a); drawN(s, it, 3); });
    },
    self: (s, src) => (s.players[opp(src.p)].hand.length >= 4 ? { press: 2 } : null),
  },
  '2nd1-10': { trig: [{ on: 'toGrave', once: true, if: (s, f, ev) => def(findOnBoard(s, ev.uid)?.inst || { id: 'R-1' }).type === 'haikei', run: (s, it) => {
    const a = choose(s, it, 't', '手札に戻すガーディアンを選ぶ（3体まで・任意）', guardians(s, it.p, 'both'), 0, 3);
    if (a) a.forEach((u) => toHand(s, it, u));
  } }] },
  '2nd1-12': { enter: killWhere('破壊する相手のパワー1000以下のイジンを選ぶ', (s, f) => pw(s, f) <= 1000) },
  '2nd1-14': { destroyed: (s, it) => {
    const a = choose(s, it, 't', '手札のレベル6以下の「即応」イジンを戦場に置く（任意）', hand(s, it.p, 'me', (f) => D(f).type === 'ijin' && lv(f) <= 6 && D(f).kw.sokuo), 0);
    if (a?.length) toField(s, it, a[0]);
  } },
  '2nd1-15': { win: (s, it) => { const a = choose(s, it, 't', '手札に戻す墓地のマホウを選ぶ', grave(s, it.p, 'me', ofType('mahou'))); if (a?.length) toHand(s, it, a[0]); } },
  '2nd1-16': { enter: { if: (s, f) => availableColors(s, f.p).size >= 3, run: (s, it) => kill(s, it, fieldCards(s, it.p, 'opp', (f) => lv(f) <= 4).map((f) => f.inst.uid)) } },
  '2nd1-17': { win: (s, it) => kill(s, it, ijins(s, it.p, 'both', (f) => !trait(s, f, '剣術')).map((f) => f.inst.uid)) },
  '2nd1-18': { strip: (s, src, t) => !src.inst.tapped && t.p !== src.p && t.zone === 'field' && def(t.inst).type === 'haikei' },
  '2nd1-19': { attack: (s, it) => {
    const n = s.battle?.attackers.length || 1;
    const opts = haikeis(s, it.p);
    const a = choose(s, it, 't', `破壊する相手のハイケイを選ぶ（${n}つまで）`, opts, Math.min(n, opts.length), n);
    if (a) kill(s, it, a);
  } },
  '2nd1-20': { rules: { noLegacy: (s, src, p, d) => s.turn === src.p && p !== src.p && d.legacy !== 'meifu' } },
  '2nd1-21': {
    trig: [{ on: 'mainStart', if: (s, f) => s.players[f.p].mana.some((m) => m.faceUp), opt: 'マリョク1つを裏にして、このターン相手の「執筆」を止める？', run: (s, it) => { flipManaCost(s, it.p); addTmp(s, { src: '2nd1-21', rule: 'ns', p: opp(it.p) }); } }],
    tmpRules: { ns: (s, t, key, f) => key === 'noShippitsu' && f.p === t.p },
    self: (s, src) => (s.turn !== src.p ? { power: 2000 } : null),
  },
  '2nd1-22': { aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && def(t.inst).kw.voyage ? { kw: { sokuo: true } } : null) }] },
  '2nd1-23': { attack: { voyage: true, run: (s, it) => { const a = choose(s, it, 't', 'ガーディアンにする魔力ゾーンの裏のカードを選ぶ', downMana(s, it.p, 'me')); if (a?.length) toGuard(s, it, a[0]); } } },
  '2nd1-24': { attack: { voyage: true, run: (s, it) => { const a = choose(s, it, 't', '寝かせる相手のイジンを選ぶ', ijins(s, it.p, 'opp', (f) => !f.inst.tapped)); if (a?.length) tap(s, a[0]); } } },
  '2nd1-25': { trig: [{ on: 'attack', if: (s, f, ev) => { const a = findOnBoard(s, ev.uid); return ev.p === f.p && a && isIjin(s, a.inst, a) && hasCol(s, a, 'blue'); }, run: (s, it) => {
    const a = findOnBoard(s, it.ev.uid); if (!a) return;
    const lim = power(s, a.p, a.inst, 'atk');
    for (const f of ijins(s, it.p, 'opp', (x) => pw(s, x) < lim)) tap(s, f.inst.uid);
  } }] },
  '2nd1-26': { trig: [shippitsu((s, it) => {
    const h = enteredF(s, it.ev); if (!h) return;
    const cols = stat(s, h.inst, h).colors;
    const a = choose(s, it, 't', 'ハイケイと同じ色のイジンを手札に戻す（任意）', ijins(s, it.p, 'both', (f) => [...stat(s, f.inst, f).colors].some((c) => cols.has(c))), 0);
    if (a?.length) toHand(s, it, a[0]);
  })] },
  '2nd1-27': { blocked: { opt: 'イジン召喚権+1して、これとブロッカーを手札に戻す？', run: (s, it) => {
    addRight(s, it.p, 'summon');
    const bl = [...(s.battle?.blocks[it.src] || [])];
    toHand(s, it, it.src); bl.forEach((u) => toHand(s, it, u));
  } } },
  '2nd1-28': { enter: (s, it) => {
    const a = choose(s, it, 't', '相手の手札からマホウを墓地に置く（2つまで）', hand(s, it.p, 'opp', ofType('mahou')), 0, 2);
    if (a) once(it, 'x', () => a.forEach((u) => discard(s, u, it.p)));
  } },
  '2nd1-29': { attack: { voyage: true, run: (s, it) => discardN(s, it, 'x', opp(it.p), 1, opp(it.p)) } },
  '2nd1-31': { enter: (s, it) => topToMana(s, it.p) },
  '2nd1-32': { rules: { manaLevel: (s, src, p) => (p === src.p ? s.players[p].mana.filter((m) => !m.faceUp).length : 0) } },
  '2nd1-33': { trig: [shippitsu((s, it) => topToMana(s, it.p, 2), { once: true, opt: '山札の上から2枚を魔力ゾーンに置く？' })] },
  '2nd1-34': { enter: { if: (s, f) => s.players[opp(f.p)].mana.filter((m) => !m.faceUp).length >= 2, run: (s, it) => addRight(s, it.p, 'summon', 2) } },
  '2nd1-35': { trig: [shippitsu((s, it) => drawN(s, it, 1), { opt: '1ドローする？' })] },
  '2nd1-36': { self: (s, src) => (s.players[opp(src.p)].mana.some((m) => !m.faceUp) ? { press: 2 } : null) },
  '2nd1-37': { enter: (s, it) => {
    const a = choose(s, it, 't', '魔力ゾーンに置く相手のイジンかハイケイを選ぶ（任意）', fieldCards(s, it.p), 0);
    if (!a?.length) return;
    toMana(s, it, a[0]); addRight(s, it.p, 'summon');
  } },
  '2nd1-38': { strip: (s, src, t) => t.p !== src.p && t.zone === 'field' && def(t.inst).type === 'ijin' && !t.inst.tapped && s.players[t.p].mana.some((m) => !m.faceUp) },
  '2nd1-39': { attack: { voyage: true, run: (s, it) => {
    const a = choose(s, it, 't', 'ハイケイ1つを手札に戻し、イジン全員にダブルプレッシャー（任意）', haikeis(s, it.p, 'me'), 0);
    if (!a?.length) return;
    toHand(s, it, a[0]);
    for (const f of ijins(s, it.p, 'me')) grantTmp(s, f.inst.uid, { press: 2 });
  } } },
  '2nd1-41': { destroyed: (s, it) => { const a = choose(s, it, 't', '破壊するハイケイを選ぶ（任意）', haikeis(s, it.p, 'both'), 0); if (a?.length) kill(s, it, a); } },
  '2nd1-42': { rules: { noManaRight: () => true } },
  '2nd1-43': { enter: { if: (s, f) => !ijins(s, f.p, 'me', (x) => x.inst.uid !== f.inst.uid).length, run: (s, it) => addRight(s, it.p, 'summon') } },
  '2nd1-45': { trig: [shippitsu((s, it) => {
    const a = choose(s, it, 't', '手札に戻す墓地の黄のマホウを選ぶ（任意）', grave(s, it.p, 'me', (f) => D(f).type === 'mahou' && D(f).colors.includes('yellow')), 0);
    if (a?.length) toHand(s, it, a[0]);
  })] },
  '2nd1-47': { rules: { loserToBottom: (s, src, f) => f.inst.uid === src.inst.uid && ijins(s, src.p, 'me', (x) => stat(s, x.inst, x).kw.drain).length > 0 } },
  '2nd1-48': { rules: { manaLevel: (s, src, p) => (p === src.p && stones(s, p).length ? 2 : 0) } },
  '2nd1-49': { enter: (s, it) => {
    const a = choose(s, it, 't', '戦場に置く『ストーン』マリョクを選ぶ（2つまで・任意）', mana(s, it.p, 'me', (f) => f.inst.faceUp && isStone(f.inst)), 0, 2);
    if (a) a.forEach((u) => toGuard(s, it, u));
  } },
  '2nd1-50': { aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && def(t.inst).kw.watcher ? { unblock: [{ by: 'ijin', levelMax: 5 }] } : null) }] },
  '2nd1-51': { self: (s, src) => (s.players[opp(src.p)].hand.length >= 3 ? { kw: { drain: true }, power: 3000 } : null) },
  '2nd1-52': { tap: { opt: '山札の上から1枚ずつ墓地に置く？', run: (s, it) => {
    const a = once(it, 'm', () => [mill(s, it.p, 1)[0]?.id || null, mill(s, opp(it.p), 1)[0]?.id || null]);
    const la = a[0] ? def({ id: a[0] }).level : -1, lb = a[1] ? def({ id: a[1] }).level : -1;
    if (la === lb) return;
    const q = la > lb ? it.p : opp(it.p);
    const b = choose(s, it, 't', '手札に戻すガーディアンを選ぶ', guardians(s, q, 'me'));
    if (b?.length) toHand(s, it, b[0]);
  } } },
  '2nd1-53': { destroyed: { if: (s, f) => grave(s, f.p, 'me', ofType('mahou')).length > 0, run: (s, it) => {
    const a = choose(s, it, 't', '墓地のマホウを手札に戻して、破壊を取り消す（2つまで・任意）', grave(s, it.p, 'me', ofType('mahou')), 0, 2);
    if (!a?.length) return;
    const m = self(s, it); if (!m?.inst.destroyed) return;
    a.forEach((u) => toHand(s, it, u)); m.inst.destroyed = false;
  } } },
  '2nd1-54': { self: (s, src) => (s.turn === src.p ? { kw: { drain: true } } : null) },
  '2nd1-55': { enter: (s, it) => { const a = choose(s, it, 't', '手札に戻すガーディアンを選ぶ', guardians(s, it.p, 'me')); if (a?.length) toHand(s, it, a[0]); } },
  '2nd1-56': { destroyed: (s, it) => mill(s, opp(it.p), 4) },
  '2nd1-57': { endStart: { if: (s, f) => s.players[f.p].guardians.length >= 2, run: (s, it) => {
    const a = choose(s, it, 't', '破壊するイジンを選ぶ', ijins(s, it.p, 'both', (f) => f.inst.uid !== it.src));
    if (!a) return;
    kill(s, it, [it.src, ...a]);
  } } },
  '2nd1-58': { rules: { noPlay: (s, src, p, inst, d) => p !== src.p && [...s.players[0].grave, ...s.players[1].grave].some((c) => def(c).name === d.name) } },
  '2nd1-59': okada,
  '2nd1-60': { enter: (s, it) => {
    const a = choose(s, it, 't', '表を見る裏のカードを選ぶ', guardians(s, it.p, 'both'));
    if (a?.length) pick(s, it, 'see', { title: 'カードの表', options: a, info: true, reveal: true });
  } },
  '2nd1-61': {
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && stat(s, t.inst, t).traits.has('剣術') ? { kw: { kachidoki: true }, trig: ['2nd1-61@k'] } : null) }],
    grants: { k: { on: 'win', self: true, run: (s, it) => { drawN(s, it, 1); addRight(s, it.p, 'summon'); } } },
  },
  '2nd1-62': { trig: [{ on: 'endStart', theirs: true, if: (s, f) => s.players[f.p].hand.length >= 2, opt: '手札2つを山札の下に戻して1ドローする？', run: (s, it) => {
    const a = choose(s, it, 't', '山札の下に戻す手札を2つ選ぶ', hand(s, it.p), 2, 2);
    if (!a) return;
    once(it, 'x', () => { a.forEach((u) => toBottom(s, it, u)); drawN(s, it, 1); });
  } }] },
  '2nd1-63': { trig: [{ on: 'destroyed', opt: '破壊されているイジンすべてを魔力ゾーンに置く？', if: (s, f, ev) => destroyedIjin('me')(s, f, ev) && ev.colors.includes('red'), run: (s, it) => {
    for (const f of ijins(s, it.p, 'me', (x) => x.inst.destroyed)) toMana(s, it, f.inst.uid);
  } }] },
  '2nd1-64': { rules: { playLevel: (s, src, p, inst, d) => (p === src.p && d.type === 'ijin' && (d.kw.double || d.kw.triple || d.kw.quad) ? -ijins(s, p, 'both').length : 0) } },
  '2nd1-65': { rules: {
    mahouCost: (s) => (grave(s, 0, 'both', ofType('mahou')).length >= 2 ? 1 : 0),
    graveLock: (s, src, f) => def(f.inst).type === 'mahou',
  } },
  '2nd1-66': { mainStart: (s, it) => {
    const a = choose(s, it, 't', '破壊して2ドローする自分のイジンを選ぶ（任意）', ijins(s, it.p, 'me'), 0);
    if (!a?.length) return;
    once(it, 'x', () => { kill(s, it, a); drawN(s, it, 2); });
  } },
  '2nd1-67': { rules: { noBounce: (s, src, f) => f.zone === 'field' && def(f.inst).type === 'ijin' } },
  '2nd1-68': { rules: { beikoku: (s, src, p) => p === src.p } },
  '2nd1-69': {
    trig: [{ on: 'tap', if: (s, f, ev) => { const t = findOnBoard(s, ev.uid); return ev.p === f.p && t?.zone === 'field' && isIjin(s, t.inst, t); }, run: (s, it) => {
      const a = choose(s, it, 't', '起こす寝ているイジンを選ぶ（任意）', ijins(s, it.p, 'me', (f) => f.inst.tapped), 0);
      if (a?.length) untap(s, a[0]);
    } }],
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) ? { power: 1000 } : null) }],
  },
  '2nd1-70': { trig: [{ on: 'deckEmpty', zones: ['field', 'grave'], opt: '精霊の島々：手札を山札に戻し、相手の手札すべてを墓地に置く？', if: (s, f, ev) => ev.p === f.p, run: (s, it) => {
    const pl = s.players[it.p];
    for (const c of [...pl.hand]) move(s, c.uid, 'deckTop', { by: it.p, silent: true });
    shuffle(s, pl.deck);
    for (const c of [...s.players[opp(it.p)].hand]) discard(s, c.uid, it.p);
  } }] },
  '2nd1-71': {
    trig: [
      { on: 'endStart', theirs: true, opt: '山札の上から1枚を墓地に置く？', run: (s, it) => mill(s, it.p, 1) },
      { on: 'toGrave', zones: ['field', 'grave'], if: (s, f, ev) => ev.p === f.p && s.turn !== f.p && ev.from === 'deck' && !!def(findOnBoard(s, ev.uid)?.inst || { id: 'R-1' }).legacy, run: (s, it) => s.queue.unshift({ k: 'legacy', p: it.p, src: it.ev.uid }) },
    ],
  },
  '2nd1-72': { ruleZones: ['field', 'grave'], rules: { manaFromGrave: (s, src, p) => p === src.p } },
  '2nd1-73': {
    mainStart: { opt: '擬洋風建築：能力を使う？', run: (s, it) => {
      const a = choice(s, it, 'c', 'どちらかを選ぶ', { 'L:s': 'イジン召喚権+1', 'L:m': 'マリョク配置権+1' });
      if (a) addRight(s, it.p, a[0] === 'L:s' ? 'summon' : 'mana');
    } },
    endStart: { if: (s) => !s.rights.summon && !s.rights.mana, run: (s, it) => kill(s, it, it.src) },
  },
  '2nd1-74': {
    endStart: (s, it) => { const a = choose(s, it, 't', '破壊する自分のイジンを選ぶ（任意）', ijins(s, it.p, 'me'), 0); if (a?.length) kill(s, it, a); },
    trig: [{ on: 'destroyed', opt: '相手の山札の上から1枚を墓地に置く？', if: destroyedIjin('me'), run: (s, it) => mill(s, opp(it.p), 1) }],
  },
  '2nd1-75': { rules: { drawPlus: () => 1 } },
  '2nd1-76': { mahou: {
    can: (s, p) => (ijins(s, p).length ? null : '相手のイジンが必要です'),
    run: killWhere('破壊する相手のイジンを選ぶ', () => true),
  } },
  '2nd1-77': { mahou: {
    can: (s, p, inst) => (s.players[p].hand.some((c) => c.uid !== inst?.uid && def(c).type === 'ijin' && def(c).level <= 5) ? null : '手札にレベル5以下のイジンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '戦場に置くイジンを選ぶ', hand(s, it.p, 'me', (f) => D(f).type === 'ijin' && lv(f) <= 5));
      if (!a?.length) return;
      toField(s, it, a[0]); grantTmp(s, a[0], { kw: { sokuo: true } });
    },
  } },
  '2nd1-78': { mahou: {
    can: (s, p) => (royOpts(s, p).length ? null : '自分の剣術イジンかガーディアンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '墓地に置く剣術イジンかガーディアンを選ぶ', royOpts(s, it.p));
      if (!a?.length) return;
      once(it, 'x', () => { toGraveBy(s, it, a[0]); drawN(s, it, 3); });
    },
  } },
  '2nd1-79': { mahou: {
    can: (s, p) => (mana(s, p, 'opp', (f) => f.inst.faceUp && D(f).type === 'maryoku').length ? null : '相手の表向きマリョクが必要です'),
    run: (s, it) => { const a = choose(s, it, 't', '裏にする相手のマリョクを選ぶ', mana(s, it.p, 'opp', (f) => f.inst.faceUp && D(f).type === 'maryoku')); if (a?.length) findOnBoard(s, a[0]).inst.faceUp = false; },
  } },
  '2nd1-80': { mahou: {
    can: (s, p) => (ijins(s, p, 'both').length ? null : 'イジンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', 'イジンを選ぶ（寝ていれば山札の上、起きていれば手札へ）', ijins(s, it.p, 'both'));
      if (!a?.length) return;
      if (findOnBoard(s, a[0]).inst.tapped) toTop(s, it, a[0]); else toHand(s, it, a[0]);
    },
  } },
  '2nd1-81': { mahou: { run: (s, it) => drawN(s, it, 2) } },
  '2nd1-82': { mahou: { run: (s, it) => { for (const f of ijins(s, it.p, 'opp', (x) => x.inst.tapped)) toMana(s, it, f.inst.uid); } } },
  '2nd1-83': { mahou: {
    can: (s, p, inst) => (s.players[p].hand.some((c) => c.uid !== inst?.uid) ? null : '手札が必要です'),
    run: (s, it) => { const a = choose(s, it, 't', '魔力ゾーンに置く手札を選ぶ', hand(s, it.p), 1, 99); if (a) a.forEach((u) => toMana(s, it, u)); },
  } },
  '2nd1-84': { mahou: { run: (s, it) => { for (const g of [...s.players[it.p].guardians]) toHand(s, it, g.uid); topToGuardian(s, it.p, 1); } } },
  '2nd1-85': { mahou: { run: (s, it) => { for (const f of ijins(s, it.p, 'opp', (x) => !D(x).legacy)) toBottom(s, it, f.inst.uid); } } },
  '2nd1-86': { mahou: { run: (s, it) => {
    once(it, 'm', () => mill(s, it.p, 5));
    const L = levelSum(s, it.p);
    const a = choose(s, it, 't', `墓地のレベル${L}以下のイジンかハイケイを戦場に置く`, grave(s, it.p, 'me', (f) => ['ijin', 'haikei'].includes(D(f).type) && lv(f) <= L));
    if (a?.length) toField(s, it, a[0]);
  } } },
  '2nd1-87': { mahou: {
    can: (s, p, inst) => ([p, opp(p)].some((q) => s.players[q].grave.filter((c) => def(c).type !== 'maryoku').length >= 3) ? null : '墓地にマリョクでないカードが3つ必要です'),
    run: (s, it) => {
      const ok = (q) => grave(s, q, 'me', (f) => D(f).type !== 'maryoku' && f.inst.uid !== it.src);
      const opts = {}; if (ok(it.p).length >= 3) opts['L:me'] = '自分の墓地'; if (ok(opp(it.p)).length >= 3) opts['L:op'] = '相手の墓地';
      if (!Object.keys(opts).length) return;
      const w = choice(s, it, 'w', 'どちらの墓地から選ぶ？', opts); if (!w) return;
      const a = choose(s, it, 't', '山札の下に戻すカードを選ぶ（3つ以上）', ok(w[0] === 'L:me' ? it.p : opp(it.p)), 3, 99);
      if (!a) return;
      once(it, 'x', () => { a.forEach((u) => toBottom(s, it, u)); drawN(s, it, 1); });
    },
  } },
  '2nd1-88': { mahou: { run: (s, it) => {
    const sum = (q) => s.players[q].hand.reduce((t, c) => t + def(c).level, 0);
    const a = sum(it.p), b = sum(opp(it.p));
    log(s, `ショーダウン：自分${a}・相手${b}`, it.p);
    if (a === b) return;
    const q = a < b ? it.p : opp(it.p);
    for (const c of [...s.players[q].hand]) discard(s, c.uid, it.p);
  } } },
  '2nd1-89': { mahou: { run: (s, it) => {
    const n = [0, 1].reduce((t, q) => t + [...s.players[q].field, ...s.players[q].guardians].filter((c) => c.tapped).length, 0);
    if (n) mill(s, opp(it.p), 3 * n);
  } } },
  '2nd1-90': { mahou: { run: (s, it) => {
    const a = [...guardians(s, it.p), ...downMana(s, it.p)];
    if (a.length) pick(s, it, 'see', { title: '相手の裏のカード', options: a, info: true, reveal: true });
  } } },
  '2nd1-101': pillar(), '2nd1-102': pillar(), '2nd1-103': pillar(), '2nd1-104': pillar(), '2nd1-105': pillar(),
  '2nd1-106': {
    trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp, run: (s, it) => {
      const lab = Object.fromEntries(ALL_COLORS.map((c) => [`L:${c}`, { red: '赤', blue: '青', green: '緑', yellow: '黄', purple: '紫' }[c]]));
      const a = choice(s, it, 'c', 'チャルカ：このターン得る色を選ぶ', lab);
      if (a) addTmp(s, { src: '2nd1-106', aura: 'c', target: it.src, color: a[0].slice(2) });
    } }],
    tmpAura: { c: (s, t, tgt) => (tgt.inst.uid === t.target && tgt.zone === 'mana' ? { colors: [t.color] } : null) },
  },
  '2nd1-107': { ruleZones: ['mana'], rules: {
    cannotAttack: (s, src, f) => def(f.inst).level < 5,
    cannotBlock: (s, src, f) => def(f.inst).level < 5,
  } },
  '2nd1-108': { trig: [{ on: 'endStart', theirs: true, zones: ['mana'], opt: '2ドローして、これを山札の上に戻す？', run: (s, it) => { drawN(s, it, 2, 'mana'); toTop(s, it, it.src); } }] },
  '2nd1-109': { trig: [{ on: 'toMana', zones: ['mana'], if: (s, f, ev) => ev.p === f.p && ev.faceUp && ev.uid !== f.inst.uid && isStone(findOnBoard(s, ev.uid)?.inst || { id: 'R-1' }), run: (s, it) => drawN(s, it, 1, 'mana') }] },
});

function royOpts(s, p) {
  return [...ijins(s, p, 'me', (f) => trait(s, f, '剣術')), ...guardians(s, p, 'me')];
}
