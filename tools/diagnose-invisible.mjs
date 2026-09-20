// 诊断：院墙网格到底有没有被渲染（合并几何体之后）
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
await delay(800);

const info = await page.evaluate(() => {
  const out = { meshes: [], groups: [] };
  window.__island.scene.traverse((o) => {
    if (o.isMesh && (o.name === 'wall-body' || o.name === 'wall-cap')) {
      const g = o.geometry;
      g.computeBoundingSphere();
      const bs = g.boundingSphere;
      out.meshes.push({
        name: o.name,
        visible: o.visible,
        parentVisible: o.parent ? o.parent.visible : null,
        verts: g.attributes.position ? g.attributes.position.count : 0,
        attrs: Object.keys(g.attributes),
        index: !!g.index,
        mat: {
          type: o.material.type,
          visible: o.material.visible,
          transparent: o.material.transparent,
          opacity: o.material.opacity,
          colorWrite: o.material.colorWrite,
          depthTest: o.material.depthTest,
          vertexColors: o.material.vertexColors,
          flatShading: o.material.flatShading,
          side: o.material.side,
          hasMap: !!o.material.map,
          color: o.material.color ? o.material.color.getHexString() : null
        },
        sphere: bs ? { r: +bs.radius.toFixed(2), cx: +bs.center.x.toFixed(1), cy: +bs.center.y.toFixed(1), cz: +bs.center.z.toFixed(1) } : null,
        pos: [+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)],
        scale: [+o.scale.x.toFixed(3), +o.scale.y.toFixed(3), +o.scale.z.toFixed(3)],
        frustumCulled: o.frustumCulled,
        segs: o.userData.wallSegs ? o.userData.wallSegs.length : 0
      });
    }
    if (o.isGroup && o.userData && o.userData.wallSegs && !o.isMesh) {
      out.groups.push({ name: o.name, children: o.children.length, visible: o.visible });
    }
  });
  return out;
});
console.log('=== 带 wallSegs 的组 ===', JSON.stringify(info.groups));
console.log('=== wall-body / wall-cap 网格 ===');
for (const m of info.meshes.slice(0, 12)) console.log(JSON.stringify(m));

// 渲染调用数：把墙关掉再比 —— 能被绘制就说明几何/材质没问题，问题在遮挡或深浅
const calls = await page.evaluate(async () => {
  const wait = (n) => new Promise((r) => { let i = 0; const t = () => (++i >= n ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); });
  const list = [];
  window.__island.scene.traverse((o) => { if (o.isMesh && (o.name === 'wall-body' || o.name === 'wall-cap')) list.push(o); });
  await wait(3);
  const withWalls = window.__island.info().render.calls;
  list.forEach((m) => (m.visible = false));
  await wait(3);
  const noWalls = window.__island.info().render.calls;
  list.forEach((m) => (m.visible = true));
  return { count: list.length, withWalls, noWalls };
});
console.log('=== draw call 对比 ===', JSON.stringify(calls), calls.withWalls > calls.noWalls ? '→ 墙确实在画' : '→ 墙没被画（被剔除或没提交）');

// 射线：从墙外 4m、墙高 +2m 处朝墙段中点打，看能不能打到墙网格
const ray = await page.evaluate(() => {
  const THREE = window.__island.THREE;
  const segs = window.__island.wallsList();
  const s = segs[0];
  const mx = (s.ax + s.bx) / 2;
  const mz = (s.az + s.bz) / 2;
  const y = window.__island.groundAt(mx, mz);
  const dirs = [[3, 0, 0], [0, 0, 3], [-3, 0, 0], [0, 0, -3], [2, 0, 2], [-2, 0, -2]];
  const hits = [];
  for (const [dx, dz] of dirs) {
    const from = new THREE.Vector3(mx + dx, y + 1.2, mz + dz);
    const to = new THREE.Vector3(mx, y + 0.5, mz);
    const d = to.clone().sub(from).normalize();
    const rc = new THREE.Raycaster(from, d, 0, 12);
    const hit = rc.intersectObjects(window.__island.scene.children, true);
    hits.push({ from: [+from.x.toFixed(1), +from.z.toFixed(1)], hit: hit.length ? hit[0].object.name || hit[0].object.type : null, dist: hit.length ? +hit[0].distance.toFixed(2) : null });
  }
  return { mx: +mx.toFixed(1), mz: +mz.toFixed(1), y: +y.toFixed(2), hits };
});
console.log('=== 射线打墙 (墙段中点', ray.mx, ray.mz, '地面 y=', ray.y, ') ===');
for (const h of ray.hits) console.log(`  从 ${h.from} → 命中 ${h.hit} @ ${h.dist}m`);
await browser.close();
