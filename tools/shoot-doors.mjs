// 每栋石厝一张"从院门外看向房子"的图：核对 门 / 院门缺口 / 信箱 / 石板路 是不是连成一条线
// 用法：node tools/shoot-doors.mjs
import { mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { pickTarget, BROWSER_ARGS, browserPath } from './lib/target.mjs';

const target = await pickTarget();
mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: browserPath([
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ]),
  headless: true,
  args: [...BROWSER_ARGS, '--window-size=1600,900']
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
page.on('pageerror', (e) => console.log('页面错误：', e.message));
await page.goto(target.url + (target.url.includes('?') ? '&' : '?') + 'hud=0&hour=10', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(800);

const pads = await page.evaluate(() => window.__island.padsInfo());
const gates = await page.evaluate(() => window.__island.wallGates());
console.log('石厝：', pads.map((p) => p.id).join(' / '));
console.log('门洞：', gates.map((g) => `(${g.x},${g.z})[${g.owner}]`).join(' '));

for (const p of pads) {
  const [dx, dz] = p.doorDir;
  const gy = await page.evaluate(([x, z]) => window.__island.groundAt(x, z), [p.x, p.z]);
  const cam = [p.x + dx * 15, gy + 7.5, p.z + dz * 15];
  const look = [p.x, gy + 2.2, p.z];
  await page.evaluate(([c, l]) => window.__island.setFreeCam(c, l), [cam, look]);
  await delay(700);
  await page.screenshot({ path: `shots/p5h-door-${p.id}.png` });
  // 顺手量一下：门方向 vs 门洞方向、信箱离门洞多远
  const g = gates.find((x) => x.owner === p.id);
  const dir = g ? [+(((g.x - p.x) / Math.hypot(g.x - p.x, g.z - p.z)).toFixed(3)), +(((g.z - p.z) / Math.hypot(g.x - p.x, g.z - p.z)).toFixed(3))] : null;
  const dot = dir ? dx * dir[0] + dz * dir[1] : null;
  console.log(
    `  ${p.id.padEnd(13)} 门朝(${dx},${dz}) 院门在(${g ? g.x + ',' + g.z : '-'}) 对齐度 ${dot === null ? '-' : dot.toFixed(3)}（1=完全正对）`
  );
}
await browser.close();
