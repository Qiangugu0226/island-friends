import * as THREE from 'three';

// P5-2 接触阴影：在物件底部铺一张柔边暗片（廉价版"环境遮蔽"）。
// 说明：太阳的实时阴影已经有了，但它只在有光时才明显、而且贴地的"接缝发暗"它给不出来；
//       这张暗片负责把物件"压"在地上（墙角、桶底、树根），是低多边形风格里最划算的一招。
// 成本：全岛几百个物件合并进 1 个 InstancedMesh → 只多 1 个 draw call。

// 程序化柔边圆片：中心实、边缘散；边缘故意做一点不规则，避免"完美圆形"的机器感
function blobTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.34)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // 边缘挖掉几块（手绘的不规则感）
  ctx.globalCompositeOperation = 'destination-out';
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = r * (0.72 + rnd() * 0.34);
    const rad = r * (0.1 + rnd() * 0.26);
    const grad = ctx.createRadialGradient(r + Math.cos(a) * rr, r + Math.sin(a) * rr, 0, r + Math.cos(a) * rr, r + Math.sin(a) * rr, rad);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(r + Math.cos(a) * rr, r + Math.sin(a) * rr, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function createContactShadows(blobs, opts = {}) {
  const color = new THREE.Color(opts.color ?? '#2A2118');
  const opacity = opts.opacity ?? 0.3;
  const lift = opts.lift ?? 0.03; // 离地一点点，避免和地形 z-fighting
  const tex = blobTexture();
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const group = new THREE.Group();
  group.name = '接触阴影';

  const n = Math.max(1, blobs.length);
  const mesh = new THREE.InstancedMesh(geo, material, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  blobs.forEach((b, i) => {
    e.set(0, b.rot ?? 0, 0);
    q.setFromEuler(e);
    p.set(b.x, (b.y ?? 0) + lift, b.z);
    s.set(Math.max(0.05, b.sx ?? 1), 1, Math.max(0.05, b.sz ?? b.sx ?? 1));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; // 一整块覆盖全岛，别按单个包围盒剔除
  mesh.renderOrder = 3;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);

  // 会动的角色（玩家/大黄）用独立的两张小片，每帧更新位置
  function makeBlob(size = 1) {
    const b = new THREE.Mesh(geo, material);
    b.scale.set(size, 1, size);
    b.frustumCulled = false;
    b.renderOrder = 3;
    group.add(b);
    return b;
  }

  return { group, material, texture: tex, count: blobs.length, makeBlob };
}
