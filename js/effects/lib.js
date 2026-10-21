// カード効果を短く書くための道具
import {
  def, opp, list, uids, stat, power, isIjin, isHaikei, pick, confirm, once, destroy, move, draw, mill, discard, tap, untap,
  untapAll, addRight, flipManaCost, payMana, findOnBoard, log, name, topToMana, topToGuardian, placeGuardian, putOnField,
  emit, rule, addTmp, grantTmp, tmpFlag, hasColor, isStone, faceUpMaryoku, removeAttacker, ijinsOf, haikeisOf, availableColors,
  levelSum, shuffle, pushFront, ownerOf, COLOR_JA, ALL_COLORS,
} from '../core.js';

export * from '../core.js';

export const me = (s, it) => findOnBoard(s, it.src);
export const pw = (s, f) => power(s, f.p, f.inst);
export const lv = (f) => def(f.inst).level;
export const D = (f) => def(f.inst);

// 戦場のイジン／ハイケイ／カード。who: 'me' | 'opp' | 'both'
export const ijins = (s, p, who = 'opp', pred = null) => list(s, p, who, 'field', (f) => isIjin(s, f.inst, f) && (!pred || pred(f)));
export const haikeis = (s, p, who = 'opp', pred = null) => list(s, p, who, 'field', (f) => isHaikei(s, f.inst, f) && (!pred || pred(f)));
export const fieldCards = (s, p, who = 'opp', pred = null) => list(s, p, who, 'field', pred);
export const guardians = (s, p, who = 'opp', pred = null) => list(s, p, who, 'guardians', pred);
export const grave = (s, p, who = 'me', pred = null) => list(s, p, who, 'grave', pred);
export const hand = (s, p, who = 'me', pred = null) => list(s, p, who, 'hand', pred);
export const mana = (s, p, who = 'me', pred = null) => list(s, p, who, 'mana', pred);
export const ofType = (t) => (f) => def(f.inst).type === t;
export const hasCol = (s, f, c) => stat(s, f.inst, f).colors.has(c);
export const trait = (s, f, t) => stat(s, f.inst, f).traits.has(t);
export const tapped = (f) => !!f.inst.tapped;

// 選択の省略形。key は効果の中で一意に
export const choose = (s, it, key, title, options, min = 1, max = undefined, extra = {}) => pick(s, it, key, { title, options, min, max: max ?? Math.max(1, min), ...extra });
export const may = (s, it, key, title) => confirm(s, it, key, title);
export const labels = (obj) => ({ options: Object.keys(obj), labels: obj });

export const kill = (s, it, us, extra = {}) => destroy(s, [].concat(us).filter(Boolean), { p: it.p, ...extra });
export const toHand = (s, it, u) => move(s, u, 'hand', { by: it.p });
export const toBottom = (s, it, u) => move(s, u, 'deckBottom', { by: it.p });
export const toTop = (s, it, u) => move(s, u, 'deckTop', { by: it.p });
export const toMana = (s, it, u, up = false) => move(s, u, up ? 'manaUp' : 'mana', { by: it.p });
export const toGuard = (s, it, u) => move(s, u, 'guardian', { by: it.p });
export const toGraveBy = (s, it, u) => move(s, u, 'grave', { by: it.p });
export const toField = (s, it, u, opts = {}) => move(s, u, 'field', { by: it.p, ...opts });
export const drawN = (s, it, n, zone) => { const k = draw(s, it.p, n, { zone: zone ?? it.zone }); if (k) log(s, `${k}ドロー`, it.p); return k; };

// 手札から1枚（count枚）を選んで墓地へ。chooser: 選ぶ人
export function discardN(s, it, key, p, n = 1, chooser = p, pred = null) {
  const opts = list(s, p, 'me', 'hand', pred);
  if (!opts.length) return [];
  const a = pick(s, it, key, { p: chooser, title: chooser === p ? `墓地に置く手札を${Math.min(n, opts.length)}枚選ぶ` : `相手の手札から墓地に置くカードを選ぶ`, options: opts, min: Math.min(n, opts.length), max: n });
  if (!a) return undefined;
  once(it, key + '_do', () => a.forEach((u) => discard(s, u, it.p)));
  return a;
}

// 「マリョク配置権が増えたとき」などのために、現在の自分のターンかどうか
export const myTurn = (s, p) => s.turn === p;
export const kikkiOk = (s, p) => faceUpMaryoku(s, p).length >= (rule(s, 'kikki3', p) ? 3 : 4);

// 戦場にある色の数
export function fieldColors(s, p, who = 'me') {
  const set = new Set();
  for (const f of list(s, p, who, 'field')) stat(s, f.inst, f).colors.forEach((c) => set.add(c));
  return set;
}

// 魔導：その色のカードが自分の戦場か魔力ゾーンにあるか
export function madou(s, p, color) {
  if (fieldColors(s, p).has(color)) return true;
  return hasColor(s, p, color);
}

// 徴募：自分のエンドフェイズ開始時、このターンにアタッカーが破壊されているなら（戦場か墓地で）
export const choboOk = (s, p) => s.tf.attackerDestroyed || (s.tf.battled && rule(s, 'choboBattle', p));
export function chobo(run, opt = null) {
  return {
    on: 'endStart', mine: true, zones: ['field', 'grave'], chobo: true, opt,
    if: (s, f) => choboOk(s, f.p),
    run: (s, it) => { if (it.zone === 'grave') once(it, '_c', () => emit(s, 'chobo', { p: it.p, uid: it.src })); run(s, it); },
  };
}
// 決起
export const kikki = (run, opt = '決起：能力を使う？') => ({ on: 'manaPlaced', kikki: true, opt, if: (s, f, ev) => ev.p === f.p && kikkiOk(s, f.p), run });
// 執筆（ハイケイが戦場に置かれたとき）
export function shippitsu(run, extra = {}) {
  return { on: 'enter', shippitsu: true, ...extra, if: (s, f, ev) => { const e = findOnBoard(s, ev.uid); return !!e && e.zone === 'field' && stat(s, e.inst, e).types.has('haikei') && (!extra.if || extra.if(s, f, ev, e)); }, run };
}
// ラベルの選択肢
export const choice = (s, it, key, title, obj) => pick(s, it, key, { title, options: Object.keys(obj), labels: obj, min: 1, max: 1 });
export const stones = (s, p) => s.players[p].mana.filter((m) => m.faceUp && isStone(m));
export const enteredF = (s, ev) => findOnBoard(s, ev.uid);
