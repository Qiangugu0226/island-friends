// 曲线院墙外观核对：从院子外侧看墙的走向 / 贴地 / 门洞
// 用法：node tools/shoot-walls.mjs
import { mkdirSync } from 'node:fs';
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
  args: [...BROWSER_ARGS, '--window-size=1600,900']
});
mkdirSync('shots', { recursive: true });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(700);

const ev = (fn, arg) => page.evaluate(fn, arg);

// 把墙段按圈聚类，取每圈的中心
const rings = await ev(() => {
  const w = window.__island.wallsList();
  return w;
});
const seen = new Array(rings.length).fill(false);
const centers = [];
for (let i = 0; i < rings.length; i++) {
  if (seen[i]) continue;
  const stack = [i];
  seen[i] = true;
  const pts = [];
  while (stack.length) {
    const k = stack.pop();
    const s = rings[k];
    pts.push([s.ax, s.az], [s.bx, s.bz]);
    for (let j = 0; j < rings.length; j++) {
      if (seen[j]) continue;
      const t = rings[j];
      const q = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]) < 2.0;
      if (q([s.ax, s.az], [t.ax, t.az]) || q([s.ax, s.az], [t.bx, t.bz]) || q([s.bx, s.bz], [t.ax, t.az]) || q([s.bx, s.bz], [t.bx, t.bz])) {
        seen[j] = true;
        stack.push(j);
      }
    }
  }
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const r = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cz)));
  centers.push({ cx: +cx.toFixed(1), cz: +cz.toFixed(1), r: +r.toFixed(1), segs: pts.length / 2 });
}
console.log('院墙圈：', centers.map((c) => `(${c.cx},${c.cz}) r≈${c.r} ${c.segs}段`).join('  '));

let n = 0;
for (const c of centers) {
  n += 1;
  // 站在墙外圈外一点，朝院心看 → 能看到墙的走向
  const d = c.r + 5.5;
  const x = c.cx + d;
  const z = c.cz + d * 0.35;
  await ev(([px, pz]) => window.__island.teleport(px, pz), [x, z]);
  await delay(260);
  const yaw = (Math.atan2(x - c.cx, z - c.cz) * 180) / Math.PI;
  await ev((y) => window.__island.setYaw(y), yaw);
  await ev((p) => window.__island.setPitch(p), -8);
  await delay(700);
  await page.screenshot({ path: `shots/p5e-wall-${n}.png` });
  console.log(`   已出图 shots/p5e-wall-${n}.png  （墙圈中心 ${c.cx},${c.cz}）`);
}

// 再出一张高角度全景，整体看院墙形状
await ev(() => window.__island.teleport(18, 22));
await delay(500);
await ev((y) => window.__island.setYaw(y), 40);
await ev((p) => window.__island.setPitch(p), 62);
await delay(900);
await page.screenshot({ path: 'shots/p5e-wall-overview.png' });
console.log('   已出图 shots/p5e-wall-overview.png');
if (errs.length) console.log('页面错误：', errs.slice(0, 3).join(' | '));
await browser.close();
