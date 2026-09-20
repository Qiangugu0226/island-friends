// 启动诊断：打开游戏，抓页面错误与加载进度
// 用法：node tools/diagnose.mjs [等待秒数]
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { pickTarget, BROWSER_ARGS, browserPath } from './lib/target.mjs';

const waitSec = Number(process.argv[2] ?? 12);
const target = await pickTarget();
const browser = await puppeteer.launch({
  executablePath: browserPath([
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ]),
  headless: true,
  args: [...BROWSER_ARGS, '--window-size=900,500']
});
const page = await browser.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}\n   ${(e.stack || '').split('\n').slice(1, 4).join('\n   ')}`));
page.on('console', (m) => {
  const s = m.text();
  if (!/vite|ProtocolLaunch/.test(s)) logs.push(`[${m.type()}] ${s.slice(0, 300)}`);
});
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await delay(waitSec * 1000);
const step = await page.$eval('#loading-step', (n) => n.textContent).catch(() => '(无)');
const ready = await page.evaluate(() => !!(window.__island && window.__island.ready)).catch(() => false);
const info = await page.evaluate(() => (window.__island?.collisionInfo ? window.__island.collisionInfo() : null)).catch(() => null);
await browser.close();
console.log(`目标：${target.kind === 'file' ? '单文件离线版' : target.url}`);
console.log(`ready=${ready}  加载界面：${step}`);
if (info) console.log(`碰撞体：圆形 ${info.circles} · 院墙 ${info.walls} · 平台 ${info.platforms}`);
console.log('--- 日志 ---');
console.log(logs.slice(0, 14).join('\n') || '(无)');
