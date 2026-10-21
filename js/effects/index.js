// 効果スクリプトをすべて読み込み、デッキに入れられるカード（READY）を決める
import { CARDS } from '../cards.js';
import { E } from '../core.js';
import './starters.js';
import './bp01.js';
import './bp02.js';
import './bp03.js';

// 効果文がキーワードだけ（または空）のカードは、スクリプトなしで動く
const KW_LINE = /^(即応|ダブルプレッシャー|トリプルプレッシャー|クアドラプルプレッシャー|ウォッチャー|ドレイン|モータル|スタンド|(アタック|ブロック)\+\d+|(これは)?ブロッカーになれない。?|※.*)$/;
export const vanilla = (c) => !c.text || c.text.split('\n').every((l) => KW_LINE.test(l.trim()));
export const READY = new Set(Object.values(CARDS).filter((c) => E[c.id] || vanilla(c)).map((c) => c.id));
