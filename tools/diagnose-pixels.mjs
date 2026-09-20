// 像素级验证：围栏到底有没有画到屏幕上
// 做法：自由相机站在墙正前方 4m、对着墙段中点 → 墙正好在画面正中 →
//       在那块区域 readPixels，做「开 → 关 → 开」三次读数：
//       只有"关掉墙"那一次明显不同，才说明这些像素确实是墙。
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
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
page.on('pageerror', (e) => console.log('页面错误：', e.message));
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(800);
await page.keyboard.press('KeyT'); // 暂停时间，减少帧间差异
await delay(400);

const gates = await page.evaluate(() => window.__island.wallGates());
const walls = await page.evaluate(() => window.__island.wallsList());
const gateDist = (s) => {
  const mx = (s.ax + s.bx) / 2;
  const mz = (s.az + s.bz) / 2;
  return Math.min(...gates.map((g) => Math.hypot(mx - g.x, mz - g.z) - g.r));
};
const w0 = [...walls].sort((a, b) => gateDist(b) - gateDist(a))[0];
const mx = (w0.ax + w0.bx) / 2;
const mz = (w0.az + w0.bz) / 2;
const L = Math.hypot(w0.bx - w0.ax, w0.bz - w0.az);
const dirX = (w0.bx - w0.ax) / L;
const dirZ = (w0.bz - w0.az) / L;
let px = -dirZ;
let pz = dirX;
// 找到这段墙所属的圈心，把相机放到"院子外侧"（否则会站进房子里）
const ring = walls.filter((s) => Math.hypot((s.ax + s.bx) / 2 - mx, (s.az + s.bz) / 2 - mz) < 12);
const rc = ring.reduce((a, s) => [a[0] + (s.ax + s.bx) / 2, a[1] + (s.az + s.bz) / 2], [0, 0]).map((v) => v / ring.length);
if (Math.hypot(mx + px * 2 - rc[0], mz + pz * 2 - rc[1]) < Math.hypot(mx - px * 2 - rc[0], mz - pz * 2 - rc[1])) {
  px = -px;
  pz = -pz;
}
const gY = await page.evaluate(([x, z]) => window.__island.groundAt(x, z), [mx, mz]);
const camPos = [mx + px * 4, gY + 1.5, mz + pz * 4];
const camLook = [mx, gY + 0.45, mz];
console.log(`测试墙段 (${mx.toFixed(1)},${mz.toFixed(1)}) 长 ${L.toFixed(2)}m，墙底地形 y=${gY}`);
console.log(`院圈心 (${rc[0].toFixed(1)},${rc[1].toFixed(1)})，相机在圈外：${Math.hypot(camPos[0] - rc[0], camPos[2] - rc[1]).toFixed(1)}m（圈半径约 6m）`);
console.log(`自由相机 ${camPos.map((v) => v.toFixed(1))} → 看 ${camLook.map((v) => v.toFixed(1))}`);

await page.evaluate(([p, l]) => window.__island.setFreeCam(p, l), [camPos, camLook]);
await delay(700);

const res = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const W = 400;
  const H = 220;
  const x0 = Math.round(canvas.width / 2 - W / 2);
  const y0 = Math.round(canvas.height / 2 - H / 2 - 40);
  const list = [];
  window.__island.scene.traverse((o) => {
    if (o.isMesh && (o.name === 'wall-body' || o.name === 'wall-cap')) list.push(o);
  });
  const readBox = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const buf = new Uint8Array(W * H * 4);
          gl.readPixels(x0, y0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          let green = 0;
          let stone = 0;
          let sum = 0;
          for (let i = 0; i < W * H; i++) {
            const r = buf[i * 4];
            const g = buf[i * 4 + 1];
            const b = buf[i * 4 + 2];
            sum += (r + g + b) / 3;
            if (g > r + 12 && g > b + 12) green += 1;
            // 石墙贴图为暖灰：三通道接近、偏亮
            else if (Math.abs(r - g) < 26 && Math.abs(g - b) < 34 && r > 95) stone += 1;
          }
          resolve({ bytes: Array.from(buf), green, stone, mean: +(sum / (W * H)).toFixed(1) });
        });
      });
    });
  return (async () => {
    const on1 = await readBox();
    list.forEach((m) => (m.visible = false));
    const off = await readBox();
    list.forEach((m) => (m.visible = true));
    const on2 = await readBox();
    const diff = (a, b) => {
      let d = 0;
      for (let i = 0; i < W * H; i++) {
        const s =
          Math.abs(a.bytes[i * 4] - b.bytes[i * 4]) + Math.abs(a.bytes[i * 4 + 1] - b.bytes[i * 4 + 1]) + Math.abs(a.bytes[i * 4 + 2] - b.bytes[i * 4 + 2]);
        if (s > 30) d += 1;
      }
      return d;
    };
    return {
      total: W * H,
      meshCount: list.length,
      on1: { mean: on1.mean, green: on1.green, stone: on1.stone },
      off: { mean: off.mean, green: off.green, stone: off.stone },
      on2: { mean: on2.mean, green: on2.green, stone: on2.stone },
      diffNoise: diff(on1, on2),
      diffWall: diff(on1, off)
    };
  })();
});

const pct = (n) => `${((n / res.total) * 100).toFixed(1)}%`;
console.log(`网格数 ${res.meshCount}，取样框 ${res.total} 像素（画面正中）`);
console.log(`  墙开① 平均亮度 ${res.on1.mean} · 绿像素 ${pct(res.on1.green)} · 石灰色 ${pct(res.on1.stone)}`);
console.log(`  墙关  平均亮度 ${res.off.mean} · 绿像素 ${pct(res.off.green)} · 石灰色 ${pct(res.off.stone)}`);
console.log(`  墙开② 平均亮度 ${res.on2.mean} · 绿像素 ${pct(res.on2.green)} · 石灰色 ${pct(res.on2.stone)}`);
console.log(`  噪声（开①vs开②）差异像素：${res.diffNoise}（${pct(res.diffNoise)}）`);
console.log(`>>> 墙占的像素（开vs关）：${res.diffWall}（${pct(res.diffWall)}）`);
console.log(res.diffWall > res.diffNoise * 3 + 500 ? '结论：墙确实画在屏幕上' : '结论：取样框里没有墙（或墙没被渲染）');
await page.screenshot({ path: 'shots/p5f-wall-pixel.png' });
await browser.close();
