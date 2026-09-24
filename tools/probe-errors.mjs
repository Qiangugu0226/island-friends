// 页面加载诊断：打印控制台消息与报错（当游戏卡在 loading / __island.ready 不上来时用）
// 用法：node tools/probe-errors.mjs
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
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log('[pageerror] ' + (e.stack || e.message)));
page.on('requestfailed', (r) => console.log('[requestfailed] ' + r.url()));
console.log('目标：' + (target.kind === 'file' ? '单文件离线版' : target.url));
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await delay(12000);
const st = await page.evaluate(() => ({
  hasIsland: !!window.__island,
  ready: window.__island ? window.__island.ready : null,
  loading: document.querySelector('#loading')?.style.display ?? null,
  hudText: (document.querySelector('.hud')?.textContent ?? '').slice(0, 120)
}));
console.log('状态：', JSON.stringify(st));
await browser.close();
