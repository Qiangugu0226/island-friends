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
check('院墙有碰撞段', walls.length >= 4, `${walls.length} 段（4 栋石厝 + 航标塔围栏）`);
// 取第一栋石厝的院墙，测"墙身中点"和"门洞中点"
const w0 = walls[0];
const rot = w0.rot;
const cos = Math.cos(rot);
const sin = Math.sin(rot);
const localToWorld = (lx, lz) => [w0.x + lx * cos + lz * sin, w0.z - lx * sin + lz * cos];
const [wallX, wallZ] = localToWorld(-w0.halfW, 0); // 西侧墙身
const gap = (w0.gaps && w0.gaps[0]) || { x: 0, z: w0.halfD };
const [gateX, gateZ] = localToWorld(gap.x, gap.z);
const tWall = await ev(([x, z]) => window.__island.hitTest(x, z), [wallX, wallZ]);
const tGate = await ev(([x, z]) => window.__island.hitTest(x, z), [gateX, gateZ]);
check('院墙墙身会挡住玩家', tWall.wall === true, `点(${wallX.toFixed(1)},${wallZ.toFixed(1)}) wall=${tWall.wall}`);
check('院墙门洞可以进出', tGate.wall === false, `门洞(${gateX.toFixed(1)},${gateZ.toFixed(1)}) wall=${tGate.wall}`);

// 实际走过去：从院外朝墙走 2.5 秒，应该被挡住（不能穿到墙的另一侧）
const [outsideX, outsideZ] = localToWorld(-w0.halfW - 3, 0);
await ev(([x, z]) => window.__island.teleport(x, z), [outsideX, outsideZ]);
await delay(400);
await ev(([x, z]) => {
  // 面朝墙的方向：用相机朝向对准墙
  const dx = x - 0, dz = 0;
  void dx; void dz;
}, [wallX, wallZ]);
const yawTo = (from, to) => (Math.atan2(from[0] - to[0], from[1] - to[1]) * 180) / Math.PI;
await ev((y) => window.__island.setYaw(y), yawTo([outsideX, outsideZ], [wallX, wallZ]));
await delay(600);
await page.keyboard.down('KeyW');
await delay(2600);
await page.keyboard.up('KeyW');
const after = await ev(() => window.__island.pos());
const distIn = await ev(([x, z]) => window.__island.hitTest(x, z), [after[0], after[2]]);
const passThrough = distIn.wall === true && Math.hypot(after[0] - w0.x, after[2] - w0.z) < w0.halfW - 0.5;
check('朝院墙走不会穿过去', !passThrough, `停在 (${after[0].toFixed(1)}, ${after[2].toFixed(1)})，离院心 ${Math.hypot(after[0] - w0.x, after[2] - w0.z).toFixed(1)}m`);

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
