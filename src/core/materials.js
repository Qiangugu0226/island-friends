import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- 材质 ----------
// 全部使用 flatShading：低多边形硬边切面，参考图的核心质感
export function flatMat(color, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(color),
    flatShading: true,
    ...opts
  });
  return mat;
}

export function makeMatCache() {
  const cache = new Map();
  return (color, opts = {}) => {
    const { map, ...rest } = opts;
    const key = `${color}|${JSON.stringify(rest)}${map ? `|m:${map.uuid}` : ''}`;
    if (!cache.has(key)) cache.set(key, flatMat(color, opts));
    return cache.get(key);
  };
}

// 带 UV 的三角面几何（贴图用）
export function geomFromTrisUV(tris, uvOf) {
  const positions = new Float32Array(tris.length * 9);
  const uvs = new Float32Array(tris.length * 6);
  let o = 0;
  let u = 0;
  for (const tri of tris) {
    for (const v of tri) {
      positions[o++] = v[0];
      positions[o++] = v[1];
      positions[o++] = v[2];
      const uv = uvOf(v);
      uvs[u++] = uv[0];
      uvs[u++] = uv[1];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// ---------- 几何工具 ----------

// 由三角面数组构建非索引几何 -> 天然逐面法线（硬边低模）
export function geomFromTris(tris) {
  const positions = new Float32Array(tris.length * 9);
  let o = 0;
  for (const tri of tris) {
    for (const v of tri) {
      positions[o++] = v[0];
      positions[o++] = v[1];
      positions[o++] = v[2];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function quad(a, b, c, d) {
  return [
    [a, b, c],
    [a, c, d]
  ];
}

// 人字形屋顶（三角柱）：宽 w、高 h、进深 d，原点在底面中心
// 注意绕序：坡面法线必须朝外（朝上/朝外），否则会被自己的阴影压黑
// 同时生成 UV：u 沿屋脊方向、v 沿坡面方向 —— 这样瓦垄贴图才会顺着坡走
export function gableRoofGeometry(w, h, d, overhang = 0.35) {
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const A = [-hw, 0, hd];
  const B = [hw, 0, hd];
  const C = [0, h, hd];
  const A2 = [-hw, 0, -hd];
  const B2 = [hw, 0, -hd];
  const C2 = [0, h, -hd];
  const t = [];
  t.push([A, C, C2], [A, C2, A2]); // 左坡
  t.push([B, B2, C2], [B, C2, C]); // 右坡
  t.push([A, B2, B], [A, A2, B2]); // 底面
  t.push([A, B, C]); // 前山墙
  t.push([A2, C2, B2]); // 后山墙
  const uvOf = (p) => {
    const slope = Math.sqrt((hw - Math.abs(p[0])) ** 2 + p[1] ** 2);
    return [p[2] * 0.55 + 0.5, slope * 0.55];
  };
  return geomFromTrisUV(t, uvOf);
}

// 三角柱（山墙/尖顶用）
export function prismGeometry(w, h, d) {
  const hw = w / 2;
  const hd = d / 2;
  const t = [
    [[-hw, 0, hd], [0, h, hd], [hw, 0, hd]],
    [[-hw, 0, -hd], [hw, 0, -hd], [0, h, -hd]],
    [[-hw, 0, hd], [0, h, hd], [0, h, -hd]], [[-hw, 0, hd], [0, h, -hd], [-hw, 0, -hd]],
    [[hw, 0, hd], [hw, 0, -hd], [0, h, -hd]], [[hw, 0, hd], [0, h, -hd], [0, h, hd]],
    [[-hw, 0, hd], [-hw, 0, -hd], [hw, 0, -hd]], [[-hw, 0, hd], [hw, 0, -hd], [hw, 0, hd]]
  ];
  return geomFromTris(t);
}

// 圆锥（树冠/干草堆/尖顶）
export function coneGeometry(r, h, segments = 7) {
  return new THREE.ConeGeometry(r, h, segments, 1, false);
}

export function smoothDamp(current, target, lambda, dt) {
  return lerpN(current, target, 1 - Math.exp(-lambda * dt));
}

export function lerpN(a, b, t) {
  return a + (b - a) * t;
}

// ---------- 文字标签（用于资产总览） ----------
export function labelSprite(text, opts = {}) {
  const {
    font = 'bold 40px "PingFang SC", "Microsoft YaHei", sans-serif',
    color = '#4a4033',
    bg = 'rgba(253,245,228,0.94)',
    border = 'rgba(122,100,70,0.4)',
    padX = 26,
    padY = 14,
    scale = 0.0125
  } = opts;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width + padX * 2);
  const h = 40 + padY * 2;
  canvas.width = w;
  canvas.height = h;

  const c = canvas.getContext('2d');
  c.font = font;
  c.textBaseline = 'middle';
  const r = 18;
  c.beginPath();
  c.moveTo(r, 0);
  c.lineTo(w - r, 0);
  c.quadraticCurveTo(w, 0, w, r);
  c.lineTo(w, h - r);
  c.quadraticCurveTo(w, h, w - r, h);
  c.lineTo(r, h);
  c.quadraticCurveTo(0, h, 0, h - r);
  c.lineTo(0, r);
  c.quadraticCurveTo(0, 0, r, 0);
  c.closePath();
  c.fillStyle = bg;
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = border;
  c.stroke();
  c.fillStyle = color;
  c.fillText(text, padX, h / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(w * scale, h * scale, 1);
  return sprite;
}

// 统一设置阴影
export function shade(object3d, { cast = true, receive = true } = {}) {
  object3d.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return object3d;
}

// ---------- 合并部件（把一堆小几何合成一个，便于 InstancedMesh） ----------
export function mergeParts(parts) {
  const geos = parts.map((p) => {
    let g = p.geo.clone();
    // mergeGeometries 要求索引状态一致：统一转成非索引
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(p.pos ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
      new THREE.Vector3(...(p.scale ?? [1, 1, 1]))
    );
    g.applyMatrix4(m);
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (merged) merged.computeVertexNormals();
  return merged;
}

// 棕榈/芭蕉叶冠：一圈下垂的长叶片，合成一个几何体。
// 用 DoubleSide 材质，省掉绕序烦恼。
export function palmCrownGeometry(leafCount = 7, leafLen = 1.7, leafWidth = 0.62, droop = 0.62, lift = 0.35) {
  const tris = [];
  for (let i = 0; i < leafCount; i++) {
    const a = (i / leafCount) * Math.PI * 2 + (i % 2) * 0.11;
    const dirX = Math.cos(a);
    const dirZ = Math.sin(a);
    const px = -dirZ * leafWidth * 0.5;
    const pz = dirX * leafWidth * 0.5;
    const tipX = dirX * leafLen;
    const tipZ = dirZ * leafLen;
    const tipY = -droop * leafLen * 0.5;
    const rootY = lift;
    const p0 = [px, rootY, pz];
    const p1 = [-px, rootY, -pz];
    const p2 = [tipX + px * 0.22, rootY + tipY, tipZ + pz * 0.22];
    const p3 = [tipX - px * 0.22, rootY + tipY, tipZ - pz * 0.22];
    tris.push([p0, p1, p2], [p1, p3, p2]);
  }
  return geomFromTris(tris);
}

