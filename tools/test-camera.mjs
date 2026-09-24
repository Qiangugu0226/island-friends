// 相机测试：抽动（抖动/弹跳）与地面·建筑穿模
// 用法：node tools/test-camera.mjs
//
// 判据说明（避免误报）：
//  · 「抖动」用**静止不动的抖动** + **直线走路时的位移突变**来衡量；
//    快速甩视角时相机本来就在划大圆弧，"单步位移大"是正常的，不算抖动。
//  · 「穿模」同时看高度：相机从屋顶上方飞过是允许的，只有真的低于建筑高度才算穿进去。
import { writeFileSync } from 'node:fs';
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
const grab = () =>
  ev(() => {
    const c = window.__island.cameraInfo();
    return {
      pos: c.pos,
      dist: c.dist,
      t: performance.now(),
      ground: window.__island.groundAt(c.pos[0], c.pos[2]),
      near: window.__island.blockersNear(c.pos[0], c.pos[2], 0.5)
    };
  });

function analyze(samples) {
  const steps = [];
  const speeds = []; // m/s：按各自的时间间隔归一化，避免"帧一长单步就大"的假警报
  let minClearance = Infinity;
  let insideSolid = 0;
  let worstSolid = null; // 记录"最深入"的那次，方便报告里指名道姓
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    minClearance = Math.min(minClearance, s.pos[1] - s.ground);
    // "钻进建筑"只算**建筑级**的碰撞体（半径 ≥1m：房子/航标塔/土地庙），
    // 而且要相机真的落在它水平范围**内部**（d < r*0.9）——擦过树桩/立柱不算钻进去。
    // 相机高度还必须低于该建筑高度，否则是从屋顶上方飞过。
    for (const b of s.near) {
      if (b.r < 1.0) continue;
      if (b.h !== undefined && s.pos[1] >= b.h) continue;
      if (b.d >= b.r * 0.9) continue;
      insideSolid++;
      const depth = b.r - b.d;
      if (!worstSolid || depth > worstSolid.depth) worstSolid = { depth: +depth.toFixed(2), r: +b.r.toFixed(2), d: +b.d.toFixed(2) };
    }
    if (i === 0) continue;
    const d = Math.hypot(s.pos[0] - samples[i - 1].pos[0], s.pos[1] - samples[i - 1].pos[1], s.pos[2] - samples[i - 1].pos[2]);
    steps.push(d);
    const dt = Math.max(1, s.t - samples[i - 1].t) / 1000;
    speeds.push(d / dt);
  }
  const avg = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;
  const spike = steps.length ? Math.max(...steps.map((s) => s - avg)) : 0;
  const medSpeed = speeds.length ? [...speeds].sort((a, b) => a - b)[Math.floor(speeds.length / 2)] : 0;
  const speedSpike = speeds.length ? Math.max(...speeds) - medSpeed : 0;
  // 径向（镜头到焦点的距离）方向反转次数：单调转视角时它应该几乎不变
  let radialReversals = 0;
  let lastSign = 0;
  for (let i = 1; i < samples.length; i++) {
    const sign = Math.sign(samples[i].dist - samples[i - 1].dist);
    if (sign !== 0 && lastSign !== 0 && sign !== lastSign) radialReversals++;
    if (sign !== 0) lastSign = sign;
  }
  return {
    maxStep: steps.length ? Math.max(...steps) : 0,
    avg,
    spike,
    medSpeed,
    maxSpeed: speeds.length ? Math.max(...speeds) : 0,
    speedSpike,
    minClearance,
    insideSolid,
    worstSolid,
    radialReversals
  };
}

console.log(`目标：${target.kind === 'file' ? '单文件离线版' : target.url}\n`);

// ---------- 1. 静止：完全不动，看有没有自发抖动 ----------
await ev(() => window.__island.teleport(-6, -14));
await delay(800);
await ev(() => window.__island.setPitch(40));
// 镜头从"被挡住"恢复到正常距离是慢速的（3/s），要等它稳定再采样，否则测到的是"还在恢复"而不是抖动
await delay(2600);
const idle = [];
for (let i = 0; i < 24; i++) {
  await delay(80);
  idle.push(await grab());
}
const ji = analyze(idle);
console.log('   ① 站在原地不动（模拟玩家松手，看相机自己抖不抖）');
check('① 静止时相机没有自发抖动', ji.maxStep < 0.05, `单步最大 ${ji.maxStep.toFixed(4)}m`);

