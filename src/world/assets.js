import * as THREE from 'three';
import { makeMatCache, gableRoofGeometry, shade } from '../core/materials.js';

// 全部资产都是代码生成的几何体：低多边形 + flatShading + 参考图色板
export function createAssets(palette) {
  const mat = makeMatCache();

  // ---------- 几何缓存（散布用 InstancedMesh，几何复用） ----------
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.24, 2.4, 6);
  trunkGeo.translate(0, 1.2, 0);

  const canopyRound = new THREE.IcosahedronGeometry(1.0, 0);
  const canopyFacet = new THREE.DodecahedronGeometry(1.0, 0);
  const canopyTall = new THREE.IcosahedronGeometry(1.0, 0);
  canopyTall.scale(0.85, 1.25, 0.85);

  const bushGeo = new THREE.IcosahedronGeometry(0.75, 0);
  const bushSmallGeo = new THREE.IcosahedronGeometry(0.5, 0);

  const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
  const stoneGeoS = new THREE.DodecahedronGeometry(0.32, 0);

  const stumpGeo = new THREE.CylinderGeometry(0.42, 0.5, 0.6, 7);
  stumpGeo.translate(0, 0.3, 0);
  const stumpTopGeo = new THREE.CircleGeometry(0.42, 7);
  stumpTopGeo.rotateX(-Math.PI / 2);
  stumpTopGeo.translate(0, 0.61, 0);

  const stemGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.42, 4);
  stemGeo.translate(0, 0.21, 0);
  const bloomGeo = new THREE.IcosahedronGeometry(0.14, 0);
  bloomGeo.translate(0, 0.46, 0);

  const tuftGeo = new THREE.ConeGeometry(0.16, 0.75, 4);
  tuftGeo.translate(0, 0.34, 0);

  // ---------- 树 ----------
  function makeTree(rand, opts = {}) {
    const g = new THREE.Group();
    const height = opts.height ?? 3.2 + rand() * 2.0;
    const trunk = new THREE.Mesh(trunkGeo, mat(palette.trunkDark));
    trunk.scale.set(1, height / 3.4, 1);
    g.add(trunk);

    const leafColor = opts.leaf ?? palette.leafColors[Math.floor(rand() * palette.leafColors.length)];
    const blobCount = 1 + (rand() < 0.55 ? 1 : 0) + (rand() < 0.25 ? 1 : 0);
    const baseY = height * 0.72;
    for (let i = 0; i < blobCount; i++) {
      const geo = rand() < 0.25 ? canopyFacet : rand() < 0.35 ? canopyTall : canopyRound;
      const blob = new THREE.Mesh(geo, mat(leafColor));
      const s = 0.85 + rand() * 0.6;
      blob.scale.set(s * (0.9 + rand() * 0.3), s * (0.85 + rand() * 0.35), s * (0.9 + rand() * 0.3));
      blob.position.set((rand() - 0.5) * 0.9, baseY + i * 0.55 + rand() * 0.25, (rand() - 0.5) * 0.9);
      blob.rotation.set(rand() * 0.6, rand() * Math.PI, rand() * 0.6);
      g.add(blob);
    }
    return shade(g);
  }

  function makeBush(rand, color) {
    const g = new THREE.Group();
    const c = color ?? palette.bushColor;
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(rand() < 0.5 ? bushGeo : bushSmallGeo, mat(c));
      const s = 0.7 + rand() * 0.6;
      b.scale.set(s, s * (0.6 + rand() * 0.3), s);
      b.position.set((rand() - 0.5) * 0.8, 0.32 * s, (rand() - 0.5) * 0.8);
      b.rotation.y = rand() * Math.PI;
      g.add(b);
    }
    return shade(g);
  }

  function makeRock(rand, small = false) {
    const geo = small ? stoneGeoS : rockGeo;
    const r = new THREE.Mesh(geo, mat(palette.rockColor));
    const s = small ? 0.6 + rand() * 0.8 : 0.7 + rand() * 1.4;
    r.scale.set(s * (0.9 + rand() * 0.5), s * (0.6 + rand() * 0.6), s * (0.9 + rand() * 0.5));
    r.rotation.set(rand() * 0.5, rand() * Math.PI, rand() * 0.5);
    r.position.y = s * 0.3;
    return shade(r);
  }

  function makeFlower(rand) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(stemGeo, mat(palette.grassDark));
    const bloom = new THREE.Mesh(bloomGeo, mat(palette.flowerColors[Math.floor(rand() * palette.flowerColors.length)]));
    g.add(stem, bloom);
    return g;
  }

  function makeStump(rand) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(stumpGeo, mat(palette.woodDark)));
    g.add(new THREE.Mesh(stumpTopGeo, mat(palette.trunk)));
    g.rotation.y = rand() * Math.PI;
    return shade(g);
  }

  function makeGrassTuft(rand) {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const t = new THREE.Mesh(tuftGeo, mat(rand() < 0.5 ? palette.grassDark : palette.grassLight));
      t.position.set((rand() - 0.5) * 0.35, 0, (rand() - 0.5) * 0.35);
      t.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
      t.scale.setScalar(0.7 + rand() * 0.8);
      g.add(t);
    }
    return g;
  }

  // ---------- 农家小院 ----------
  function makeFarmhouse(rand, cfg) {
    const g = new THREE.Group();
    const { w, d, wallH, roofH } = cfg;
    const roofColor = palette.roofColors[cfg.roof % palette.roofColors.length];

    const foundation = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), mat(palette.foundation));
    foundation.position.y = 0.25;
    g.add(foundation);

    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mat(rand() < 0.5 ? palette.wall : palette.wallAlt));
    walls.position.y = 0.5 + wallH / 2;
    g.add(walls);

    const roof = new THREE.Mesh(gableRoofGeometry(w, roofH, d, 0.45), mat(roofColor));
    roof.position.y = 0.5 + wallH;
    g.add(roof);

    // 门
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.95, 0.16), mat(palette.woodDark));
    door.position.set(0, 0.5 + 0.98, d / 2 + 0.02);
    g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(palette.trunkDark));
    knob.position.set(0.4, 0.5 + 1.0, d / 2 + 0.12);
    g.add(knob);

    // 窗户（每面 1-2 个）
    const winMat = mat('#FFF3CF');
    const frameMat = mat(palette.wood);
    const addWindow = (x, y, z, ry = 0) => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.14), winMat);
      win.position.set(x, y, z);
      win.rotation.y = ry;
      g.add(win);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.1), frameMat);
      frame.position.set(x, y, z);
      frame.rotation.y = ry;
      frame.position.add(new THREE.Vector3(Math.sin(ry) * 0.04, 0, Math.cos(ry) * 0.04));
      g.add(frame);
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.2, 0.2), frameMat);
      barV.position.set(x, y, z);
      barV.rotation.y = ry;
      g.add(barV);
    };
    addWindow(w / 2 + 0.02, 0.5 + wallH * 0.58, d * 0.18, Math.PI / 2);
    addWindow(-w / 2 - 0.02, 0.5 + wallH * 0.58, d * 0.18, Math.PI / 2);
    addWindow(w * 0.28, 0.5 + wallH * 0.58, d / 2 + 0.02, 0);

    // 烟囱
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.7, 0.75), mat(palette.foundation));
    chimney.position.set(-w * 0.28, 0.5 + wallH + roofH * 0.62, d * 0.1);
    g.add(chimney);
    const smokeCap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.95), mat(palette.cliff));
    smokeCap.position.set(-w * 0.28, 0.5 + wallH + roofH * 0.62 + 0.9, d * 0.1);
    g.add(smokeCap);

    g.rotation.y = cfg.rot ?? 0;
    return shade(g);
  }

  // 院子栅栏（矩形一圈）
  function makeYardFence(w, d, opts = {}) {
    const g = new THREE.Group();
    const postMat = mat(palette.fence);
    const railMat = mat(palette.wood);
    const h = opts.height ?? 1.0;
    const gaps = opts.gaps ?? [];
    const inGap = (x, z) => gaps.some((gp) => Math.hypot(x - gp.x, z - gp.z) < (gp.r ?? 2.0));

    const postGeo = new THREE.BoxGeometry(0.16, h, 0.16);
    const railGeoX = new THREE.BoxGeometry(1, 0.12, 0.1);
    const railGeoZ = new THREE.BoxGeometry(0.1, 0.12, 1);

    const step = 1.6;
    const nx = Math.max(2, Math.round(w / step));
    const nz = Math.max(2, Math.round(d / step));

    for (let i = 0; i <= nx; i++) {
      const x = -w / 2 + (i / nx) * w;
      for (const z of [-d / 2, d / 2]) {
        if (inGap(x, z)) continue;
        const p = new THREE.Mesh(postGeo, postMat);
        p.position.set(x, h / 2, z);
        g.add(p);
      }
      if (i < nx) {
        const seg = w / nx;
        for (const z of [-d / 2, d / 2]) {
          if (inGap(x + seg / 2, z) || inGap(x, z) || inGap(x + seg, z)) continue;
          for (const yy of [h * 0.45, h * 0.8]) {
            const r = new THREE.Mesh(railGeoX, railMat);
            r.scale.x = seg;
            r.position.set(x + seg / 2, yy, z);
            g.add(r);
          }
        }
      }
    }
    for (let j = 0; j <= nz; j++) {
      const z = -d / 2 + (j / nz) * d;
      for (const x of [-w / 2, w / 2]) {
        if (inGap(x, z)) continue;
        const p = new THREE.Mesh(postGeo, postMat);
        p.position.set(x, h / 2, z);
        g.add(p);
      }
      if (j < nz) {
        const seg = d / nz;
        for (const x of [-w / 2, w / 2]) {
          if (inGap(x, z + seg / 2) || inGap(x, z) || inGap(x, z + seg)) continue;
          for (const yy of [h * 0.45, h * 0.8]) {
            const r = new THREE.Mesh(railGeoZ, railMat);
            r.scale.z = seg;
            r.position.set(x, yy, z + seg / 2);
            g.add(r);
          }
        }
      }
    }
    return shade(g);
  }

  // ---------- 灯塔（地标） ----------
  function makeLighthouse(cfg) {
    const g = new THREE.Group();
    const H = cfg.height ?? 15;
    const bodyH = H - 4.2;
    const redMat = mat(palette.lighthouseRed);
    const whiteMat = mat(palette.lighthouseWhite);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.9, 1.6, 10), mat(palette.foundation));
    base.position.y = 0.8;
    g.add(base);

    // 白/红交替柱身
    const bands = 5;
    const bandH = bodyH / bands;
    for (let i = 0; i < bands; i++) {
      const rBottom = 1.85 - (i / bands) * 0.55;
      const rTop = 1.85 - ((i + 1) / bands) * 0.55;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBottom, bandH, 10, 1),
        i % 2 === 0 ? whiteMat : redMat
      );
      seg.position.y = 1.6 + bandH * (i + 0.5);
      g.add(seg);
    }

    const galleryY = 1.6 + bodyH;
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.8, 0.45, 10), mat(palette.cliff));
    gallery.position.y = galleryY + 0.2;
    g.add(gallery);

    // 栏杆
    const railCount = 10;
    for (let i = 0; i < railCount; i++) {
      const a = (i / railCount) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.1), whiteMat);
      post.position.set(Math.cos(a) * 1.85, galleryY + 0.8, Math.sin(a) * 1.85);
      g.add(post);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.07, 5, 14), whiteMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = galleryY + 1.15;
    g.add(ring);

    // 灯室
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 2.0, 8), mat('#FFE9A8', { emissive: new THREE.Color('#FFD98A'), emissiveIntensity: 0.35 }));
    lantern.position.y = galleryY + 1.5;
    g.add(lantern);

    const top = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.5, 8), redMat);
    top.position.y = galleryY + 3.25;
    g.add(top);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), mat(palette.woodDark));
    finial.position.y = galleryY + 4.1;
    g.add(finial);

    // 门
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.3), mat(palette.woodDark));
    door.position.set(0, 1.1, 2.3);
    g.add(door);

    const light = new THREE.PointLight(new THREE.Color('#FFD98A'), 0, 46, 1.6);
    light.position.y = galleryY + 1.5;
    g.add(light);

    return { group: shade(g), light };
  }

  // ---------- 栈桥 + 小船 ----------
  function makeDock(cfg) {
    const g = new THREE.Group();
    const L = cfg.length ?? 14;
    const W = cfg.width ?? 2.6;
    const plankMat = mat(palette.wood);
    const postMat = mat(palette.woodDark);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.22, L), plankMat);
    deck.position.set(0, 1.1, -L / 2);
    g.add(deck);

    for (let i = 0; i < Math.round(L / 2.2); i++) {
      const z = -1 - i * 2.2;
      for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.4, 6), postMat);
        post.position.set(x, -0.15, z);
        g.add(post);
      }
    }
    return shade(g);
  }

  function makeBoat() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.0, 3.6, 7, 1, false, 0, Math.PI), mat(palette.wood));
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = Math.PI / 2;
    hull.position.y = 0.45;
    hull.scale.set(1, 1, 0.55);
    g.add(hull);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.16, 1.15), mat(palette.woodDark));
    rim.position.y = 0.62;
    g.add(rim);
    for (const x of [-0.9, 0, 0.9]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 1.0), mat(palette.trunkDark));
      bench.position.set(x, 0.5, 0);
      g.add(bench);
    }
    return shade(g);
  }

  // ---------- 生活小景 ----------
  function makeWell() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 1.1, 10), mat(palette.foundation));
    ring.position.y = 0.55;
    g.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.95, 10), mat(palette.waterPond));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 1.05;
    g.add(water);
    for (const x of [-1.0, 1.0]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.16), mat(palette.woodDark));
      post.position.set(x, 1.1, 0);
      g.add(post);
    }
    const roof = new THREE.Mesh(gableRoofGeometry(2.9, 0.8, 2.0, 0.25), mat(palette.roofColors[1]));
    roof.position.y = 2.2;
    g.add(roof);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.42, 8), mat(palette.wood));
    bucket.position.set(0, 1.5, 0);
    g.add(bucket);
    return shade(g);
  }

  function makeMillstone() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.5, 10), mat(palette.rockColor));
    base.position.y = 0.25;
    g.add(base);
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.28, 10), mat(palette.cliff));
    stone.position.y = 0.62;
    stone.rotation.z = 0.12;
    g.add(stone);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 6), mat(palette.woodDark));
    hole.position.set(0.55, 0.72, 0);
    g.add(hole);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), mat(palette.wood));
    handle.position.set(1.3, 0.72, 0);
    g.add(handle);
    return shade(g);
  }

  function makeBarrel() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 9), mat(palette.wood));
    body.position.y = 0.48;
    g.add(body);
    for (const y of [0.15, 0.8]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.09, 9), mat(palette.woodDark));
      band.position.y = y;
      g.add(band);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 9), mat(palette.trunkDark));
    top.position.y = 0.97;
    g.add(top);
    return shade(g);
  }

  function makePumpkin(rand) {
    const g = new THREE.Group();
    const s = 0.35 + rand() * 0.18;
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat('#E8813A'));
    body.scale.set(1, 0.78, 1);
    body.position.y = s * 0.78;
    g.add(body);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 5), mat(palette.grassDark));
    stem.position.y = s * 1.55;
    g.add(stem);
    return shade(g);
  }

  function makeHaystack(rand) {
    const g = new THREE.Group();
    const r = 1.0 + rand() * 0.5;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, 1.7, 8), mat('#E8C46A'));
    body.position.y = 0.85;
    g.add(body);
    const top = new THREE.Mesh(new THREE.ConeGeometry(r * 0.62, 0.7, 8), mat('#D9B25A'));
    top.position.y = 2.0;
    g.add(top);
    return shade(g);
  }

  function makeBench() {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.6), mat(palette.wood));
    seat.position.y = 0.55;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.12), mat(palette.wood));
    back.position.set(0, 0.95, -0.26);
    g.add(back);
    for (const x of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.5), mat(palette.woodDark));
      leg.position.set(x, 0.28, 0);
      g.add(leg);
    }
    return shade(g);
  }

  function makeLamp() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.4, 6), mat(palette.woodDark));
    pole.position.y = 1.7;
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), mat(palette.woodDark));
    arm.position.set(0.32, 3.35, 0);
    g.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), mat('#FFE9A8', { emissive: new THREE.Color('#FFD98A'), emissiveIntensity: 0.3 }));
    head.position.set(0.6, 3.1, 0);
    g.add(head);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.26, 4), mat(palette.roofColors[2]));
    cap.position.set(0.6, 3.48, 0);
    cap.rotation.y = Math.PI / 4;
    g.add(cap);
    const light = new THREE.PointLight(new THREE.Color('#FFCF7A'), 0, 16, 1.8);
    light.position.set(0.6, 3.0, 0);
    g.add(light);
    return { group: shade(g), light };
  }

  function makeClothesline() {
    const g = new THREE.Group();
    for (const x of [-2.2, 2.2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.3, 5), mat(palette.woodDark));
      pole.position.set(x, 1.15, 0);
      g.add(pole);
    }
    const line = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.04, 0.04), mat(palette.trunkDark));
    line.position.y = 2.1;
    g.add(line);
    const colors = [palette.wall, palette.roofColors[0], palette.roofColors[2], palette.lighthouseWhite];
    for (let i = 0; i < 4; i++) {
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.06), mat(colors[i % colors.length]));
      cloth.position.set(-1.6 + i * 1.05, 1.72, 0);
      cloth.rotation.z = (i % 2 ? 1 : -1) * 0.03;
      g.add(cloth);
    }
    return shade(g);
  }

  function makeMailbox() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.2, 0.13), mat(palette.woodDark));
    pole.position.y = 0.6;
    g.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.75), mat(palette.roofColors[2]));
    box.position.y = 1.35;
    g.add(box);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.8), mat(palette.roofColors[0]));
    roof.position.y = 1.59;
    g.add(roof);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.18), mat(palette.lighthouseRed));
    flag.position.set(0.28, 1.55, -0.2);
    g.add(flag);
    return shade(g);
  }

  function makeCropField(rand, cfg) {
    const g = new THREE.Group();
    const soil = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, 0.35, cfg.d), mat(palette.soil));
    soil.position.y = 0.18;
    g.add(soil);
    const rows = cfg.rows ?? 6;
    const rowStep = cfg.d / rows;
    for (let r = 0; r < rows; r++) {
      const z = -cfg.d / 2 + rowStep * (r + 0.5);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(cfg.w - 1.0, 0.22, rowStep * 0.55), mat(palette.soil));
      ridge.position.set(0, 0.42, z);
      g.add(ridge);
      const n = Math.round((cfg.w - 1.5) / 1.1);
      for (let i = 0; i < n; i++) {
        const x = -(cfg.w - 1.5) / 2 + i * 1.1 + (rand() - 0.5) * 0.2;
        const plant = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 5), mat(palette.cropGreen));
        plant.position.set(x, 0.85, z + (rand() - 0.5) * 0.2);
        plant.rotation.y = rand() * Math.PI;
        g.add(plant);
      }
    }
    g.rotation.y = cfg.rot ?? 0;
    return shade(g);
  }

  return {
    mat,
    geos: { trunkGeo, canopyRound, canopyFacet, canopyTall, bushGeo, bushSmallGeo, rockGeo, stoneGeoS, stumpGeo, stumpTopGeo, stemGeo, bloomGeo, tuftGeo },
    makeTree,
    makeBush,
    makeRock,
    makeFlower,
    makeStump,
    makeGrassTuft,
    makeFarmhouse,
    makeYardFence,
    makeLighthouse,
    makeDock,
    makeBoat,
    makeWell,
    makeMillstone,
    makeBarrel,
    makePumpkin,
    makeHaystack,
    makeBench,
    makeLamp,
    makeClothesline,
    makeMailbox,
    makeCropField
  };
}
