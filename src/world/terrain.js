import * as THREE from 'three';
import { makeNoise2D } from '../core/rng.js';
import { clamp, smoothstep } from '../core/rng.js';

// 低多边形岛屿地形：逐面单色（非索引几何）= 参考图那种干净硬边切面
// P5-1：叠加一层程序化"手绘色斑"贴图（map 与顶点色相乘），让大片草地不再死平
export function createTerrain(layout, palette, textures) {
  const island = layout.island;
  const size = island.size;
  const res = island.resolution;
  const half = size / 2;
  const step = size / res;
  const noise = makeNoise2D(layout.cfg.seed ^ 0x2f1b3c);

  const cols = res + 1;
  const heights = new Float32Array(cols * cols);
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      heights[j * cols + i] = layout.heightAt(-half + i * step, -half + j * step);
    }
  }

  const C = {
    grassLight: new THREE.Color(palette.grassLight),
    grassMid: new THREE.Color(palette.grassMid),
    grassDark: new THREE.Color(palette.grassDark),
    sandLight: new THREE.Color(palette.sandLight),
    sandDark: new THREE.Color(palette.sandDark),
    sandWet: new THREE.Color(palette.sandWet),
    rock: new THREE.Color(palette.rock),
    cliff: new THREE.Color(palette.cliff)
  };

  const positions = new Float32Array(res * res * 6 * 3);
  const colors = new Float32Array(res * res * 6 * 3);
  const scratch = new THREE.Color();
  let o = 0;
  let c = 0;

  const hAt = (i, j) => heights[clamp(j, 0, res) * cols + clamp(i, 0, res)];

  function faceColor(x, z, y, steep) {
    const n = noise(x * 0.14, z * 0.14);
    const n2 = noise(x * 0.62 + 31.7, z * 0.62 - 12.3);
    if (y < island.beachTop) {
      const wet = smoothstep((y + 1.0) / (island.beachTop + 1.0));
      scratch.copy(C.sandWet).lerp(C.sandLight, wet);
      if (y < -1.0) scratch.lerp(C.cliff, clamp((-1.0 - y) / 1.6, 0, 1) * 0.55);
      scratch.lerp(C.sandDark, (1 - wet) * 0.35);
    } else if (y < island.grassStart) {
      const t = smoothstep((y - island.beachTop) / (island.grassStart - island.beachTop));
      scratch.copy(C.sandLight).lerp(C.grassMid, t);
    } else {
      scratch.copy(C.grassMid).lerp(C.grassLight, clamp(n * 1.15, 0, 1));
      scratch.lerp(C.grassDark, clamp((n2 - 0.45) * 1.1, 0, 1) * 0.85);
    }
    if (steep > 0.58) scratch.lerp(C.cliff, clamp((steep - 0.58) / 0.32, 0, 1) * 0.9);
    scratch.multiplyScalar(0.955 + n2 * 0.09);
    return scratch;
  }

  const uvs = new Float32Array(res * res * 6 * 2);
  let t2 = 0;

  function pushVertex(px, py, pz, col) {
    positions[o++] = px;
    positions[o++] = py;
    positions[o++] = pz;
    colors[c++] = col.r;
    colors[c++] = col.g;
    colors[c++] = col.b;
    // UV 铺满整张地形（贴图自身的 repeat 决定平铺密度）
    uvs[t2++] = (px + half) / size;
    uvs[t2++] = (pz + half) / size;
  }

  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x0 = -half + i * step;
      const z0 = -half + j * step;
      const x1 = x0 + step;
      const z1 = z0 + step;
      const y00 = hAt(i, j);
      const y10 = hAt(i + 1, j);
      const y01 = hAt(i, j + 1);
      const y11 = hAt(i + 1, j + 1);

      // 两个三角形的面心高度 + 坡度
      const cxA = (x0 + x1 + x0) / 3;
      const czA = (z0 + z0 + z1) / 3;
      const cyA = (y00 + y10 + y01) / 3;
      const cxB = (x1 + x1 + x0) / 3;
      const czB = (z0 + z1 + z1) / 3;
      const cyB = (y10 + y11 + y01) / 3;

      const gx = (y10 + y11 - y00 - y01) / (2 * step);
      const gz = (y01 + y11 - y00 - y10) / (2 * step);
      const steep = Math.hypot(gx, gz);

      const colA = faceColor(cxA, czA, cyA, steep);
      const ca = { r: colA.r, g: colA.g, b: colA.b };
      const colB = faceColor(cxB, czB, cyB, steep);
      const cb = { r: colB.r, g: colB.g, b: colB.b };

      // 三角形 A: (x0,z0) (x0,z1) (x1,z0) —— 从上方看是逆时针，法线朝上
      pushVertex(x0, y00, z0, ca);
      pushVertex(x0, y01, z1, ca);
      pushVertex(x1, y10, z0, ca);
      // 三角形 B: (x1,z0) (x0,z1) (x1,z1)
      pushVertex(x1, y10, z0, cb);
      pushVertex(x0, y01, z1, cb);
      pushVertex(x1, y11, z1, cb);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const matOpts = { vertexColors: true, flatShading: true };
  if (textures?.ground) matOpts.map = textures.ground;
  const mat = new THREE.MeshLambertMaterial(matOpts);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return { mesh, triangles: res * res * 2 };
}
