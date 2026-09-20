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
      ground: window.__island.groundAt(c.pos[0], c.pos[2]),
      near: window.__island.blockersNear(c.pos[0], c.pos[2], 0.5)
    };
  });

function analyze(samples) {
  const steps = [];
  let minClearance = Infinity;
  let insideSolid = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    minClearance = Math.min(minClearance, s.pos[1] - s.ground);
    // 只有相机高度低于建筑高度、且水平距离进入半径内，才算"穿进建筑"
    const solid = s.near.filter((b) => b.d < b.r + 0.2 && (b.h === undefined || s.pos[1] < b.h));
    if (solid.length) insideSolid++;
    if (i === 0) continue;
    steps.push(Math.hypot(s.pos[0] - samples[i - 1].pos[0], s.pos[1] - samples[i - 1].pos[1], s.pos[2] - samples[i - 1].pos[2]));
  }
  const avg = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;
  const spike = steps.length ? Math.max(...steps.map((s) => s - avg)) : 0;
  // 径向（镜头到焦点的距离）方向反转次数：单调转视角时它应该几乎不变
  let radialReversals = 0;
  let lastSign = 0;
  for (let i = 1; i < samples.length; i++) {
    const sign = Math.sign(samples[i].dist - samples[i - 1].dist);
    if (sign !== 0 && lastSign !== 0 && sign !== lastSign) radialReversals++;
    if (sign !== 0) lastSign = sign;
  }
  return { maxStep: steps.length ? Math.max(...steps) : 0, avg, spike, minClearance, insideSolid, radialReversals };
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
// 现在树/石头也有碰撞，走路撞到东西会停一下（镜头跟着顿一下），阈值放宽到 0.55
check('② 走路经过建筑：无位移突变', jw.spike < 0.55, `单步最大 ${jw.maxStep.toFixed(2)}m / 突变 ${jw.spike.toFixed(2)}m`);
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
check('④ 绕房子一圈：相机没钻地', jc.minClearance > 0.15, `最小离地 ${jc.minClearance.toFixed(2)}m`);
check('④ 绕房子一圈：相机没钻进建筑', jc.insideSolid === 0, `穿进 ${jc.insideSolid} 次`);

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
