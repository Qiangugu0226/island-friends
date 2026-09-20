// 诊断：场景里的墙段网格 vs collision 里登记的墙段数据，找出不一致
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
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(500);

const r = await page.evaluate(() => {
  const meshes = [];
  window.__island.scene.traverse((o) => {
    if (o.userData && o.userData.wallSeg) meshes.push(o.userData.wallSeg);
  });
  const list = window.__island.wallsList();
  const key = (s) => `${s.ax.toFixed(1)}|${s.az.toFixed(1)}|${s.bx.toFixed(1)}|${s.bz.toFixed(1)}`;
  const listKeys = new Set(list.map(key));
  const meshKeys = new Set(meshes.map(key));
  const onlyMesh = meshes.filter((s) => !listKeys.has(key(s)));
  const onlyList = list.filter((s) => !meshKeys.has(key(s)));

  // 用网格自身数据（= audit 的口径）算最坏埋深
  let worst = 0;
  let worstSeg = null;
  let worstT = 0;
  for (const s of meshes) {
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const x = s.ax + (s.bx - s.ax) * t;
      const z = s.az + (s.bz - s.az) * t;
      const gap = s.baseY0 + (s.baseY1 - s.baseY0) * t - window.__island.groundAt(x, z);
      if (-gap > worst) {
        worst = -gap;
        worstSeg = s;
        worstT = t;
      }
    }
  }
  return {
    meshCount: meshes.length,
    listCount: list.length,
    onlyMesh: onlyMesh.map((s) => [+s.ax.toFixed(1), +s.az.toFixed(1), +s.bx.toFixed(1), +s.bz.toFixed(1)]),
    onlyList: onlyList.map((s) => [s.ax, s.az, s.bx, s.bz, s.baseY0, s.baseY1]),
    worst: +worst.toFixed(3),
    worstSeg: worstSeg ? { ax: +worstSeg.ax.toFixed(2), az: +worstSeg.az.toFixed(2), bx: +worstSeg.bx.toFixed(2), bz: +worstSeg.bz.toFixed(2), baseY0: +worstSeg.baseY0.toFixed(3), baseY1: +worstSeg.baseY1.toFixed(3) } : null,
    worstT,
    terrainAtWorst: worstSeg ? +window.__island.groundAt(worstSeg.ax + (worstSeg.bx - worstSeg.ax) * worstT, worstSeg.az + (worstSeg.bz - worstSeg.az) * worstT).toFixed(3) : null,
    hasUserDataOnAll: meshes.every((s) => s.baseY0 !== undefined && s.baseY1 !== undefined)
  };
});
console.log('场景里带 wallSeg 标记的网格：', r.meshCount, ' collision 登记：', r.listCount);
console.log('全部网格都带 baseY0/baseY1：', r.hasUserDataOnAll);
console.log('只在网格里有（没登记进 collision）：', r.onlyMesh.length, JSON.stringify(r.onlyMesh.slice(0, 6)));
console.log('只在 collision 里有：', r.onlyList.length, JSON.stringify(r.onlyList.slice(0, 6)));
console.log('按网格数据算的最大埋深：', r.worst, 'm @t=' + r.worstT);
console.log('该段：', JSON.stringify(r.worstSeg), ' 该点地形=', r.terrainAtWorst);

// 复刻 audit 的遍历方式：按 decor 物件 → 子网格
const per = await page.evaluate(() => {
  const out = [];
  window.__island.scene.traverse((o) => {
    const a = o.userData && o.userData.audit;
    if (!a || a.kind !== 'decor') return;
    let bad = 0;
    let worst = 0;
    let worstSeg = null;
    for (const child of o.children) {
      const ws = child.userData && child.userData.wallSeg;
      if (!ws) continue;
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const x = ws.ax + (ws.bx - ws.ax) * t;
        const z = ws.az + (ws.bz - ws.az) * t;
        const gap = ws.baseY0 + (ws.baseY1 - ws.baseY0) * t - window.__island.groundAt(x, z);
        if (-gap > 0.34 || gap > 0.06) bad += 1;
        if (gap < worst) {
          worst = gap;
          worstSeg = [+ws.ax.toFixed(1), +ws.az.toFixed(1), +ws.bx.toFixed(1), +ws.bz.toFixed(1)];
        }
      }
    }
    if (bad) out.push({ name: o.name || '(无名)', bad, worst: +worst.toFixed(2), worstSeg, transform: [o.position.x, o.position.y, o.position.z] });
  });
  return out;
});
console.log('复刻 audit 遍历的结果：', JSON.stringify(per, null, 1));

// 直接用 audit 自己的口径跑一遍，并对比两种测地函数
const cmp = await page.evaluate(() => {
  const problems = window.__island.audit().problems ?? window.__island.audit();
  const rounded = window.__island.groundAt(-5.1, -52.7);
  const exact = window.__island.heightAtExact(-5.1, -52.7);
  return { problems: JSON.stringify(problems).slice(0, 600), rounded, exact };
});
console.log('audit() 原始输出：', cmp.problems);
console.log(`(-5.1,-52.7) 地形：round版=${cmp.rounded} 精确版=${cmp.exact}`);
await browser.close();
