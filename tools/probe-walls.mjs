// 院墙形状体检：走向分布（方框只有 2 个方向）+ 每段是否贴地
// 用法：node tools/probe-walls.mjs
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
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(500);
const s = await page.evaluate(() => window.__island.wallStats());
const g = await page.evaluate(() => window.__island.wallGroups());
console.log('目标：' + (target.kind === 'file' ? '单文件离线版' : target.url));
console.log(`墙段 ${s.segs} 段，聚成 ${g.groups} 个圈（${g.sizes.join('/')}）`);
console.log(`走向覆盖 ${s.dirBins}/18 个方向扇区，最大单一方向占 ${(s.topBinShare * 100).toFixed(0)}%（方框 ≈ 2/18、占 50%）`);
console.log(`墙底离地最大间隙 ${s.maxBottomGap} m ${s.worstAt ? `@(${s.worstAt})` : ''}（>0 = 悬空）`);
await browser.close();
