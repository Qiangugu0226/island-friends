import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// 场景摆放：石厝村落 / 航标塔 / 土地庙 / 石阶码头 + 渔船 / 晒渔网 / 梯田 / 石板路 / 渔家小景
export function buildStructures(scene, layout, assets, palette) {
  const cfg = layout.cfg;
  const rand = mulberry32(cfg.seed ^ 0x1a2b3c4d);
  const group = new THREE.Group();
  group.name = 'structures';
  const blockers = [];
  const nightLights = [];
  const stats = { houses: 0, yards: 0, props: 0, slabs: 0 };

  // ---------- 石板路（沿道路铺石板）----------
  const slabGeo = new THREE.BoxGeometry(1.35, 0.14, 1.05);
  const slabMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const slabPositions = [];
  const slabColor = new THREE.Color();
  for (const path of layout.paths) {
    for (const s of path.segs) {
      const len = Math.hypot(s.dx, s.dz);
      const n = Math.max(1, Math.round(len / 0.85));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = s.a.x + s.dx * t + (rand() - 0.5) * 0.28;
        const z = s.a.z + s.dz * t + (rand() - 0.5) * 0.28;
        const y = layout.heightAt(x, z) + 0.05;
        if (y < -0.2) continue;
        slabPositions.push({
          x,
          y,
          z,
          ry: Math.atan2(s.dx, s.dz) + Math.PI / 2 + (rand() - 0.5) * 0.16,
          s: 0.82 + rand() * 0.34,
          color: rand() < 0.5 ? palette.stone : palette.stoneDark
        });
      }
    }
  }
  if (slabPositions.length) {
    const slabMesh = new THREE.InstancedMesh(slabGeo, slabMat, slabPositions.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    for (let i = 0; i < slabPositions.length; i++) {
      const it = slabPositions[i];
      e.set(0, it.ry, 0);
      q.setFromEuler(e);
      v3.set(it.x, it.y, it.z);
      s3.set(it.s, 1, it.s);
      m4.compose(v3, q, s3);
      slabMesh.setMatrixAt(i, m4);
      slabColor.set(it.color);
      slabMesh.setColorAt(i, slabColor);
    }
    slabMesh.instanceMatrix.needsUpdate = true;
    if (slabMesh.instanceColor) slabMesh.instanceColor.needsUpdate = true;
    slabMesh.receiveShadow = true;
    slabMesh.castShadow = false;
    group.add(slabMesh);
    stats.slabs = slabPositions.length;
  }

  // ---------- 石厝小院 ----------
  layout.pads.forEach((pad) => {
    const house = assets.makeStoneHouse(rand, pad);
    house.position.set(pad.x, pad.y, pad.z);
    group.add(house);
    blockers.push({
      x: pad.x,
      z: pad.z,
      r: Math.max(pad.w, pad.d) * 0.62,
      h: pad.y + pad.wallH + pad.roofH + 0.8
    });
    stats.houses++;

    // 石砌矮院墙，朝村子中心留门
    const fw = pad.w + 5.4;
    const fd = pad.d + 5.4;
    const toCenter = new THREE.Vector2(-pad.x, -pad.z).normalize();
    const localAngle = Math.atan2(toCenter.y, toCenter.x) - (pad.rot ?? 0);
    const sides = [
      { a: 0, gap: { x: fw / 2, z: 0 } },
      { a: Math.PI / 2, gap: { x: 0, z: fd / 2 } },
      { a: Math.PI, gap: { x: -fw / 2, z: 0 } },
      { a: -Math.PI / 2, gap: { x: 0, z: -fd / 2 } }
    ];
    let best = sides[0];
    let bestDiff = Infinity;
    for (const s of sides) {
      const diff = Math.abs(((localAngle - s.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = s;
      }
    }
    const yard = assets.makeStoneWallYard(fw, fd, { gaps: [{ x: best.gap.x, z: best.gap.z, r: 2.6 }] });
    yard.position.set(pad.x, layout.heightAt(pad.x, pad.z), pad.z);
    yard.rotation.y = pad.rot ?? 0;
    group.add(yard);
    stats.yards++;
  });

  // ---------- 航标塔（地标）----------
  if (cfg.beaconTower) {
    const bt = cfg.beaconTower;
    const pad = layout.landmarkPads.find((p) => p.kind === 'beacon');
    const tower = assets.makeBeaconTower(bt);
    const y = pad ? pad.y : layout.heightAt(bt.x, bt.z);
    tower.group.position.set(bt.x, y, bt.z);
    tower.group.rotation.y = bt.rot ?? 0;
    group.add(tower.group);
    nightLights.push(tower.light);
    blockers.push({ x: bt.x, z: bt.z, r: 3.4, h: y + (bt.height ?? 14) + 2 });

    const rail = assets.makeStoneWallYard(15, 15, { height: 0.8, gaps: [{ x: 0, z: 7.5, r: 2.4 }] });
    rail.position.set(bt.x, y, bt.z);
    group.add(rail);
  }

  // ---------- 土地庙 + 庙前老榕树 ----------
  if (cfg.shrine) {
    const sh = cfg.shrine;
    const pad = layout.landmarkPads.find((p) => p.kind === 'shrine');
    const y = pad ? pad.y : layout.heightAt(sh.x, sh.z);
    const shrine = assets.makeShrine();
    shrine.group.position.set(sh.x, y, sh.z);
    shrine.group.rotation.y = sh.rot ?? 0;
    group.add(shrine.group);
    nightLights.push(shrine.light);
    blockers.push({ x: sh.x, z: sh.z, r: 2.2, h: y + 3.2 });

    for (const [dx, dz] of [[-4.6, 3.2], [4.2, 4.0]]) {
      const bx = sh.x + dx;
      const bz = sh.z + dz;
      const by = layout.heightAt(bx, bz);
      const banyan = assets.makeBanyan(rand);
      banyan.position.set(bx, by, bz);
      group.add(banyan);
      blockers.push({ x: bx, z: bz, r: 1.1, h: by + 2.2 });
    }
  }

  // ---------- 石阶码头 + 渔船 ----------
  function shoreRadiusAt(angle) {
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let lo = 1;
    let hi = layout.island.size * 0.62;
    for (let k = 0; k < 26; k++) {
      const mid = (lo + hi) / 2;
      if (layout.heightAt(dx * mid, dz * mid) > 0.1) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  if (cfg.dock) {
    const a = Math.atan2(cfg.dock.z, cfg.dock.x);
    const r0 = shoreRadiusAt(a);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = dx * (r0 - 1.2);
    const pz = dz * (r0 - 1.2);
    const py = Math.max(layout.heightAt(px, pz), 0.7);
    const pier = assets.makeStonePier(cfg.dock);
    pier.rotation.y = Math.atan2(-dx, -dz);
    pier.position.set(px, py, pz);
    group.add(pier);
    stats.props++;

    // 渔船停在栈台侧边，浮在水面上（y 固定在水线附近，不跟着栈台抬高）
    const [mlx, , mlz] = pier.userData.moorLocal ?? [2.6, 0.2, -6];
    const th = pier.rotation.y;
    const bx = px + mlx * Math.cos(th) + mlz * Math.sin(th);
    const bz = pz - mlx * Math.sin(th) + mlz * Math.cos(th);
    const boat = assets.makeFishingBoat(rand);
    boat.position.set(bx, 0.16, bz);
    boat.rotation.y = th + Math.PI / 2;
    group.add(boat);
  }

  // ---------- 梯田菜畦 ----------
  if (cfg.cropField) {
    const field = assets.makeTerraceField(rand, cfg.cropField);
    const pad = layout.landmarkPads.find((p) => p.kind === 'crop');
    field.position.set(
      cfg.cropField.x,
      (pad ? pad.y : layout.heightAt(cfg.cropField.x, cfg.cropField.z)) + 0.05,
      cfg.cropField.z
    );
    group.add(field);
  }

  // ---------- 渔家小景 ----------
  // 摆位规则：道具不许压在石板路 / 池塘 / 地标（航标塔、土地庙、梯田）上，
  // 如果原坐标落在这些地方，就自动往旁边找一块空地（这是"穿模"的通用解法）。
  const inRoad = (x, z, margin) => {
    for (const path of layout.paths) {
      for (const s of path.segs) {
        let t = 0;
        if (s.len2 > 1e-6) t = Math.max(0, Math.min(1, ((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.len2));
        const px = s.a.x + s.dx * t;
        const pz = s.a.z + s.dz * t;
        const rr = path.half + margin;
        if ((x - px) ** 2 + (z - pz) ** 2 < rr * rr) return true;
      }
    }
    return false;
  };
  const inPond = (x, z, margin) =>
    layout.ponds.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + margin) ** 2);
  const onLandmark = (x, z, margin) =>
    layout.landmarkPads.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.padR * 0.5 + margin) ** 2);

  function findPlacement(x, z, margin, radius) {
    const busy = (px, pz) => inRoad(px, pz, margin) || inPond(px, pz, margin + 0.4) || onLandmark(px, pz, margin);
    if (!busy(x, z)) return { x, z, moved: false };
    for (const r of [radius + 0.6, radius + 1.4, radius + 2.4, radius + 3.6]) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + r;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (!busy(px, pz)) return { x: px, z: pz, moved: true };
      }
    }
    return { x, z, moved: false };
  }

  const place = (builder, list, opts = {}) => {
    for (const item of list ?? []) {
      const spot = findPlacement(item.x, item.z, opts.clearance ?? 0.7, opts.radius ?? 1.2);
      const obj = builder();
      const x = spot.x;
      const z = spot.z;
      const y = layout.heightAt(x, z) - (opts.sink ?? 0.1);
      if (spot.moved) stats.nudged = (stats.nudged ?? 0) + 1;
      if (obj.group) {
        obj.group.position.set(x, y, z);
        obj.group.rotation.y = item.rot ?? 0;
        group.add(obj.group);
        if (obj.light) nightLights.push(obj.light);
      } else {
        obj.position.set(x, y, z);
        obj.rotation.y = item.rot ?? 0;
        group.add(obj);
      }
      if (opts.blockerRadius) blockers.push({ x, z, r: opts.blockerRadius, h: y + (opts.blockerHeight ?? 2.2) });
      stats.props++;
    }
  };

  const P = cfg.props ?? {};
  place(assets.makeWell, P.well, { blockerRadius: 1.5, blockerHeight: 3.4, radius: 1.6 });
  place(assets.makeMillstone, P.millstone, { blockerRadius: 1.2, radius: 1.2 });
  place(() => assets.makeHaystack(rand), P.haystacks, { blockerRadius: 1.3, radius: 1.3 });
  place(() => assets.makePumpkin(rand), P.pumpkins, { sink: 0.04 });
  place(assets.makeBarrel, P.barrels, { blockerRadius: 0.55, radius: 0.7 });
  place(assets.makeStoneBench, P.benches, { blockerRadius: 1.0, radius: 1.1 });
  place(assets.makeLanternPost, P.lanternPosts, { blockerRadius: 0.3, blockerHeight: 3.4, radius: 0.8 });
  place(assets.makeClothesline, P.clotheslines, { radius: 2.3 });
  place(assets.makeMailbox, P.mailboxes, { blockerRadius: 0.35, radius: 0.6 });
  place(assets.makeNetRack, P.netRacks, { blockerRadius: 1.6, blockerHeight: 2.6, radius: 2.1 });
  place(() => assets.makeDryingRack(rand), P.dryingRacks, { blockerRadius: 1.1, radius: 1.6 });
  place(assets.makeWaterJar, P.waterJars, { blockerRadius: 0.55, radius: 0.8 });
  place(() => assets.makeBasket(rand), P.baskets, { blockerRadius: 0.4, radius: 0.7 });

  // 池塘四周点缀石头
  for (const pond of layout.ponds) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rand() * 0.5;
      const rr = pond.r * (0.92 + rand() * 0.3);
      const x = pond.x + Math.cos(a) * rr;
      const z = pond.z + Math.sin(a) * rr;
      const rock = assets.makeRock(rand);
      rock.position.set(x, layout.heightAt(x, z) - 0.12, z);
      group.add(rock);
    }
  }

  scene.add(group);
  return { group, blockers, nightLights, stats };
}
