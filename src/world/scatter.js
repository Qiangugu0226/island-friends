import * as THREE from 'three';
import { mulberry32, clamp, smoothstep } from '../core/rng.js';

// 程序化散布：树 / 灌木 / 石头 / 野花 / 树桩 / 草丛
// 用 InstancedMesh 保证上万株植物也只有十几个 draw call
export function scatterWorld(scene, layout, assets, palette) {
  const cfg = layout.cfg;
  const scatter = cfg.scatter;
  const island = layout.island;
  const rand = mulberry32(cfg.seed ^ 0x5eed1234);
  const group = new THREE.Group();
  group.name = 'scatter';

  // 空间哈希：最小间距检查
  function makeGrid(cell) {
    const map = new Map();
    const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    return {
      add(x, z) {
        const k = key(x, z);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push([x, z]);
      },
      farEnough(x, z, minDist) {
        const cx = Math.floor(x / cell);
        const cz = Math.floor(z / cell);
        const r = Math.ceil(minDist / cell);
        for (let i = cx - r; i <= cx + r; i++) {
          for (let j = cz - r; j <= cz + r; j++) {
            const arr = map.get(`${i},${j}`);
            if (!arr) continue;
            for (const [px, pz] of arr) {
              if ((px - x) ** 2 + (pz - z) ** 2 < minDist * minDist) return false;
            }
          }
        }
        return true;
      }
    };
  }

  const maxR = island.radius + island.falloff * 0.55;

  function samplePoint({ minDist, minHeight, maxSlope, grid, extra = 1.0, tries = 26, treesOnly = false }) {
    for (let t = 0; t < tries; t++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * maxR;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = layout.heightAt(x, z);
      if (h < minHeight) continue;
      if (layout.slopeAt(x, z) > maxSlope) continue;
      if (!layout.isFree(x, z, extra)) continue;
      if (grid && !grid.farEnough(x, z, minDist)) continue;
      if (treesOnly && Math.hypot(x, z) > island.radius) continue;
      return { x, z, h };
    }
    return null;
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const col = new THREE.Color();

  function buildInstanced(geo, material, items, { cast = true, receive = true, colored = false } = {}) {
    if (!items.length) return null;
    const mesh = new THREE.InstancedMesh(geo, material, items.length);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
      q.setFromEuler(e);
      v3.set(it.x, it.y, it.z);
      s3.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
      m4.compose(v3, q, s3);
      mesh.setMatrixAt(i, m4);
      if (colored && it.color) {
        col.set(it.color);
        mesh.setColorAt(i, col);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (colored && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  const stats = { trees: 0, bushes: 0, rocks: 0, flowers: 0, stumps: 0, tufts: 0 };

  // ---------- 树 ----------
  const treeGrid = makeGrid(scatter.treeMinDistance);
  const trunks = [];
  const canopyItems = { round: [], facet: [], tall: [] };
  for (let i = 0; i < scatter.trees; i++) {
    const p = samplePoint({
      minDist: scatter.treeMinDistance,
      minHeight: island.grassStart + 0.15,
      maxSlope: 0.62,
      grid: treeGrid,
      extra: 1.6
    });
    if (!p) continue;
    treeGrid.add(p.x, p.z);
    const height = scatter.minTreeHeight + rand() * (scatter.maxTreeHeight - scatter.minTreeHeight);
    const trunkScale = height / 3.6;
    trunks.push({ x: p.x, y: p.h, z: p.z, ry: rand() * Math.PI, sx: 1, sy: trunkScale, sz: 1 });
    const leaf = palette.leafColors[Math.floor(rand() * palette.leafColors.length)];
    const blobCount = 1 + (rand() < 0.55 ? 1 : 0) + (rand() < 0.22 ? 1 : 0);
    for (let b = 0; b < blobCount; b++) {
      const kind = rand() < 0.22 ? 'facet' : rand() < 0.3 ? 'tall' : 'round';
      const s = (0.85 + rand() * 0.7) * clamp(height / 4.2, 0.65, 1.5);
      canopyItems[kind].push({
        x: p.x + (rand() - 0.5) * 0.9,
        y: p.h + height * 0.72 + b * 0.5 * trunkScale + rand() * 0.2,
        z: p.z + (rand() - 0.5) * 0.9,
        rx: rand() * 0.5,
        ry: rand() * Math.PI,
        rz: rand() * 0.5,
        sx: s * (0.92 + rand() * 0.25),
        sy: s * (0.85 + rand() * 0.35),
        sz: s * (0.92 + rand() * 0.25),
        color: leaf
      });
    }
    stats.trees++;
  }

  const trunkMat = assets.mat(palette.trunkDark);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const trunkMesh = buildInstanced(assets.geos.trunkGeo, trunkMat, trunks);
  if (trunkMesh) group.add(trunkMesh);
  for (const [kind, items] of Object.entries(canopyItems)) {
    const geo = kind === 'facet' ? assets.geos.canopyFacet : kind === 'tall' ? assets.geos.canopyTall : assets.geos.canopyRound;
    const mesh = buildInstanced(geo, leafMat, items, { colored: true });
    if (mesh) group.add(mesh);
  }

  // ---------- 灌木 ----------
  const bushGrid = makeGrid(2.0);
  const bushItems = [];
  for (let i = 0; i < scatter.bushes; i++) {
    const p = samplePoint({ minDist: 2.2, minHeight: island.grassStart - 0.35, maxSlope: 0.7, grid: bushGrid, extra: 0.9, tries: 14 });
    if (!p) continue;
    bushGrid.add(p.x, p.z);
    const s = 0.7 + rand() * 0.8;
    bushItems.push({
      x: p.x,
      y: p.h,
      z: p.z,
      ry: rand() * Math.PI,
      sx: s * (0.9 + rand() * 0.4),
      sy: s * (0.6 + rand() * 0.4),
      sz: s * (0.9 + rand() * 0.4),
      color: rand() < 0.3 ? palette.grassDark : palette.bushColor
    });
    stats.bushes++;
  }
  const bushMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const bushMesh = buildInstanced(assets.geos.bushGeo, bushMat, bushItems, { colored: true });
  if (bushMesh) group.add(bushMesh);

  // ---------- 石头（草地 + 沙滩上的碎礁石） ----------
  const rockGrid = makeGrid(scatter.rockMinDistance);
  const rockItems = [];
  const pebbleItems = [];
  for (let i = 0; i < scatter.rocks; i++) {
    const p = samplePoint({ minDist: scatter.rockMinDistance, minHeight: island.grassStart - 0.4, maxSlope: 0.85, grid: rockGrid, extra: 0.6, tries: 16 });
    if (!p) continue;
    rockGrid.add(p.x, p.z);
    rockItems.push({
      x: p.x,
      y: p.h,
      z: p.z,
      rx: (rand() - 0.5) * 0.5,
      ry: rand() * Math.PI,
      rz: (rand() - 0.5) * 0.5,
      sx: 0.8 + rand() * 1.5,
      sy: 0.5 + rand() * 0.7,
      sz: 0.8 + rand() * 1.5,
      color: rand() < 0.4 ? palette.cliff : palette.rockColor
    });
    stats.rocks++;
  }
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = island.radius * 0.82 + rand() * island.falloff * 0.9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = layout.heightAt(x, z);
    if (h < -0.3 || h > island.beachTop + 0.4) continue;
    if (!layout.isFree(x, z, 0.3)) continue;
    pebbleItems.push({
      x, y: h, z,
      rx: rand() * 0.6,
      ry: rand() * Math.PI,
      rz: rand() * 0.6,
      sx: 0.5 + rand() * 0.8,
      sy: 0.4 + rand() * 0.5,
      sz: 0.5 + rand() * 0.8,
      color: rand() < 0.5 ? palette.rockColor : palette.cliff
    });
  }
  const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const rockMesh = buildInstanced(assets.geos.rockGeo, rockMat, rockItems, { colored: true });
  if (rockMesh) group.add(rockMesh);
  const pebbleMesh = buildInstanced(assets.geos.stoneGeoS, rockMat, pebbleItems, { colored: true });
  if (pebbleMesh) group.add(pebbleMesh);

  // ---------- 野花 ----------
  const flowerItems = [];
  const flowerStems = [];
  for (let i = 0; i < scatter.flowers; i++) {
    const p = samplePoint({ minDist: 1.5, minHeight: island.grassStart - 0.1, maxSlope: 0.5, grid: null, extra: 0.4, tries: 10 });
    if (!p) continue;
    const s = 0.8 + rand() * 0.7;
    const c = palette.flowerColors[Math.floor(rand() * palette.flowerColors.length)];
    flowerStems.push({ x: p.x, y: p.h, z: p.z, ry: rand() * Math.PI, sx: s, sy: s, sz: s });
    flowerItems.push({ x: p.x, y: p.h, z: p.z, ry: rand() * Math.PI, sx: s, sy: s, sz: s, color: c });
    stats.flowers++;
  }
  const stemMesh = buildInstanced(assets.geos.stemGeo, assets.mat(palette.grassDark), flowerStems, { cast: false });
  if (stemMesh) group.add(stemMesh);
  const bloomMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const bloomMesh = buildInstanced(assets.geos.bloomGeo, bloomMat, flowerItems, { cast: false, colored: true });
  if (bloomMesh) group.add(bloomMesh);

  // ---------- 树桩 ----------
  const stumpItems = [];
  const stumpGrid = makeGrid(6);
  for (let i = 0; i < scatter.stumps; i++) {
    const p = samplePoint({ minDist: 6, minHeight: island.grassStart, maxSlope: 0.4, grid: stumpGrid, extra: 1.2, tries: 12 });
    if (!p) continue;
    stumpGrid.add(p.x, p.z);
    stumpItems.push({ x: p.x, y: p.h, z: p.z, ry: rand() * Math.PI, sx: 0.8 + rand() * 0.6, sy: 0.8 + rand() * 0.5, sz: 0.8 + rand() * 0.6 });
    stats.stumps++;
  }
  const stumpMesh = buildInstanced(assets.geos.stumpGeo, assets.mat(palette.woodDark), stumpItems);
  if (stumpMesh) group.add(stumpMesh);
  const stumpTopMesh = buildInstanced(assets.geos.stumpTopGeo, assets.mat(palette.trunk), stumpItems, { cast: false });
  if (stumpTopMesh) group.add(stumpTopMesh);

  // ---------- 草丛（数量多，最便宜的一层） ----------
  const tuftItems = [];
  for (let i = 0; i < scatter.grassTufts; i++) {
    const p = samplePoint({ minDist: 0.9, minHeight: island.grassStart - 0.5, maxSlope: 0.6, grid: null, extra: 0.2, tries: 6 });
    if (!p) continue;
    const s = 0.7 + rand() * 0.9;
    tuftItems.push({
      x: p.x,
      y: p.h,
      z: p.z,
      ry: rand() * Math.PI,
      sx: s,
      sy: s * (0.8 + rand() * 0.6),
      sz: s,
      color: rand() < 0.45 ? palette.grassDark : palette.grassLight
    });
    stats.tufts++;
  }
  const tuftMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const tuftMesh = buildInstanced(assets.geos.tuftGeo, tuftMat, tuftItems, { cast: false, colored: true });
  if (tuftMesh) group.add(tuftMesh);

  scene.add(group);
  return { group, stats };
}
