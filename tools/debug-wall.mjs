// 院墙贴合排查：打印每段的局部 y / 世界 y / 该处地形高度
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

const out = await page.evaluate(() => {
  const THREE = window.__island.THREE;
  const scene = window.__island.scene;
  let yard = null;
  scene.traverse((o) => {
    if (o.name && o.name.startsWith('院墙:house-stone')) yard = o;
  });
  if (!yard) return { error: '未找到院墙' };
  const res = {
    groupPos: yard.position.toArray().map((v) => +v.toFixed(2)),
    groupRotY: +yard.rotation.y.toFixed(3),
    children: yard.children.length,
    sample: []
  };
  for (let i = 0; i < Math.min(6, yard.children.length); i++) {
    const ch = yard.children[i];
    const box = new THREE.Box3().setFromObject(ch);
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    res.sample.push({
      localY: +ch.position.y.toFixed(2),
      worldMinY: +box.min.y.toFixed(2),
      terrain: +window.__island.groundAt(cx, cz),
      gap: +(box.min.y - window.__island.groundAt(cx, cz)).toFixed(2)
    });
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
