// 碰撞测试：院墙 / 树 / 石头 / 树桩 / 晾衣杆 / 码头栈台
// 用法：node tools/test-collision.mjs
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
  args: [...BROWSER_ARGS, '--window-size=1280,720']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(800);

const results = [];
const check = (n, ok, d = '') => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${n}${d ? '  — ' + d : ''}`);
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const info = await ev(() => window.__island.collisionInfo());
console.log(`目标：${target.kind === 'file' ? '单文件离线版' : target.url}`);
console.log(`碰撞体：圆形 ${info.circles} 个 · 院墙 ${info.walls} 段 · 平台 ${info.platforms} 个\n`);

// ---------- 1. 院墙：墙身挡住、门洞能进 ----------
const walls = await ev(() => window.__island.wallsList());
const groups = await ev(() => window.__island.wallGroups());
check('院墙有碰撞段', walls.length >= 20, `${walls.length} 段，聚成 ${groups.groups} 个圈（尺寸 ${groups.sizes.join('/')}）`);
check('每圈院墙都切成足够多的碰撞段（不是一根大长方体）', groups.sizes.every((s) => s >= 8), `每个圈最少 ${Math.min(...groups.sizes)} 段`);

// 取一段"离门洞最远"的墙：门口本来就能过，选到那儿测穿墙会误判
const gates = await ev(() => window.__island.wallGates());
const gateDist = (s) => {
  const mx = (s.ax + s.bx) / 2;
  const mz = (s.az + s.bz) / 2;
  return Math.min(...gates.map((g) => Math.hypot(mx - g.x, mz - g.z) - g.r));
};
const w0 = [...walls].sort((a, b) => gateDist(b) - gateDist(a))[0];
const mx = (w0.ax + w0.bx) / 2;
const mz = (w0.az + w0.bz) / 2;
// "院外"方向 = 由圈心指向这段墙（对矩形和曲线都成立；不能再靠墙的垂线，垂线可能指进院子里）
const ring = walls.filter((s) => Math.hypot((s.ax + s.bx) / 2 - mx, (s.az + s.bz) / 2 - mz) < 14);
const rcx = ring.reduce((a, s) => a + (s.ax + s.bx) / 2, 0) / ring.length;
const rcz = ring.reduce((a, s) => a + (s.az + s.bz) / 2, 0) / ring.length;
const radLen = Math.max(1e-6, Math.hypot(mx - rcx, mz - rcz));
const outX0 = (mx - rcx) / radLen;
const outZ0 = (mz - rcz) / radLen;
const tWall = await ev(([x, z]) => window.__island.hitTest(x, z), [mx, mz]);
check('院墙墙身会挡住玩家', tWall.wall === true, `墙段中点(${mx.toFixed(1)},${mz.toFixed(1)}) wall=${tWall.wall}`);
const outX = mx + outX0 * 1.2;
const outZ = mz + outZ0 * 1.2;
const tOut = await ev(([x, z]) => window.__island.hitTest(x, z), [outX, outZ]);
check('墙外 1.2m 可通行（墙是薄带）', tOut.wall === false, `(${outX.toFixed(1)},${outZ.toFixed(1)}) wall=${tOut.wall}`);

// 实际走过去：从墙外 3m 朝墙走 2.6 秒，应该被挡在外面（不能穿到墙内侧）
const startX = mx + outX0 * 3;
const startZ = mz + outZ0 * 3;
await ev(([x, z]) => window.__island.teleport(x, z), [startX, startZ]);
await delay(400);
const yawTo = (from, to) => (Math.atan2(from[0] - to[0], from[1] - to[1]) * 180) / Math.PI;
await ev((y) => window.__island.setYaw(y), yawTo([startX, startZ], [mx, mz]));
await delay(600);
await page.keyboard.down('KeyW');
await delay(2600);
await page.keyboard.up('KeyW');
const after = await ev(() => window.__island.pos());
// 是否跨到了墙的另一侧：比较沿"向外方向"的位移
const sideNow = (after[0] - mx) * outX0 + (after[2] - mz) * outZ0;
check('朝院墙走不会穿过去', sideNow > 0, `停在 (${after[0].toFixed(1)}, ${after[2].toFixed(1)})，侧向 ${sideNow.toFixed(2)}m（>0 = 仍在出发侧）`);

// 每个门洞都真的能过（曲线院墙上的门是算出来的，必须验证没被墙段堵住）
let openGates = 0;
for (const g of gates) {
  const t = await ev(([x, z]) => window.__island.hitTest(x, z), [g.x, g.z]);
  if (t.wall === false) openGates += 1;
}
check('每个门洞都能过', openGates === gates.length, `${openGates}/${gates.length} 个门洞畅通`);

// ---------- 2. 树 / 石头 / 树桩 / 晾衣杆 ----------
const treeSpot = await ev(([x, z]) => window.__island.circlesNear(x, z, 12), [-6, -14]);
const bigCircle = treeSpot.find((c) => c.r >= 0.3 && c.r <= 0.45);
check('树有碰撞体', !!bigCircle, bigCircle ? `树 (${bigCircle.x},${bigCircle.z}) r=${bigCircle.r}` : '附近没找到树');
if (bigCircle) {
  const t = await ev(([x, z]) => window.__island.hitTest(x, z), [bigCircle.x, bigCircle.z]);
  check('站在树心位置会被判定为挡住', t.circle !== null, JSON.stringify(t.circle));
}

// 晾衣绳的两根杆子（在院子里，找 r≈0.22 的小碰撞体）
const lines = await ev(() => window.__island.circlesNear(26, 15, 6));
const pole = lines.find((c) => Math.abs(c.r - 0.22) < 0.001);
check('晾衣杆有碰撞体', !!pole, pole ? `杆 (${pole.x},${pole.z}) r=${pole.r}` : '没找到');

// 石头 / 树桩：r 0.4~0.6 的碰撞体数量
const rocksAll = await ev(() => window.__island.circlesNear(0, 0, 60));
console.log(`   岛中心 60m 内圆形碰撞体 ${rocksAll.length} 个（含树/石头/道具）`);

// ---------- 3. 码头栈台可以走上去 ----------
const plats = await ev(() => window.__island.platformsList());
check('码头栈台是可行走平台', plats.length >= 1, plats.map((p) => `topY=${p.topY}`).join(' '));
if (plats.length) {
  const p = plats[0];
  const cxLocal = p.cx;
  const czLocal = p.cz;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const px = p.x + cxLocal * c + czLocal * s;
  const pz = p.z - cxLocal * s + czLocal * c;
  const t = await ev(([x, z]) => window.__island.hitTest(x, z), [px, pz]);
  check('栈台中心脚下高度=栈台高度', t.platform !== null && Math.abs(t.ground - p.topY) < 0.05, `ground=${t.ground} topY=${p.topY}`);
  await ev(([x, z]) => window.__island.teleport(x, z), [px, pz]);
  await delay(700);
  const pos = await ev(() => window.__island.pos());
  check('玩家能站在栈台上（不会掉进水里）', Math.abs(pos[1] - p.topY) < 0.4, `玩家 y=${pos[1].toFixed(2)} 栈台 ${p.topY}`);
  await page.screenshot({ path: 'shots/p5c-pier-stand.png' });
}

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n通过 ${pass}/${results.length}`);
if (errs.length) console.log('页面错误：', errs.slice(0, 4).join(' | '));
process.exit(pass === results.length ? 0 : 1);
