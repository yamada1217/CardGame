# イジンデン オンライン

ダイソーのカードゲーム「イジンデン」のルールで遊べる、スマホ向けWebアプリです。スターターデッキ3種（伝説の武将・知と美の革命・日本の大天才）の全カードの効果を実装しています。

- CPUとの対戦（1台で遊べる）
- 友達とオンライン対戦：部屋を作ってリンクを送るだけ。途中で再読み込みしても続きから戻れます。
- ホーム画面に追加すると、アプリのように全画面で動きます。
- お金はかかりません。公開は GitHub Pages、通信は Firebase の無料枠だけを使います。

## 動かし方

ビルド不要です。静的ファイルをそのまま配信します。

```sh
npx http-server -c-1 .   # http://localhost:8080 を開く
npm test                 # CPU同士を300戦させてエンジンを確認
```

オンライン対戦は `js/firebase-config.js` を設定すると使えます（手順は [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)）。
設定がなくても、`http://localhost:8080/?backend=local` を同じブラウザの2つのタブで開けば対戦の流れを試せます。

## 構成

| ファイル | 中身 |
|---|---|
| `js/engine.js` | ルールの本体。「状態 + 行動 → 新しい状態」の純粋な関数 |
| `js/cards.js` | スターター3種のカードとデッキ（`node tools/build-cards.mjs` で `docs/ijinden/cards.json` から生成） |
| `js/ai.js` | CPUの思考 |
| `js/app.js` | 画面とタップ操作 |
| `js/online.js` | オンライン対戦。行動だけを順番に記録し、両端末で同じように再生する |
| `database.rules.json` | Firebase のセキュリティルール |
| `docs/ijinden/RULES.md` | ルール仕様（公式ルール・Q&Aから整理） |
