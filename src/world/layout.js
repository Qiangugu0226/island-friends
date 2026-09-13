import { makeNoise2D, fbm, clamp, lerp, smoothstep, mulberry32 } from '../core/rng.js';

// 世界布局：地形高度函数 + 各类地块（院子/池塘/道路）+ 散布避让区域
// 关键点：heightAt 是「唯一真值」，地形网格、玩家行走、物件摆放全部用它，保证踩得准。
export function buildLayout(cfg) {
  const island = cfg.island;
  const noise = makeNoise2D(cfg.seed);
  const R = island.radius;
  const F = island.falloff;

  // ---------- 基础地形（海岛轮廓 + 起伏） ----------
  function rawHeight(x, z) {
    const d = Math.hypot(x, z);
    // 用角度方向的噪声扰动半径，让岛的海岸线不规则（不是个圆饼）
    const ang = Math.atan2(z, x);
    const wob = fbm(noise, Math.cos(ang) * 1.6 + 5.2, Math.sin(ang) * 1.6 - 3.1, 2);
    const radiusHere = R * (0.84 + 0.30 * wob);
    const mask = smoothstep((radiusHere - d) / F);
    const rolling = fbm(noise, x * island.hillScale, z * island.hillScale, 3);
    const broad = fbm(noise, x * 0.0095 + 13.7, z * 0.0095 - 5.3, 2);
    const h = island.baseHeight + island.hillHeight * (rolling * 0.72 + broad * 0.55);
    return island.seabedDepth + Math.pow(mask, 0.86) * (h - island.seabedDepth);
  }

  // ---------- 院子（把房子所在处整平） ----------
  const pads = cfg.buildings.map((b, i) => {
    const padR = Math.max(b.w, b.d) * 0.78 + 6.4;
    return { ...b, index: i, padR, y: rawHeight(b.x, b.z) };
  });

  // 地标也需要一块平地（灯塔 / 菜地）
  const landmarkPads = [];
  if (cfg.lighthouse) {
    landmarkPads.push({
      x: cfg.lighthouse.x,
      z: cfg.lighthouse.z,
      padR: 9.0,
      y: rawHeight(cfg.lighthouse.x, cfg.lighthouse.z),
      kind: 'lighthouse'
    });
  }
  if (cfg.cropField) {
    const c = cfg.cropField;
    landmarkPads.push({
      x: c.x,
      z: c.z,
      padR: Math.max(c.w, c.d) * 0.72 + 2.5,
      y: rawHeight(c.x, c.z),
      kind: 'crop'
    });
  }
  const flatPads = [...pads, ...landmarkPads];

  // ---------- 池塘（挖碗） ----------
  const ponds = cfg.ponds.map((p, i) => {
    const rimY = rawHeight(p.x, p.z);
    const surfaceY = rimY - 0.3;
    return { ...p, index: i, surfaceY, floorY: surfaceY - p.depth };
  });

  // ---------- 道路（沿折线压平） ----------
  const paths = cfg.paths.map((p) => {
    const nodes = p.points.map(([x, z]) => ({ x, z, y: rawHeight(x, z) }));
    const segs = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      segs.push({ a, b, dx: b.x - a.x, dz: b.z - a.z, len2: (b.x - a.x) ** 2 + (b.z - a.z) ** 2 });
    }
    return { ...p, nodes, segs, half: (p.width ?? 2.2) * 0.5, feather: 2.0 };
  });

  function nearestOnPaths(x, z) {
    let best = null;
    for (const path of paths) {
      for (const s of path.segs) {
        let t = 0;
        if (s.len2 > 1e-6) t = clamp(((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.len2, 0, 1);
        const px = s.a.x + s.dx * t;
        const pz = s.a.z + s.dz * t;
        const d = Math.hypot(x - px, z - pz);
        if (!best || d < best.d) {
          best = { d, y: lerp(s.a.y, s.b.y, t), path };
        }
      }
    }
    return best;
  }

  // ---------- 最终高度 ----------
  function heightAt(x, z) {
    let h = rawHeight(x, z);

    for (const pad of flatPads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      if (d > pad.padR) continue;
      const inner = pad.padR * 0.75;
      const w = 1 - smoothstep((d - inner) / Math.max(pad.padR - inner, 0.001));
      h = lerp(h, pad.y, w * 0.96);
    }

    for (const p of ponds) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > p.r) continue;
      const t = clamp(d / p.r, 0, 1);
      const target = p.floorY + (p.depth + 0.35) * Math.pow(t, 2.0);
      const w = 1 - smoothstep((t - 0.3) / 0.7);
      h = lerp(h, Math.min(h, target), w);
    }

    const near = nearestOnPaths(x, z);
    if (near) {
      const w = 1 - smoothstep((near.d - near.path.half) / near.path.feather);
      h = lerp(h, near.y - 0.1, w * 0.92);
    }

    return h;
  }

  function slopeAt(x, z, eps = 1.2) {
    const hx = heightAt(x + eps, z) - heightAt(x - eps, z);
    const hz = heightAt(x, z + eps) - heightAt(x, z - eps);
    return Math.hypot(hx, hz) / (2 * eps);
  }

  // ---------- 散布避让 ----------
  const exclusions = [];

  for (const pad of pads) exclusions.push({ x: pad.x, z: pad.z, r: pad.padR + 1.4, kind: 'pad' });
  for (const p of ponds) exclusions.push({ x: p.x, z: p.z, r: p.r + 1.6, kind: 'pond' });
  if (cfg.lighthouse) exclusions.push({ x: cfg.lighthouse.x, z: cfg.lighthouse.z, r: 11, kind: 'lighthouse' });
  if (cfg.dock) exclusions.push({ x: cfg.dock.x, z: cfg.dock.z, r: 14, kind: 'dock' });
  if (cfg.cropField) exclusions.push({ x: cfg.cropField.x, z: cfg.cropField.z, r: Math.max(cfg.cropField.w, cfg.cropField.d) * 0.7, kind: 'crop' });
  if (cfg.gallery) exclusions.push({ x: cfg.gallery.x, z: cfg.gallery.z, r: 60, kind: 'gallery' });

  // 道路走廊：用线段距离精确判定，避免大圆误伤
  const roadSegs = [];
  for (const path of paths) {
    for (const s of path.segs) {
      roadSegs.push({ ax: s.a.x, az: s.a.z, dx: s.dx, dz: s.dz, len2: s.len2, r: path.half + 1.2 });
    }
  }

  function isFree(x, z, extra = 0) {
    for (const e of exclusions) {
      if ((x - e.x) ** 2 + (z - e.z) ** 2 < (e.r + extra) ** 2) return false;
    }
    for (const s of roadSegs) {
      let t = 0;
      if (s.len2 > 1e-6) t = clamp(((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len2, 0, 1);
      const px = s.ax + s.dx * t;
      const pz = s.az + s.dz * t;
      if ((x - px) ** 2 + (z - pz) ** 2 < (s.r + extra) ** 2) return false;
    }
    return true;
  }

  // 海岸线：沿射线二分找 h = 0 的半径（给浪花环用）
  function shoreline(samples = 220) {
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const dirX = Math.cos(a);
      const dirZ = Math.sin(a);
      let lo = 0.5;
      let hi = island.size * 0.62;
      if (heightAt(dirX * lo, dirZ * lo) < 0) {
        pts.push(null);
        continue;
      }
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (heightAt(dirX * mid, dirZ * mid) > 0.12) lo = mid;
        else hi = mid;
      }
      pts.push({ angle: a, r: lo });
    }
    return pts;
  }

  return {
    cfg,
    island,
    noise,
    rawHeight,
    heightAt,
    slopeAt,
    pads,
    landmarkPads,
    flatPads,
    ponds,
    paths,
    exclusions,
    isFree,
    shoreline,
    random: mulberry32(cfg.seed ^ 0x51ed270b)
  };
}
