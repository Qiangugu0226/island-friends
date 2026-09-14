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
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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

  // ---------- 世界 ----------
  hud.setLoading('正在塑造小岛地形…', 0.08);
  await nextFrame();

  const layout = buildLayout(cfg);
  const assets = createAssets(palette);
  const terrain = createTerrain(layout, palette);
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
  const sky = createSky(scene, cfg.dayPhases, palette);
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

  hud.setLoading('正在放置玩家…', 0.86);
  await nextFrame();
  const player = createPlayer(assets, palette, cfg.player, layout);
  if (params.has('x')) player.state.position.x = parseFloat(params.get('x'));
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

  hud.setLoading('正在布置资产总览展台…', 0.94);
  await nextFrame();
  const gallery = createGallery(scene, cfg.gallery, assets, palette, [
    { label: '玩家（你）', make: () => player.buildPreview() }
  ]);

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

  // 相机避让：不要穿进房子/灯塔，也不要钻到地面以下
  function resolveCamera(pos) {
    const minY = layout.heightAt(pos.x, pos.z) + 1.15;
    if (pos.y < minY) pos.y = minY;
    for (const b of blockers) {
      if (b.h !== undefined && pos.y > b.h) continue;
      const dx = pos.x - b.x;
      const dz = pos.z - b.z;
      const d = Math.hypot(dx, dz);
      const need = b.r + 1.0;
      if (d < need) {
        const k = d < 1e-4 ? 0 : (need - d) / d;
        pos.x += d < 1e-4 ? need : dx * k;
        pos.z += d < 1e-4 ? need : dz * k;
      }
    }
  }

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
      resolveCamera(camera.position);
      camera.lookAt(player.position.x, player.position.y + 0.6, player.position.z);
    }

    ocean.update(elapsed, hour, sky.fog.color, sky.fog.near, sky.fog.far);

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

    renderer.render(scene, camera);

    hud.update(dt, {
      clock: time.clockText(),
      phase: phase.phase,
      speedIndex: time.state.speedIndex,
      speed: time.speed,
      position: player.position,
      viewName: rig.modeName(rig.mode),
      objects: `${renderer.info.render.calls} draw / ${(renderer.info.render.triangles / 1000).toFixed(0)}k tri`,
      hour
    });

    input.endFrame();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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
