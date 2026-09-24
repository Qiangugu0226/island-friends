import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// 场景摆放：石厝村落 / 航标塔 / 土地庙 / 石阶码头 + 渔船 / 晒渔网 / 梯田 / 石板路 / 渔家小景
export function buildStructures(scene, layout, assets, palette) {
  const cfg = layout.cfg;
  const rand = mulberry32(cfg.seed ^ 0x1a2b3c4d);
  const group = new THREE.Group();
  group.name = 'structures';
  const blockers = [];
  const walls = [];      // 院墙碰撞：每段一条线段 {ax,az,bx,bz,thickness}
  const gates = [];      // 院墙/围栏上的缺口（门洞），供调试与自动测试判断"哪里本来就该能过"
  // 道具占位表（避免互相重叠）。放在最前面：石厝小院那边给信箱占位时就要用
  const occupied = [];
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

  // 自然曲线轮廓：两三个低频正弦叠加（每个点独立随机会变成锯齿多边形，像折纸不像石墙）
  // 另外：地面太陡的地方自动往里收一点——现实里砌墙也会绕开难砌的坡坎
  function organicRing(cx, cz, rx, rz, rot, N, opts = {}) {
    const amp = opts.amp ?? [0.11, 0.07, 0.04];
    const freq = opts.freq ?? [2, 3, 5];
    const phase = [rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2];
    const slopeLimit = opts.slopeLimit ?? 0.35;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let wob = 1;
      for (let k = 0; k < amp.length; k++) wob += Math.sin(a * freq[k] + phase[k]) * amp[k];
      let shrink = 1;
      let wx = cx;
      let wz = cz;
      for (let attempt = 0; attempt < 4; attempt++) {
        const lx = Math.cos(a) * rx * wob * shrink;
        const lz = Math.sin(a) * rz * wob * shrink;
        wx = cx + lx * cosR + lz * sinR;
        wz = cz - lx * sinR + lz * cosR;
        if (layout.slopeAt(wx, wz) <= slopeLimit) break;
        shrink -= 0.04;
      }
      pts.push([wx, wz]);
    }
    return pts;
  }

  // ---------- 石厝小院 ----------
  // 信箱不按 world.json 的坐标直接摆：它要"挂在院门旁边"。先把信箱按最近的院子分配掉，
  // 后面通用 prop 摆放就跳过它们（否则会被 findPlacement 挪到别处、还可能顶在门当中）。
  const P = cfg.props ?? {};
  const mailboxOf = new Map(); // padIndex → 配置项
  const mailboxFree = [];
  (P.mailboxes ?? []).forEach((item) => {
    let bi = -1;
    let bd = Infinity;
    layout.pads.forEach((pad, i) => {
      const d = Math.hypot(item.x - pad.x, item.z - pad.z);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    if (bi >= 0 && !mailboxOf.has(bi)) mailboxOf.set(bi, item);
    else mailboxFree.push(item);
  });

  layout.pads.forEach((pad, padIndex) => {
    // 门在屋子本地 +Z 面。让门**正对村子中心** —— 村道从村中心方向来，院门也开在这一侧，
    // 于是"村道 → 院门 → 房门"连成一条直线（以前房子的朝向是随便转的，三栋的门都背对院门）。
    const toCenter = new THREE.Vector2(-pad.x, -pad.z).normalize();
    pad.rot = Math.atan2(toCenter.x, toCenter.y);
    const doorDirX = Math.sin(pad.rot);
    const doorDirZ = Math.cos(pad.rot);
    const alongX = Math.cos(pad.rot); // 沿院墙方向（门的右手边）
    const alongZ = -Math.sin(pad.rot);

    const house = assets.makeStoneHouse(rand, pad);
    house.name = `石厝:${pad.id}`;
    house.userData.audit = { kind: 'compound', tag: pad.id };
    house.position.set(pad.x, pad.y, pad.z);
    group.add(house);
    blockers.push({
      x: pad.x,
      z: pad.z,
      r: Math.max(pad.w, pad.d) * 0.62,
      h: pad.y + pad.wallH + pad.roofH + 0.8,
      kind: 'house'
    });
    stats.houses++;

    // 院墙：规整四边形（4 个角 + 4 条边的中点，门只开在边的中点上）。
    // 注意角落用的是"同一个点"，所以不会像最早那样两条边各自铺满、在角上交叉穿模。
    const fw = pad.w + 5.4;
    const fd = pad.d + 5.4;
    const cosP = Math.cos(pad.rot);
    const sinP = Math.sin(pad.rot);
    const corner = [
      [-fw / 2, -fd / 2],
      [fw / 2, -fd / 2],
      [fw / 2, fd / 2],
      [-fw / 2, fd / 2]
    ];
    const outline = [];
    for (let i = 0; i < 4; i++) {
      const a = corner[i];
      const b = corner[(i + 1) % 4];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // 顺序：边中点 → 角 → 边中点 → 角……（偶数下标都是边中点，门只从这里挑）
      outline.push([pad.x + mid[0] * cosP + mid[1] * sinP, pad.z - mid[0] * sinP + mid[1] * cosP]);
      outline.push([pad.x + b[0] * cosP + b[1] * sinP, pad.z - b[0] * sinP + b[1] * cosP]);
    }
    // 缺口开在"房门正对的那条边"的中点上
    let gateIndex = 0;
    let bestDot = -Infinity;
    outline.forEach(([px, pz], i) => {
      if (i % 2 !== 0) return;
      const d = new THREE.Vector2(px - pad.x, pz - pad.z).normalize();
      const dot = d.x * doorDirX + d.y * doorDirZ;
      if (dot > bestDot) {
        bestDot = dot;
        gateIndex = i;
      }
    });
    const gate = { x: outline[gateIndex][0], z: outline[gateIndex][1], r: 2.6, owner: pad.id };
    gates.push(gate);
    // 暖色夯土墙 + 稻草压顶（温馨路线；石砌留给航标塔那圈围栏）
    const yard = assets.makeStoneWallPath(outline, {
      gaps: [gate],
      groundAt: layout.heightAt,
      color: '#E8C89C',
      capColor: '#E0BC63',
      step: 1.6,
      maxSegFactor: 2.0,
      thickness: 0.42
    });
    yard.name = `院墙:${pad.id}`;
    yard.userData.audit = { kind: 'decor' };
    group.add(yard);
    // 碰撞：逐段墙（每段一条线段），人能进院子但穿不过墙
    for (const seg of yard.userData.wallSegs ?? []) walls.push(seg);
    stats.yards++;

    // 信箱：立在院门旁边（沿墙让开门洞 → 不会顶在门当中；再往外挪一点 → 在墙外侧）
    const mailboxCfg = mailboxOf.get(padIndex);
    if (mailboxCfg) {
      const off = gate.r + 0.5;
      const mx = gate.x + alongX * off + doorDirX * 0.55;
      const mz = gate.z + alongZ * off + doorDirZ * 0.55;
      const box = assets.makeMailbox();
      box.name = '信箱';
      box.userData.audit = { kind: 'prop' };
      box.position.set(mx, layout.heightAt(mx, mz) - 0.06, mz);
      box.rotation.y = pad.rot; // 投信口朝着村道
      group.add(box);
      occupied.push({ x: mx, z: mz, r: 0.55, name: '信箱' });
      stats.props++;
    }
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
    blockers.push({ x: bt.x, z: bt.z, r: 3.4, h: y + (bt.height ?? 14) + 2, kind: 'tower' });

    // 塔院矮墙：同样用不规则曲线（朝路的 +z 侧留口）
    const railGate = { x: bt.x, z: bt.z + 7.6, r: 2.4, owner: 'beacon' };
    const railPts = organicRing(bt.x, bt.z, 7.5, 7.5, 0, 24, { amp: [0.08, 0.05, 0.03], slopeLimit: 0.5 });
    const rail = assets.makeStoneWallPath(railPts, {
      height: 0.8,
      gaps: [railGate],
      groundAt: layout.heightAt,
      step: 1.0,
      maxSegFactor: 1.4
    });
    gates.push(railGate);
    rail.name = '塔院围墙';
    rail.userData.audit = { kind: 'decor' };
    group.add(rail);
    for (const seg of rail.userData.wallSegs ?? []) walls.push(seg);
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
    blockers.push({ x: sh.x, z: sh.z, r: 2.2, h: y + 3.2, kind: 'building' });

    for (const [dx, dz] of [[-4.6, 3.2], [4.2, 4.0]]) {
      const bx = sh.x + dx;
      const bz = sh.z + dz;
      const by = layout.heightAt(bx, bz);
      const banyan = assets.makeBanyan(rand);
      banyan.name = '庙前榕树';
      banyan.userData.audit = { kind: 'tree' };
      banyan.position.set(bx, by, bz);
      group.add(banyan);
      blockers.push({ x: bx, z: bz, r: 1.1, h: by + 2.2, kind: 'tree' });
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
  // 房子/地标也是占位（这时候它们已经全部建好了）
  for (const b of blockers) occupied.push({ x: b.x, z: b.z, r: b.r, name: b.name });

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

  // 院墙现在是逐段线段：点到线段的距离 < 半墙厚+余量 就算压墙
  const onWall = (x, z, margin) =>
    walls.some((wl) => {
      const dx = wl.bx - wl.ax;
      const dz = wl.bz - wl.az;
      const len2 = dx * dx + dz * dz || 1e-6;
      let tt = ((x - wl.ax) * dx + (z - wl.az) * dz) / len2;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      const px = wl.ax + dx * tt;
      const pz = wl.az + dz * tt;
      return Math.hypot(x - px, z - pz) < (wl.thickness ?? 0.42) / 2 + margin;
    });

  function busy(px, pz, myR) {
    if (onWall(px, pz, myR + 0.25)) return true;
    if (inRoad(px, pz, Math.max(0.9, myR * 0.6))) return true;
    if (inPond(px, pz, myR * 0.5 + 0.5)) return true;
    if (onLandmark(px, pz, myR)) return true;
    // 房子本体是**旋转矩形**，不能用圆形近似：房子朝向现在跟着院门走，圆形包不住四个角
    for (const pd of layout.pads) {
      const dx = px - pd.x;
      const dz = pz - pd.z;
      const c = Math.cos(pd.rot ?? 0);
      const s = Math.sin(pd.rot ?? 0);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) < pd.w / 2 + myR * 0.5 + 0.35 && Math.abs(lz) < pd.d / 2 + myR * 0.5 + 0.35) return true;
    }
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
      if (opts.blockerRadius) blockers.push({ x, z, r: opts.blockerRadius, h: y + (opts.blockerHeight ?? 2.2), kind: 'prop' });
      // 立柱类道具（晾衣绳的两根杆子）单独加碰撞
      for (const [lx, lz] of opts.posts ?? []) {
        const c = Math.cos(item.rot ?? 0);
        const sn = Math.sin(item.rot ?? 0);
        blockers.push({
          x: x + lx * c + lz * sn,
          z: z - lx * sn + lz * c,
          r: opts.postRadius ?? 0.25,
          h: y + (opts.blockerHeight ?? 2.4),
          kind: 'post'
        });
      }
      stats.props++;
    }
  };

  place(assets.makeWell, P.well, { name: '水井', blockerRadius: 1.5, blockerHeight: 3.4, radius: 1.6 });
  place(assets.makeMillstone, P.millstone, { name: '石磨', blockerRadius: 1.2, radius: 1.6 });
  place(() => assets.makeHaystack(rand), P.haystacks, { name: '稻草堆', blockerRadius: 1.3, radius: 1.3 });
  place(() => assets.makePumpkin(rand), P.pumpkins, { name: '南瓜', sink: 0.04 });
  place(assets.makeBarrel, P.barrels, { name: '木桶', blockerRadius: 0.55, radius: 0.7 });
  place(assets.makeStoneBench, P.benches, { name: '石凳', blockerRadius: 1.0, radius: 1.1 });
  place(assets.makeLanternPost, P.lanternPosts, { name: '灯笼路灯', blockerRadius: 0.3, blockerHeight: 3.4, radius: 0.8 });
  place(assets.makeClothesline, P.clotheslines, { name: '晾衣绳', radius: 2.3, posts: [[-2.2, 0], [2.2, 0]], postRadius: 0.22 });
  // 信箱已经在各院子里"挂"到院门旁了，这里只处理没分到院子的（超出院子数量的那些）
  if (mailboxFree.length) place(assets.makeMailbox, mailboxFree, { name: '信箱', blockerRadius: 0.35, radius: 0.6 });
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
  return { group, blockers, walls, gates, platforms, nightLights, stats };
}
