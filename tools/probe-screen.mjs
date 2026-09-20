// 把画面读成 ASCII 图：不依赖视觉模型也能"看"到场景里有什么
// 用法：
//   node tools/probe-screen.mjs                  → 站在村口朝北看
//   node tools/probe-screen.mjs wall             → 自动对准一段院墙
//   node tools/probe-screen.mjs cam:x,y,z look:x,y,z
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

const mode = process.argv[2] ?? 'village';
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.split(':')));

let camPos;
let camLook;
let label = '';
if (argv.cam && argv.look) {
  camPos = argv.cam.split(',').map(Number);
  camLook = argv.look.split(',').map(Number);
  label = '指定机位';
} else if (mode === 'wall') {
  const gates = await page.evaluate(() => window.__island.wallGates());
  const walls = await page.evaluate(() => window.__island.wallsList());
  const gd = (s) => {
    const mx = (s.ax + s.bx) / 2;
    const mz = (s.az + s.bz) / 2;
    return Math.min(...gates.map((g) => Math.hypot(mx - g.x, mz - g.z) - g.r));
  };
  const w0 = [...walls].sort((a, b) => gd(b) - gd(a))[0];
  const mx = (w0.ax + w0.bx) / 2;
  const mz = (w0.az + w0.bz) / 2;
  const L = Math.hypot(w0.bx - w0.ax, w0.bz - w0.az);
  let px = -(w0.bz - w0.az) / L;
  let pz = (w0.bx - w0.ax) / L;
  const ring = walls.filter((s) => Math.hypot((s.ax + s.bx) / 2 - mx, (s.az + s.bz) / 2 - mz) < 12);
  const rc = ring.reduce((a, s) => [a[0] + (s.ax + s.bx) / 2, a[1] + (s.az + s.bz) / 2], [0, 0]).map((v) => v / ring.length);
  if (Math.hypot(mx + px * 2 - rc[0], mz + pz * 2 - rc[1]) < Math.hypot(mx - px * 2 - rc[0], mz - pz * 2 - rc[1])) {
    px = -px;
    pz = -pz;
  }
  const gY = await page.evaluate(([x, z]) => window.__island.groundAt(x, z), [mx, mz]);
  camPos = [mx + px * 6, gY + 1.6, mz + pz * 6];
  camLook = [mx, gY + 0.4, mz];
  label = `院墙段 (${mx.toFixed(1)},${mz.toFixed(1)}) 长 ${L.toFixed(2)}m，墙底 y=${gY}`;
  await page.evaluate(
    ([mx2, mz2, y2]) => {
      window.__w = [mx2, y2, mz2];
    },
    [mx, gY, mz]
  );
} else if (mode === 'yard') {
  // 从院子外面正对整圈院墙看（玩家真实视角）
  const walls = await page.evaluate(() => window.__island.wallsList());
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
        const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.2;
        if (near([s.ax, s.az], [t.ax, t.az]) || near([s.ax, s.az], [t.bx, t.bz]) || near([s.bx, s.bz], [t.ax, t.az]) || near([s.bx, s.bz], [t.bx, t.bz])) {
          seen[j] = true;
          stack.push(j);
        }
      }
    }
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const r = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cz)));
    rings.push({ cx, cz, r, segs: pts.length / 2 });
  }
  rings.sort((a, b) => a.cx - b.cx);
  const idx = Number(argv.ring ?? 0);
  const rg = rings[idx];
  const gY = await page.evaluate(([x, z]) => window.__island.groundAt(x, z), [rg.cx, rg.cz]);
  const ang = Number(argv.ang ?? 45) * (Math.PI / 180);
  const ux = Math.cos(ang);
  const uz = Math.sin(ang);
  camPos = [rg.cx + ux * (rg.r + 9), gY + 3.2, rg.cz + uz * (rg.r + 9)];
  camLook = [rg.cx, gY + 0.6, rg.cz];
  label = `第${idx + 1}圈院墙 中心(${rg.cx.toFixed(1)},${rg.cz.toFixed(1)}) r≈${rg.r.toFixed(1)} ${rg.segs}段`;
  console.log(`共 ${rings.length} 圈：` + rings.map((x, i) => `${i + 1}(${x.cx.toFixed(1)},${x.cz.toFixed(1)} r${x.r.toFixed(1)})`).join(' '));
} else {
  camPos = [0, 12, 40];
  camLook = [0, 4, 0];
  label = '村口高机位朝岛心';
}
console.log(`机位：${label}`);
console.log(`自由相机 ${camPos.map((v) => v.toFixed(1))} → 看 ${camLook.map((v) => v.toFixed(1))}`);
await page.evaluate(([p, l]) => window.__island.setFreeCam(p, l), [camPos, camLook]);
await delay(800);
if (process.env.WALLS === 'off') {
  const n = await page.evaluate(() => {
    let n = 0;
    window.__island.scene.traverse((o) => {
      if (o.isMesh && (o.name === 'wall-body' || o.name === 'wall-cap')) {
        o.visible = false;
        n += 1;
      }
    });
    return n;
  });
  console.log(`（已隐藏 ${n} 个院墙网格，用于对照）`);
  await delay(400);
}
if (process.env.WALLS === 'magenta') {
  const n = await page.evaluate(() => {
    const THREE = window.__island.THREE;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
    let n = 0;
    window.__island.scene.traverse((o) => {
      if (o.isMesh && (o.name === 'wall-body' || o.name === 'wall-cap')) {
        o.material = mat;
        n += 1;
      }
    });
    return n;
  });
  console.log(`（${n} 个院墙网格材质换成纯品红，用于对照）`);
  await delay(400);
}

