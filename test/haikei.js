// 何かを与える系のハイケイが、実際に盤面に効いているかを確かめる
// 使い方: node test/haikei.js
import { createGame, canAttackWith, canBlockPair, power, stat, findOnBoard } from '../js/engine.js';

let fails = 0, n = 0;
function check(name, ok) {
  n++;
  if (!ok) { fails++; console.log('NG', name); }
}

// 盤面を作る。field: { 0: [id...], 1: [id...] }、haikei は field に混ぜてよい
function board({ me = [], foe = [], turn = 0, mana = 0, hands = [5, 5], guardians = 2 } = {}) {
  const s = createGame({ seed: 1, decks: ['R01', 'B01'], first: 0 });
  s.phase = 'main'; s.turn = turn; s.turnNo = 5;
  let k = 900;
  const inst = (p, id, extra = {}) => ({ uid: `${p}-${k++}`, id, tapped: false, enteredTurn: 1, inc: ++s.inc, ...extra });
  [me, foe].forEach((ids, p) => {
    const pl = s.players[p];
    pl.field = ids.map((id) => inst(p, id));
    pl.guardians = pl.guardians.slice(0, guardians);
    pl.mana = Array.from({ length: mana }, () => ({ uid: `${p}-${k++}`, id: 'R-13', faceUp: true }));
    pl.hand = pl.hand.slice(0, hands[p]);
  });
  const at = (p, id) => s.players[p].field.find((c) => c.id === id);
  return { s, at, inst };
}
const st = (s, c) => stat(s, c, findOnBoard(s, c.uid));
const pw = (s, c, role) => power(s, findOnBoard(s, c.uid).p, c, role);

// 連なる天守閣・毘盧遮那仏像（2種）：自分のイジンはパワー+1000
for (const h of ['R-10', 'G-10', '2nd1-69']) {
  const { s, at } = board({ me: [h, '1-72'], foe: ['R-4'] });
  check(`${h} 自分+1000`, pw(s, at(0, '1-72')) === 2000);
  check(`${h} 相手には効かない`, pw(s, at(1, 'R-4')) === 3000);
}

// 武者の蔵：レベル2以下は剣術を得る、剣術は即応を得る
{
  const { s, at } = board({ me: ['1-46', '1-72', '1-10', 'R-4'] });
  for (const c of s.players[0].field) c.enteredTurn = s.turnNo; // 出したばかり
  check('武者の蔵 Lv2が剣術', st(s, at(0, '1-72')).traits.has('剣術'));
  check('武者の蔵 Lv2が即応でアタック可', canAttackWith(s, 0, at(0, '1-72')));
  check('武者の蔵 剣術Lv3が即応', canAttackWith(s, 0, at(0, '1-10')));
  check('武者の蔵 剣術でないLv3は即応なし', !canAttackWith(s, 0, at(0, 'R-4')));
}

// 円形闘技場：自分のターンの間、ガーディアンは即応を持つパワー3000のイジン
{
  const { s } = board({ me: ['1-48'] });
  const g = s.players[0].guardians[0];
  check('円形闘技場 ガーディアンがアタック可', canAttackWith(s, 0, g));
  check('円形闘技場 パワー3000', pw(s, g) === 3000);
  s.turn = 1;
  check('円形闘技場 相手のターンはイジンでない', !canAttackWith(s, 0, g) && !st(s, g).types.has('ijin'));
}
{
  // 自分の戦場のイジンへの強化はイジンになったガーディアンにも効く
  const { s } = board({ me: ['1-48', 'G-10', '3-52'], mana: 5 });
  const g = s.players[0].guardians[0];
  check('円形闘技場+毘盧遮那仏像 パワー4000', pw(s, g) === 4000);
  check('円形闘技場+主戦場 アタック時6000', pw(s, g, 'atk') === 6000);
}

// 英傑集う大河：黄のイジンは赤青緑を得る
{
  const { s, at } = board({ me: ['Y-9', 'Y-1'] });
  const c = st(s, at(0, 'Y-1')).colors;
  check('英傑集う大河 色', ['red', 'blue', 'green', 'yellow'].every((x) => c.has(x)));
}

