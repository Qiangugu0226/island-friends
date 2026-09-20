import * as THREE from 'three';
import { makeMatCache, gableRoofGeometry, shade, mergeParts, palmCrownGeometry } from '../core/materials.js';
import { withRepeat } from '../core/textures.js';

// 全部资产都是代码生成的几何体：低多边形 + flatShading + 程序化手绘贴图
// 造型体系 = 中国东南沿海渔村（石厝 / 燕尾脊 / 航标塔 / 土地庙 / 石阶码头 / 渔网 / 榕树芭蕉竹丛）
// 配色体系 = 参考图 Explore! Piggy Island 的暖奶油 + 青绿 + 黄绿（童话化处理）
// P5-1：贴图按「颜色 → 贴图」自动挂载（颜色继续负责染色，一张瓦垄贴图可同时给灰瓦/红瓦用）
export function createAssets(palette, textures) {
  const baseMat = makeMatCache();
  const T = textures ?? {};

  const stoneMain = T.stone ? withRepeat(T.stone, 3.4, 2.2) : null;
  const stoneFine = T.stone ? withRepeat(T.stone, 3.2, 1.2) : null;
  const woodMain = T.wood ? withRepeat(T.wood, 1.6, 1.6) : null;
  const woodCoarse = T.wood ? withRepeat(T.wood, 1.1, 1.1) : null;
  const texMap = {
    [palette.wallStone]: stoneMain,
    [palette.wallStoneAlt]: stoneMain,
    [palette.wallBrick]: T.brick ?? null,
    [palette.wallBrickDark]: T.brick ?? null,
    [palette.wallWhite]: T.plaster ?? null,
    [palette.roofTile]: T.roofTiles ?? null,
    [palette.roofTileDark]: T.roofTiles ?? null,
    [palette.roofRed]: T.roofTiles ?? null,
    [palette.wood]: woodMain,
    [palette.woodDark]: woodCoarse,
    [palette.timber]: woodMain,
    [palette.timberDark]: woodCoarse,
    [palette.stone]: stoneFine,
    [palette.stoneDark]: stoneFine,
    [palette.foundation]: stoneFine,
    '#E0BC63': T.thatch ?? null,
    '#CFA94F': T.thatch ?? null
  };

  const mat = (color, opts = {}) => {
    if (opts.noTex) {
      const rest = { ...opts };
      delete rest.noTex;
      return baseMat(color, rest);
    }
    if (opts.map) return baseMat(color, opts);
    const m = texMap[color];
    return m ? baseMat(color, { ...opts, map: m }) : baseMat(color, opts);
  };

  // ---------- 几何缓存 ----------
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

  // 榕树：粗干 + 宽冠 + 气根
  const banyanTrunkGeo = new THREE.CylinderGeometry(0.42, 0.66, 3.0, 7);
  banyanTrunkGeo.translate(0, 1.5, 0);
  const banyanCanopyGeo = new THREE.IcosahedronGeometry(1, 0);
  banyanCanopyGeo.scale(1.35, 0.72, 1.35);
  const banyanRootGeo = new THREE.CylinderGeometry(0.055, 0.075, 2.6, 4);
  banyanRootGeo.translate(0, -1.3, 0);

  // 芭蕉：茎 + 叶冠
  const bananaStemGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.0, 6);
  bananaStemGeo.translate(0, 1.0, 0);
  const bananaCrownGeo = palmCrownGeometry(7, 1.9, 0.7, 0.75, 0.5);

  // 竹丛：几根细竹 + 叶球，合并成一个几何
  const bambooClumpGeo = (() => {
    const parts = [];
    const stick = new THREE.CylinderGeometry(0.055, 0.07, 4.2, 5);
    stick.translate(0, 2.1, 0);
    const leaf = new THREE.IcosahedronGeometry(0.34, 0);
    leaf.scale(1.1, 0.5, 1.1);
    const offsets = [
      [0, 0], [0.32, 0.18], [-0.3, 0.22], [0.16, -0.32], [-0.2, -0.26], [0.42, -0.1]
    ];
    offsets.forEach(([x, z], i) => {
      const h = 0.82 + (i % 3) * 0.09;
      parts.push({ geo: stick, pos: [x, 0, z], rot: [0, 0, (i % 2 ? 1 : -1) * 0.045], scale: [1, h, 1] });
      parts.push({ geo: leaf, pos: [x + (i % 2 ? 0.1 : -0.1), 3.1 + h * 1.0, z], rot: [0, i * 0.7, 0] });
    });
    return mergeParts(parts);
  })();

  // 渔网格子（晒网架用）
  const netLatticeGeo = (() => {
    const parts = [];
    const barV = new THREE.BoxGeometry(0.05, 2.0, 0.05);
    const barH = new THREE.BoxGeometry(3.4, 0.05, 0.05);
    for (let i = 0; i < 6; i++) parts.push({ geo: barV, pos: [-1.6 + i * 0.64, 0, 0] });
    for (let i = 0; i < 4; i++) parts.push({ geo: barH, pos: [0, -0.75 + i * 0.5, 0] });
    return mergeParts(parts);
  })();

  const doubleSideMat = (color) => new THREE.MeshLambertMaterial({
    color: new THREE.Color(color),
    flatShading: true,
    side: THREE.DoubleSide
  });

  // ---------- 燕尾脊屋顶 ----------
  function swallowtailRoof(w, h, d, tileColor, ridgeColor, overhang = 0.5) {
    const g = new THREE.Group();
    const hw = w / 2 + overhang;
    g.add(new THREE.Mesh(gableRoofGeometry(w, h, d, overhang), mat(tileColor)));

    // 正脊（细一点，别像一条横梁）
    const ridgeT = 0.17;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.18, ridgeT, 0.24), mat(ridgeColor));
    ridge.position.y = h + 0.07;
    g.add(ridge);

    // 两端燕尾翘角：长度跟着屋宽走，小房子（土地庙）也不会变成两根长红杆
    const tipLen1 = 0.3 + Math.min(0.75, w * 0.085);
    const tipLen2 = 0.16 + Math.min(0.42, w * 0.05);
    for (const s of [-1, 1]) {
      const tip1 = new THREE.Mesh(new THREE.BoxGeometry(tipLen1, 0.22, 0.26), mat(ridgeColor));
      tip1.position.set(s * (hw + tipLen1 * 0.4), h + 0.14, 0);
      tip1.rotation.z = s * 0.52;
      g.add(tip1);
      const tip2 = new THREE.Mesh(new THREE.BoxGeometry(tipLen2, 0.18, 0.22), mat(ridgeColor));
      tip2.position.set(s * (hw + tipLen1 * 0.78 + tipLen2 * 0.4), h + 0.42, 0);
      tip2.rotation.z = s * 1.05;
      g.add(tip2);
    }

    // 脊饰
    const orn = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.26), mat(ridgeColor));
    orn.position.y = h + 0.2;
    g.add(orn);
    return g;
  }

  // ---------- 民居（石厝 / 白墙 / 红砖）----------
  function makeStoneHouse(rand, cfg) {
    const g = new THREE.Group();
    const w = cfg.w;
    const d = cfg.d;
    const wallH = cfg.wallH;
    const roofH = cfg.roofH;
    const style = cfg.style ?? 'stone';
    const wallColor = style === 'white' ? palette.wallWhite : style === 'brick' ? palette.wallBrick : palette.wallStone;
    const wallAlt = style === 'white' ? palette.wallWhite : style === 'brick' ? palette.wallBrickDark : palette.wallStoneAlt;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.55, d + 0.6), mat(palette.stoneDark));
    plinth.position.y = 0.28;
    g.add(plinth);

    const bands = 3;
    const bandH = wallH / bands;
    for (let i = 0; i < bands; i++) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(w + (i === 0 ? 0.16 : 0), bandH, d + (i === 0 ? 0.16 : 0)),
        mat(i % 2 === 0 ? wallColor : wallAlt)
      );
      band.position.y = 0.55 + bandH * (i + 0.5);
      g.add(band);
    }

    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.22, d + 0.9), mat(palette.timberDark));
    beam.position.y = 0.55 + wallH + 0.11;
    g.add(beam);

    const tile = cfg.roofTile ?? palette.roofTile;
    const ridgeColor = cfg.ridge ?? palette.lanternRed;
    const roof = swallowtailRoof(w, roofH, d, tile, ridgeColor, 0.62);
    roof.position.y = 0.55 + wallH + 0.2;
    g.add(roof);

    if (cfg.stove !== false) {
      const stove = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), mat(palette.stoneDark));
      stove.position.set(-w * 0.3, 0.55 + wallH + roofH * 0.55, d * 0.12);
      g.add(stove);
      const stoveCap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.7), mat(palette.roofTileDark));
      stoveCap.position.set(-w * 0.3, 0.55 + wallH + roofH * 0.55 + 0.55, d * 0.12);
      g.add(stoveCap);
    }

    const doorW = 1.2;
    const doorH = 2.0;
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.18), mat(palette.timberDark));
    door.position.set(0, 0.55 + doorH / 2, d / 2 + 0.04);
    g.add(door);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.5, 0.2, 0.26), mat(palette.timber));
    lintel.position.set(0, 0.55 + doorH + 0.12, d / 2 + 0.06);
    g.add(lintel);
    for (const s of [-1, 1]) {
      const couplet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.5, 0.06), mat(palette.lanternRed));
      couplet.position.set(s * (doorW / 2 + 0.28), 0.55 + 1.15, d / 2 + 0.12);
      g.add(couplet);
    }
    const step = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.9, 0.22, 0.7), mat(palette.stone));
    step.position.set(0, 0.16, d / 2 + 0.42);
    g.add(step);

    const addWindow = (x, y, z, ry) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.25, 0.16), mat(palette.timber));
      frame.position.set(x, y, z);
      frame.rotation.y = ry;
      g.add(frame);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.95, 0.1), mat('#3A3B33'));
      pane.position.set(x, y, z);
      pane.rotation.y = ry;
      g.add(pane);
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.0, 0.16), mat(palette.timber));
      barV.position.set(x, y, z);
      barV.rotation.y = ry;
      g.add(barV);
      const barH = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.16), mat(palette.timber));
      barH.position.set(x, y, z);
      barH.rotation.y = ry;
      g.add(barH);
    };
    addWindow(w / 2 + 0.06, 0.55 + wallH * 0.6, d * 0.16, Math.PI / 2);
    addWindow(-w / 2 - 0.06, 0.55 + wallH * 0.6, d * 0.16, Math.PI / 2);
    addWindow(w * 0.3, 0.55 + wallH * 0.6, d / 2 + 0.06, 0);

    g.rotation.y = cfg.rot ?? 0;
    void rand;
    return shade(g);
  }

  // ---------- 石砌矮院墙（留门洞）----------
  function makeStoneWallYard(w, d, opts = {}) {
    const g = new THREE.Group();
    const h = opts.height ?? 0.95;
    const t = 0.42;
    const gaps = opts.gaps ?? [];
    const inGap = (x, z) => gaps.some((gp) => Math.hypot(x - gp.x, z - gp.z) < (gp.r ?? 2.2));

    const segGeoX = new THREE.BoxGeometry(1, h, t);
    const segGeoZ = new THREE.BoxGeometry(t, h, 1);
    const capGeoX = new THREE.BoxGeometry(1, 0.12, t + 0.14);
    const capGeoZ = new THREE.BoxGeometry(t + 0.14, 0.12, 1);
    const wallMat = mat(opts.color ?? palette.wallStone);
    const capMat = mat(opts.capColor ?? palette.stoneDark);

    const build = (x, z, segLen, alongX) => {
      if (segLen <= 0.05) return;
      const seg = new THREE.Mesh(alongX ? segGeoX : segGeoZ, wallMat);
      seg.scale.set(alongX ? segLen : 1, 1, alongX ? 1 : segLen);
      seg.position.set(x, h / 2, z);
      g.add(seg);
      const cap = new THREE.Mesh(alongX ? capGeoX : capGeoZ, capMat);
      cap.scale.set(alongX ? segLen : 1, 1, alongX ? 1 : segLen);
      cap.position.set(x, h + 0.06, z);
      g.add(cap);
    };

    const step = 1.4;
    const nx = Math.max(2, Math.round(w / step));
    const nz = Math.max(2, Math.round(d / step));
    for (const z of [-d / 2, d / 2]) {
      const seg = w / nx;
      for (let i = 0; i < nx; i++) {
        const cx = -w / 2 + seg * (i + 0.5);
        if (inGap(cx, z)) continue;
        build(cx, z, seg * 0.98, true);
      }
    }
    for (const x of [-w / 2, w / 2]) {
      const seg = d / nz;
      for (let j = 0; j < nz; j++) {
        const cz = -d / 2 + seg * (j + 0.5);
        if (inGap(x, cz)) continue;
        build(x, cz, seg * 0.98, false);
      }
    }
    return shade(g);
  }

  // ---------- 航标塔（地标）----------
  function makeBeaconTower(cfg) {
    const g = new THREE.Group();
    const H = cfg.height ?? 13;
    const bodyH = H - 3.4;
    const whiteMat = mat(palette.lighthouseWhite);
    const redMat = mat(palette.lanternRed);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.9, 1.8, 10), mat(palette.stone));
    base.position.y = 0.9;
    g.add(base);
    const baseCap = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 0.25, 10), mat(palette.stoneDark));
    baseCap.position.y = 1.9;
    g.add(baseCap);

    const segments = 4;
    const segH = bodyH / segments;
    for (let i = 0; i < segments; i++) {
      const rBottom = 1.75 - (i / segments) * 0.5;
      const rTop = 1.75 - ((i + 1) / segments) * 0.5;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, segH, 10, 1), whiteMat);
      seg.position.y = 2.0 + segH * (i + 0.5);
      g.add(seg);
    }

    const galleryY = 2.0 + bodyH;
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.7, 0.4, 10), mat(palette.stoneDark));
    gallery.position.y = galleryY + 0.2;
    g.add(gallery);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), whiteMat);
      post.position.set(Math.cos(a) * 1.72, galleryY + 0.75, Math.sin(a) * 1.72);
      g.add(post);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.07, 5, 14), whiteMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = galleryY + 1.05;
    g.add(ring);

    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.25, 1.9, 8),
      mat('#FFE9A8', { emissive: new THREE.Color('#FFD98A'), emissiveIntensity: 0.35 })
    );
    lantern.position.y = galleryY + 1.45;
    g.add(lantern);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 8), redMat);
    top.position.y = galleryY + 3.1;
    g.add(top);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), mat(palette.gold));
    finial.position.y = galleryY + 3.95;
    g.add(finial);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.68, 0.5, 10), redMat);
    belt.position.y = 2.0 + bodyH * 0.52;
    g.add(belt);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.3), mat(palette.timberDark));
    door.position.set(0, 1.15, 2.2);
    g.add(door);

    const light = new THREE.PointLight(new THREE.Color('#FFD98A'), 0, 46, 1.6);
    light.position.y = galleryY + 1.45;
    g.add(light);

    return { group: shade(g), light };
  }

  // ---------- 土地庙 ----------
  function makeShrine() {
    const g = new THREE.Group();
    const w = 2.2;
    const d = 1.9;
    const h = 1.7;

    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, 0.35, d + 1.1), mat(palette.stoneDark));
    base.position.y = 0.17;
    g.add(base);

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(palette.wallWhite));
    body.position.y = 0.35 + h / 2;
    g.add(body);

    const roof = swallowtailRoof(w, 0.85, d, palette.roofRed, palette.lanternRed, 0.4);
    roof.position.y = 0.35 + h;
    g.add(roof);

    const opening = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.12), mat('#2E2A24'));
    opening.position.set(0, 0.35 + 0.7, d / 2 + 0.03);
    g.add(opening);

    const table = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.72, 0.72), mat(palette.timberDark));
    table.position.set(0, 0.36, d / 2 + 1.0);
    g.add(table);
    const censer = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.28, 8), mat(palette.gold));
    censer.position.set(0, 0.72 + 0.18, d / 2 + 1.0);
    g.add(censer);
    for (let i = 0; i < 3; i++) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 4), mat('#8A3B2A'));
      stick.position.set(-0.09 + i * 0.09, 0.72 + 0.55, d / 2 + 1.0);
      stick.rotation.z = (i - 1) * 0.14;
      g.add(stick);
    }

    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 8, 7),
        mat(palette.lanternRed, { emissive: new THREE.Color('#B8322A'), emissiveIntensity: 0.32 })
      );
      l.scale.set(1, 0.82, 1);
      l.position.set(s * 1.5, 0.35 + h + 0.55, d / 2 + 0.3);
      g.add(l);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 6), mat(palette.gold));
      cap.position.set(s * 1.5, 0.35 + h + 0.79, d / 2 + 0.3);
      g.add(cap);
      const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.22, 4), mat(palette.gold));
      tassel.position.set(s * 1.5, 0.35 + h + 0.28, d / 2 + 0.3);
      g.add(tassel);
    }

    const light = new THREE.PointLight(new THREE.Color('#FFB46B'), 0, 13, 1.8);
    light.position.set(0, 1.6, d / 2 + 0.9);
    g.add(light);

    return { group: shade(g), light };
  }

  // ---------- 石阶码头 ----------
  // 原点在岸上（水线附近），-Z 朝离岛方向。
  // 结构：岸上 3 级台阶 → 石砌栈台（顶面 y=1.15）→ 栈台末端 4 级台阶下到水里。
  function makeStonePier(cfg) {
    const g = new THREE.Group();
    const L = cfg.length ?? 14;
    const W = cfg.width ?? 3.0;
    const DECK_TOP = 1.15;
    const stepD = 0.7;

    // 岸上台阶（从沙滩上到栈台）
    for (let i = 0; i < 3; i++) {
      const y = 0.3 + i * 0.3;
      const step = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.3, stepD + 0.15), mat(i % 2 === 0 ? palette.stone : palette.stoneDark));
      step.position.set(0, y - 0.15, 1.5 - i * stepD);
      g.add(step);
    }

    const deckStart = 1.5 - 2 * stepD - stepD * 0.5;
    const outerSteps = 4;
    const deckEnd = -L + outerSteps * stepD + 1.0;
    const pierLen = Math.max(4, deckStart - deckEnd - 0.6);
    const deckCenterZ = deckStart - pierLen / 2;

    const deck = new THREE.Mesh(new THREE.BoxGeometry(W, DECK_TOP - 0.35, pierLen), mat(palette.stone));
    deck.position.set(0, (DECK_TOP - 0.35) / 2 + 0.1, deckCenterZ);
    g.add(deck);
    const deckTop = new THREE.Mesh(new THREE.BoxGeometry(W + 0.24, 0.12, pierLen + 0.1), mat(palette.stoneDark));
    deckTop.position.set(0, DECK_TOP + 0.06, deckCenterZ);
    g.add(deckTop);

    // 石砌墩
    for (let i = 0; i < Math.round(pierLen / 2.2); i++) {
      const z = deckStart - 1.2 - i * 2.2;
      for (const x of [-W / 2 + 0.35, W / 2 - 0.35]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), mat(palette.stoneDark));
        post.position.set(x, -0.3, z);
        g.add(post);
      }
    }

    // 末端下水的台阶
    for (let i = 0; i < outerSteps; i++) {
      const y = DECK_TOP - 0.35 - i * 0.32;
      const step = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.32, stepD), mat(i % 2 === 0 ? palette.stoneDark : palette.stone));
      step.position.set(0, y - 0.16, deckEnd - 0.2 - i * stepD);
      g.add(step);
    }

    // 系缆桩（栈台末端两侧）
    for (const x of [W / 2 - 0.3, -W / 2 + 0.3]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.75, 6), mat(palette.stoneDark));
      bollard.position.set(x, DECK_TOP + 0.45, deckEnd + 0.9);
      g.add(bollard);
    }

    // 给外面用：栈台顶面高度、可行走范围、靠船位置（本地坐标）
    g.userData.deckTopY = DECK_TOP;
    g.userData.deckLocal = { cx: 0, cz: deckCenterZ, halfW: W / 2, halfD: pierLen / 2 };
    g.userData.moorLocal = [W / 2 + 1.55, DECK_TOP - 0.95, deckCenterZ - pierLen * 0.22];
    return shade(g);
  }

  // ---------- 木渔船（竹篷 + 渔网 + 鱼篓）----------
  function makeFishingBoat(rand) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.15, 4.2, 8, 1, false, 0, Math.PI), mat(palette.timber));
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = Math.PI / 2;
    hull.position.y = 0.5;
    hull.scale.set(1, 1, 0.5);
    g.add(hull);

    const rim = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.18, 1.3), mat(palette.timberDark));
    rim.position.y = 0.72;
    g.add(rim);

    const canopy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 1.9, 8, 1, true, 0, Math.PI),
      mat(palette.bambooDark)
    );
    canopy.rotation.z = Math.PI / 2;
    canopy.position.set(-0.35, 1.0, 0);
    g.add(canopy);

    const oar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 2.6), mat(palette.timberDark));
    oar.position.set(1.2, 0.9, 0.4);
    oar.rotation.set(0.12, 0.5, 0);
    g.add(oar);

    const net = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), mat(palette.netColor));
    net.scale.set(1.2, 0.5, 0.9);
    net.position.set(1.3, 0.85, -0.35);
    g.add(net);

    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 8), mat(palette.bamboo));
    basket.position.set(0.4, 0.95, 0.35);
    g.add(basket);

    void rand;
    return shade(g);
  }

  // ---------- 晒渔网架 ----------
  function makeNetRack() {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), mat(palette.timberDark));
        leg.position.set(s * 1.7, 1.3, t * 0.42);
        leg.rotation.x = t * 0.16;
        g.add(leg);
      }
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.13, 0.13), mat(palette.timber));
    bar.position.y = 2.5;
    g.add(bar);
    const net = new THREE.Mesh(netLatticeGeo, doubleSideMat(palette.netColor));
    net.position.set(0, 1.35, 0);
    g.add(net);
    return shade(g);
  }

  // ---------- 晒鱼干架 ----------
  function makeDryingRack(rand) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), mat(palette.timberDark));
      post.position.set(s * 1.05, 0.95, 0);
      g.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 0.1), mat(palette.timber));
    bar.position.y = 1.8;
    g.add(bar);
    const fishMat = mat(palette.fishColor);
    for (let i = 0; i < 4; i++) {
      const x = -0.85 + i * 0.56;
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), fishMat);
      body.scale.set(0.55, 1.5, 0.4);
      body.position.set(x, 1.5, 0);
      g.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), fishMat);
      tail.position.set(x, 1.22, 0);
      tail.rotation.x = Math.PI;
      g.add(tail);
    }
    void rand;
    return shade(g);
  }

  // ---------- 水缸 / 竹篓 / 石凳 ----------
  function makeWaterJar() {
    const g = new THREE.Group();
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.36, 0.85, 10), mat(palette.clay));
    jar.position.y = 0.43;
    g.add(jar);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 10), mat(palette.clayDark));
    lip.position.y = 0.85;
    g.add(lip);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.4, 10), mat(palette.waterPond));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.83;
    g.add(water);
    return shade(g);
  }

  function makeBasket(rand) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.62, 8), mat(palette.bamboo));
    body.position.y = 0.31;
    g.add(body);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 4, 10), mat(palette.bambooDark));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.62;
    g.add(rim);
    if (rand() < 0.5) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 4, 8, Math.PI), mat(palette.bambooDark));
      handle.position.y = 0.62;
      g.add(handle);
    }
    return shade(g);
  }

  function makeStoneBench() {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.58), mat(palette.stone));
    seat.position.y = 0.52;
    g.add(seat);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.5), mat(palette.stoneDark));
      leg.position.set(s * 0.7, 0.25, 0);
      g.add(leg);
    }
    return shade(g);
  }

  // ---------- 灯笼路灯 ----------
  function makeLanternPost() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.2, 6), mat(palette.timberDark));
    pole.position.y = 1.6;
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.1), mat(palette.timberDark));
    arm.position.set(0.36, 3.15, 0);
    g.add(arm);
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 9, 8),
      mat(palette.lanternRed, { emissive: new THREE.Color('#C03A2E'), emissiveIntensity: 0.4 })
    );
    lantern.scale.set(1, 0.85, 1);
    lantern.position.set(0.72, 2.85, 0);
    g.add(lantern);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 6), mat(palette.gold));
    cap.position.set(0.72, 3.12, 0);
    g.add(cap);
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.26, 4), mat(palette.gold));
    tassel.position.set(0.72, 2.48, 0);
    g.add(tassel);

    const light = new THREE.PointLight(new THREE.Color('#FFC177'), 0, 16, 1.8);
    light.position.set(0.72, 2.8, 0);
    g.add(light);
    return { group: shade(g), light };
  }

  // ---------- 中式水井 ----------
  function makeWell() {
    const g = new THREE.Group();
    // 井圈：开口圆柱（用实心圆柱会把井口封死，看不到水面）
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.18, 1.0, 12, 1, true), mat(palette.stone));
    ring.position.y = 0.5;
    g.add(ring);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.94, 0.98, 1.0, 12, 1, true), mat(palette.stoneDark, { side: THREE.DoubleSide }));
    inner.position.y = 0.5;
    g.add(inner);
    // 井沿石圈
    const ringTop = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.1, 5, 16), mat(palette.stoneDark));
    ringTop.rotation.x = Math.PI / 2;
    ringTop.position.y = 1.0;
    g.add(ringTop);
    // 井底水面（压低一点，看着有深度）
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.92, 12), mat(palette.waterPond));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.34;
    g.add(water);

    // 木架：柱子从井沿（1.0）顶到棚底（2.5）
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), mat(palette.timberDark));
      post.position.set(s * 1.02, 1.7, 0); // 0.9 ~ 2.5
      g.add(post);
    }
    // 横梁 + 辘轳（两端插进立柱）
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.13, 0.13), mat(palette.timber));
    beam.position.set(0, 2.28, 0);
    g.add(beam);
    const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.0, 8), mat(palette.timber));
    winch.rotation.z = Math.PI / 2;
    winch.position.y = 2.28;
    g.add(winch);
    // 摇柄（接在辘轳一端）
    const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.09), mat(palette.timberDark));
    crankArm.position.set(1.12, 2.1, 0);
    g.add(crankArm);
    const crankGrip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.09), mat(palette.timberDark));
    crankGrip.position.set(1.12, 1.9, 0.14);
    g.add(crankGrip);
    // 吊绳：上接辘轳、下接木桶（不然木桶是"悬浮"的）
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 4), mat(palette.trunkDark, { noTex: true }));
    rope.position.set(0, 1.95, 0); // 1.56 ~ 2.34
    g.add(rope);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.4, 8), mat(palette.timber));
    bucket.position.set(0, 1.36, 0); // 1.16 ~ 1.56
    g.add(bucket);

    // 顶棚：底面正好压在立柱顶上
    const roof = new THREE.Mesh(gableRoofGeometry(2.5, 0.66, 1.8, 0.26), mat(palette.roofTile));
    roof.position.y = 2.5;
    g.add(roof);
    return shade(g);
  }

  // ---------- 石磨 / 木桶 / 南瓜 / 稻草堆 / 晾衣绳 / 信箱 ----------
  function makeMillstone() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.5, 10), mat(palette.stone));
    base.position.y = 0.25;
    g.add(base);
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.28, 10), mat(palette.stoneDark));
    stone.position.y = 0.62;
    stone.rotation.z = 0.1;
    g.add(stone);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 6), mat(palette.timberDark));
    hole.position.set(0.55, 0.72, 0);
    g.add(hole);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.11, 0.11), mat(palette.timber));
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
    const r = 0.95 + rand() * 0.45;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r, 1.7, 8), mat('#E0BC63'));
    body.position.y = 0.85;
    g.add(body);
    const top = new THREE.Mesh(new THREE.ConeGeometry(r * 0.64, 0.7, 8), mat('#CFA94F'));
    top.position.y = 2.0;
    g.add(top);
    return shade(g);
  }

  function makeClothesline() {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.3, 5), mat(palette.timberDark));
      pole.position.set(s * 2.2, 1.15, 0);
      g.add(pole);
    }
    const line = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.04, 0.04), mat(palette.timber));
    line.position.y = 2.1;
    g.add(line);
    const clothColors = [palette.indigo, palette.wallWhite, palette.indigoLight, palette.wallWhite];
    for (let i = 0; i < 4; i++) {
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.8, 0.05), mat(clothColors[i % clothColors.length]));
      cloth.position.set(-1.6 + i * 1.05, 1.68, 0);
      cloth.rotation.z = (i % 2 ? 1 : -1) * 0.035;
      g.add(cloth);
    }
    return shade(g);
  }

  function makeMailbox() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.2, 0.13), mat(palette.timberDark));
    pole.position.y = 0.6;
    g.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.44, 0.78), mat(palette.lanternRed));
    box.position.y = 1.38;
    g.add(box);
    const roof = new THREE.Mesh(gableRoofGeometry(0.62, 0.2, 0.86, 0.06), mat(palette.roofTileDark));
    roof.position.y = 1.62;
    g.add(roof);
    return shade(g);
  }

  // ---------- 梯田菜畦 ----------
  function makeTerraceField(rand, cfg) {
    const g = new THREE.Group();
    const levels = 3;
    const levelD = cfg.d / levels;
    for (let i = 0; i < levels; i++) {
      const z = -cfg.d / 2 + levelD * (i + 0.5);
      const y = 0.18 + i * 0.22;
      const soil = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, 0.24, levelD - 0.18), mat(palette.soil));
      soil.position.set(0, y, z);
      g.add(soil);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(cfg.w + 0.2, 0.5, 0.24), mat(palette.stoneDark));
      wall.position.set(0, 0.25 + i * 0.22, z + levelD / 2);
      g.add(wall);
      const rows = 3;
      const rowStep = (levelD - 0.5) / rows;
      for (let r = 0; r < rows; r++) {
        const rz = z - levelD / 2 + 0.35 + rowStep * (r + 0.5);
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(cfg.w - 0.8, 0.16, rowStep * 0.5), mat(palette.soilDark));
        ridge.position.set(0, y + 0.2, rz);
        g.add(ridge);
        const n = Math.round((cfg.w - 1.4) / 1.1);
        for (let k = 0; k < n; k++) {
          const x = -(cfg.w - 1.4) / 2 + k * 1.1 + (rand() - 0.5) * 0.2;
          const plant = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 5), mat(palette.cropGreen));
          plant.position.set(x, y + 0.6, rz + (rand() - 0.5) * 0.18);
          plant.rotation.y = rand() * Math.PI;
          g.add(plant);
        }
      }
    }
    g.rotation.y = cfg.rot ?? 0;
    return shade(g);
  }

  // ---------- 植被 ----------
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

  function makeBanyan(rand) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(banyanTrunkGeo, mat(palette.trunkDark)));

    const canopyMat = mat(palette.banyanLeaf);
    const blobs = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2;
      const r = i === 0 ? 0 : 1.1 + rand() * 0.7;
      const blob = new THREE.Mesh(banyanCanopyGeo, canopyMat);
      const s = 1.5 + rand() * 0.7;
      blob.scale.set(s, s * (0.75 + rand() * 0.2), s);
      blob.position.set(Math.cos(a) * r, 3.1 + (i === 0 ? 0.35 : 0), Math.sin(a) * r);
      blob.rotation.y = rand() * Math.PI;
      g.add(blob);
    }
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const r = 1.2 + rand() * 1.4;
      const root = new THREE.Mesh(banyanRootGeo, mat(palette.trunkDark));
      root.position.set(Math.cos(a) * r, 2.05, Math.sin(a) * r);
      g.add(root);
    }
    return shade(g);
  }

  function makeBanana(rand) {
    const g = new THREE.Group();
    const stems = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < stems; i++) {
      const a = (i / stems) * Math.PI * 2 + rand();
      const x = Math.cos(a) * 0.35;
      const z = Math.sin(a) * 0.35;
      const scale = 0.8 + rand() * 0.45;
      const stem = new THREE.Mesh(bananaStemGeo, mat(palette.bananaStem));
      stem.position.set(x, 0, z);
      stem.scale.set(1, scale, 1);
      g.add(stem);
      const crown = new THREE.Mesh(bananaCrownGeo, doubleSideMat(palette.bananaLeaf));
      crown.position.set(x, 2.0 * scale, z);
      crown.rotation.y = rand() * Math.PI;
      crown.scale.setScalar(scale * (0.9 + rand() * 0.3));
      g.add(crown);
    }
    return shade(g);
  }

  function makeBamboo(rand) {
    const g = new THREE.Group();
    const clump = new THREE.Mesh(bambooClumpGeo, mat(palette.bamboo));
    clump.rotation.y = rand() * Math.PI;
    clump.scale.setScalar(0.75 + rand() * 0.5);
    g.add(clump);
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

  return {
    mat,
    textures: T,
    geos: {
      trunkGeo,
      canopyRound,
      canopyFacet,
      canopyTall,
      bushGeo,
      bushSmallGeo,
      rockGeo,
      stoneGeoS,
      stumpGeo,
      stumpTopGeo,
      stemGeo,
      bloomGeo,
      tuftGeo,
      banyanTrunkGeo,
      banyanCanopyGeo,
      banyanRootGeo,
      bananaStemGeo,
      bananaCrownGeo,
      bambooClumpGeo,
      netLatticeGeo
    },
    makeTree,
    makeBanyan,
    makeBanana,
    makeBamboo,
    makeBush,
    makeRock,
    makeFlower,
    makeStump,
    makeGrassTuft,
    makeStoneHouse,
    makeStoneWallYard,
    makeBeaconTower,
    makeShrine,
    makeStonePier,
    makeFishingBoat,
    makeNetRack,
    makeDryingRack,
    makeWaterJar,
    makeBasket,
    makeStoneBench,
    makeLanternPost,
    makeWell,
    makeMillstone,
    makeBarrel,
    makePumpkin,
    makeHaystack,
    makeClothesline,
    makeMailbox,
    makeTerraceField
  };
}
