// Firebase（無料の Spark プラン）の設定。ブラウザに配られる前提の公開値で、
// 書き込みの制限は database.rules.json のルールで行う。
// null にするとオンライン対戦はオフになる（?backend=local で同じブラウザの2タブ対戦は試せる）。
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBIgUSVWmMz0jPWfBnnQYimU24TaKmUYSY',
  authDomain: 'ijinden-online-fbe1c.firebaseapp.com',
  databaseURL: 'https://ijinden-online-fbe1c-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'ijinden-online-fbe1c',
  storageBucket: 'ijinden-online-fbe1c.firebasestorage.app',
  messagingSenderId: '968594200769',
  appId: '1:968594200769:web:e056ccc6c1a99d44675c40',
};
