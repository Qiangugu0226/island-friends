import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// 建筑与生活小景的摆放：农家小院 / 灯塔 / 栈桥 / 小船 / 菜地 / 各类道具
export function buildStructures(scene, layout, assets, palette) {
  const cfg = layout.cfg;
  const rand = mulberry32(cfg.seed ^ 0x1a2b3c4d);
  const group = new THREE.Group();
  group.name = 'structures';
  const blockers = [];
  const nightLights = [];
  const stats = { houses: 0, fences: 0, props: 0 };

  // ---------- 柴堆 ----------
  function makeWoodpile() {
    const g = new THREE.Group();
    const logGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 6);
    logGeo.rotateZ(Math.PI / 2);
    const logMat = assets.mat(palette.woodDark);
    const capMat = assets.mat(palette.trunk);
    for (let row = 0; row < 3; row++) {
      const count = 5 - row;
      for (let i = 0; i < count; i++) {
        const log = new THREE.Mesh(logGeo, row % 2 === 0 ? logMat : capMat);
        log.position.set((i - (count - 1) / 2) * 0.34, 0.18 + row * 0.32, (row % 2 ? 0.06 : -0.06));
        g.add(log);
      }
    }
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return g;
  }

  // ---------- 农家小院 ----------
  layout.pads.forEach((pad, index) => {
    const house = assets.makeFarmhouse(rand, pad);
    house.position.set(pad.x, pad.y, pad.z);
    group.add(house);
    blockers.push({ x: pad.x, z: pad.z, r: Math.max(pad.w, pad.d) * 0.62, h: pad.y + pad.wallH + pad.roofH + 0.6 });

    // 院墙栅栏（朝村子中心一侧留门）
    const fw = pad.w + 5.0;
    const fd = pad.d + 5.0;
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
      let diff = Math.abs(((localAngle - s.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = s;
      }
    }
    const fence = assets.makeYardFence(fw, fd, { gaps: [{ x: best.gap.x, z: best.gap.z, r: 2.6 }] });
    fence.position.set(pad.x, layout.heightAt(pad.x, pad.z), pad.z);
    fence.rotation.y = pad.rot ?? 0;
    group.add(fence);
    stats.fences++;

    // 柴堆 + 木桶
    const wx = pad.x + Math.cos((pad.rot ?? 0) + 1.9) * (pad.w * 0.75);
    const wz = pad.z + Math.sin((pad.rot ?? 0) + 1.9) * (pad.w * 0.75);
    const woodpile = makeWoodpile();
    woodpile.position.set(wx, layout.heightAt(wx, wz), wz);
    woodpile.rotation.y = -(pad.rot ?? 0);
    group.add(woodpile);
  });

  // ---------- 灯塔 ----------
  let lighthouseLight = null;
  if (cfg.lighthouse) {
    const lhCfg = cfg.lighthouse;
    const pad = layout.landmarkPads.find((p) => p.kind === 'lighthouse');
    const lh = assets.makeLighthouse(lhCfg);
    const y = pad ? pad.y : layout.heightAt(lhCfg.x, lhCfg.z);
    lh.group.position.set(lhCfg.x, y, lhCfg.z);
    lh.group.rotation.y = lhCfg.rot ?? 0;
    group.add(lh.group);
    lighthouseLight = lh.light;
    nightLights.push(lh.light);
    blockers.push({ x: lhCfg.x, z: lhCfg.z, r: 3.4, h: y + (lhCfg.height ?? 15) + 2 });

    // 灯塔外围一圈矮栏杆
    const rail = assets.makeYardFence(15, 15, { height: 0.8, gaps: [{ x: 0, z: 7.5, r: 2.4 }] });
    rail.position.set(lhCfg.x, y, lhCfg.z);
    group.add(rail);
  }

  // ---------- 栈桥 + 小船 ----------
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
    const px = dx * (r0 - 1.0);
    const pz = dz * (r0 - 1.0);
    const py = Math.max(layout.heightAt(px, pz), 0.55);
    const dock = assets.makeDock(cfg.dock);
    // 让 -Z 指向离岛方向
    dock.rotation.y = Math.atan2(-dx, -dz);
    dock.position.set(px, py, pz);
    group.add(dock);
    stats.props++;

    const bow = new THREE.Vector3(px, py, pz).addScaledVector(new THREE.Vector3(dx, 0, dz), cfg.dock.length - 2.0);
    bow.y = 0.18;
    const boat = assets.makeBoat();
    boat.position.copy(bow);
    boat.rotation.y = Math.atan2(-dx, -dz) + Math.PI / 2 + 0.12;
    group.add(boat);
  }

  // ---------- 菜地 ----------
  if (cfg.cropField) {
    const field = assets.makeCropField(rand, cfg.cropField);
    const pad = layout.landmarkPads.find((p) => p.kind === 'crop');
    field.position.set(cfg.cropField.x, (pad ? pad.y : layout.heightAt(cfg.cropField.x, cfg.cropField.z)) + 0.05, cfg.cropField.z);
    group.add(field);
  }

  // ---------- 生活道具 ----------
  const place = (builder, list, opts = {}) => {
    for (const item of list ?? []) {
      const obj = builder();
      const x = item.x;
      const z = item.z;
      const y = layout.heightAt(x, z) - (opts.sink ?? 0.12);
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
  place(assets.makeWell, P.well, { blockerRadius: 1.4 });
  place(assets.makeMillstone, P.millstone, { blockerRadius: 1.2 });
  place(() => assets.makeHaystack(rand), P.haystacks, { blockerRadius: 1.3 });
  place(() => assets.makePumpkin(rand), P.pumpkins, { sink: 0.05 });
  place(assets.makeBarrel, P.barrels, { blockerRadius: 0.55 });
  place(assets.makeBench, P.benches, { blockerRadius: 1.0 });
  place(assets.makeLamp, P.lamps, { blockerRadius: 0.3 });
  place(assets.makeClothesline, P.clotheslines, {});
  place(assets.makeMailbox, P.mailboxes, { blockerRadius: 0.35 });

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
