// 测试单文件离线 HTML 能不能从 file:// 直接跑起来
// 用法：node tools/test-single.mjs
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = EDGE_CANDIDATES.find((p) => existsSync(p));
const file = resolve('小岛朋友.html');
if (!existsSync(file)) {
  console.error('找不到 小岛朋友.html，先跑 npm run build:single');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: true,
  args: ['--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--allow-file-access-from-files']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

const problems = [];
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/vite/.test(m.text())) problems.push(`[console] ${m.text()}`);
});

const fileUrl = `file:///${file.replace(/\\/g, '/')}`;
await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
let ready = false;
try {
  await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 120000 });
  ready = true;
} catch {
  const step = await page.$eval('#loading-step', (n) => n.textContent).catch(() => '(读不到)');
  problems.push(`世界未就绪，加载界面显示：${step}`);
}
await delay(1200);
await page.screenshot({ path: 'shots/single-file.png' });
await browser.close();

console.log(`file:// 离线运行：${ready ? '✅ 成功' : '❌ 失败'}`);
console.log('截图：shots/single-file.png');
if (problems.length) problems.slice(0, 8).forEach((p) => console.log(p));
