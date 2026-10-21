// 第2弾ブースター
import {
  register, def, opp, pw, lv, D, ijins, haikeis, fieldCards, guardians, grave, hand, mana, ofType, hasCol, trait,
  choose, may, kill, toHand, toTop, toBottom, toMana, toGuard, toGraveBy, toField, drawN, discardN, once, log, addRight, flipManaCost,
  untap, tap, topToMana, topToGuardian, addTmp, grantTmp, tmpFlag, findOnBoard, list, stat, power, isIjin, mill, discard, shuffle,
  faceUpMaryoku, availableColors, chobo, kikki, shippitsu, choice, stones, enteredF, fieldColors, madou, isStone, pick, emit, rule,
  ownerOf,
} from './lib.js';
import { drawOnMana } from './starters.js';

const self = (s, it) => findOnBoard(s, it.src);
const mine = (src, t) => t.p === src.p && t.zone === 'field';
const ijinT = (t) => t.zone === 'field' && def(t.inst).type === 'ijin';
const graveN = (s) => s.players[0].grave.length + s.players[1].grave.length;
const equipFrom = (cols) => (s, p, ijin) => def(ijin).colors.some((c) => cols.includes(c));

register({
  '2-1': { trig: [kikki((s, it) => { drawN(s, it, 1); tmpFlag(s, 'mahouFree', it.p); log(s, 'このターン、手札のマホウは魔力コスト0', it.p); })] },
  '2-2': {
    self: (s, src) => (list(s, src.p, 'me', 'field', (f) => f.inst.uid !== src.inst.uid && def(f.inst).kw.voyage).length ? { power: 3000 } : null),
    trig: [chobo((s, it) => {
      const a = choose(s, it, 't', '手札か墓地のレベル5以下のイジンを戦場に置く（任意）', [...hand(s, it.p), ...grave(s, it.p)].filter((f) => D(f).type === 'ijin' && lv(f) <= 5), 0);
      if (a?.length) toField(s, it, a[0]);
    })],
  },
  '2-3': {
    self: () => ({ kw: { noSokuo: true } }),
    enter: (s, it) => { for (const g of guardians(s, it.p, 'both')) toHand(s, it, g.inst.uid); },
    strip: (s, src, t) => t.zone === 'grave' && s.turn !== src.p,
    stripZones: ['field'],
  },
  '2-4': {
    rules: { noPhaseDraw: (s, src, p) => p === src.p },
    trig: [
      { on: 'drawStart', mine: true, if: (s, f) => s.players[f.p].hand.length >= 10, run: (s, it) => winNow(s, it.p, 'アイザック・ニュートンの能力') },
      { on: 'endStart', mine: true, run: (s, it) => { const n = s.rights.summon; if (n > 0) drawN(s, it, n); } },
    ],
  },
  '2-5': {
    self: (s) => (graveN(s) >= 6 ? { kw: { noDestroy: true } } : null),
    endStart: (s, it) => { const a = choose(s, it, 't', '山札の下に戻す墓地のカードを選ぶ（任意）', grave(s, it.p, 'both', (f) => D(f).type !== 'maryoku'), 0); if (a?.length) toBottom(s, it, a[0]); },
    trig: [{ on: 'graveLeave', opt: '1ドローする？', run: (s, it) => drawN(s, it, 1) }],
  },
  '2-6': { trig: [chobo((s, it) => {
    const inGrave = it.zone === 'grave';
    const a = inGrave ? choice(s, it, 'c', 'ナポレオン：どちらかを選ぶ', { 'L:field': 'これを戦場に置く', 'L:guard': '山札の上から1枚をガーディアンに' }) : ['L:guard'];
    if (!a) return;
    if (a[0] === 'L:field') toField(s, it, it.src); else topToGuardian(s, it.p, 1);
  }, 'ナポレオン：能力を使う？')] },
  '2-7': { trig: [{ on: 'toMana', opt: '日野富子：能力を使う？', if: (s, f, ev) => ev.p === f.p && ev.faceUp && isStone(enteredF(s, ev)?.inst || { id: 'R-1' }), run: (s, it) => {
    const a = choice(s, it, 'c', '日野富子：どちらかを選ぶ', { 'L:d': '1ドロー', 'L:m': '山札の上から1枚を魔力ゾーンへ' });
    if (!a) return;
    if (a[0] === 'L:d') drawN(s, it, 1); else topToMana(s, it.p);
  } }] },
  '2-8': {
    play: { level: (s, p, l) => l - Math.max(0, ...list(s, p, 'me', 'field', (f) => def(f.inst).type === 'ijin').map(lv)) },
    enter: { opt: '追加でバトルする？', run: (s, it) => { s.battlesLeft++; log(s, '追加でバトルできる', it.p); } },
  },
  '2-9': {
    enter: (s, it) => addRight(s, it.p, 'mana'),
    trig: [kikki((s, it) => {
      const a = choice(s, it, 'c', '石田三成：どちらかを選ぶ', { 'L:d': '1ドロー', 'L:s': 'イジン召喚権+1' });
      if (!a) return;
      if (a[0] === 'L:d') drawN(s, it, 1); else addRight(s, it.p, 'summon');
    })],
  },
  '2-10': { trig: [{ on: 'attackDeclared', if: (s, f, ev) => ev.p === f.p && ev.attackers.length === 1, run: (s, it) => grantTmp(s, it.ev.attackers[0], { press: 2 }) }] },
  '2-11': { trig: [{ on: 'attackDeclared', if: (s, f, ev) => ev.p === f.p && ev.attackers.length === 1, run: (s, it) => grantTmp(s, it.ev.attackers[0], { atk: 3000 * ijins(s, it.p).length }) }] },
  '2-12': { attack: (s, it) => grantTmp(s, it.src, { unblock: [{ by: 'ijin' }], kw: { noDestroy: true } }) },
  '2-13': {
    enter: (s, it) => { const a = choose(s, it, 't', '山札の上に戻すガーディアンを選ぶ', guardians(s, it.p, 'me')); if (a?.length) toTop(s, it, a[0]); },
    destroyed: (s, it) => topToGuardian(s, it.p, 1),
  },
  '2-14': {
    attack: (s, it) => {
      const a = choose(s, it, 't', '寝かせるイジンとガーディアンを選ぶ（1体につきアタック+2000・任意）', [...ijins(s, it.p, 'me', (f) => !f.inst.tapped), ...guardians(s, it.p, 'me', (f) => !f.inst.tapped)], 0, 99);
      if (!a?.length) return;
      once(it, 'x', () => { a.forEach((u) => tap(s, u)); grantTmp(s, it.src, { atk: 2000 * a.length }); });
    },
    post: (s, src, st) => ((st.setPower ?? st.power) >= 5000 ? { press: 2 } : null),
  },
  '2-15': { self: (s, src) => (s.players[opp(src.p)].guardians.length >= 4 ? { press: 3 } : null) },
  '2-16': { aura: [{ to: (s, src, t) => {
    if (!mine(src, t) || !def(t.inst).traits.includes('思想')) return null;
    const n = fieldColors(s, src.p, 'opp').size;
    return n >= 3 ? { kw: { noDestroyAbility: true, noLeaveAbility: true } } : n >= 2 ? { kw: { noDestroyAbility: true } } : null;
  } }] },
  '2-17': { enter: (s, it) => {
    if (s.players[it.p].hand.length && discardN(s, it, 'x', it.p, 1) === undefined) return;
    const all = ijins(s, it.p, 'both');
    const top = Math.max(...all.map((f) => pw(s, f)));
    const a = choose(s, it, 't', '破壊する最もパワーの高いイジンを選ぶ', all.filter((f) => pw(s, f) === top));
    if (a?.length) kill(s, it, a);
  } },
  '2-18': {
    rules: { noFaceUpMana: (s, src, p) => p !== src.p && faceUpMaryoku(s, p).length >= 3 },
    self: (s, src) => ({ power: 1000 * faceUpMaryoku(s, opp(src.p)).length }),
  },
  '2-19': { trig: [{ on: 'destroyed', if: (s, f, ev) => ev.p === f.p && ev.zone === 'guardians' && !!s.battle?.attackers.length, run: (s, it) => {
    const a = choose(s, it, 't', '手札に戻すアタッカーを選ぶ（任意）', s.battle?.attackers || [], 0);
    if (a?.length) toHand(s, it, a[0]);
  } }] },
  '2-20': { trig: [chobo((s, it) => {
    const a = choose(s, it, 't', '相手の手札からマホウかハイケイを墓地に置く', hand(s, it.p, 'opp', (f) => ['mahou', 'haikei'].includes(D(f).type)));
    if (a?.length) once(it, 'x', () => discard(s, a[0], it.p));
  }, '洪秀全：相手の手札を見る？')] },
  '2-21': { mainStart: (s, it) => {
    const n = stones(s, it.p).length;
    if (n === 1) addRight(s, it.p, 'mana'); else if (n === 2) addRight(s, it.p, 'summon'); else if (n >= 3) drawN(s, it, 1);
  } },
  '2-22': { attack: { voyage: true, run: nichiren }, destroyed: nichiren },
  '2-23': { self: (s, src) => (list(s, src.p, 'opp', 'field', (f) => stat(s, f.inst, f).kw.sokuo && def(f.inst).type === 'ijin').length ? { blk: 4000 } : null) },
  '2-24': { attack: { voyage: true, run: (s, it) => {
    const a = choose(s, it, 't', 'これをブロックさせる相手のイジンを選ぶ（任意）', ijins(s, it.p), 0);
    if (a?.length) addTmp(s, { mustBlock: { blocker: a[0], attacker: it.src } });
  } } },
  '2-25': {
    enter: (s, it) => { const n = s.players[it.p].field.filter((c) => def(c).type === 'haikei').length; if (n) drawN(s, it, n); },
    self: (s, src) => ({ power: 500 * s.players[src.p].field.filter((c) => def(c).type === 'haikei').length }),
  },
  '2-26': { trig: [shippitsu((s, it) => { draw(s, s.turn, 1); tmpFlag(s, 'noBattle', s.turn); log(s, 'このターン、バトルできない'); }, { opt: 'ターンプレイヤーは1ドローして、このターンバトルできなくなる。使う？', if: (s) => !s.tf.battled })] },
  '2-27': {
    trig: [kikki((s, it) => addTmp(s, { src: '2-27', aura: 'stone', p: it.p }))],
    tmpAura: { stone: (s, t, tgt) => (tgt.zone === 'mana' && tgt.p === t.p && isStone(tgt.inst) ? { level: 1 } : null) },
  },
  '2-28': { enter: { if: (s) => list(s, 0, 'both', 'field', (f) => def(f.inst).type === 'ijin' && def(f.inst).colors.includes('red')).length > 0, run: (s, it) => { drawN(s, it, 1); addRight(s, it.p, 'summon'); } } },
  '2-29': { enter: { if: (s, f) => s.players[f.p].mana.some((m) => m.faceUp), opt: 'マリョク1つを裏にして、戦場の色の数だけイジン召喚権を増やす？', run: (s, it) => { flipManaCost(s, it.p); addRight(s, it.p, 'summon', fieldColors(s, it.p).size); } } },
  '2-30': {
    self: (s) => ({ power: 2000 * list(s, 0, 'both', 'field', (f) => def(f.inst).type === 'ijin' && def(f.inst).traits.includes('剣術')).length }),
    trig: [{ on: 'endStart', theirs: true, if: (s) => s.tf.battled, run: (s, it) => {
      const a = choose(s, it, 't', '魔力ゾーンに置く相手のイジンを選ぶ（任意）', ijins(s, it.p), 0);
      if (a?.length) toMana(s, it, a[0]);
    } }],
  },
  '2-31': { destroyed: (s, it) => {
    const a = choose(s, it, 't', '手札か墓地のレベル7以下の「美術」カードを戦場に置く（任意）', [...hand(s, it.p), ...grave(s, it.p)].filter((f) => D(f).traits.includes('美術') && lv(f) <= 7 && ['ijin', 'haikei'].includes(D(f).type)), 0);
    if (a?.length) toField(s, it, a[0]);
  } },
  '2-32': { trig: [
    { on: 'attack', if: (s, f, ev) => { const a = findOnBoard(s, ev.uid); return ev.p === f.p && a && hasCol(s, a, 'blue') && isIjin(s, a.inst, a); }, run: (s, it) => {
      const a = choose(s, it, 't', '破壊して1ドローするアタッカーを選ぶ（任意）', s.battle?.attackers || [], 0);
      if (!a?.length) return;
      once(it, 'x', () => { kill(s, it, a); drawN(s, it, 1); });
    } },
    chobo((s, it) => {
      const a = choose(s, it, 't', 'ガーディアンにする手札か墓地のカードを選ぶ（任意）', [...hand(s, it.p), ...grave(s, it.p).filter((f) => f.inst.uid !== it.src)], 0);
      if (a?.length) toGuard(s, it, a[0]);
    }),
  ] },
  '2-33': {
    rules: { kikki3: (s, src, p) => p === src.p },
    trig: [{ on: 'toGrave', once: true, if: (s, f, ev) => ev.p === f.p && ev.from !== 'field' && ev.from !== 'guardians' && def(enteredF(s, ev)?.inst || { id: 'R-1' }).legacy === 'meifu', run: (s, it) => s.queue.unshift({ k: 'legacy', p: it.p, src: it.ev.uid }) }],
  },
  '2-34': {
    trig: [{ on: 'untap', if: (s, f, ev) => { const a = findOnBoard(s, ev.uid); return ev.p === f.p && a?.zone === 'field' && isIjin(s, a.inst, a) && hasCol(s, a, 'green'); }, run: (s, it) => drawN(s, it, 1) }],
    rules: { tapReduce: (s, src, p) => p === src.p },
  },
  '2-35': { trig: [{ on: 'chobo', if: (s, f, ev) => ev.p === f.p, run: (s, it) => topToGuardian(s, it.p, 1) }] },
  '2-36': { trig: [{ on: 'enter', opt: '足利義政：能力を使う？', if: (s, f, ev) => { const e = enteredF(s, ev); return ev.p === f.p && e && isIjin(s, e.inst, e) && hasCol(s, e, 'red'); }, run: (s, it) => {
    const a = choice(s, it, 'c', '足利義政：どちらかを選ぶ', { 'L:d': '2ドロー', 'L:s': 'イジン召喚権+2' });
    if (!a) return;
    if (a[0] === 'L:d') drawN(s, it, 2); else addRight(s, it.p, 'summon', 2);
  } }] },
  '2-37': {
    play: { level: (s, p, l) => l - Math.max(0, ...grave(s, p, 'me', (f) => D(f).legacy === 'hangon').map(lv)) },
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && t.inst.uid !== src.inst.uid && def(t.inst).colors.includes('yellow') ? { kw: { sokuo: true, watcher: true }, power: 3000 } : null) }],
  },
  '2-38': {
    rules: { noShippitsu: (s, src, f) => f.inst.uid !== src.inst.uid },
    trig: [shippitsu((s, it) => {
      const n = list(s, 0, 'both', 'field', (f) => stat(s, f.inst, f).kw.shippitsu).length;
      const a = choose(s, it, 't', `手札に戻す相手のイジンを選ぶ（${n}体まで）`, ijins(s, it.p), 0, n);
      if (a) a.forEach((u) => toHand(s, it, u));
    })],
  },
  '2-39': {
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) ? { colors: ['yellow'] } : null) }],
    trig: [shippitsu((s, it) => drawN(s, it, 1), { if: (s) => list(s, 0, 'both', 'field', (f) => isIjin(s, f.inst, f) && hasCol(s, f, 'yellow')).length >= 3 })],
  },
  '2-40': { trig: [{ on: 'enter', if: (s, f, ev) => { const e = enteredF(s, ev); return ev.p !== f.p && e && isIjin(s, e.inst, e); }, run: (s, it) => {
    const a = choose(s, it, 't', '寝かせる「即応」を持つイジンを選ぶ（任意）', ijins(s, it.p, 'both', (f) => stat(s, f.inst, f).kw.sokuo && !f.inst.tapped), 0);
    if (a?.length) tap(s, a[0]);
  } }] },
  '2-41': { mainStart: { if: (s, f) => s.players[f.p].hand.some((c) => isStone(c)), opt: '手札の『ストーン』を見せて、マリョク配置権+1する？', run: (s, it) => addRight(s, it.p, 'mana') } },
  '2-42': {
    aura: [{ to: (s, src, t) => {
      if (!mine(src, t) || !ijinT(t)) return null;
      const g = t.inst.uid !== src.inst.uid ? { atk: 1000 } : {};
      if ((def(t.inst).power || 0) >= 3000) Object.assign(g, { kw: { voyage: true }, trig: ['2-42@vd'] });
      return g;
    } }],
    grants: { vd: { on: 'attack', self: true, voyage: true, run: (s, it) => drawN(s, it, 1) } },
  },
  '2-43': { self: (s, src) => (list(s, src.p, 'me', 'field', (f) => def(f.inst).type === 'ijin' && lv(f) >= 4).length ? { power: 2000 } : null) },
  '2-44': { self: (s, src) => (list(s, src.p, 'me', 'field', (f) => def(f.inst).type === 'ijin' && lv(f) <= 3).length ? { power: 2000, kw: { sokuo: true } } : null) },
  '2-45': {
    rules: { enterTapped: (s, src, f) => f.p !== src.p && def(f.inst).type === 'haikei' },
    strip: (s, src, t) => t.p !== src.p && t.zone === 'field' && def(t.inst).type === 'haikei' && t.inst.tapped,
  },
  '2-46': {
    enter: { if: (s, f) => s.players[f.p].hand.some((c) => import_equip(c)), run: (s, it) => {
      const a = choice(s, it, 'c', '手札の装備カードを見せて、どちらかを得る（任意）', { 'L:s': 'イジン召喚権+1', 'L:q': 'このターン「即応」', 'L:n': '使わない' });
      if (!a) return;
      if (a[0] === 'L:s') addRight(s, it.p, 'summon'); else if (a[0] === 'L:q') grantTmp(s, it.src, { kw: { sokuo: true } });
    } },
    aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && (t.inst.equips || []).length ? { unblock: [{ by: 'ijin', unequipped: true }] } : null) }],
  },
  '2-47': {
    self: (s, src) => (!s.players[src.p].grave.length ? { kw: { watcher: true } } : null),
    endStart: (s, it) => { const a = choose(s, it, 't', '山札の下に戻す墓地のカードを選ぶ（任意）', grave(s, it.p, 'both', (f) => D(f).type !== 'maryoku'), 0); if (a?.length) toBottom(s, it, a[0]); },
  },
  '2-48': { self: (s, src) => ({ ...(!s.players[src.p].grave.length ? { kw: { watcher: true } } : {}), ...(!s.players[opp(src.p)].grave.length ? { press: 3 } : {}) }) },
  '2-49': { trig: [kikki((s, it) => drawN(s, it, 1), '決起：1ドローする？')] },
  '2-50': {
    mainStart: (s, it) => {
      const a = choose(s, it, 't', '寝かせるイジンを選ぶ（1体につきイジン召喚権+1・任意）', ijins(s, it.p, 'me', (f) => !f.inst.tapped), 0, 99);
      if (!a?.length) return;
      once(it, 'x', () => { a.forEach((u) => tap(s, u)); addRight(s, it.p, 'summon', a.length); });
    },
    equip: { from: 'field', ok: equipFrom(['red', 'yellow']), grant: () => ({ kw: { attackTapped: true } }) },
  },
  '2-51': { trig: [{ on: 'attackDeclared', if: (s, f, ev) => ev.p !== f.p, run: (s, it) => {
    const a = choose(s, it, 't', 'ガーディアンにするイジンを選ぶ（任意）', ijins(s, it.p, 'me'), 0, 99);
    if (a) once(it, 'x', () => a.forEach((u) => { untap(s, u); toGuard(s, it, u); }));
  } }] },
  '2-52': {
    trig: [{ on: 'enter', if: (s, f, ev) => { const e = enteredF(s, ev); return ev.p === f.p && e && stat(s, e.inst, e).kw.voyage && isIjin(s, e.inst, e); }, run: (s, it) => addRight(s, it.p, 'summon') }],
    equip: { from: 'field', ok: equipFrom(['blue', 'yellow']), grant: () => ({ kw: { voyage: true } }), trig: [{ on: 'attack', self: true, voyage: true, run: (s, it) => {
      const a = choose(s, it, 't', '墓地のレベル3以下のイジンを戦場に置く（任意）', grave(s, it.p, 'me', (f) => D(f).type === 'ijin' && lv(f) <= 3), 0);
      if (a?.length) toField(s, it, a[0]);
    } }] },
  },
  '2-53': { aura: [{ to: (s, src, t) => (mine(src, t) && ijinT(t) && s.players[src.p].field.filter((c) => def(c).type === 'ijin').length === 2 ? { kw: { watcher: true } } : null) }] },
  '2-54': {
    endStart: { opt: '山札の上から2枚を見て、ハイケイを戦場に置く？', run: (s, it) => {
      const top = s.players[it.p].deck.slice(0, 2);
      const a = pick(s, it, 't', { title: '戦場に置くハイケイを選ぶ（残りは手札へ）', options: top.filter((c) => def(c).type === 'haikei').map((c) => c.uid), min: 0, max: 2, ask: true });
      if (!a) return;
      once(it, 'x', () => { for (const c of top) { if (a.includes(c.uid)) toField(s, it, c.uid); else move_(s, c.uid, 'hand', it.p); } });
    } },
    equip: { from: 'field', ok: equipFrom(['green', 'yellow']), grant: (s, h) => ({ kw: { sokuo: true }, power: 500 * s.players[h.p].field.filter((c) => def(c).type === 'haikei').length }) },
  },
  '2-55': {
    rules: { choboBattle: (s) => list(s, 0, 'both', 'field', (f) => stat(s, f.inst, f).traits.has('思想')).length > 0 },
    trig: [{ on: 'attackDeclared', opt: '山札の上から1枚をガーディアンにする？', if: (s, f, ev) => ev.p !== f.p && ev.attackers.length >= 4, run: (s, it) => topToGuardian(s, it.p, 1) }],
  },
  '2-56': {
    self: () => ({ colors: ['red', 'blue', 'green'] }),
    trig: [
      { on: 'endStart', mine: true, run: (s, it) => { const c = s.players[it.p].deck[0]; if (c) pick(s, it, 'see', { title: '山札の上のカード', options: [c.uid], info: true, reveal: true }); } },
      { on: 'endStart', mine: true, opt: 'このハイケイを破壊して、山札をシャッフルする？', run: (s, it) => { kill(s, it, it.src); shuffle(s, s.players[it.p].deck); } },
    ],
  },
  '2-57': { mahou: {
    can: (s, p) => (guardians(s, p, 'both').length ? null : 'ガーディアンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '破壊するガーディアンを選ぶ', guardians(s, it.p, 'both'));
      if (a?.length) kill(s, it, a, { toBottom: madou(s, it.p, 'yellow') });
    },
  } },
  '2-58': { mahou: {
    can: (s, p) => (ijins(s, p, 'me', (f) => lv(f) <= 5).length ? null : 'レベル5以下の自分のイジンが必要です'),
    run: (s, it) => { const a = choose(s, it, 't', '「即応」を与えるイジンを選ぶ', ijins(s, it.p, 'me', (f) => lv(f) <= 5)); if (a?.length) grantTmp(s, a[0], { kw: { sokuo: true } }); },
  } },
  '2-59': { mahou: { run: (s, it) => addRight(s, it.p, 'summon') } },
  '2-60': { mahou: { run: (s, it) => topToGuardian(s, it.p, 1) } },
  '2-61': { mahou: { run: (s, it) => { once(it, 'd', () => drawN(s, it, 2)); discardN(s, it, 'x', it.p, 1); } } },
  '2-62': { mahou: { run: (s, it) => { for (const f of ijins(s, it.p, 'opp', (x) => x.inst.tapped)) toHand(s, it, f.inst.uid); } } },
  '2-63': { mahou: {
    can: (s, p) => (mutOpts(s, p).length ? null : 'ガーディアンか裏向きのマリョクが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '墓地に置くカードを選ぶ', mutOpts(s, it.p));
      if (!a?.length) return;
      const d = def(findOnBoard(s, a[0]).inst);
      if (!toGraveBy(s, it, a[0])) return;
      if (d.type === 'ijin' && d.level <= 6) toField(s, it, a[0]);
    },
  } },
  '2-64': { mahou: { run: (s, it) => { for (const g of [...s.players[it.p].guardians]) toMana(s, it, g.uid); topToGuardian(s, it.p, 2); } } },
  '2-65': { mahou: { run: (s, it) => addRight(s, it.p, 'mana') } },
  '2-66': { mahou: {
    can: (s, p) => (s.players[p].guardians.length ? null : '自分のガーディアンが必要です'),
    run: (s, it) => {
      const a = choose(s, it, 't', '山札の下に戻すガーディアンを選ぶ', guardians(s, it.p, 'me'));
      if (!a?.length) return;
      toBottom(s, it, a[0]); kill(s, it, ijins(s, it.p, 'both').map((f) => f.inst.uid));
    },
  } },
  '2-67': { mahou: {
    can: (s, p) => (ijins(s, p, 'both', (f) => lv(f) <= 4).length ? null : 'レベル4以下のイジンが必要です'),
    run: (s, it) => { const a = choose(s, it, 't', '破壊するイジンを選ぶ', ijins(s, it.p, 'both', (f) => lv(f) <= 4)); if (a?.length) kill(s, it, a); },
  } },
  '2-68': { mahou: {
    can: (s, p) => (fieldCards(s, p, 'both', (f) => lv(f) <= 7).length ? null : '対象のカードがありません'),
    run: (s, it) => { const a = choose(s, it, 't', 'ガーディアンにするカードを選ぶ', fieldCards(s, it.p, 'both', (f) => lv(f) <= 7)); if (a?.length) toGuard(s, it, a[0]); },
  } },
  '2-69': { mahou: {
    can: (s, p) => (haikeis(s, p, 'both').length && fieldColors(s, p).size ? null : '対象のハイケイがありません'),
    run: (s, it) => {
      const n = fieldColors(s, it.p).size;
      const a = choose(s, it, 't', `破壊するハイケイを選ぶ（${n}つまで）`, haikeis(s, it.p, 'both'), 1, n);
      if (!a) return;
      once(it, 'x', () => { const k = kill(s, it, a).length; if (k && madou(s, it.p, 'red')) drawN(s, it, k); });
    },
  } },
  '2-70': { mahou: {
    can: (s, p) => (ijins(s, p, 'both').length && fieldColors(s, p).size ? null : '対象のイジンがありません'),
    run: (s, it) => {
      const n = fieldColors(s, it.p).size;
      const a = choose(s, it, 't', `寝かせるイジンを選ぶ（${n}体まで）`, ijins(s, it.p, 'both'), 1, n);
      if (!a) return;
      const blue = madou(s, it.p, 'blue');
      once(it, 'x', () => a.forEach((u) => { tap(s, u); if (blue) addTmp(s, { noUntap: u, until: s.turnNo + 1 }); }));
    },
  } },
  '2-71': { mahou: {
    can: (s, p) => (grave(s, p, 'both', ofType('maryoku')).length && fieldColors(s, p).size ? null : '墓地にマリョクがありません'),
    run: (s, it) => {
      const n = fieldColors(s, it.p).size;
      const a = choose(s, it, 't', `手札に戻す墓地のマリョクを選ぶ（${n}つまで）`, grave(s, it.p, 'both', ofType('maryoku')), 1, n);
      if (!a) return;
      const green = madou(s, it.p, 'green');
      once(it, 'x', () => a.forEach((u) => (green ? toMana(s, it, u, true) : toHand(s, it, u))));
    },
  } },
  '2-72': drawOnMana(),
  '2-73': { equip: { from: 'mana', grant: (s, h) => ({ colors: ['yellow'], power: 500 * new Set([...def(h.inst).colors, 'yellow']).size }) } },
  '2-78': marbleOrb(['red', 'yellow']),
  '2-79': marbleOrb(['blue', 'yellow']),
  '2-80': marbleOrb(['green', 'yellow']),
});

