// 2つのタブでオンライン対戦を最後まで進め、両端末の状態が一致するかを確かめる
// 使い方: npx http-server -p 8080 . を起動してから node test/online-e2e.mjs
import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const errs = [];
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); return p; };
const A = await mk(), B = await mk();
await A.goto('http://localhost:8080/?backend=local');
await A.evaluate(() => localStorage.clear());
await A.reload();
await A.fill('#name', 'ひろむ');
await A.click('#start-online');
await A.waitForSelector('.room-code');
const code = (await A.textContent('.room-code')).trim();
await A.waitForTimeout(500);
await B.goto(`http://localhost:8080/?room=${code}&backend=local`);
await B.fill('#name', 'ともだち');
await B.click('[data-deck="wisdom"]');
await B.click('#join');
await A.waitForSelector('.game'); await B.waitForSelector('.game');
await A.waitForTimeout(500);
const drive = (p) => p.evaluate(async () => {
  const { ui, act, seat } = window.__ijinden;
  const ai = await import('/js/ai.js');
  const g = ui.game, { ME } = seat();
  if (g.phase === 'over') return 'over';
  if (g.phase === 'block' && g.turn !== ME) { act({ type: 'declareBlocks', blocks: ai.cpuBlocks(g, ME) }); return 'blk'; }
  if (g.phase === 'main' && g.turn === ME) { act(ai.cpuMainAction(g, ME)); return 'act'; }
  return 'wait';
});
let steps = 0, res;
while (steps++ < 3000) {
  const [ra, rb] = [await drive(A), await drive(B)];
  if (ra === 'over' && rb === 'over') break;
  await A.waitForTimeout(20);
}
const sa = await A.evaluate(() => JSON.stringify(window.__ijinden.ui.game));
const sb = await B.evaluate(() => JSON.stringify(window.__ijinden.ui.game));
console.log('steps', steps, 'same state:', sa === sb, 'winner', JSON.parse(sa).winner, JSON.parse(sa).winReason);
// 再読み込みして復帰できるか
await B.reload(); await B.waitForSelector('.game'); await B.waitForTimeout(800);
const sb2 = await B.evaluate(() => JSON.stringify(window.__ijinden.ui.game));
console.log('resume same:', sa === sb2);
await A.waitForTimeout(400);
// 再戦
await A.click('[data-r="again"]'); await A.waitForTimeout(1200);
console.log('rematch phase A/B:', await A.evaluate(() => window.__ijinden.ui.game.phase), await B.evaluate(() => window.__ijinden.ui.game.phase), 'turnNo', await B.evaluate(() => window.__ijinden.ui.game.turnNo));
console.log('errors', errs);
await b.close();
