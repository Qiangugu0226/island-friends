// 验证审计护栏真的能抓住"网格与数据不一致"：
// 正常应为 0 问题 → 把院墙网格整体下沉 1.05m → 必须报「墙网格错位」→ 复原后回到 0
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { pickTarget, BROWSER_ARGS, browserPath } from './lib/target.mjs';

const target = await pickTarget();
const browser = await puppeteer.launch({
  executablePath: browserPath([
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ]),
  headless: true,
  args: BROWSER_ARGS
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('页面错误：', e.message));
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(600);

const list = (r) => (r.problems ?? r).map((p) => `${p.type}(${p.name})`).join(' / ') || '（无）';
const a0 = await page.evaluate(() => window.__island.audit());
console.log('① 正常状态：' + list(a0));

const moved = await page.evaluate(() => {
  let n = 0;
  window.__island.scene.traverse((o) => {
    if (o.isMesh && (o.name === 'wall-body' || o.name === 'wall-cap')) {
      o.position.y -= 1.05;
      o.updateMatrixWorld(true);
      n += 1;
    }
  });
  return n;
});
await delay(200);
const a1 = await page.evaluate(() => window.__island.audit());
console.log(`② 把 ${moved} 个院墙网格下沉 1.05m：` + list(a1));

await page.evaluate(() => {
  window.__island.scene.traverse((o) => {
    if (o.isMesh && (o.name === 'wall-body' || o.name === 'wall-cap')) {
      o.position.y += 1.05;
      o.updateMatrixWorld(true);
    }
  });
});
await delay(200);
const a2 = await page.evaluate(() => window.__island.audit());
console.log('③ 复原：' + list(a2));

const ok = (a0.problems ?? a0).length === 0 && (a1.problems ?? a1).some((p) => p.type === '墙网格错位') && (a2.problems ?? a2).length === 0;
console.log(ok ? '\n✅ 护栏有效：埋进土里一定会被审计抓到' : '\n❌ 护栏没生效，审计漏掉了错位的网格');
await browser.close();
process.exit(ok ? 0 : 1);
