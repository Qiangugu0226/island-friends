// 运行穿模审计并把问题列出来
// 用法：node tools/audit.mjs
import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = EDGE_CANDIDATES.find((p) => existsSync(p));
const port = process.env.SHOOT_PORT ?? '5173';

const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: true,
  args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${port}/?view=top`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(600);

const report = await page.evaluate(() => window.__island.audit());
await browser.close();

console.log(`扫描固定物件：${report.itemCount} 件`);
console.log('问题统计：', JSON.stringify(report.byType, null, 0));
console.log('');
for (const p of report.problems) {
  console.log(`${p.type.padEnd(6, '　')} ${String(p.name).padEnd(22, '　')} (${p.x}, ${p.z})  ${p.detail}`);
}
writeFileSync('shots/audit-report.json', JSON.stringify(report, null, 2), 'utf8');
console.log(`\n完整报告：shots/audit-report.json`);
if (errors.length) console.log('页面错误：', errors.slice(0, 5).join(' | '));
