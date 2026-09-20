// 后处理/接触阴影的性能代价矩阵：分级关、只有阴影、分级带不同 MSAA 档
// 用法：node tools/probe-grade-perf.mjs
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

const cases = [
  ['基线（分级关·暗片关）', 'grade=0&shadows=0'],
  ['只加接触阴影', 'grade=0'],
  ['分级 4xMSAA', 'samples=4'],
  ['分级 2xMSAA', 'samples=2'],
  ['分级 无MSAA', 'samples=0']
];

for (const [name, qs] of cases) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const url = target.url + (target.url.includes('?') ? '&' : '?') + qs;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
  await delay(900);
  await page.evaluate(() => window.__island.teleport(0, 0));
  await page.evaluate((y) => window.__island.setYaw(y), 40);
  await page.evaluate((p) => window.__island.setPitch(p), 12);
  await delay(800);
  const st = await page.evaluate(
    () =>
      new Promise((res) => {
        const t = [];
        let last = performance.now();
        let n = 0;
        const tick = () => {
          const now = performance.now();
          t.push(now - last);
          last = now;
          if (++n < 60) requestAnimationFrame(tick);
          else {
            const s = t.slice(10).sort((a, b) => a - b);
            const rs = window.__island.renderStats();
            res({ med: +s[Math.floor(s.length / 2)].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), calls: rs.calls, grade: rs.grade, shadows: rs.shadows });
          }
        };
        requestAnimationFrame(tick);
      })
  );
  console.log(
    `${name.padEnd(20, '　')} 帧时间中位 ${String(st.med).padStart(6)}ms / p95 ${String(st.p95).padStart(6)}ms · draw ${st.calls} · 分级${st.grade ? '开' : '关'} · 暗片${st.shadows}${errs.length ? ' · 页面错误:' + errs[0] : ''}`
  );
  await page.close();
}
await browser.close();
