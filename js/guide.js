// はじめての人向けの遊び方ガイド。左右スワイプか「次へ」でページをめくる。
// 初めて対戦を始めるときに一度だけ自動で開き、タイトルとメニューの「遊び方」からいつでも開ける。
import { CARDS } from './cards.js';
import { cardFace, esc } from './cardview.js';

const card = (id, size = 'm') => (CARDS[id] ? cardFace({ uid: `guide-${id}`, id }, { size }) : '');

const PAGES = [
  {
    title: 'イジンデンへようこそ',
    art: `<div class="g-fan">${card('R-1')}${card('B-1')}${card('G-1')}</div>`,
    body: `<p>歴史の偉人を戦わせるカードゲームです。</p>
      <p class="g-big">アタックしたイジンを、相手が<b>ブロックできなかったら勝ち</b>。</p>
      <p>自分の山札が尽きてしまっても負けになります。</p>`,
  },
  {
    title: 'カードは4種類',
    art: `<div class="g-row">${card('R-1', 's')}${card('R-10', 's')}${card('R-11', 's')}${card('R-13', 's')}</div>`,
    body: `<dl class="g-kinds">
      <dt>イジン</dt><dd>戦場に出して、アタックやブロックをする</dd>
      <dt>ハイケイ</dt><dd>戦場に置くと、ずっと効果を発揮する</dd>
      <dt>マホウ</dt><dd>使うと1回だけ効果が出て、墓地へ</dd>
      <dt>マリョク</dt><dd>魔力ゾーンに置いて、カードを使う力にする</dd></dl>`,
  },
  {
    title: '1ターンにできること',
    body: `<ol class="g-flow">
      <li><b>ドロー</b>山札から1枚引く</li>
      <li><b>マリョク配置 1回</b>マリョクは表向きで、ほかのカードは裏向きで魔力ゾーンへ</li>
      <li><b>イジン召喚 1回</b></li>
      <li><b>ハイケイ・マホウ 何枚でも</b>条件を満たしていれば</li>
      <li><b>バトル 1回</b>アタックするイジンを選ぶ</li>
      <li><b>ターン終了</b></li></ol>`,
  },
  {
    title: 'カードを使う条件',
    art: `<div class="g-mana"><span class="m up c-red">赤<small>Lv1</small></span><span class="m down">裏</span><span class="m down">裏</span><b>＝ レベル3</b></div>`,
    body: `<p><b>色</b>：使うカードと同じ色の<b>表向きマリョクが1枚</b>あればOK。</p>
      <p><b>レベル</b>：「表向きマリョクのレベル」＋「裏向きカードの枚数」が、カードのレベル以上なら使えます。</p>
      <p class="g-tip">使わない手札は裏向きで置けば、1枚ぶんのレベルになります。</p>`,
  },
  {
    title: 'バトルとブロック',
    art: `<div class="g-vs">${card('R-4', 's')}<b>VS</b>${card('B-4', 's')}</div>`,
    body: `<p>アタックされた側は、イジンやガーディアンで<b>ブロック</b>します。</p>
      <p>パワーが大きい方が勝ち、同じなら相打ちで両方破壊。何体かでブロックすると、パワーを合計できます。</p>
      <p class="g-tip">ブロックしなかったアタッカーが1体でもいたら、その時点で負けです。</p>`,
  },
  {
    title: 'ガーディアン',
    art: '<div class="g-guards"><i></i><i></i><i></i><i></i></div>',
    body: `<p>最初に山札から4枚を裏向きで置いた、自分を守る壁です。</p>
      <p>パワー0なので、ブロックすると1回で壊れます。ガーディアンが減るほど守りが苦しくなります。</p>`,
  },
  {
    title: '操作のコツ',
    body: `<ul class="g-tips">
      <li><b>タップ</b>で選ぶ・使う</li>
      <li><b>長押し</b>でカードを拡大して、効果を読む</li>
      <li>カードを使うと大きく表示されます。<b>タップで早送り</b></li>
      <li>右上のメニューから、いつでもこのガイドを見られます</li></ul>
      <p class="g-big">まずはCPU（やさしい）と対戦してみましょう！</p>`,
  },
];

let root = null;

export function openGuide(onClose) {
  root?.remove();
  root = document.createElement('div');
  root.id = 'guide-root';
  let i = 0;
  const close = () => { root?.classList.remove('open'); const r = root; root = null; setTimeout(() => r?.remove(), 220); onClose?.(); };
  const draw = () => {
    const pg = PAGES[i];
    root.innerHTML = `<div class="g-body" role="dialog" aria-label="遊び方">
      <button class="g-skip" data-g="close">${i === PAGES.length - 1 ? '閉じる' : 'スキップ'}</button>
      <div class="g-page" key="${i}">
        <div class="g-step">${i + 1} / ${PAGES.length}</div>
        <h2>${esc(pg.title)}</h2>
        ${pg.art ? `<div class="g-art">${pg.art}</div>` : ''}
        <div class="g-text">${pg.body}</div>
      </div>
      <div class="g-dots">${PAGES.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="g-nav">
        <button class="btn ghost" data-g="prev" ${i ? '' : 'disabled'}>戻る</button>
        <button class="btn primary" data-g="next">${i === PAGES.length - 1 ? 'はじめる' : '次へ'}</button>
      </div></div>`;
    root.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => go(b.dataset.g));
  };
  const go = (k) => {
    if (k === 'close') return close();
    if (k === 'next') { if (i === PAGES.length - 1) return close(); i++; }
    if (k === 'prev' && i > 0) i--;
    draw();
  };
  // 左右スワイプでめくる
  let sx = null;
  root.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  root.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 'next' : 'prev');
  });
  document.body.appendChild(root);
  draw();
  void root.offsetWidth;
  root.classList.add('open');
}