// 仁王：イジンがちょうど2体ならウォッチャー
{
  const { s, at } = board({ me: ['2-53', '1-72', 'R-4'] });
  check('仁王 2体でウォッチャー', st(s, at(0, '1-72')).kw.watcher);
  const b = board({ me: ['2-53', '1-72', 'R-4', '1-10'] });
  check('仁王 3体ならなし', !st(b.s, b.at(0, '1-72')).kw.watcher);
}

// 蒸気機関車（装備）：即応、ハイケイ1つにつき+500
{
  const { s, at } = board({ me: ['G-1', 'G-10', '1-48'] });
  const c = at(0, 'G-1');
  c.equips = [{ uid: '0-999', id: '2-54', from: 'field' }];
  c.enteredTurn = s.turnNo;
  check('蒸気機関車 即応', canAttackWith(s, 0, c));
  check('蒸気機関車 +500×ハイケイ', pw(s, c) === 3000 + 1000 + 1000);
}

// 三層の舎利殿：これ自身が赤青緑
{
  const { s, at } = board({ me: ['2-56'] });
  const c = st(s, at(0, '2-56')).colors;
  check('三層の舎利殿 色', ['red', 'blue', 'green', 'yellow'].every((x) => c.has(x)));
}

// 炎上がる天守閣：アタック+持ちとガーディアンは戦場の能力で離れない
{
  const { s } = board({ me: ['3-51'] });
  check('炎上がる天守閣 ガーディアン', st(s, s.players[0].guardians[0]).kw.noLeaveAbility);
}

// 天下分け目の主戦場：魔力5つ以上でアタック+2000
{
  const { s, at } = board({ me: ['3-52', '1-72'], mana: 5 });
  check('主戦場 アタック+2000', pw(s, at(0, '1-72'), 'atk') === 3000);
  const b = board({ me: ['3-52', '1-72'], mana: 4 });
  check('主戦場 4つではなし', pw(b.s, b.at(0, '1-72'), 'atk') === 1000);
}

// 永遠の帝都：レベル3以下はブロック+1000、ブロック+持ちは能力で破壊されない
{
  const { s, at } = board({ me: ['3-53', '1-72', '2-10', 'R-1'] });
  check('永遠の帝都 Lv2ブロック+1000', pw(s, at(0, '1-72'), 'blk') === 2000);
  check('永遠の帝都 Lv6はなし', pw(s, at(0, 'R-1'), 'blk') === 6000);
  check('永遠の帝都 ブロック+持ちは破壊されない', st(s, at(0, '2-10')).kw.noDestroyAbility);
}

// 火と氷の大地：青のイジンは赤にブロックされない、相手のLv2以下は赤になる
{
  const { s, at } = board({ me: ['4-43', 'B-1'], foe: ['R-4', '1-72'], turn: 0 });
  check('火と氷の大地 相手Lv2が赤', st(s, at(1, '1-72')).colors.has('red'));
  check('火と氷の大地 赤にブロックされない', !canBlockPair(s, 1, at(1, 'R-4'), at(0, 'B-1')));
}

// 蝦夷共和国：ガーディアンがいなければLv4以下は志願を得る（志願はモータル）
{
  const { s, at } = board({ me: ['4-49', '1-72'], guardians: 0 });
  check('蝦夷共和国 志願', st(s, at(0, '1-72')).traits.has('志願'));
}

// 風林火山：剣術イジンは勝鬨を得る
{
  const { s, at } = board({ me: ['2nd1-61', '1-10', 'R-4'] });
  check('風林火山 剣術に勝鬨', st(s, at(0, '1-10')).trig.includes('2nd1-61@k'));
  check('風林火山 剣術でないとなし', !st(s, at(0, 'R-4')).trig.includes('2nd1-61@k'));
}

// 殿：自分のターン、相手の手札が多いなら+5000
{
  const { s, at } = board({ me: ['2nd2-44', '1-72'], hands: [1, 4] });
  check('殿 +5000', pw(s, at(0, '1-72')) === 6000);
  s.turn = 1;
  check('殿 相手のターンはなし', pw(s, at(0, '1-72')) === 1000);
}

// 黄金時代：相手の手札3つ以下なら相手のイジン-2000
{
  const { s, at } = board({ me: ['2nd2-48'], foe: ['R-4'], hands: [5, 3] });
  check('黄金時代 -2000', pw(s, at(1, 'R-4')) === 1000);
}

console.log(`haikei: ${n - fails}/${n} OK`);
if (fails) process.exitCode = 1;