// ---------- 2. 直线走路经过石厝 ----------
await ev(() => window.__island.teleport(-40, 40));
await delay(500);
await ev(() => window.__island.setPitch(38));
await ev(() => window.__island.setYaw(15));
await delay(500);
const p0 = await ev(() => window.__island.pos());
await page.keyboard.down('KeyW');
const walkSamples = [];
for (let i = 0; i < 36; i++) {
  await delay(80);
  walkSamples.push(await grab());
}
await page.keyboard.up('KeyW');
const p1 = await ev(() => window.__island.pos());
const jw = analyze(walkSamples);
console.log(`   ② 贴着石厝走过：走了 ${Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(1)}m`);
// 判据说明：相机避让建筑是"收快放慢"的设计 —— 墙/房子进入视线射线时会**立即**拉近，
// 所以"速度峰值"本来就会高于玩家的走路速度，不能拿它当抖动。真正的抖动是**来回摆**，
// 用"镜头到焦点的距离反复反向"来判定（和帧时长无关，也不受 headless 掉帧影响）。
check(
  '② 走路经过建筑：镜头没有来回摆',
  jw.radialReversals <= 2 && jw.maxSpeed < 14,
  `径向反向 ${jw.radialReversals} 次 · 速度中位 ${jw.medSpeed.toFixed(2)}m/s 峰值 ${jw.maxSpeed.toFixed(2)}m/s（单步最大 ${jw.maxStep.toFixed(2)}m）`
);
check('② 走路经过建筑：相机没钻地', jw.minClearance > 0.15, `最小离地 ${jw.minClearance.toFixed(2)}m`);
check('② 走路经过建筑：相机没钻进建筑', jw.insideSolid === 0, `穿进 ${jw.insideSolid} 次`);

// ---------- 3. 正常速度转视角（约 60°/秒，接近实际甩鼠标） ----------
await ev(() => window.__island.teleport(-6, -14));
await delay(600);
await ev(() => window.__island.setPitch(35));
let yaw = 0;
const spinSamples = [];
await page.keyboard.down('KeyW');
for (let i = 0; i < 30; i++) {
  yaw += 5; // 每 80ms 转 5° ≈ 62°/s
  await ev((y) => window.__island.setYaw(y), yaw);
  await delay(80);
  spinSamples.push(await grab());
}
await page.keyboard.up('KeyW');
const js = analyze(spinSamples);
check('③ 正常速度转视角：镜头没有忽远忽近（径向反向≤2）', js.radialReversals <= 2, `径向反向 ${js.radialReversals} 次 · 单步最大 ${js.maxStep.toFixed(2)}m`);
check('③ 转视角时相机没钻地', js.minClearance > 0.15, `最小离地 ${js.minClearance.toFixed(2)}m`);

// ---------- 4. 站在房子边慢速绕一圈（最容易撞建筑的场景） ----------
const pads = await ev(() => window.__island.padsInfo());
// 相机是不是在某个房子的**旋转矩形**里（比"进到某个圆里"准得多：房子朝向＋四角都算得准）
const houseAt = (pos) => {
  for (const p of pads) {
    if (pos[1] >= p.top) continue; // 从屋顶上方飞过不算
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    const dx = pos[0] - p.x;
    const dz = pos[2] - p.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < p.w / 2 + 0.05 && Math.abs(lz) < p.d / 2 + 0.05) return p.id;
  }
  return null;
};
await ev(() => window.__island.teleport(-33, 36));
await delay(600);
await ev(() => window.__island.setPitch(18));
const circle = [];
for (let i = 0; i < 60; i++) {
  await ev((y) => window.__island.setYaw(y), (i / 60) * 360);
  await delay(70);
  circle.push(await grab());
}
const jc = analyze(circle);
const inHouse = circle.filter((s) => houseAt(s.pos)).map((s) => houseAt(s.pos));
check('④ 绕房子一圈：相机没钻地', jc.minClearance > 0.15, `最小离地 ${jc.minClearance.toFixed(2)}m`);
check(
  '④ 绕房子一圈：相机没钻进房子（按旋转矩形判定）',
  inHouse.length === 0,
  inHouse.length ? `有 ${inHouse.length} 帧在房子里：${[...new Set(inHouse)].join('/')}` : '0 帧'
);

// ---------- 5. 抬头看天 ----------
await ev(() => window.__island.teleport(-6, -14));
await ev(() => window.__island.setYaw(200));
await delay(400);
const look = [];
for (const pitch of [30, 12, 0, -12, -22, -30]) {
  await ev((p) => window.__island.setPitch(p), pitch);
  await delay(650);
  const s = await grab();
  look.push({ pitch, clear: +(s.pos[1] - s.ground).toFixed(2), dist: s.dist });
}
console.log('   ⑤ 抬头：俯仰角 / 相机离地 / 相机距离');
look.forEach((s) => console.log(`      ${String(s.pitch).padStart(4)}°  离地 ${s.clear}m  距离 ${s.dist}m`));
check('⑤ 抬头全程不穿地面', look.every((s) => s.clear > 0.1), `最小离地 ${Math.min(...look.map((s) => s.clear))}m`);
await page.screenshot({ path: 'shots/p2fix-lookup.png' });

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n通过 ${pass}/${results.length}`);
if (errs.length) console.log('页面错误：', errs.slice(0, 4).join(' | '));
writeFileSync('shots/camera-report.json', JSON.stringify({ idle: ji, walk: jw, spin: js, circle: jc, look }, null, 2));
process.exit(pass === results.length ? 0 : 1);
