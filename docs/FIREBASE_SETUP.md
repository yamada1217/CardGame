# Firebase（無料）のつなぎ方

オンライン対戦の通信に Firebase Realtime Database の無料プラン（Spark）を使います。クレジットカードの登録は不要です。

1. https://console.firebase.google.com/ を Google アカウントで開き、「プロジェクトを作成」。名前は `ijinden-online` など。Google アナリティクスはオフで構いません。
2. 左メニュー「構築」→「Realtime Database」→「データベースを作成」。場所は「シンガポール（asia-southeast1）」、モードは「ロックモード」で開始。続けて「構築」→「Authentication」→「始める」→「匿名」を有効にする。
3. 「ルール」タブに、このリポジトリの `database.rules.json` の中身を貼って「公開」。
4. プロジェクトの概要の歯車 →「プロジェクトの設定」→「マイアプリ」で `</>`（ウェブ）を選び、アプリを登録（Hosting はチェック不要）。
5. 表示される `firebaseConfig = { ... }` の中身を `js/firebase-config.js` の `FIREBASE_CONFIG` に貼る。

この設定値は公開されても問題ない種類のものです（ブラウザに配られる前提の値で、書き込みの制限は手順3のルールで行います）。

## 無料枠の目安

同時接続100・保存1GB・転送10GB/月。1試合の転送量は数十KB程度なので、友達同士で遊ぶ範囲なら超えません。超えた場合も、Spark プランは課金されずに止まるだけです。