import { move, endGame } from './lib.js';
import { E } from '../core.js';
function import_equip(c) { return !!E[c.id]?.equip; }
function move_(s, u, to, p) { return move(s, u, to, { by: p }); }
function winNow(s, p, why) { endGame(s, p, why); }
function draw(s, p, n) { return drawN(s, { p }, n); }

function nichiren(s, it) {
  const a = choose(s, it, 't', '相手の手札からマホウを墓地に置く', hand(s, it.p, 'opp', ofType('mahou')));
  if (!a) return;
  once(it, 'x', () => { if (a.length) discard(s, a[0], it.p); else toHand(s, it, it.src); });
}

function mutOpts(s, p) {
  return [...guardians(s, p, 'both'), ...mana(s, p, 'both', (f) => !f.inst.faceUp)];
}

function marbleOrb(cols) {
  return { trig: [{ on: 'toMana', self: true, zones: ['mana'], if: (s, f, ev) => ev.faceUp && !s.players[f.p].mana.some((m) => m.uid !== f.inst.uid && m.faceUp && def(m).type === 'maryoku' && def(m).colors.some((c) => cols.includes(c))), run: (s, it) => {
    const a = choose(s, it, 't', '山札の上に戻すガーディアンを選ぶ', guardians(s, it.p, 'me'));
    if (a?.length) toTop(s, it, a[0]);
  } }] };
}
