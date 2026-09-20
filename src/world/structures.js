import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// 场景摆放：石厝村落 / 航标塔 / 土地庙 / 石阶码头 + 渔船 / 晒渔网 / 梯田 / 石板路 / 渔家小景
export function buildStructures(scene, layout, assets, palette) {
  const cfg = layout.cfg;
  const rand = mulberry32(cfg.seed ^ 0x1a2b3c4d);
  const group = new THREE.Group();
  group.name = 'structures';
  const blockers = [];
  const walls = [];      // 院墙这类"矩形环"碰撞
  const platforms = [];  // 能走上去的面（码头栈台）
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
        // 石板不许铺进房子/院子里（道路若靠得太近，这里会把石板掐掉，避免插进院墙）
        if (layout.insideCompound(x, z, 0.55)) continue;
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
    house.name = `石厝:${pad.id}`;
    house.userData.audit = { kind: 'compound', tag: pad.id };
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
    const yard = assets.makeStoneWallYard(fw, fd, {
      gaps: [{ x: best.gap.x, z: best.gap.z, r: 2.6 }],
      originX: pad.x,
      originZ: pad.z,
      rot: pad.rot ?? 0,
      groundAt: layout.heightAt
    });
    yard.name = `院墙:${pad.id}`;
    yard.userData.audit = { kind: 'decor' };
    yard.position.set(pad.x, 0, pad.z);
    yard.rotation.y = pad.rot ?? 0;
    group.add(yard);
    // 院墙的碰撞：矩形环 + 门洞（人能进院子，但穿不过墙）
    walls.push({
      x: pad.x,
      z: pad.z,
      rot: pad.rot ?? 0,
      halfW: fw / 2,
      halfD: fd / 2,
      thickness: 0.42,
      gaps: [{ x: best.gap.x, z: best.gap.z, r: 2.6 }]
    });
    stats.yards++;
  });

  // ---------- 航标塔（地标）----------
  if (cfg.beaconTower) {
    const bt = cfg.beaconTower;
    const pad = layout.landmarkPads.find((p) => p.kind === 'beacon');
    const tower = assets.makeBeaconTower(bt);
    tower.group.name = '航标塔';
    tower.group.userData.audit = { kind: 'landmark' };
    const y = pad ? pad.y : layout.heightAt(bt.x, bt.z);
    tower.group.position.set(bt.x, y, bt.z);
    tower.group.rotation.y = bt.rot ?? 0;
    group.add(tower.group);
    nightLights.push(tower.light);
    blockers.push({ x: bt.x, z: bt.z, r: 3.4, h: y + (bt.height ?? 14) + 2 });

    const rail = assets.makeStoneWallYard(15, 15, {
      height: 0.8,
      gaps: [{ x: 0, z: 7.5, r: 2.4 }],
      originX: bt.x,
      originZ: bt.z,
      rot: 0,
      groundAt: layout.heightAt
    });
    rail.name = '塔院围墙';
    rail.userData.audit = { kind: 'decor' };
    rail.position.set(bt.x, 0, bt.z);
    group.add(rail);
    walls.push({ x: bt.x, z: bt.z, rot: 0, halfW: 7.5, halfD: 7.5, thickness: 0.42, gaps: [{ x: 0, z: 7.5, r: 2.4 }] });
  }

  // ---------- 土地庙 + 庙前老榕树 ----------
  if (cfg.shrine) {
    const sh = cfg.shrine;
    const pad = layout.landmarkPads.find((p) => p.kind === 'shrine');
    const y = pad ? pad.y : layout.heightAt(sh.x, sh.z);
    const shrine = assets.makeShrine();
    shrine.group.name = '土地庙';
    shrine.group.userData.audit = { kind: 'landmark' };
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
      banyan.name = '庙前榕树';
      banyan.userData.audit = { kind: 'tree' };
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
    pier.name = '石阶码头';
    pier.userData.audit = { kind: 'landmark', tag: 'pier' };
    pier.rotation.y = Math.atan2(-dx, -dz);
    pier.position.set(px, py, pz);
    const deck = pier.userData.deckLocal ?? { cx: 0, cz: -6, halfW: 1.5, halfD: 5 };
    platforms.push({
      x: px,
      z: pz,
      rot: pier.rotation.y,
      cx: deck.cx,
      cz: deck.cz,
      halfW: deck.halfW,
      halfD: deck.halfD,
      topY: py + (pier.userData.deckTopY ?? 1.15)
    });
    group.add(pier);
    stats.props++;

    // 渔船停在栈台侧边，浮在水面上（y 固定在水线附近，不跟着栈台抬高）
    const [mlx, , mlz] = pier.userData.moorLocal ?? [2.6, 0.2, -6];
    const th = pier.rotation.y;
    const bx = px + mlx * Math.cos(th) + mlz * Math.sin(th);
    const bz = pz - mlx * Math.sin(th) + mlz * Math.cos(th);
    const boat = assets.makeFishingBoat(rand);
    boat.name = '渔船';
    boat.userData.audit = { kind: 'landmark', tag: 'pier' };
    boat.position.set(bx, 0.16, bz);
    boat.rotation.y = th + Math.PI / 2;
    group.add(boat);
  }

  // ---------- 梯田菜畦 ----------
  if (cfg.cropField) {
    const field = assets.makeTerraceField(rand, cfg.cropField);
    field.name = '梯田菜畦';
    field.userData.audit = { kind: 'landmark' };
    const pad = layout.landmarkPads.find((p) => p.kind === 'crop');
    field.position.set(
      cfg.cropField.x,
      (pad ? pad.y : layout.heightAt(cfg.cropField.x, cfg.cropField.z)) + 0.05,
      cfg.cropField.z
    );
    group.add(field);
  }

  // ---------- 渔家小景 ----------
  // 摆位规则（穿模的通用解法）：
  //   1) 不压石板路  2) 不压池塘  3) 不压地标（航标塔/土地庙/梯田）
  //   4) 不与任何已有物件重叠（房子、地标、先前摆下的道具都会被"占位"）
  // 落在禁区里就自动往旁边找一块空地。
  const occupied = blockers.map((b) => ({ x: b.x, z: b.z, r: b.r, name: b.name }));

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

  const onWall = (x, z, margin) =>
    walls.some((wl) => {
      const c = Math.cos(wl.rot ?? 0);
      const s = Math.sin(wl.rot ?? 0);
      const dx = x - wl.x;
      const dz = z - wl.z;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const ax = Math.abs(lx);
      const az = Math.abs(lz);
      const tt = (wl.thickness ?? 0.42) / 2 + margin;
      const onX = Math.abs(ax - wl.halfW) <= tt && az <= wl.halfD + tt;
      const onZ = Math.abs(az - wl.halfD) <= tt && ax <= wl.halfW + tt;
      if (!onX && !onZ) return false;
      const inGap = (wl.gaps ?? []).some((gp) => (lx - gp.x) ** 2 + (lz - gp.z) ** 2 < (gp.r ?? 2.4) ** 2);
      return !inGap;
    });

  function busy(px, pz, myR) {
    if (onWall(px, pz, myR + 0.25)) return true;
    if (inRoad(px, pz, Math.max(0.9, myR * 0.6))) return true;
    if (inPond(px, pz, myR * 0.5 + 0.5)) return true;
    if (onLandmark(px, pz, myR)) return true;
    for (const o of occupied) {
      if ((px - o.x) ** 2 + (pz - o.z) ** 2 < (o.r + myR + 0.6) ** 2) return true;
    }
    return false;
  }

  function findPlacement(x, z, radius) {
    if (!busy(x, z, radius)) return { x, z, moved: false };
    for (const r of [radius + 0.9, radius + 1.8, radius + 2.8, radius + 4.0, radius + 5.4, radius + 7.0, radius + 9.0, radius + 11.5]) {
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + r;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (!busy(px, pz, radius)) return { x: px, z: pz, moved: true };
      }
    }
    return { x, z, moved: false, failed: true };
  }

  const place = (builder, list, opts = {}) => {
    const myR = opts.radius ?? 1.0;
    for (const item of list ?? []) {
      const spot = findPlacement(item.x, item.z, myR);
      const obj = builder();
      const target = obj.group ?? obj;
      if (opts.name) target.name = opts.name;
      target.userData.audit = { kind: opts.kind ?? 'prop' };
      const x = spot.x;
      const z = spot.z;
      if (spot.moved) stats.nudged = (stats.nudged ?? 0) + 1;
      if (spot.failed) stats.placementFailed = (stats.placementFailed ?? 0) + 1;
      const y = layout.heightAt(x, z) - (opts.sink ?? 0.1);
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
      occupied.push({ x, z, r: myR, name: opts.name });
      if (opts.blockerRadius) blockers.push({ x, z, r: opts.blockerRadius, h: y + (opts.blockerHeight ?? 2.2) });
      // 立柱类道具（晾衣绳的两根杆子）单独加碰撞
      for (const [lx, lz] of opts.posts ?? []) {
        const c = Math.cos(item.rot ?? 0);
        const sn = Math.sin(item.rot ?? 0);
        blockers.push({
          x: x + lx * c + lz * sn,
          z: z - lx * sn + lz * c,
          r: opts.postRadius ?? 0.25,
          h: y + (opts.blockerHeight ?? 2.4)
        });
      }
      stats.props++;
    }
  };

  const P = cfg.props ?? {};
  place(assets.makeWell, P.well, { name: '水井', blockerRadius: 1.5, blockerHeight: 3.4, radius: 1.6 });
  place(assets.makeMillstone, P.millstone, { name: '石磨', blockerRadius: 1.2, radius: 1.6 });
  place(() => assets.makeHaystack(rand), P.haystacks, { name: '稻草堆', blockerRadius: 1.3, radius: 1.3 });
  place(() => assets.makePumpkin(rand), P.pumpkins, { name: '南瓜', sink: 0.04 });
  place(assets.makeBarrel, P.barrels, { name: '木桶', blockerRadius: 0.55, radius: 0.7 });
  place(assets.makeStoneBench, P.benches, { name: '石凳', blockerRadius: 1.0, radius: 1.1 });
  place(assets.makeLanternPost, P.lanternPosts, { name: '灯笼路灯', blockerRadius: 0.3, blockerHeight: 3.4, radius: 0.8 });
  place(assets.makeClothesline, P.clotheslines, { name: '晾衣绳', radius: 2.3, posts: [[-2.2, 0], [2.2, 0]], postRadius: 0.22 });
  place(assets.makeMailbox, P.mailboxes, { name: '信箱', blockerRadius: 0.35, radius: 0.6 });
  place(assets.makeNetRack, P.netRacks, { name: '晒渔网架', blockerRadius: 1.6, blockerHeight: 2.6, radius: 2.1 });
  place(() => assets.makeDryingRack(rand), P.dryingRacks, { name: '晒鱼干架', blockerRadius: 1.1, radius: 1.6 });
  place(assets.makeWaterJar, P.waterJars, { name: '水缸', blockerRadius: 0.55, radius: 0.8 });
  place(() => assets.makeBasket(rand), P.baskets, { name: '竹篓', blockerRadius: 0.4, radius: 0.7 });

  // 池塘四周点缀石头（同样遵守占位规则，别插进房子里）
  for (const pond of layout.ponds) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rand() * 0.5;
      const rr = pond.r * (0.92 + rand() * 0.3);
      const x = pond.x + Math.cos(a) * rr;
      const z = pond.z + Math.sin(a) * rr;
      if (busy(x, z, 0.7)) continue;
      const rock = assets.makeRock(rand);
      rock.name = '塘边石头';
      rock.userData.audit = { kind: 'rock' };
      rock.position.set(x, layout.heightAt(x, z) - 0.12, z);
      group.add(rock);
      occupied.push({ x, z, r: 0.7, name: '塘边石头' });
    }
  }

  scene.add(group);
  return { group, blockers, walls, platforms, nightLights, stats };
}
