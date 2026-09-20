// 色彩分级 + 接触阴影的开/关对照图（同机位、同时刻）
// 用法：node tools/shoot-grade.mjs
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

// 机位：[名字, 小时, 相机, 看向]
const views = [
  ['day', 10, [-18, 8.5, 44], [-10, 4.2, 20]],
  ['base', 10, [-21.5, 5.6, 36], [-31, 4.0, 27]],
  ['dusk', 18.6, [-18, 8.5, 44], [-10, 4.2, 20]],
  ['night', 21.5, [6, 7.5, 6], [16, 3.4, 21]]
];
const only = process.argv[2];
const combos = [
  ['off', 'grade=0&shadows=0'],
  ['shadow', 'grade=0'],
  ['grade', 'shadows=0'],
  ['both', '']
];

for (const [vname, hour, cam, look] of views) {
  if (only && only !== vname) continue;
  for (const [cname, qs] of combos) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    const url = `${target.url}${target.url.includes('?') ? '&' : '?'}hud=0&hour=${hour}${qs ? '&' + qs : ''}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
    await delay(700);
    await page.evaluate(([p, l]) => window.__island.setFreeCam(p, l), [cam, look]);
    await delay(900);
    const file = `shots/p5g-${vname}-${cname}.png`;
    await page.screenshot({ path: file });
    console.log(`${vname.padEnd(5)} ${cname.padEnd(6)} → ${file}${errs.length ? '  ❌ ' + errs[0] : ''}`);
    await page.close();
  }
}
await browser.close();
