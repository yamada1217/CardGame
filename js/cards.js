// tools/build-cards.mjs で docs/ijinden/cards.json から生成。手で編集しない。
export const COLORS = { red: { name: '赤' }, blue: { name: '青' }, green: { name: '緑' }, yellow: { name: '黄' }, purple: { name: '紫' } };

export const LEGACY_TEXT = {
  "draw1": "1ドローする。",
  "manaize": "魔力化: これを裏にして魔力ゾーンに置く（マリョク配置権は使わない）。",
  "restore": "復元: これを表向きで魔力ゾーンに置く（マリョク配置権は使わない）。",
  "meifu": "冥府発動: このマホウを、色・レベル・魔力コストの条件を無視して使う（発動条件は必要）。",
  "hangon": "反魂: 自分のガーディアン1体を山札の下に戻して、墓地のこのイジンを戦場に置く（召喚権は使わない）。",
  "kodama": "木霊: 自分の手札か墓地から、これよりレベルの低いイジン1体を戦場に置く（召喚権は使わない）。",
  "returnToHand": "これを手札に戻す。",
  "returnToDeckTopOrBottom": "これを山札の上か下に戻す。",
  "soshin": "喪神: アタッカー1体を選び、アタッカーでない状態にする（指定していたブロッカーも外れる）。"
};

