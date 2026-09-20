// 一次性诊断：航标塔围栏一圈的地形剖面
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
await delay(400);

const prof = await page.evaluate(() => {
  const cx = 0.1;
  const cz = -47.8;
  const out = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const x = cx + Math.cos(a) * 7.6;
    const z = cz + Math.sin(a) * 7.6;
    out.push(+window.__island.groundAt(x, z).toFixed(2));
  }
  return out;
});
let maxDrop = 0;
let at = -1;
for (let i = 0; i < prof.length - 1; i++) {
  const d = Math.abs(prof[i + 1] - prof[i]);
  if (d > maxDrop) {
    maxDrop = d;
    at = i;
  }
}
console.log('航标塔围栏一圈地形高度（每 5° 一个采样）：');
console.log(prof.join(' '));
console.log(`相邻采样最大高差 ${maxDrop.toFixed(2)}m @ 第 ${at} 个采样（≈${((at / 72) * 360).toFixed(0)}°）`);
// 每 1.2m 墙段的对应高差：一圈 2πr≈47.8m，72 个采样 → 每采样 0.66m
console.log(`换算到 1.2m 墙段 ≈ ${(maxDrop * (1.2 / 0.66)).toFixed(2)}m 高差`);
await browser.close();
