import * as THREE from 'three';
import worldConfig from './data/world.json';
import { buildLayout } from './world/layout.js';
import { createTerrain } from './world/terrain.js';
import { createOcean } from './world/ocean.js';
import { createAssets } from './world/assets.js';
import { scatterWorld } from './world/scatter.js';
import { buildStructures } from './world/structures.js';
import { createGallery } from './world/gallery.js';
import { createPlayer } from './entities/player.js';
import { createSky } from './core/sky.js';
import { createTime } from './core/time.js';
import { createInput } from './core/input.js';
import { createCameraRig } from './core/camera.js';
import { createHud } from './ui/hud.js';
import { createAudit } from './dev/audit.js';
import { createTextures } from './core/textures.js';
import { createCollision } from './systems/collision.js';
import { createContactShadows } from './core/contact-shadows.js';
import { createGrade } from './core/grade.js';
import { createBubbles } from './systems/bubbles.js';
import { createClues } from './systems/clues.js';
import { createAnimal } from './systems/animal-ai.js';
import { createAffection } from './systems/affection.js';
import { createAudio } from './systems/audio.js';
import animalsConfig from './data/animals.json';
import { clamp } from './core/rng.js';

const params = new URLSearchParams(location.search);
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

async function boot() {
  const cfg = worldConfig;
  const hud = createHud();
  if (params.get('hud') === '0') {
    document.querySelectorAll('.hud').forEach((n) => (n.style.display = 'none'));
    document.getElementById('hint')?.remove();
  }

  const palette = cfg.palette;

  // ---------- 渲染器 / 场景 / 相机 ----------
  // ?preserve=1：保留绘制缓冲，让自动化工具能 readPixels 逐像素核对画面（调试用，正常玩不需要）
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: params.get('preserve') === '1'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.skyHorizon);

  const camera = new THREE.PerspectiveCamera(
    cfg.camera.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    2400
  );

  const input = createInput(renderer.domElement);
  const rig = createCameraRig(camera, cfg.camera, input);
  // ?dist=5 可以把跟随相机拉近（给玩家/动物拍特写用）
  if (params.has('dist')) rig.state.distance = parseFloat(params.get('dist'));
  const time = createTime(cfg.time);
  if (params.has('hour')) time.setHour(parseFloat(params.get('hour')));

  // ---------- P5-2 色彩分级（后处理）----------
  // ?grade=0 可关掉做对照；world.json 里 grade 段是全部可调参数
  const grade = createGrade(renderer, scene, camera, cfg.grade ?? {});
  if (params.has('samples')) grade.setSamples(parseInt(params.get('samples'), 10));
  // URL 实时调参：?sat=1.2&contrast=1.1&vignette=0.3&warm=1.2&cool=0.8&exposure=1.05&lift=0.02
  for (const [key, uni] of [
    ['exposure', 'uExposure'],
    ['contrast', 'uContrast'],
    ['sat', 'uSaturation'],
    ['warm', 'uWarm'],
    ['cool', 'uCool'],
    ['vignette', 'uVignette'],
    ['lift', 'uLift']
  ]) {
    if (params.has(key)) grade.uniforms[uni].value = parseFloat(params.get(key));
  }
  grade.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
  let gradeOn = (cfg.grade?.enabled ?? true) && params.get('grade') !== '0';

  // ---------- 世界 ----------
  hud.setLoading('正在塑造小岛地形…', 0.08);
  await nextFrame();

  const layout = buildLayout(cfg);
  const textures = createTextures(palette, cfg.seed);
  const assets = createAssets(palette, textures);
  const terrain = createTerrain(layout, palette, textures);
  scene.add(terrain.mesh);
  const tBoot = performance.now();
  const mark = (label) => {
    if (params.has('probe') || params.has('timing')) {
      console.log(`BOOT ${label}: ${(performance.now() - tBoot).toFixed(0)}ms`);
    }
  };
  mark('terrain');

  if (params.has('probe')) {
    for (const [x, z] of [[-10, 6], [0, 0], [20, 15], [-16, 9], [-44, 30], [0, -47], [34, -14], [0, 40]]) {
      console.log(`PROBE x=${x} z=${z} h=${layout.heightAt(x, z).toFixed(2)} slope=${layout.slopeAt(x, z).toFixed(2)}`);
    }
    console.log(`PROBE island radius=${layout.island.radius} size=${layout.island.size} res=${layout.island.resolution}`);
    const geo = terrain.mesh.geometry;
    const colorAttr = geo.getAttribute('color');
    const posAttr = geo.getAttribute('position');
    const m = terrain.mesh.material;
    console.log(`PROBE vertexColors=${m.vertexColors} colorAttr=${!!colorAttr} count=${posAttr.count} colorCount=${colorAttr ? colorAttr.count : 'none'} materialColor=${m.color.getHexString()} flat=${m.flatShading}`);
    const mid = Math.floor(posAttr.count / 2);
    const c = new THREE.Color(colorAttr.getX(mid), colorAttr.getY(mid), colorAttr.getZ(mid));
    console.log(`PROBE midFaceColor=${c.getHexString()} atY=${posAttr.getY(mid).toFixed(2)} paletteGrassMid=${new THREE.Color(palette.grassMid).getHexString()} paletteSandLight=${new THREE.Color(palette.sandLight).getHexString()}`);
    // 定点取面：(-10, 6) 所在的格子
    const half = layout.island.size / 2;
    const stp = layout.island.size / layout.island.resolution;
    const gi = Math.round((-10 + half) / stp);
    const gj = Math.round((6 + half) / stp);
    const base = (gj * layout.island.resolution + gi) * 6;
    console.log(
      `PROBE cell i=${gi} j=${gj} idx=${base} y=${posAttr.getY(base).toFixed(2)} x=${posAttr.getX(base).toFixed(2)} z=${posAttr.getZ(base).toFixed(2)} ` +
      `color=${new THREE.Color(colorAttr.getX(base), colorAttr.getY(base), colorAttr.getZ(base)).getHexString()} ` +
      `beachTop=${layout.island.beachTop} grassStart=${layout.island.grassStart}`
    );
    const bs = geo.boundingSphere;
    let nanCount = 0;
    for (let k = 0; k < posAttr.array.length; k++) if (!Number.isFinite(posAttr.array[k])) nanCount++;
    console.log(
      `PROBE mesh visible=${terrain.mesh.visible} frustumCulled=${terrain.mesh.frustumCulled} bs=${bs ? `${bs.center.toArray().map((v) => v.toFixed(1)).join(',')}/r=${bs.radius.toFixed(1)}` : 'none'} ` +
      `invalidPositions=${nanCount} index=${!!geo.index} drawRange=${geo.drawRange.count}`
    );
    {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, -0.4), camera);
      const hits = ray.intersectObject(terrain.mesh, false);
      console.log(`PROBE terrainOnlyRay hits=${hits.length} ${hits[0] ? hits[0].distance.toFixed(2) : '-'}`);
    }
  }

  hud.setLoading('正在注入海水与浪花…', 0.32);
  await nextFrame();
  const ocean = createOcean(scene, layout, palette);
  const hide = (params.get('hide') ?? '').split(',').filter(Boolean);
  if (hide.includes('ocean')) {
    ocean.ocean.visible = false;
    ocean.foamCore.mesh.visible = false;
    ocean.foamHalo.mesh.visible = false;
  }
  if (hide.includes('ponds')) ocean.pondGroup.visible = false;
  // 光照整体倍率：world.json 的 dayPhases.lightScale 是默认值（见那里的说明），?light=2.6 可临时覆盖
  const lightScale = parseFloat(params.get('light') ?? cfg.dayPhases.lightScale ?? '1');
  const sky = createSky(scene, cfg.dayPhases, palette, Number.isFinite(lightScale) ? lightScale : 1);
  mark('ocean+sky');

  hud.setLoading('正在种树、灌木、石头与野花…', 0.5);
  await nextFrame();
  const scatter = scatterWorld(scene, layout, assets, palette);
  if (hide.includes('scatter')) scatter.group.visible = false;
  mark('scatter');

  hud.setLoading('正在盖房子、立航标塔、修码头…', 0.72);
  await nextFrame();
  const structures = buildStructures(scene, layout, assets, palette);
  mark('structures');
  if (hide.includes('structures')) structures.group.visible = false;
  if (hide.includes('terrain')) terrain.mesh.visible = false;
  const dbg = params.get('debug');
  if (dbg === 'flat') {
    terrain.mesh.material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  } else if (dbg === 'wire') {
    terrain.mesh.material = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, fog: false, depthTest: false });
    terrain.mesh.renderOrder = 20;
  }

  // ---------- 碰撞系统（必须在创建玩家之前建好，否则玩家拿不到）----------
  // 圆形：房子/道具/树/石头/树桩 · 院墙：矩形环 + 门洞 · 平台：码头栈台
  const collision = createCollision({ cell: 8 });
  for (const b of structures.blockers) collision.addCircle(b.x, b.z, b.r, { h: b.h });
  for (const c of scatter.colliders) collision.addCircle(c.x, c.z, c.r);
  for (const w of structures.walls) collision.walls.push(w);
  for (const p of structures.platforms) collision.platforms.push(p);
  cfg.player.collision = collision;
  console.log(
    `[collision] 圆形碰撞 ${collision.circles.length} 个 · 院墙 ${collision.walls.length} 段 · 平台 ${collision.platforms.length} 个`
  );

  // ---------- P5-2 接触阴影：把物件"压"在地上 ----------
  // 房子用整块矩形暗片（和院子轮廓一致），其余按碰撞半径给一张柔边圆片；
  // 院墙沿每一段铺一条窄暗带。全部合并进 1 个 InstancedMesh。
  const shadowBlobs = [];
  const blobOf = (x, z, sx, sz, rot = 0) => shadowBlobs.push({ x, z, y: layout.heightAt(x, z), sx, sz, rot });
  for (const b of structures.blockers) {
    if (b.kind === 'house') continue; // 房子单独用矩形
    const k = b.kind === 'tower' ? 1.45 : b.kind === 'building' ? 1.35 : b.kind === 'tree' ? 3.1 : b.kind === 'post' ? 2.2 : 2.3;
    blobOf(b.x, b.z, b.r * k * 2, b.r * k * 2);
  }
  for (const pad of layout.pads) blobOf(pad.x, pad.z, pad.w + 1.0, pad.d + 1.0, pad.rot ?? 0);
  for (const c of scatter.colliders) blobOf(c.x, c.z, c.r * 5.0, c.r * 5.0);
  for (const w of structures.walls) {
    const L = Math.hypot(w.bx - w.ax, w.bz - w.az);
    blobOf((w.ax + w.bx) / 2, (w.az + w.bz) / 2, L + 0.55, (w.thickness ?? 0.42) + 0.8, Math.atan2(-(w.bz - w.az), w.bx - w.ax));
  }
  const shadows = createContactShadows(shadowBlobs, cfg.contactShadows ?? {});
  const shadowsOn = params.get('shadows') !== '0';
  shadows.group.visible = shadowsOn;
  scene.add(shadows.group);
  console.log(`[contact] 接触阴影 ${shadows.count} 片（合并 1 个 draw call）${shadowsOn ? '' : ' · 已关闭'}`);

  hud.setLoading('正在放置玩家…', 0.86);
  await nextFrame();
  const player = createPlayer(assets, palette, cfg.player, layout);  if (params.has('x')) player.state.position.x = parseFloat(params.get('x'));
  if (params.has('z')) player.state.position.z = parseFloat(params.get('z'));
  player.teleport(player.state.position.x, player.state.position.z);
  scene.add(player.root);

  const spawnMarker = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFF3C4'), transparent: true, opacity: 0.5 })
  );
  spawnMarker.rotation.x = -Math.PI / 2;
  spawnMarker.position.set(cfg.player.spawn.x, layout.heightAt(cfg.player.spawn.x, cfg.player.spawn.z) + 0.06, cfg.player.spawn.z);
  scene.add(spawnMarker);

  // 会动的角色也带一张暗片（每帧跟着走）
  const playerBlob = shadows.makeBlob(1.5);

  hud.setLoading('正在布置资产总览展台…', 0.94);
  await nextFrame();
  const gallery = createGallery(scene, cfg.gallery, assets, palette, [
    { label: '玩家（你）', make: () => player.buildPreview() }
  ]);

  hud.setLoading('正在把大黄放到岛上…', 0.9);
  await nextFrame();

  // ---------- P2：动物 / 线索 / 交互系统 ----------
  const audio = createAudio();
  const bubbles = createBubbles(scene);
  const clues = createClues(scene, palette, assets);
  clues.attachLayout(layout);

  const dwarf = animalsConfig.animals[0];
  const animal = createAnimal({ scene, assets, palette, layout, cfg: dwarf, audio, bubbleMakers: bubbles });
  animal.reset();
  const dogBlob = shadows.makeBlob(1.1);

  const affection = createAffection({
    scene,
    layout,
    assets,
    palette,
    cfg: { foods: animalsConfig.foods, animals: animalsConfig.animals },
    bubbles,
    audio
  });

  // URL 调试：?dog=alert|flee|curious|hidden  ?aff=60  ?food=bone:3
  if (params.has('aff')) {
    const v = parseFloat(params.get('aff'));
    affection.state.affection[dwarf.id] = v;
    affection.state.observed[dwarf.id] = true;
  }
  if (params.has('food')) {
    const [id, n] = params.get('food').split(':');
    if (affection.state.inventory[id] !== undefined) affection.state.inventory[id] = Number(n ?? 1);
    affection.autoSelectFood();
  }
  if (params.has('dog')) {
    const mode = params.get('dog');
    if (mode === 'flee') {
      animal.state.mode = 'flee';
      animal.state.fleeTarget = animal.hideouts[(animal.state.hideoutIndex + 1) % animal.hideouts.length];
    } else if (mode === 'alert') {
      animal.state.mode = 'alert';
    } else if (mode === 'curious') {
      animal.state.mode = 'curious';
      affection.state.affection[dwarf.id] = Math.max(affection.state.affection[dwarf.id] ?? 0, 20);
    } else {
      animal.state.mode = 'hidden';
    }
  }

  // ---------- 视角 ----------
  const viewInfo = {
    follow: ['纯程序化生成 · 无外部美术资源', 'P1.5 地方化：东南沿海渔村（石厝 / 燕尾脊 / 航标塔 / 土地庙 / 石阶码头 / 渔网）'],
    top: ['全岛俯瞰', '用来检查岛屿轮廓、沙滩与浪花描边、村落与道路布局'],
    ground: ['地面视角', '靠近海边的低角度画面，检查海岸与航标塔剪影'],
    gallery: [`资产总览（${gallery.itemCount} 件）`, '每一件资产都是代码生成的，逐件看、不满意就改']
  };

  if (params.has('view')) rig.setMode(params.get('view'));
  hud.setViewHint(...(viewInfo[rig.mode] ?? viewInfo.follow));

  // 自由相机：?cam=x,y,z&look=x,y,z —— 我给资产拍特写 / 你排查画面都能用
  const freeCam = { active: false, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  if (params.has('cam')) {
    const [cx, cy, cz] = params.get('cam').split(',').map(Number);
    freeCam.pos.set(cx, cy, cz);
    freeCam.active = true;
    if (params.has('look')) {
      const [lx, ly, lz] = params.get('look').split(',').map(Number);
      freeCam.look.set(lx, ly, lz);
    } else {
      freeCam.look.set(cx, 2, cz - 10);
    }
    rig.setMode('free');
  }

  const blockers = structures.blockers;
  const focus = new THREE.Vector3();
  const galleryLook = gallery.cameraLook.clone();

  // ---------- 相机避让：沿视线采样，撞到东西就把相机拉近 ----------
  // 关键：只"缩距"，不"抬高度"。抬高度会和"回到目标位"打架 → 来回弹（抽动）。
  rig.setCollider((f, dir, maxDist) => {
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxDist;
      const px = f.x + dir.x * t;
      const py = f.y + dir.y * t;
      const pz = f.z + dir.z * t;
      let hit = py < layout.heightAt(px, pz) + 0.45;
      if (!hit) {
        const b = collision.hitCircle(px, pz, 0.45, py);
        if (b) hit = true;
      }
      if (hit) return Math.max(1.3, t - 0.5);
    }
    return maxDist;
  });

  // 兜底：收最近了还在物件里（比如玩家贴着晒鱼干架站），就水平推开一点
  rig.setPostAdjust((pos) => {
    const b = collision.hitCircle(pos.x, pos.z, 0.4, pos.y);
    if (!b) return;
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    const d = Math.hypot(dx, dz);
    const need = b.r + 0.4;
    if (d < 1e-4) {
      pos.x += need;
    } else {
      const k = (need - d) / d;
      pos.x += dx * k;
      pos.z += dz * k;
    }
  });

  // 夜晚灯光
  const lampFactor = (hour) => {
    const x = hour < 12 ? hour + 24 : hour;
    const start = 18.4;
    const end = 30.2;
    return clamp(Math.min((x - start) / 1.2, (end - x) / 1.2), 0, 1);
  };
  const lampLights = structures.nightLights;

  // ---------- 主循环 ----------
  let prev = performance.now();
  let elapsed = 0;
  let lastSpeedIndex = 1;
  let cardOpen = false;
  const p2dbg = {};

  function frame(now) {
    const dt = Math.min((now - prev) / 1000, 0.06);
    prev = now;
    elapsed += dt;

    time.advance(dt);

    const hour = time.hour;
    focus.copy(rig.mode === 'gallery' ? galleryLook : player.position);
    sky.update(hour, focus);
    const phase = sky.phase;

    player.update(dt, input, rig.basis(), blockers);
    rig.update(dt, player.position);

    if (rig.mode === 'gallery') {
      camera.position.lerp(gallery.cameraPos, 1 - Math.exp(-5 * dt));
      camera.lookAt(galleryLook);
    } else if (rig.mode === 'free') {
      camera.position.copy(freeCam.pos);
      camera.lookAt(freeCam.look);
    } else if (rig.mode === 'follow') {
      // 避让已经在 rig 里用「射线缩距」处理了，这里不再额外动相机
    }

    ocean.update(elapsed, hour, sky.fog.color, sky.fog.near, sky.fog.far);

    // ---------- P2：大黄 / 线索 / 交互 ----------
    animal.update(dt, elapsed, {
      playerPos: player.position,
      posture: player.state.posture,
      affection: affection.state.affection[dwarf.id] ?? 0
    });
    clues.update(dt, elapsed, {
      position: animal.position,
      tier: animal.state.tier,
      facing: animal.state.facing,
      hidden: animal.isHiding(),
      visibleToPlayer: animal.model.root.visible
    });
    bubbles.update(dt);
    affection.update(dt, player.position);

    const dogDist = animal.state.distance;
    const dogVisible = animal.model.root.visible;
    const observable = dogVisible && dogDist <= dwarf.trust.observeRange && animal.state.mode !== 'flee';
    const canFeed = dogVisible && dogDist <= 3.4 && animal.state.mode !== 'flee';
    p2dbg.observable = observable;
    p2dbg.canFeed = canFeed;
    p2dbg.dogDist = +dogDist.toFixed(2);
    p2dbg.dogVisible = dogVisible;
    p2dbg.dogMode = animal.state.mode;
    p2dbg.posture = player.state.posture;
    p2dbg.hasCrosshairEl = !!document.getElementById('crosshair');

    if (input.wasPressed('KeyE')) {
      if (cardOpen) {
        cardOpen = false;
        hud.hideObserveCard();
      } else if (observable) {
        cardOpen = true;
        affection.observe(dwarf.id);
      }
    }
    if (input.wasPressed('KeyF') && canFeed) {
      const res = affection.feed(dwarf.id);
      if (res.ok || res.reason === 'wrongFood') animal.onFeed(res.ok);
    }
    for (let i = 0; i < 4; i++) {
      if (input.wasPressed(`Digit${i + 1}`)) affection.selectFood(affection.foods[i].id);
    }
    if (cardOpen && !observable && dogDist > dwarf.trust.observeRange + 1.5) {
      cardOpen = false;
      hud.hideObserveCard();
    }

    hud.setCrosshair({ observable, canFeed });
    hud.updateAffection({
      visible: !!affection.state.observed[dwarf.id],
      name: dwarf.name,
      emoji: '🐶',
      level: affection.levelOf(dwarf.id),
      value: affection.state.affection[dwarf.id] ?? 0,
      max: dwarf.affection.max,
      tip: (affection.state.affection[dwarf.id] ?? 0) < 20 ? '蹲下（C）慢慢靠近，别吓到它' : (affection.state.affection[dwarf.id] ?? 0) < 60 ? '它不再跑了，可以投喂' : '它开始凑过来摇尾巴了'
    });
    hud.updateInventory(affection.inventoryList, affection.state.selected, affection.state.observed[dwarf.id]);
    hud.updateToasts(affection.state.toasts);
    if (cardOpen) {
      hud.updateObserveCard({
        name: dwarf.name,
        emoji: '🐶',
        species: `${dwarf.species} · ${dwarf.personality}`,
        state: animal.state.mode,
        stateText: {
          hidden: '躲藏中',
          alert: '警觉',
          flee: '吓跑了',
          curious: '看着你'
        }[animal.state.mode] ?? animal.state.mode,
        body: animal.state.mode === 'hidden'
          ? '它缩在草丛里，只露出一截尾巴尖，耳朵一动一动。'
          : animal.state.mode === 'alert'
            ? '它半撑起身子盯着你，没有跑，尾巴小心翼翼地摇着。'
            : animal.state.mode === 'flee'
              ? '它被吓跑了，正往远处的窝跑——走远一点它就会回来。'
              : '它认得你了，歪着头看你，尾巴摇得很欢。',
        quote: `「${dwarf.hint}」`,
        affection: affection.state.affection[dwarf.id] ?? 0,
        max: dwarf.affection.max,
        likeFood: affection.foodById[dwarf.likeFood]?.name ?? '-'
      });
    }

    const lf = lampFactor(hour);
    for (const light of lampLights) {
      const base = light.distance > 30 ? 110 : 5.5;
      light.intensity = base * lf;
    }

    // 快捷键
    if (input.wasPressed('KeyV')) {
      const mode = rig.nextMode();
      hud.setViewHint(...(viewInfo[mode] ?? viewInfo.follow));
    }
    if (input.wasPressed('KeyT')) {
      if (time.state.speedIndex === 0) time.setSpeedIndex(lastSpeedIndex);
      else {
        lastSpeedIndex = time.state.speedIndex;
        time.setSpeedIndex(0);
      }
    }
    if (input.wasPressed('BracketRight')) time.setSpeedIndex(time.state.speedIndex + 1);
    if (input.wasPressed('BracketLeft')) time.setSpeedIndex(time.state.speedIndex - 1);
    if (input.wasPressed('KeyR')) player.teleport(cfg.player.spawn.x, cfg.player.spawn.z);
    if (input.wasPressed('KeyH')) {
      document.querySelectorAll('.hud').forEach((n) => {
        n.style.display = n.style.display === 'none' ? '' : 'none';
      });
    }

    // 会动的角色：暗片跟着走（放在地上一点点）
    if (shadowsOn) {
      playerBlob.position.set(player.position.x, layout.heightAt(player.position.x, player.position.z) + 0.03, player.position.z);
      const dp = animal.state.position;
      dogBlob.visible = animal.state.mode !== 'hidden';
      dogBlob.position.set(dp.x, layout.heightAt(dp.x, dp.z) + 0.03, dp.z);
    }

    if (gradeOn) grade.render();
    else renderer.render(scene, camera);

    hud.update(dt, {
      clock: time.clockText(),
      phase: phase.phase,
      speedIndex: time.state.speedIndex,
      speed: time.speed,
      position: player.position,
      viewName: rig.modeName(rig.mode),
      objects: `${(gradeOn ? grade.stats.calls : renderer.info.render.calls)} draw / ${((gradeOn ? grade.stats.triangles : renderer.info.render.triangles) / 1000).toFixed(0)}k tri`,
      hour
    });

    input.endFrame();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    grade.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
  });

  // 自动化冒烟测试：?walk=1 会模拟按住 W 走 3 秒，并把位移打到控制台
  if (params.has('walk')) {
    const start = player.position.clone();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      const moved = start.distanceTo(player.position);
      console.log(
        `WALK start=(${start.x.toFixed(1)},${start.z.toFixed(1)}) end=(${player.position.x.toFixed(1)},${player.position.z.toFixed(1)}) ` +
        `moved=${moved.toFixed(2)}m groundY=${layout.heightAt(player.position.x, player.position.z).toFixed(2)}`
      );
    }, 3000);
  }

  renderer.domElement.addEventListener('click', () => {
    if (document.getElementById('hint')) document.getElementById('hint').style.display = 'none';
  });

  // 给自动化截图留的钩子
  window.__island = {
    setHour: (h) => time.setHour(h),
    setView: (v) => rig.setMode(v),
    teleport: (x, z) => player.teleport(x, z),
    pos: () => player.position.toArray(),
    basis: () => {
      const b = rig.basis();
      return { forward: b.forward.toArray(), right: b.right.toArray() };
    },
    info: () => renderer.info,
    // 分级开着时 renderer.info 会被最后那个全屏 pass 重置，所以另给一个"当前这一帧"的统计
    renderStats: () => ({
      calls: gradeOn ? grade.stats.calls : renderer.info.render.calls,
      triangles: gradeOn ? grade.stats.triangles : renderer.info.render.triangles,
      grade: gradeOn,
      shadows: shadowsOn ? shadows.count : 0
    }),
    setGrade: (on) => {
      gradeOn = !!on;
      return gradeOn;
    },
    gradeInfo: () => ({ enabled: gradeOn, ...Object.fromEntries(Object.entries(grade.uniforms).map(([k, v]) => [k, v.value])) }),
    THREE,
    scene,
    audit: () => createAudit({ structures, layout, cfg })(),
    // P2：给自动化测试用的钩子
    dog: () => ({
      mode: animal.state.mode,
      distance: +animal.state.distance.toFixed(2),
      tier: animal.state.tier,
      visible: animal.model.root.visible,
      hideout: animal.state.hideoutIndex,
      position: animal.position.toArray().map((v) => +v.toFixed(2)),
      hideouts: animal.hideouts.map((h) => ({ label: h.label, x: +h.x.toFixed(1), z: +h.z.toFixed(1) }))
    }),
    affection: () => ({
      value: affection.state.affection[dwarf.id] ?? 0,
      level: affection.levelOf(dwarf.id).name,
      observed: !!affection.state.observed[dwarf.id],
      inventory: { ...affection.state.inventory },
      selected: affection.state.selected,
      cooldown: +affection.state.feedCooldown.toFixed(2)
    }),
    posture: () => player.state.posture,
    feed: () => {
      const res = affection.feed(dwarf.id);
      if (res.ok || res.reason === 'wrongFood') animal.onFeed(res.ok);
      return res;
    },
    observe: () => {
      affection.observe(dwarf.id);
      return affection.state.observed[dwarf.id];
    },
    setAffection: (v) => {
      affection.state.affection[dwarf.id] = Math.max(0, Math.min(dwarf.affection.max, v));
      affection.state.observed[dwarf.id] = true;
    },
    jumpDog: (i) => animal.jumpToHideout(i),
    forceDogMode: (m) => {
      animal.state.mode = m;
    },
    uiState: () => ({
      card: hud.observeCardOpen,
      affectionVisible: !document.getElementById('affection')?.hidden,
      crosshairGold: document.getElementById('crosshair')?.classList.contains('gold') ?? false,
      prompt: document.getElementById('prompt')?.textContent ?? '',
      ...p2dbg
    }),
    giveFood: (id, n = 1) => {
      if (affection.state.inventory[id] === undefined) return false;
      affection.state.inventory[id] += n;
      affection.autoSelectFood();
      return true;
    },
    resetFeedCooldown: () => {
      affection.state.feedCooldown = 0;
    },
    setFreeCam: (pos, look) => {
      freeCam.pos.set(pos[0], pos[1], pos[2]);
      freeCam.look.set(look[0], look[1], look[2]);
      freeCam.active = true;
      rig.setMode('free');
    },
    setFollow: (dist) => {
      if (dist) rig.state.distance = dist;
      rig.setMode('follow');
    },
    setPitch: (deg) => {
      rig.state.pitch = (deg * Math.PI) / 180;
    },
    setYaw: (deg) => {
      rig.state.yaw = (deg * Math.PI) / 180;
    },
    cameraInfo: () => ({
      pos: camera.position.toArray().map((v) => +v.toFixed(2)),
      pitchDeg: +((rig.state.pitch * 180) / Math.PI).toFixed(1),
      yawDeg: +((rig.state.yaw * 180) / Math.PI).toFixed(1),
      dist: +camera.position.distanceTo(rig.state.focus).toFixed(2),
      mode: rig.mode
    }),
    pondInfo: () => layout.ponds.map((p) => ({ x: p.x, z: p.z, r: p.r, surfaceY: +p.surfaceY.toFixed(2), floorY: +p.floorY.toFixed(2) })),
    pickups: () =>
      affection.state.pickups
        .filter((p) => !p.taken)
        .map((p) => ({ food: p.food, x: +p.mesh.position.x.toFixed(1), z: +p.mesh.position.z.toFixed(1) })),
    groundAt: (x, z) => +layout.heightAt(x, z).toFixed(2),
    heightAtExact: (x, z) => layout.heightAt(x, z),
    // 世界坐标 → 屏幕像素（调试/自动出图用：把某个物件投到画面上看它在哪）
    screenOf: (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return [((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height, +v.z.toFixed(3)];
    },
    wallGates: () => (structures.gates ?? []).map((g) => ({ x: +g.x.toFixed(1), z: +g.z.toFixed(1), r: g.r, owner: g.owner ?? null })),
    // 石厝小院的朝向信息（门朝哪、院门在哪）——出图与核对用
    padsInfo: () =>
      layout.pads.map((p) => ({
        id: p.id,
        x: +p.x.toFixed(2),
        z: +p.z.toFixed(2),
        rot: +p.rot.toFixed(3),
        w: p.w,
        d: p.d,
        top: +(p.y + (p.wallH ?? 3.4) + (p.roofH ?? 2.6) + 1.2).toFixed(2),
        doorDir: [+Math.sin(p.rot).toFixed(3), +Math.cos(p.rot).toFixed(3)]
      })),
    collisionInfo: () => ({
      circles: collision.circles.length,
      walls: collision.walls.length,
      platforms: collision.platforms.length
    }),
    circlesNear: (x, z, r = 10) =>
      collision
        .nearby(x, z, r)
        .filter((b) => Math.hypot(b.x - x, b.z - z) <= r)
        .slice(0, 12)
        .map((b) => ({ x: +b.x.toFixed(1), z: +b.z.toFixed(1), r: +b.r.toFixed(2) })),
    wallsList: () =>
      collision.walls.map((w) => ({
        ax: +w.ax.toFixed(2),
        az: +w.az.toFixed(2),
        bx: +w.bx.toFixed(2),
        bz: +w.bz.toFixed(2),
        thickness: w.thickness,
        baseY: w.baseY === undefined ? null : +w.baseY.toFixed(3),
        baseY0: w.baseY0 === undefined ? null : +w.baseY0.toFixed(3),
        baseY1: w.baseY1 === undefined ? null : +w.baseY1.toFixed(3),
        height: w.height ?? null
      })),
    // 院墙形状体检：走向分布（方框=只有 2 个方向）+ 每段是否贴地
    wallStats: () => {
      const segs = collision.walls;
      const bins = new Array(18).fill(0);
      let maxFloat = 0;
      let worst = null;
      for (const s of segs) {
        const ang = ((Math.atan2(s.bz - s.az, s.bx - s.ax) * 180) / Math.PI + 180) % 180;
        bins[Math.floor(ang / 10) % 18] += 1;
        if (s.baseY !== null && s.baseY !== undefined) {
          for (const [px, pz] of [[s.ax, s.az], [s.bx, s.bz]]) {
            const g = layout.heightAt(px, pz);
            const gap = s.baseY - g; // >0 = 墙底高于地面 → 悬空
            if (gap > maxFloat) {
              maxFloat = gap;
              worst = [+px.toFixed(1), +pz.toFixed(1)];
            }
          }
        }
      }
      const occupied = bins.filter((b) => b > 0).length;
      const top = Math.max(...bins);
      return {
        segs: segs.length,
        dirBins: occupied,
        topBinShare: +(top / Math.max(1, segs.length)).toFixed(2),
        maxBottomGap: +maxFloat.toFixed(3),
        worstAt: worst
      };
    },
    // 院墙统计：按连通性把墙段聚成"圈"，方便判断有几座院子
    wallGroups: () => {
      const segs = collision.walls;
      const n = segs.length;
      const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.0;
      const seen = new Array(n).fill(false);
      let groups = 0;
      const sizes = [];
      for (let i = 0; i < n; i++) {
        if (seen[i]) continue;
        groups += 1;
        let count = 0;
        const stack = [i];
        seen[i] = true;
        while (stack.length) {
          const k = stack.pop();
          count += 1;
          const s = segs[k];
          for (let j = 0; j < n; j++) {
            if (seen[j]) continue;
            const t = segs[j];
            if (near([s.ax, s.az], [t.ax, t.az]) || near([s.ax, s.az], [t.bx, t.bz]) || near([s.bx, s.bz], [t.ax, t.az]) || near([s.bx, s.bz], [t.bx, t.bz])) {
              seen[j] = true;
              stack.push(j);
            }
          }
        }
        sizes.push(count);
      }
      return { groups, sizes: sizes.sort((a, b) => b - a) };
    },
    platformsList: () =>
      collision.platforms.map((p) => ({
        x: +p.x.toFixed(1),
        z: +p.z.toFixed(1),
        rot: +p.rot.toFixed(3),
        cx: p.cx,
        cz: p.cz,
        halfW: p.halfW,
        halfD: p.halfD,
        topY: +p.topY.toFixed(2)
      })),
    hitTest: (x, z) => {
      const w = collision.hitWall(x, z);
      const c = collision.hitCircle(x, z, 0.34, null);
      return {
        wall: !!w,
        circle: c ? { x: +c.x.toFixed(1), z: +c.z.toFixed(1), r: +c.r.toFixed(2) } : null,
        platform: collision.platformAt(x, z),
        ground: +collision.groundAt(x, z, layout.heightAt).toFixed(2)
      };
    },
    blockersNear: (x, z, r = 8) =>
      blockers
        .map((b) => ({ ...b, d: +Math.hypot(b.x - x, b.z - z).toFixed(2) }))
        .filter((b) => b.d < r + b.r)
        .sort((a, b) => a.d - b.d)
        .map((b) => ({ x: +b.x.toFixed(1), z: +b.z.toFixed(1), r: b.r, d: b.d })),
    canStandAt: (x, z) => {
      const h = layout.heightAt(x, z);
      const pondHit = layout.ponds.some((p) => {
        const d = Math.hypot(x - p.x, z - p.z);
        return d < p.r && p.surfaceY - h > 0.8;
      });
      const near = blockers.find((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < (b.r + 0.34) ** 2);
      return { canStand: h >= -0.55 && !pondHit && !near, h: +h.toFixed(2), pondHit, blockedBy: near ?? null };
    },
    ready: true
  };

  hud.setLoading('完成', 1);
  await nextFrame();
  hud.hideLoading();
  if (params.has('probe')) {
    const dump = (tag) => {
      console.log(
        `PROBE[${tag}] cam=${camera.position.toArray().map((v) => v.toFixed(2)).join(',')} ` +
        `player=${player.position.toArray().map((v) => v.toFixed(2)).join(',')} ` +
        `focus=${focus.toArray().map((v) => v.toFixed(2)).join(',')} ` +
        `dist=${camera.position.distanceTo(focus).toFixed(2)} mode=${rig.mode} ` +
        `groundH=${layout.heightAt(camera.position.x, camera.position.z).toFixed(2)}`
      );
    };
    setTimeout(() => dump('t1'), 800);
    setTimeout(() => dump('t2'), 2500);
    setTimeout(() => {
      const ray = new THREE.Raycaster();
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const pts = [[0, 0.2], [0, 0], [0, -0.4], [-0.4, -0.5], [0.4, -0.5]];
      for (const [nx, ny] of pts) {
        ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
        const hits = ray.intersectObjects(scene.children, true).filter((h) => h.object.visible);
        const first = hits[0];
        const sx = Math.round((nx * 0.5 + 0.5) * renderer.domElement.width);
        const sy = Math.round((ny * 0.5 + 0.5) * renderer.domElement.height);
        gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        console.log(
          `PICK ndc=${nx},${ny} pixel=#${px[0].toString(16).padStart(2, '0')}${px[1].toString(16).padStart(2, '0')}${px[2].toString(16).padStart(2, '0')} ` +
          `hit=${first ? `${first.object.name || first.object.type}@${first.distance.toFixed(1)}m` : 'none'} ` +
          `all=${hits.slice(0, 3).map((h) => `${h.object.name || h.object.type}@${h.distance.toFixed(1)}`).join(' > ')}`
        );
      }
    }, 3000);
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  const step = document.getElementById('loading-step');
  const where = (err.stack || '').split('\n').slice(1, 3).map((l) => l.trim()).join(' | ');
  if (step) step.textContent = `出错了：${err.message} @ ${where}`;
  if (step) step.style.maxWidth = '90vw';
});
