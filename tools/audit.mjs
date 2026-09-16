// 运行穿模审计并把问题列出来
// 用法：node tools/audit.mjs
// 会自动选目标：开发服务器在 → 用它；不在 → 用单文件 小岛朋友.html
import { writeFileSync } from 'node:fs';
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
  args: [...BROWSER_ARGS, '--window-size=1280,720']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${target.url}?view=top`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(600);

const report = await page.evaluate(() => window.__island.audit());
await browser.close();

console.log(`目标：${target.kind === 'file' ? '单文件离线版' : target.url}`);
console.log(`扫描固定物件：${report.itemCount} 件`);
console.log('问题统计：', JSON.stringify(report.byType));
console.log('');
for (const p of report.problems) {
  console.log(`${p.type.padEnd(6, '　')} ${String(p.name).padEnd(24, '　')} (${p.x}, ${p.z})  ${p.detail}`);
}
writeFileSync('shots/audit-report.json', JSON.stringify(report, null, 2), 'utf8');
console.log(`\n完整报告：shots/audit-report.json`);
if (errors.length) console.log('页面错误：', errors.slice(0, 5).join(' | '));
