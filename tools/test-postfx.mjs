// 后处理回归测试：分级开着的时候画面必须"有内容"，而且要和不开时明显不同但不过分
// （防的就是"全黑"这类静默故障：tDiffuse 没接上、shader 编译失败、色彩空间写错……）
// 用法：node tools/test-postfx.mjs  —— 全部通过退出码 0
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

const results = [];
const check = (n, ok, d = '') => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${n}${d ? '  — ' + d : ''}`);
};

// 同一页面里直接开关分级来对照：场景状态完全一样，差异只可能来自调色
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const url = `${target.url}${target.url.includes('?') ? '&' : '?'}hud=0&hour=10&preserve=1`;
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(700);
await page.evaluate(([p, l]) => window.__island.setFreeCam(p, l), [[-18, 8.5, 44], [-10, 4.2, 20]]);
await delay(900);

const readPixels = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const canvas = document.querySelector('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            const W = canvas.width;
            const H = canvas.height;
            const buf = new Uint8Array(W * H * 4);
            gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            const px = [];
            let sum = 0;
            let n = 0;
            for (let i = 0; i < W * H; i += 37) {
              const r = buf[i * 4];
              const g = buf[i * 4 + 1];
              const b = buf[i * 4 + 2];
              px.push([r, g, b]);
              sum += (r + g + b) / 3;
              n += 1;
            }
            const mean = sum / n;
            let varr = 0;
            for (const [r, g, b] of px) varr += ((r + g + b) / 3 - mean) ** 2;
            const sd = Math.sqrt(varr / n);
            const set = new Set(px.map(([r, g, b]) => `${r >> 4},${g >> 4},${b >> 4}`));
            res({ mean: +mean.toFixed(1), sd: +sd.toFixed(1), colors: set.size, px });
          })
        );
      })
  );

const on = await readPixels();
const onStats = await page.evaluate(() => window.__island.renderStats());
await page.screenshot({ path: 'shots/p5g-test-on.png' });
await page.evaluate(() => window.__island.setGrade(false));
await delay(220);
const off = await readPixels();
await page.screenshot({ path: 'shots/p5g-test-off.png' });
const offStats = await page.evaluate(() => window.__island.renderStats());

check('分级关闭：画面正常', off.mean > 40 && off.sd > 12 && off.colors > 60, `平均亮度 ${off.mean} · 标准差 ${off.sd} · 颜色数 ${off.colors}`);
check('分级开启：画面不是全黑/纯色', on.mean > 40 && on.sd > 12 && on.colors > 60, `平均亮度 ${on.mean} · 标准差 ${on.sd} · 颜色数 ${on.colors}`);
check('分级开启：没有页面错误', errs.length === 0, errs.slice(0, 2).join(' | ') || '无');

// 逐像素差异：要有变化（真的在调色），但不能面目全非。
// 注意用"平均差"而不是"单点最大差"：两次读数之间场景还在动（水波、狗、飞鸟），单点极值不可靠。
let diff = 0;
let sumDiff = 0;
const n = Math.min(off.px.length, on.px.length);
for (let i = 0; i < n; i++) {
  const d =
    Math.abs(off.px[i][0] - on.px[i][0]) + Math.abs(off.px[i][1] - on.px[i][1]) + Math.abs(off.px[i][2] - on.px[i][2]);
  sumDiff += d / 3;
  if (d > 12) diff += 1;
}
const ratio = diff / n;
const meanDiff = sumDiff / n;
check(
  '分级确实在调色（画面有变化、但只是调色不是换画面）',
  ratio > 0.2 && ratio < 0.99 && meanDiff > 5 && meanDiff < 90,
  `${(ratio * 100).toFixed(0)}% 采样点有变化，平均单通道差 ${meanDiff.toFixed(1)}`
);
check('分级开启时仍在渲染场景（不是只画了一个全屏面）', onStats.calls > 50, `draw call ${onStats.calls}`);
check('分级关闭时也在渲染场景', offStats.calls > 50, `draw call ${offStats.calls}`);

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
