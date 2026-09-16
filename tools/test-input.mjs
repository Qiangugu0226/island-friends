// 操作测试：验证 WASD 方向是否正确（A 左 / D 右 / W 前 / S 后）
// 用法：node tools/test-input.mjs      （自动选择开发服务器或单文件离线版）
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
await page.goto(`${target.url}?view=follow&x=10&z=-16`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(800);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

async function probe(keys, label, expect) {
  await page.evaluate(() => window.__island.teleport(10, -16));
  await delay(400);
  const before = await page.evaluate(() => ({
    pos: window.__island.pos(),
    basis: window.__island.basis()
  }));
  for (const k of keys) await page.keyboard.down(k);
  await delay(1100);
  for (const k of keys) await page.keyboard.up(k);
  await delay(120);
  const after = await page.evaluate(() => window.__island.pos());
  const delta = [after[0] - before.pos[0], 0, after[2] - before.pos[2]];
  const len = Math.hypot(delta[0], delta[2]);
  const dir = len > 1e-4 ? [delta[0] / len, 0, delta[2] / len] : [0, 0, 0];
  const scoreForward = dot(dir, before.basis.forward);
  const scoreRight = dot(dir, before.basis.right);
  const ok =
    expect === 'forward' ? scoreForward > 0.9 :
    expect === 'back' ? scoreForward < -0.9 :
    expect === 'right' ? scoreRight > 0.9 :
    scoreRight < -0.9;
  console.log(
    `${ok ? '✅' : '❌'} ${label}: 位移 ${len.toFixed(2)}m  ` +
    `·前=${scoreForward.toFixed(2)} ·右=${scoreRight.toFixed(2)}  ` +
    `(期望 ${expect === 'forward' ? '前≈1' : '右≈1'})`
  );
  return ok;
}

const results = [];
results.push(await probe(['KeyW'], 'W 前进', 'forward'));
results.push(await probe(['KeyS'], 'S 后退', 'back'));
results.push(await probe(['KeyD'], 'D 右移', 'right'));
results.push(await probe(['KeyA'], 'A 左移', 'left'));

// S / A 用反向量判定
function checkBackward() {
  return results[1];
}
void checkBackward;

await browser.close();
const pass = results.every(Boolean);
console.log(pass ? '\nW 与 D 方向正确' : '\n方向仍有问题');