export const CARDS = {
 "R-1": {
  "id": "R-1",
  "name": "上杉謙信",
  "type": "ijin",
  "color": "red",
  "level": 6,
  "power": 6000,
  "traits": [
   "剣術"
  ],
  "legacy": null,
  "kw": {},
  "text": "アタッカーになったとき、これのパワー以下のパワーを持つ相手の戦場のイジン1体を破壊する。",
  "rarity": "SR",
  "unlimited": false
 },
 "R-2": {
  "id": "R-2",
  "name": "源義経",
  "type": "ijin",
  "color": "red",
  "level": 1,
  "power": 500,
  "traits": [
   "剣術"
  ],
  "legacy": "manaize",
  "kw": {
   "sokuo": true
  },
  "text": "即応",
  "rarity": "C",
  "unlimited": false
 },
 "R-3": {
  "id": "R-3",
  "name": "武田勝頼",
  "type": "ijin",
  "color": "red",
  "level": 2,
  "power": 1000,
  "traits": [
   "剣術"
  ],
  "legacy": "draw1",
  "kw": {
   "atk": 2000
  },
  "text": "アタック+2000",
  "rarity": "C",
  "unlimited": false
 },
 "R-4": {
  "id": "R-4",
  "name": "ヴラド・ツェペシュ",
  "type": "ijin",
  "color": "red",
  "level": 3,
  "power": 3000,
  "traits": [],
  "legacy": null,
  "kw": {},
  "text": "アタッカーになったとき、自分の魔力ゾーンのマリョク1つを裏にして発動できる。パワー2000以下の相手の戦場のイジン1体を破壊する。",
  "rarity": "C",
  "unlimited": false
 },
 "R-5": {
  "id": "R-5",
  "name": "坂上田村麻呂",
  "type": "ijin",
  "color": "red",
  "level": 4,
  "power": 1000,
  "traits": [
   "剣術"
  ],
  "legacy": null,
  "kw": {
   "double": true
  },
  "text": "ダブルプレッシャー",
  "rarity": "C",
  "unlimited": false
 },
 "R-6": {
  "id": "R-6",
  "name": "楠木正成",
  "type": "ijin",
  "color": "red",
  "level": 5,
  "power": 5000,
  "traits": [
   "剣術"
  ],
  "legacy": null,
  "kw": {},
  "text": "戦場に置かれたとき、イジン召喚権+1する。",
  "rarity": "C",
  "unlimited": false
 },
 "R-7": {
  "id": "R-7",
  "name": "ジェームズ・バトラー・ヒコック",
  "type": "ijin",
  "color": "red",
  "level": 5,
  "power": 4000,
  "traits": [],
  "legacy": null,
  "kw": {
   "sokuo": true
  },
  "text": "即応\nアタッカーになったとき、相手の戦場のハイケイ1つにつき1ドローする。",
  "rarity": "C",
  "unlimited": false
 },
 "R-8": {
  "id": "R-8",
  "name": "アレクサンドロス大王",
  "type": "ijin",
  "color": "red",
  "level": 6,
  "power": 6000,
  "traits": [],
  "legacy": null,
  "kw": {
   "sokuo": true
  },
  "text": "即応\nアタッカーになったとき、アタッカー1体につき相手の戦場のハイケイ1つを破壊する。",
  "rarity": "C",
  "unlimited": false
 },
 "R-9": {
  "id": "R-9",
  "name": "神剣眠る氏社",
  "type": "haikei",
  "color": "red",
  "level": 2,
  "traits": [],
  "legacy": "manaize",
  "kw": {},
  "text": "自分の戦場の赤のイジンが破壊されるたびに発動できる。そのイジン1体を裏にして魔力ゾーンに置く。",
  "rarity": "C",
  "unlimited": false
 },
 "R-10": {
  "id": "R-10",
  "name": "連なる天守閣",
  "type": "haikei",
  "color": "red",
  "level": 3,
  "traits": [],
  "legacy": "manaize",
  "kw": {},
  "text": "これのハイケイ使用に際し、自分の戦場に「剣術」イジンがいれば、これはレベル1になる。\nこれが戦場にある間、自分の戦場のイジンは「パワー+1000」を得る。",
  "rarity": "C",
  "unlimited": false
 },
 "R-11": {
  "id": "R-11",
  "name": "ロイヤリティ",
  "type": "mahou",
  "color": "red",
  "level": 3,
  "cost": 1,
  "traits": [],
  "legacy": "meifu",
  "kw": {},
  "text": "自分の戦場の「剣術」イジン1体を破壊するか、自分の戦場のガーディアン1体を山札の上に戻す。3ドローする。",
  "rarity": "C",
  "unlimited": false
 },
 "R-12": {
  "id": "R-12",
  "name": "デスペラード",
  "type": "mahou",
  "color": "red",
  "level": 3,
  "cost": 1,
  "traits": [],
  "legacy": "meifu",
  "kw": {},
  "text": "自分の戦場のイジン1体と相手の戦場のガーディアン1体を指定して発動できる。そのイジンとガーディアンを破壊する。",
  "rarity": "C",
  "unlimited": false
 },
 "R-13": {
  "id": "R-13",
  "name": "レッドストーン",
  "type": "maryoku",
  "color": "red",
  "level": 1,
  "traits": [],
  "legacy": "restore",
  "kw": {},
  "text": "※デッキに何枚でも入れてよい。",
  "rarity": "C",
  "unlimited": true
 },
 "B-1": {
  "id": "B-1",
  "name": "レオナルド・ダ・ヴィンチ",
  "type": "ijin",
  "color": "blue",
  "level": 6,
  "power": 5000,
  "traits": [
   "美術"
  ],
  "legacy": null,
  "kw": {},
  "text": "戦場に置かれたとき、自分の墓地のレベル6以下のイジン1体か、自分の墓地のレベル5以下のハイケイ1つを指定して発動できる。そのイジンかハイケイを戦場に置く。",
  "rarity": "SR",
  "unlimited": false
 },
 "B-2": {
  "id": "B-2",
  "name": "ヴァスコ・ダ・ガマ",
  "type": "ijin",
  "color": "blue",
  "level": 1,
  "power": 1000,
  "traits": [],
  "legacy": "draw1",
  "kw": {
   "voyage": true
  },
  "text": "航海 - アタッカーになったとき、1ドローして、自分の手札1枚を墓地に置く。",
  "rarity": "C",
  "unlimited": false
 },
 "B-3": {
  "id": "B-3",
  "name": "好太王",
  "type": "ijin",
  "color": "blue",
  "level": 2,
  "power": 1000,
  "traits": [],
  "legacy": "draw1",
  "kw": {
   "cannotBlock": true
  },
  "text": "パワー1000以下のイジンにブロックされない。\nブロッカーになれない。",
  "rarity": "C",
  "unlimited": false
 },
 "B-4": {
  "id": "B-4",
  "name": "フェルディナンド・マゼラン",
  "type": "ijin",
  "color": "blue",
  "level": 3,
  "power": 3000,
  "traits": [],
  "legacy": null,
  "kw": {
   "voyage": true
  },
  "text": "航海 - アタッカーになったとき、相手の手札のカード1つを墓地に置く。そのカードは相手が選ぶ。",
  "rarity": "C",
  "unlimited": false
 },
 "B-5": {
  "id": "B-5",
  "name": "ラファエロ・サンティ",
  "type": "ijin",
  "color": "blue",
  "level": 3,
  "power": 3000,
  "traits": [
   "美術"
  ],
  "legacy": null,
  "kw": {},
  "text": "戦場に置かれたとき、自分の墓地のイジン1体かハイケイ1つを手札に戻す。",
  "rarity": "C",
  "unlimited": false
 },
 "B-6": {
  "id": "B-6",
  "name": "ジャン・カルヴァン",
  "type": "ijin",
  "color": "blue",
  "level": 2,
  "power": 1000,
  "traits": [],
  "legacy": "draw1",
  "kw": {},
  "text": "メインフェイズが開始したとき、自分の魔力ゾーンのマリョク1つを裏にして発動できる。このターンの間「執筆」は発動しない。\n相手のターンの間「パワー+2000」を得る。",
  "rarity": "C",
  "unlimited": false
 },
 "B-7": {
  "id": "B-7",
  "name": "武帝",
  "type": "ijin",
  "color": "blue",
  "level": 3,
  "power": 2000,
  "traits": [],
  "legacy": null,
  "kw": {},
  "text": "自分の戦場のイジン1体につき「パワー+1000」を得る。\nパワー5000以上の間「ダブルプレッシャー」を得る。",
  "rarity": "C",
  "unlimited": false
 },
 "B-8": {
  "id": "B-8",
  "name": "楊貴妃",
  "type": "ijin",
  "color": "blue",
  "level": 5,
  "power": 1000,
  "traits": [],
  "legacy": null,
  "kw": {},
  "text": "戦場に置かれたとき、自分の戦場のイジン1体を破壊して発動できる。3ドローする。\n自分の手札が5枚以上の間「イジンにブロックされない」を得る。",
  "rarity": "C",
  "unlimited": false
 },
 "B-9": {
  "id": "B-9",
  "name": "モナ・リザ",
  "type": "haikei",
  "color": "blue",
  "level": 2,
  "traits": [
   "美術"
  ],
  "legacy": "returnToHand",
  "kw": {},
  "text": "自分のメインフェイズが開始したとき、手札の「美術」カード1つを墓地に置いて発動できる。1ドローする。",
  "rarity": "C",
  "unlimited": false
 },
 "B-10": {
  "id": "B-10",
  "name": "革命の広場",
  "type": "haikei",
  "color": "blue",
  "level": 3,
  "traits": [],
  "legacy": "returnToHand",
  "kw": {},
  "text": "イジンが破壊されるたび、1ドローする。\n自分のメインフェイズが開始したとき、自分の戦場のイジン1体を指定して発動できる。そのイジンを破壊する。",
  "rarity": "C",
  "unlimited": false
 },
 "B-11": {
  "id": "B-11",
  "name": "フリート",
  "type": "mahou",
  "color": "blue",
  "level": 3,
  "cost": 0,
  "traits": [],
  "legacy": null,
  "kw": {},
  "text": "このターンのバトル解決に際し、アタッカーは破壊されない。\nこのターンの間「航海」を持つ戦場のイジンは「アタック+2000」を得る。",
  "rarity": "C",
  "unlimited": false
 },
 "B-12": {
  "id": "B-12",
  "name": "ドローイング",
  "type": "mahou",
  "color": "blue",
  "level": 3,
  "cost": 1,
  "traits": [],
  "legacy": "meifu",
  "kw": {},
  "text": "2ドローする。",
  "rarity": "C",
  "unlimited": false
 },
 "B-13": {
  "id": "B-13",
  "name": "ブルーストーン",
  "type": "maryoku",
  "color": "blue",
  "level": 1,
  "traits": [],
  "legacy": "restore",
  "kw": {},
  "text": "※デッキに何枚でも入れてよい。",
  "rarity": "C",
  "unlimited": true
 },
 "G-1": {
  "id": "G-1",
  "name": "出雲の阿国",
  "type": "ijin",
  "color": "green",
  "level": 5,
  "power": 3000,
  "traits": [],
  "legacy": "draw1",
  "kw": {},
  "text": "戦場に置かれたとき、自分の戦場のカードすべてを起こす。\n破壊されたとき、自分の魔力ゾーンのマリョク1つを裏にして発動できる。これを破壊されていない状態にする。",
  "rarity": "SR",
  "unlimited": false
 },
 "G-2": {
  "id": "G-2",
  "name": "卑弥呼",
  "type": "ijin",
  "color": "green",
  "level": 1,
  "power": 500,
  "traits": [],
  "legacy": null,
  "kw": {},
  "text": "戦場に置かれたとき、自分の山札の上から1枚を、裏のまま魔力ゾーンに置く。",
  "rarity": "C",
  "unlimited": false
 },
 "G-3": {
  "id": "G-3",
  "name": "アテルイ",
  "type": "ijin",
  "color": "green",
  "level": 3,
  "power": 2000,
  "traits": [],
  "legacy": "draw1",
  "kw": {
   "atk": 1000
  },
  "text": "「剣術」イジンが戦場に置かれたとき、これを起こす。\nアタック+1000",
  "rarity": "C",
  "unlimited": false
 },
 "G-4": {
  "id": "G-4",
  "name": "紀貫之",
  "type": "ijin",
  "color": "green",
  "level": 2,
  "power": 2000,
  "traits": [],
  "legacy": "draw1",
  "kw": {
   "shippitsu": true
  },
  "text": "執筆 - ハイケイが戦場に置かれたとき、これを裏にして魔力ゾーンに置く。",
  "rarity": "C",
  "unlimited": false
 },
 "G-5": {
  "id": "G-5",
  "name": "阿倍仲麻呂",
  "type": "ijin",
  "color": "green",
  "level": 4,
  "power": 4000,
  "traits": [],
  "legacy": null,
  "kw": {},
  "text": "「航海」が発動したとき、1ドローして、これを起こす。",
  "rarity": "C",
  "unlimited": false
 },
 "G-6": {
  "id": "G-6",
  "name": "葛飾北斎",
  "type": "ijin",
  "color": "green",
  "level": 3,
  "power": 2000,
  "traits": [
   "美術"
  ],
  "legacy": "draw1",
  "kw": {},
  "text": "戦場に置かれたとき、自分の墓地のハイケイ1つか2つを指定して発動できる。それらのハイケイすべてを手札に戻す。",
  "rarity": "C",
  "unlimited": false
 },
 "G-7": {
  "id": "G-7",
  "name": "藤原定家",
  "type": "ijin",
  "color": "green",
  "level": 4,
  "power": 4000,
  "traits": [],
  "legacy": null,
  "kw": {
   "shippitsu": true
  },
  "text": "執筆 - ハイケイが戦場に置かれたとき、自分の戦場のカードすべてを起こす。",
  "rarity": "C",
  "unlimited": false
 },
 "G-8": {
  "id": "G-8",
  "name": "最澄",
  "type": "ijin",
  "color": "green",
  "level": 8,
  "power": 7000,
  "traits": [],
  "legacy": "manaize",
  "kw": {
   "voyage": true
  },
  "text": "航海 - アタッカーになったとき、自分の戦場のハイケイ1つを指定して発動できる。そのハイケイを手札に戻す。自分の戦場のイジンは、このターンの間「ダブルプレッシャー」を得る。",
  "rarity": "C",
  "unlimited": false
 },
 "G-9": {
  "id": "G-9",
  "name": "阿弥陀堂",
  "type": "haikei",
  "color": "green",
  "level": 4,
  "traits": [],
  "legacy": null,
  "kw": {},
  "text": "自分のメインフェイズが開始したとき、自分の戦場のカード1つか、自分の魔力ゾーンのカード1つを指定して発動できる。そのカードを手札に戻す。",
  "rarity": "C",
  "unlimited": false
 },
 "G-10": {
  "id": "G-10",
  "name": "毘盧遮那仏像",
  "type": "haikei",
  "color": "green",
  "level": 6,
  "traits": [],
  "legacy": "manaize",
  "kw": {},
  "text": "これが戦場にある間、自分の戦場のイジンは「パワー+1000」を得る。\n自分のエンドフェイズが開始したとき、自分の戦場のカードすべてを起こす。",
  "rarity": "C",
  "unlimited": false
 },
 "G-11": {
  "id": "G-11",
  "name": "グロウ",
  "type": "mahou",
  "color": "green",
  "level": 3,
  "cost": 0,
  "traits": [],
  "legacy": "meifu",
  "kw": {},
  "text": "自分の山札の上から1枚を、裏のまま魔力ゾーンに置く。",
  "rarity": "C",
  "unlimited": false
 },
 "G-12": {
  "id": "G-12",
  "name": "ギャザリング",
  "type": "mahou",
  "color": "green",
  "level": 5,
  "cost": 1,
  "traits": [],
  "legacy": "manaize",
  "kw": {},
  "text": "自分の戦場のガーディアンすべてを手札に戻す。自分の山札の上から2枚をガーディアンにして戦場に置く。",
  "rarity": "C",
  "unlimited": false
 },
 "G-13": {
  "id": "G-13",
  "name": "グリーンストーン",
  "type": "maryoku",
  "color": "green",
  "level": 1,
  "traits": [],
  "legacy": "restore",
  "kw": {},
  "text": "※デッキに何枚でも入れてよい。",
  "rarity": "C",
  "unlimited": true
 }
};

