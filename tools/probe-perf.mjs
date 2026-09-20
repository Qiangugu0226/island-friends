// 性能体检：draw call / 三角面 / 帧时间（曲线院墙加密后要确认没超预算）
// 用法：node tools/probe-perf.mjs
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
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(1200);

const views = [
  ['村口平地', 0, 0, 40, 12],
  ['院墙近景', -31.7 + 13, 27.9 + 4, 250, 14],
  ['航标塔', 0, -40, 170, 20],
  ['高位俯瞰', 18, 22, 40, 62]
];
for (const [name, x, z, yaw, pitch] of views) {
  await page.evaluate(([px, pz]) => window.__island.teleport(px, pz), [x, z]);
  await delay(300);
  await page.evaluate((y) => window.__island.setYaw(y), yaw);
  await page.evaluate((p) => window.__island.setPitch(p), pitch);
  await delay(700);
  // 采样 ~1 秒的帧时间
  const st = await page.evaluate(
    () =>
      new Promise((res) => {
        const t = [];
        let last = performance.now();
        let n = 0;
        function tick() {
          const now = performance.now();
          t.push(now - last);
          last = now;
          n += 1;
          if (n < 70) requestAnimationFrame(tick);
          else {
            const s = t.slice(10).sort((a, b) => a - b);
            const stats = window.__island.renderStats
              ? window.__island.renderStats()
              : { calls: window.__island.info().render.calls, triangles: window.__island.info().render.triangles };
            res({
              calls: stats.calls,
              tris: Math.round(stats.triangles / 1000),
              grade: !!stats.grade,
              shadows: stats.shadows ?? 0,
              med: +s[Math.floor(s.length / 2)].toFixed(1),
              p95: +s[Math.floor(s.length * 0.95)].toFixed(1)
            });
          }
        }
        requestAnimationFrame(tick);
      })
  );
  console.log(
    `${name.padEnd(6, '　')} draw ${String(st.calls).padStart(4)} · ${String(st.tris).padStart(4)}k 三角面 · 帧时间中位 ${st.med}ms / p95 ${st.p95}ms · 分级${st.grade ? '开' : '关'} · 暗片${st.shadows}`
  );
}
await browser.close();
