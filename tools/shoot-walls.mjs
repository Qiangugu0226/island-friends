// 院墙出图：每圈一张"院子外侧三分之四视角" + 一张正对墙面的近景
// 机位选法：贴着圈的径向方向站到 r+9 处；近景只挑"墙面朝向镜头"的段（避免拍到墙的侧棱）
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
page.on('pageerror', (e) => console.log('页面错误：', e.message));
await page.goto(target.url + (target.url.includes('?') ? '&' : '?') + 'hud=0', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(800);

const walls = await page.evaluate(() => window.__island.wallsList());
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.2;
const seen = new Array(walls.length).fill(false);
const rings = [];
for (let i = 0; i < walls.length; i++) {
  if (seen[i]) continue;
  const stack = [i];
  seen[i] = true;
  const segs = [];
  while (stack.length) {
    const k = stack.pop();
    const s = walls[k];
    segs.push(s);
    for (let j = 0; j < walls.length; j++) {
      if (seen[j]) continue;
      const t = walls[j];
      if (near([s.ax, s.az], [t.ax, t.az]) || near([s.ax, s.az], [t.bx, t.bz]) || near([s.bx, s.bz], [t.ax, t.az]) || near([s.bx, s.bz], [t.bx, t.bz])) {
        seen[j] = true;
        stack.push(j);
      }
    }
  }
  const pts = segs.flatMap((s) => [[s.ax, s.az], [s.bx, s.bz]]);
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const r = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cz)));
  rings.push({ cx, cz, r, segs });
}
rings.sort((a, b) => a.cx - b.cx);
console.log(`共 ${rings.length} 圈院墙`);

for (let i = 0; i < rings.length; i++) {
  const rg = rings[i];
  const gY = await page.evaluate(([x, z]) => window.__island.groundAt(x, z), [rg.cx, rg.cz]);
  const ang = [0.6, 2.2, 3.6, 5.0, 0.9][i % 5];
  const camPos = [rg.cx + Math.cos(ang) * (rg.r + 12), gY + 9.5, rg.cz + Math.sin(ang) * (rg.r + 12)];
  const look = [rg.cx, gY + 0.6, rg.cz];
  await page.evaluate(([p, l]) => window.__island.setFreeCam(p, l), [camPos, look]);
  await delay(700);
  await page.screenshot({ path: `shots/p5f-yard-${i + 1}.png` });
  console.log(`  圈${i + 1} 中心(${rg.cx.toFixed(1)},${rg.cz.toFixed(1)}) r≈${rg.r.toFixed(1)} ${rg.segs.length}段 → shots/p5f-yard-${i + 1}.png`);
}

// 近景：挑一段"面朝外"的墙（法线方向 = 离圈心向外的方向），站在前面 4.5m
const rg0 = rings[1] ?? rings[0];
let best = null;
for (const s of rg0.segs) {
  const mx = (s.ax + s.bx) / 2;
  const mz = (s.az + s.bz) / 2;
  const radX = mx - rg0.cx;
  const radZ = mz - rg0.cz;
  const rl = Math.hypot(radX, radZ);
  const L = Math.hypot(s.bx - s.ax, s.bz - s.az);
  const dX = (s.bx - s.ax) / L;
  const dZ = (s.bz - s.az) / L;
  // 墙面法线（两种朝向里取"朝外"的那个），与径向的夹角越小 = 越正对镜头
  let nx = -dZ;
  let nz = dX;
  if (nx * radX + nz * radZ < 0) {
    nx = -nx;
    nz = -nz;
  }
  const face = (nx * radX + nz * radZ) / rl; // 1 = 完全正对
  if (L < 1.2) continue; // 太短的段拍出来没内容
  if (!best || face > best.face) best = { s, mx, mz, nx, nz, face, len: L };
}
const gY2 = await page.evaluate(([x, z]) => window.__island.groundAt(x, z), [best.mx, best.mz]);
const cam2 = [best.mx + best.nx * 4.5, gY2 + 1.35, best.mz + best.nz * 4.5];
await page.evaluate(([p, l]) => window.__island.setFreeCam(p, l), [cam2, [best.mx, gY2 + 0.5, best.mz]]);
await delay(700);
await page.screenshot({ path: 'shots/p5f-wall-close.png' });
console.log(`  近景：段(${best.mx.toFixed(1)},${best.mz.toFixed(1)}) 长 ${best.len.toFixed(2)}m 正对度 ${best.face.toFixed(2)} → shots/p5f-wall-close.png`);
await browser.close();
