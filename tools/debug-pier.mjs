// 码头栈台站立问题排查
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { pickTarget, BROWSER_ARGS, browserPath } from './lib/target.mjs';

const target = await pickTarget();
const browser = await puppeteer.launch({
  executablePath: browserPath([
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ]),
  headless: true,
  args: [...BROWSER_ARGS, '--window-size=900,500']
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(800);

const plats = await page.evaluate(() => window.__island.platformsList());
console.log('platforms:', JSON.stringify(plats));
const p = plats[0];
const c = Math.cos(p.rot);
const s = Math.sin(p.rot);
const px = p.x + p.cx * c + p.cz * s;
const pz = p.z - p.cx * s + p.cz * c;
console.log(`栈台中心世界坐标: (${px.toFixed(2)}, ${pz.toFixed(2)})  顶面 ${p.topY}`);

const before = await page.evaluate(([x, z]) => window.__island.hitTest(x, z), [px, pz]);
console.log('传送前 hitTest:', JSON.stringify(before));

await page.evaluate(([x, z]) => window.__island.teleport(x, z), [px, pz]);
for (let i = 0; i < 6; i++) {
  await delay(200);
  const st = await page.evaluate(([x, z]) => {
    const pos = window.__island.pos();
    return { pos: pos.map((v) => +v.toFixed(2)), here: window.__island.hitTest(pos[0], pos[2]) };
  }, [px, pz]);
  console.log(`  t${i}: pos=${JSON.stringify(st.pos)}  platform=${st.here.platform} ground=${st.here.ground} wall=${st.here.wall} circle=${JSON.stringify(st.here.circle)}`);
}

await browser.close();
