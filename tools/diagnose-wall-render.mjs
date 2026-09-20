// 三张对照图分辨：是"几何体画不出来"还是"材质画不出来"
//  A 基线 → B 在同一个位置放一个纯红方块（几何体+基本材质一定能画） → C 把院墙材质换成纯红
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
await page.goto(target.url + (target.url.includes('?') ? '&' : '?') + 'preserve=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(700);

// 机位：院子外面正对整圈院墙（和 probe-screen.mjs yard 一致）
const walls = await page.evaluate(() => window.__island.wallsList());
let cx = walls.reduce((a, s) => a + s.ax, 0) / walls.length;
let cz = walls.reduce((a, s) => a + s.az, 0) / walls.length;
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.2;
const seen = new Array(walls.length).fill(false);
const rings = [];
for (let i = 0; i < walls.length; i++) {
  if (seen[i]) continue;
  const stack = [i];
  seen[i] = true;
  const pts = [];
  while (stack.length) {
    const k = stack.pop();
    const s = walls[k];
    pts.push([s.ax, s.az], [s.bx, s.bz]);
    for (let j = 0; j < walls.length; j++) {
      if (seen[j]) continue;
      const t = walls[j];
      if (near([s.ax, s.az], [t.ax, t.az]) || near([s.ax, s.az], [t.bx, t.bz]) || near([s.bx, s.bz], [t.ax, t.az]) || near([s.bx, s.bz], [t.bx, t.bz])) {
        seen[j] = true;
        stack.push(j);
      }
    }
  }
  const rcx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const rcz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  rings.push({ cx: rcx, cz: rcz, r: Math.max(...pts.map((p) => Math.hypot(p[0] - rcx, p[1] - rcz))), pts });
}
rings.sort((a, b) => a.cx - b.cx);
const rg = rings[0];
cx = rg.cx;
cz = rg.cz;
const gY = await page.evaluate(([x, z]) => window.__island.groundAt(x, z), [cx, cz]);
const camPos = [cx + (rg.r + 9) * 0.7, gY + 3.2, cz + (rg.r + 9) * 0.7];
const camLook = [cx, gY + 0.6, cz];
console.log(`机位：院圈中心(${cx.toFixed(1)},${cz.toFixed(1)}) r≈${rg.r.toFixed(1)}；相机 ${camPos.map((v) => v.toFixed(1))}`);
await page.evaluate(([p, l]) => window.__island.setFreeCam(p, l), [camPos, camLook]);
await delay(800);

const ascii = () =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const W = canvas.width;
    const H = canvas.height;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const COLS = 64;
    const ROWS = 28;
    const rows = [];
    const counts = {};
    for (let r = 0; r < ROWS; r++) {
      let line = '';
      for (let c = 0; c < COLS; c++) {
        const x0 = Math.floor((c * W) / COLS);
        const x1 = Math.floor(((c + 1) * W) / COLS);
        const y0 = Math.floor(((ROWS - 1 - r) * H) / ROWS);
        const y1 = Math.floor(((ROWS - r) * H) / ROWS);
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (let y = y0; y < y1; y += 3)
          for (let x = x0; x < x1; x += 3) {
            const i = (y * W + x) * 4;
            sr += buf[i];
            sg += buf[i + 1];
            sb += buf[i + 2];
            n += 1;
          }
        const rr = sr / n;
        const gg = sg / n;
        const bb = sb / n;
        const mean = (rr + gg + bb) / 3;
        const mx = Math.max(rr, gg, bb);
        const mn = Math.min(rr, gg, bb);
        let ch;
        if (rr > gg + 45 && rr > bb + 45) ch = 'R';
        else if (bb > rr + 14 && bb >= gg) ch = '~';
        else if (gg > rr + 10 && gg > bb + 6) ch = 'T';
        else if (mean < 62) ch = '#';
        else if (mx - mn < 26 && mean > 88) ch = 'S';
        else if (mx - mn < 26) ch = 'd';
        else if (rr > gg && gg > bb && mean > 150) ch = '.';
        else ch = 'o';
        line += ch;
        counts[ch] = (counts[ch] ?? 0) + 1;
      }
      rows.push(line);
    }
    const total = COLS * ROWS;
    return { rows, stat: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}${((v / total) * 100).toFixed(1)}%`).join(' ') };
  });

const show = async (title) => {
  const m = await ascii();
  console.log(`\n===== ${title} =====`);
  m.rows.forEach((r, i) => console.log(String(i).padStart(2) + ' ' + r));
  console.log('占比：' + m.stat);
};

await show('A 基线（现在的院墙）');

// B：在同一位置放一个纯红方块 + 一圈红色小方块（贴着每一段墙）
const placed = await page.evaluate(
  ([cx2, cz2, gy, pts]) => {
    const THREE = window.__island.THREE;
    const scene = window.__island.scene;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const big = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
    big.position.set(cx2, gy + 1.2, cz2);
    scene.add(big);
    const group = new THREE.Group();
    for (const [x, z] of pts) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), mat);
      b.position.set(x, window.__island.groundAt(x, z) + 0.6, z);
      group.add(b);
    }
    scene.add(group);
    return group.children.length;
  },
  [cx, cz, gY, rg.pts]
);
await delay(600);
await show(`B 加了 1 个 2m 红方块（院心）+ ${placed} 个红柱（沿墙点）`);

// C：把院墙材质换成纯红
const swapped = await page.evaluate(() => {
  const THREE = window.__island.THREE;
  const red = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
  let n = 0;
  window.__island.scene.traverse((o) => {
    if (o.isMesh && (o.name === 'wall-body' || o.name === 'wall-cap')) {
      o.material = red;
      n += 1;
    }
  });
  return n;
});
await delay(600);
await show(`C ${swapped} 个院墙网格换成纯品红基本材质（DoubleSide）`);
await browser.close();
