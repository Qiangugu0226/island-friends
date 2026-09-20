// 解剖合并后的院墙几何体：顶点范围 / NaN / 退化三角形 / 矩阵行列式
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
  args: BROWSER_ARGS
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('页面错误：', e.message));
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(600);

const r = await page.evaluate(() => {
  const THREE = window.__island.THREE;
  const out = [];
  const segsByMesh = [];
  window.__island.scene.traverse((o) => {
    if (o.isMesh && (o.name === 'wall-body' || o.name === 'wall-cap')) segsByMesh.push(o);
  });
  for (const o of segsByMesh) {
    const g = o.geometry;
    const arr = g.attributes.position.array;
    let mnY = Infinity;
    let mxY = -Infinity;
    let mnX = Infinity;
    let mxX = -Infinity;
    let mnZ = Infinity;
    let mxZ = -Infinity;
    for (let i = 0; i < arr.length; i += 3) {
      mnX = Math.min(mnX, arr[i]);
      mxX = Math.max(mxX, arr[i]);
      mnY = Math.min(mnY, arr[i + 1]);
      mxY = Math.max(mxY, arr[i + 1]);
      mnZ = Math.min(mnZ, arr[i + 2]);
      mxZ = Math.max(mxZ, arr[i + 2]);
    }
    const wss = o.userData.wallSegs;
    let mLo = null;
    let mHi = null;
    if (wss) {
      mLo = Math.min(...wss.map((s) => Math.min(s.baseY0, s.baseY1)));
      mHi = Math.max(...wss.map((s) => Math.max(s.baseY0, s.baseY1)));
    }
    out.push({
      name: o.name,
      mesh: { minY: +mnY.toFixed(2), maxY: +mxY.toFixed(2), x: [+mnX.toFixed(1), +mxX.toFixed(1)], z: [+mnZ.toFixed(1), +mxZ.toFixed(1)] },
      data: wss ? { baseLow: +mLo.toFixed(2), baseHigh: +mHi.toFixed(2), expectTop: +(mHi + (wss[0].height ?? 0.95)).toFixed(2), segs: wss.length } : null,
      groundAtCenter: +window.__island.groundAt((mnX + mxX) / 2, (mnZ + mxZ) / 2).toFixed(2)
    });
  }
  return out;
});
for (const x of r) console.log(JSON.stringify(x));
await browser.close();
