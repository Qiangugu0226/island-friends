// 墙段贴地精度：沿每段墙底直线取样，直接和地形比
// 用法：node tools/probe-ground.mjs
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

const r = await page.evaluate(() => {
  const walls = window.__island.wallsList();
  let maxFloat = 0;
  let maxBurial = 0;
  let floatAt = null;
  let burialAt = null;
  let samples = 0;
  const lenHist = { '≤0.6': 0, '≤1.2': 0, '≤2': 0, '>2': 0 };
  for (const s of walls) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    if (len <= 0.6) lenHist['≤0.6'] += 1;
    else if (len <= 1.2) lenHist['≤1.2'] += 1;
    else if (len <= 2) lenHist['≤2'] += 1;
    else lenHist['>2'] += 1;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const x = s.ax + (s.bx - s.ax) * t;
      const z = s.az + (s.bz - s.az) * t;
      const g = window.__island.groundAt(x, z);
      const y = s.baseY0 + (s.baseY1 - s.baseY0) * t; // 段底直线
      const gap = y - g; // >0 浮空 / <0 埋入
      samples += 1;
      if (gap > maxFloat) {
        maxFloat = gap;
        floatAt = [+x.toFixed(1), +z.toFixed(1)];
      }
      if (-gap > maxBurial) {
        maxBurial = -gap;
        burialAt = [+x.toFixed(1), +z.toFixed(1)];
      }
    }
  }
  return { segs: walls.length, samples, maxFloat: +maxFloat.toFixed(3), floatAt, maxBurial: +maxBurial.toFixed(3), burialAt, lenHist };
});

console.log('目标：' + (target.kind === 'file' ? '单文件离线版' : target.url));
console.log(`墙段 ${r.segs} 段 × 9 个采样点 = ${r.samples} 次测地`);
console.log(`段长分布：${Object.entries(r.lenHist).map(([k, v]) => `${k}m ${v}段`).join(' / ')}`);
console.log(`最大浮空 ${r.maxFloat} m ${r.floatAt ? `@(${r.floatAt})` : ''}   （>0.06 就该修）`);
console.log(`最大埋深 ${r.maxBurial} m ${r.burialAt ? `@(${r.burialAt})` : ''}   （>0.35 墙会显得矮）`);
await browser.close();
