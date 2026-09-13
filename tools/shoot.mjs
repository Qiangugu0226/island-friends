// 可靠的可视化验证工具：用系统 Edge（headless）打开游戏，等世界真正就绪后再截图。
// 用法：
//   node tools/shoot.mjs <名称> [查询参数] [--w 1600] [--h 900]
// 例：
//   node tools/shoot.mjs p15-top "view=top"
//   node tools/shoot.mjs p15-village "view=follow&x=-14&z=9"
// 输出：shots/<名称>.png，控制台错误会打印出来。
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

const args = process.argv.slice(2);
const name = args[0] ?? 'shot';
const query = args[1] ?? '';
const widthArg = args.indexOf('--w');
const heightArg = args.indexOf('--h');
const width = widthArg >= 0 ? Number(args[widthArg + 1]) : 1600;
const height = heightArg >= 0 ? Number(args[heightArg + 1]) : 900;
const port = process.env.SHOOT_PORT ?? '5174';
const url = `http://127.0.0.1:${port}/${query ? `?${query}` : ''}`;

const browserPath = EDGE_CANDIDATES.find((p) => existsSync(p));
if (!browserPath) {
  console.error('找不到 Edge/Chrome 可执行文件');
  process.exit(1);
}

mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: true,
  args: [
    '--no-first-run',
    '--no-default-browser-check',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    `--window-size=${width},${height}`
  ]
});

const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });

const problems = [];
page.on('console', (msg) => {
  const type = msg.type();
  if (type === 'error' || type === 'warning') {
    const text = msg.text();
    if (/THREE|Error|error|Uncaught|failed/.test(text) && !/vite|ProtocolLaunch/.test(text)) {
      problems.push(`[${type}] ${text}`);
    }
  }
});
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

try {
  await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
} catch (err) {
  problems.push(`等待世界就绪超时：${err.message}`);
  const step = await page.$eval('#loading-step', (n) => n.textContent).catch(() => '(读不到)');
  problems.push(`加载界面当前文字：${step}`);
}

// 让渲染循环跑几帧（时间推进、阴影稳定）
await delay(1500);
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

const outPath = `shots/${name}.png`;
await page.screenshot({ path: outPath });

const info = await page.evaluate(() => {
  const r = window.__island?.info?.();
  return r ? `${r.render.calls} draw / ${(r.render.triangles / 1000).toFixed(0)}k tri` : 'no info';
});

await browser.close();

console.log(`saved: ${outPath}`);
console.log(`render: ${info}`);
if (problems.length) {
  console.log('--- 问题 ---');
  problems.slice(0, 12).forEach((p) => console.log(p));
} else {
  console.log('无控制台错误');
}