export const DECKS = {
 "R01": {
  "name": "伝説の武将デッキ",
  "cards": [
   "R-1",
   "R-1",
   "R-2",
   "R-2",
   "R-3",
   "R-3",
   "R-4",
   "R-4",
   "R-5",
   "R-5",
   "R-6",
   "R-6",
   "R-7",
   "R-7",
   "R-8",
   "R-8",
   "R-9",
   "R-9",
   "R-10",
   "R-10",
   "R-11",
   "R-11",
   "R-12",
   "R-12",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13",
   "R-13"
  ]
 },
 "B01": {
  "name": "知と美の革命デッキ",
  "cards": [
   "B-1",
   "B-1",
   "B-2",
   "B-2",
   "B-3",
   "B-3",
   "B-4",
   "B-4",
   "B-5",
   "B-5",
   "B-6",
   "B-6",
   "B-7",
   "B-7",
   "B-8",
   "B-8",
   "B-9",
   "B-9",
   "B-10",
   "B-10",
   "B-11",
   "B-11",
   "B-12",
   "B-12",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13",
   "B-13"
  ]
 },
 "G01": {
  "name": "日本の大天才デッキ",
  "cards": [
   "G-1",
   "G-1",
   "G-2",
   "G-2",
   "G-3",
   "G-3",
   "G-4",
   "G-4",
   "G-5",
   "G-5",
   "G-6",
   "G-6",
   "G-7",
   "G-7",
   "G-8",
   "G-8",
   "G-9",
   "G-9",
   "G-10",
   "G-10",
   "G-11",
   "G-11",
   "G-12",
   "G-12",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13",
   "G-13"
  ]
 }
};
