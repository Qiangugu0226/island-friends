import * as THREE from 'three';

// 碰撞系统：把"能不能站、站多高"集中到一处
//  · circles  ：圆形碰撞体（房子、道具、树、石头、树桩……），用空间网格加速
//  · walls    ：院墙这类"矩形环"（带门洞），按墙段判定，人能进院子但穿不过墙
//  · platforms：能走上去的面（栈台），走到上面时脚下高度取平台高度
export function createCollision({ cell = 8 } = {}) {
  const grid = new Map();
  const circles = [];
  const walls = [];
  const platforms = [];
  const box = new THREE.Box3();

  const key = (i, j) => `${i},${j}`;

  function addCircle(x, z, r, meta = {}) {
    const rec = { x, z, r, ...meta };
    circles.push(rec);
    const i0 = Math.floor((x - r) / cell);
    const i1 = Math.floor((x + r) / cell);
    const j0 = Math.floor((z - r) / cell);
    const j1 = Math.floor((z + r) / cell);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(rec);
      }
    }
    return rec;
  }

  function nearby(x, z, radius, out = []) {
    out.length = 0;
    const i0 = Math.floor((x - radius) / cell);
    const i1 = Math.floor((x + radius) / cell);
    const j0 = Math.floor((z - radius) / cell);
    const j1 = Math.floor((z + radius) / cell);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = grid.get(key(i, j));
        if (!arr) continue;
        for (const rec of arr) if (!out.includes(rec)) out.push(rec);
      }
    }
    return out;
  }

  const scratch = [];

  // 圆形碰撞：被挡住就返回那个碰撞体
  function hitCircle(x, z, margin = 0.34, y = null) {
    const list = nearby(x, z, 2 + margin, scratch);
    for (const b of list) {
      if (y !== null && b.h !== undefined && y > b.h) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz < (b.r + margin) ** 2) return b;
    }
    return null;
  }

  // 院墙：落在"墙环"里且不在门洞 → 挡住
  function hitWall(x, z, margin = 0.28) {
    for (const w of walls) {
      const c = Math.cos(w.rot ?? 0);
      const s = Math.sin(w.rot ?? 0);
      const dx = x - w.x;
      const dz = z - w.z;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const ax = Math.abs(lx);
      const az = Math.abs(lz);
      const t = (w.thickness ?? 0.42) / 2 + margin;
      const halfW = w.halfW;
      const halfD = w.halfD;
      const onX = Math.abs(ax - halfW) <= t && az <= halfD + t;
      const onZ = Math.abs(az - halfD) <= t && ax <= halfW + t;
      if (!onX && !onZ) continue;
      const inGap = (w.gaps ?? []).some((g) => (lx - g.x) ** 2 + (lz - g.z) ** 2 < (g.r ?? 2.4) ** 2);
      if (!inGap) return w;
    }
    return null;
  }

  function platformAt(x, z) {
    let top = null;
    for (const p of platforms) {
      const c = Math.cos(p.rot ?? 0);
      const s = Math.sin(p.rot ?? 0);
      const dx = x - p.x;
      const dz = z - p.z;
      const lx = dx * c - dz * s - (p.cx ?? 0);
      const lz = dx * s + dz * c - (p.cz ?? 0);
      if (Math.abs(lx) <= p.halfW && Math.abs(lz) <= p.halfD) {
        if (top === null || p.topY > top) top = p.topY;
      }
    }
    return top;
  }

  // 脚下高度：地形与平台取较高者
  function groundAt(x, z, terrainHeightAt) {
    const h = terrainHeightAt(x, z);
    const top = platformAt(x, z);
    return top === null ? h : Math.max(h, top);
  }

  function blocked(x, z, { margin = 0.34, y = null, groundAt: groundFn, stepUp = 0.75 } = {}) {
    if (hitWall(x, z)) return { type: 'wall' };
    const c = hitCircle(x, z, margin, y);
    if (c) return c;
    if (groundFn) {
      const here = groundFn(x, z);
      void here;
      void stepUp;
    }
    return null;
  }

  return {
    circles,
    walls,
    platforms,
    addCircle,
    nearby,
    hitCircle,
    hitWall,
    platformAt,
    groundAt,
    blocked,
    get count() {
      return circles.length;
    }
  };
}
