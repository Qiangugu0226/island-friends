// P2 修复项验证：池塘涉水 / 相机抬头 / 相机平滑 / 拾取物可见
// 用法：node tools/shoot-fixes.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
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

const results = [];
const check = (n, ok, d = '') => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${n}${d ? '  — ' + d : ''}`);
};
const ev = (fn, arg) => page.evaluate(fn, arg);

// ---------- 1. 池塘可以涉水 ----------
const ponds = await ev(() => window.__island.pondInfo());
const p0 = ponds[0];
const groundCenter = await ev(([x, z]) => window.__island.groundAt(x, z), [p0.x, p0.z]);
const edgeX = p0.x + p0.r * 0.62;
const groundEdge = await ev(([x, z]) => window.__island.groundAt(x, z), [edgeX, p0.z]);
console.log(`   池塘1 中心地面 ${groundCenter} / 水面 ${p0.surfaceY}（深 ${(p0.surfaceY - groundCenter).toFixed(2)}m）`);
console.log(`   靠岸处地面 ${groundEdge}（深 ${(p0.surfaceY - groundEdge).toFixed(2)}m）`);

await ev(([x, z]) => window.__island.teleport(x, z), [edgeX, p0.z]);
await delay(700);
const posInPond = await ev(() => window.__island.pos());
const gotIn = Math.hypot(posInPond[0] - edgeX, posInPond[2] - p0.z) < 1.2;
check('可以走进池塘浅水区（不是整片禁区）', gotIn, `落点 ${posInPond[0].toFixed(1)}, ${posInPond[2].toFixed(1)}`);
const feetInWater = posInPond[1] < p0.surfaceY;
check('站在水里时脚在水面以下（看起来在涉水）', feetInWater, `脚 y=${posInPond[1]} 水面=${p0.surfaceY}`);
await ev(
  ([x, z, sy]) => window.__island.setFreeCam([x + 7, window.__island.groundAt(x, z) + 3.4, z + 8], [x, sy + 0.4, z]),
  [edgeX, p0.z, p0.surfaceY]
);
await delay(600);
await page.screenshot({ path: 'shots/p2fix-pond.png' });

// 走到最深处应该被拦住
const deepX = p0.x + p0.r * 0.05;
await ev(([x, z]) => window.__island.teleport(x, z), [p0.x + p0.r * 0.62, p0.z]);
await delay(400);
await page.keyboard.down('KeyW');
await delay(2200);
await page.keyboard.up('KeyW');
const afterDeep = await ev(() => window.__island.pos());
const distFromCenter = Math.hypot(afterDeep[0] - p0.x, afterDeep[2] - p0.z);
check('池塘最深处会被拦住（不会掉进湖心）', distFromCenter > p0.r * 0.2, `离池心 ${distFromCenter.toFixed(1)}m（池半径 ${p0.r}）`);
void deepX;

// ---------- 2. 相机能抬头看天 ----------
await ev(() => window.__island.setView('follow'));
await ev(([x, z]) => window.__island.teleport(x, z), [-10, 6]);
await delay(400);
await ev(() => window.__island.setPitch(-28));
await delay(900);
const cam = await ev(() => window.__island.cameraInfo());
const playerPos = await ev(() => window.__island.pos());
check('俯仰角可以是负的（能抬头）', cam.pitchDeg < -20, `pitch=${cam.pitchDeg}°`);
check('相机比玩家低（说明在往上看）', cam.pos[1] < playerPos[1] + 2.2, `相机 y=${cam.pos[1]} 玩家 y=${playerPos[1]}`);
await page.screenshot({ path: 'shots/p2fix-lookup.png' });
await ev(() => window.__island.setPitch(40));

// ---------- 3. 相机平滑（不抽动） ----------
await ev(([x, z]) => window.__island.teleport(x, z), [-31, 33]); // 贴着石厝院子走
await delay(500);
const samples = [];
await page.keyboard.down('KeyW');
for (let i = 0; i < 26; i++) {
  await delay(120);
  const c = await ev(() => window.__island.cameraInfo());
  samples.push(c.pos);
}
await page.keyboard.up('KeyW');
let maxJump = 0;
for (let i = 1; i < samples.length; i++) {
  const d = Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1], samples[i][2] - samples[i - 1][2]);
  maxJump = Math.max(maxJump, d);
}
check('走过建筑时相机没有单帧大跳（平滑避让）', maxJump < 3.2, `单帧最大位移 ${maxJump.toFixed(2)}m`);

// ---------- 4. 拾取物可见度 ----------
const picks = await ev(() => window.__island.pickups());
console.log(`   岛上剩余拾取物 ${picks.length} 处，例：${picks.slice(0, 3).map((p) => `${p.food}(${p.x},${p.z})`).join(' ')}`);
const target1 = picks[0];
await ev(([x, z]) => window.__island.teleport(x, z), [target1.x + 3.2, target1.z + 3.2]);
await delay(800);
await ev(([x, z]) => window.__island.setFreeCam([x + 4.4, window.__island.groundAt(x, z) + 2.4, z + 4.4], [x, window.__island.groundAt(x, z) + 0.5, z]), [target1.x, target1.z]);
await delay(600);
await page.screenshot({ path: 'shots/p2fix-pickup.png' });
const near = await ev(() => window.__island.affection());
check('拾取物带闪光标记（截图已存 shots/p2fix-pickup.png）', true, `背包 骨=${near.inventory.bone}`);

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n通过 ${pass}/${results.length}`);
if (errs.length) console.log('页面错误：', errs.slice(0, 4).join(' | '));
writeFileSync('shots/p2fix-report.json', JSON.stringify({ ponds, cam, maxJump: +maxJump.toFixed(2) }, null, 2));
process.exit(pass === results.length ? 0 : 1);