const map = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const W = canvas.width;
  const H = canvas.height;
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const COLS = 64;
  const ROWS = 30;
  const rows = [];
  const counts = {};
  for (let r = 0; r < ROWS; r++) {
    let line = '';
    for (let c = 0; c < COLS; c++) {
      // gl 的 y 从下往上 → 翻转
      const x0 = Math.floor((c * W) / COLS);
      const x1 = Math.floor(((c + 1) * W) / COLS);
      const y0 = Math.floor(((ROWS - 1 - r) * H) / ROWS);
      const y1 = Math.floor(((ROWS - r) * H) / ROWS);
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let y = y0; y < y1; y += 3) {
        for (let x = x0; x < x1; x += 3) {
          const i = (y * W + x) * 4;
          sr += buf[i];
          sg += buf[i + 1];
          sb += buf[i + 2];
          n += 1;
        }
      }
      const rr = sr / n;
      const gg = sg / n;
      const bb = sb / n;
      const mean = (rr + gg + bb) / 3;
      const mx = Math.max(rr, gg, bb);
      const mn = Math.min(rr, gg, bb);
      let ch;
      if (rr > 110 && bb > 110 && gg < rr - 45 && gg < bb - 45) ch = 'R'; // 纯品红（对照用）
      else if (bb > rr + 14 && bb >= gg) ch = '~'; // 水
      else if (gg > rr + 10 && gg > bb + 6) ch = 'T'; // 草木
      else if (mean < 62) ch = '#'; // 暗部：屋顶/树荫/背光面
      else if (mx - mn < 26 && mean > 88) ch = 'S'; // 灰石/墙
      else if (mx - mn < 26) ch = 'd'; // 灰但暗
      else if (rr > gg && gg > bb && mean > 150) ch = '.'; // 亮暖：天空/沙地
      else ch = 'o'; // 其它（泥路/木/砖）
      line += ch;
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
    rows.push(line);
  }
  const total = COLS * ROWS;
  const legend = { R: '对照色', '~': '水', T: '草木', '#': '暗部', S: '灰石/墙', d: '灰暗', '.': '亮暖/天空', o: '其它' };
  const stat = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}${legend[k]} ${((v / total) * 100).toFixed(1)}%`)
    .join(' · ');
  return { rows, stat };
});
console.log('图例：~水  T草木  #暗部  S灰石/墙  d灰暗  .亮暖/天空  o其它\n');
map.rows.forEach((r, i) => console.log(String(i).padStart(2) + ' ' + r));
console.log('\n占比：' + map.stat);
await page.screenshot({ path: 'shots/probe-screen.png' });
await browser.close();
