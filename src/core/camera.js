import * as THREE from 'three';
import { clamp } from './rng.js';

// 第三人称斜俯视跟随相机（俯角约 40°），另外提供 3 个固定观察视角
export function createCameraRig(camera, cfg, input) {
  const state = {
    mode: 'follow',
    yaw: Math.PI * 0.92,
    pitch: THREE.MathUtils.degToRad(cfg.pitchDeg ?? 40),
    distance: cfg.distance ?? 13.5,
    currentDist: cfg.distance ?? 13.5,
    focus: new THREE.Vector3(),
    initialized: false,
    orbitTime: 0
  };

  const minPitch = THREE.MathUtils.degToRad(cfg.minPitchDeg ?? -32);
  const maxPitch = THREE.MathUtils.degToRad(cfg.maxPitchDeg ?? 85);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const dirV = new THREE.Vector3();
  const focusTarget = new THREE.Vector3();
  let collider = null;
  let postAdjust = null;

  const modes = ['follow', 'top', 'ground', 'gallery'];
  const modeNames = { follow: '跟随', top: '全岛俯瞰', ground: '地面', gallery: '资产总览', free: '自由相机' };

  function handleInput(dt) {
    if (input.axis.locked) {
      const { dx, dy } = input.consumeMouse();
      state.yaw -= dx * (cfg.mouseSensitivity ?? 0.0028);
      state.pitch = clamp(state.pitch + dy * (cfg.mouseSensitivity ?? 0.0028), minPitch, maxPitch);
    } else {
      input.consumeMouse();
    }
    const wheel = input.consumeWheel();
    if (wheel) {
      state.distance = clamp(
        state.distance + wheel * 0.012,
        cfg.minDistance ?? 5,
        cfg.maxDistance ?? 30
      );
    }
  }

  function followStep(dt, targetPos) {
    // 抬头（俯仰角为负）时把注视点也抬高：相机才不会一头扎进地面，
    // 画面变成"下半是角色、上半是天空"，这才是抬头看天该有的样子。
    const lift = 1.05 + Math.min(3.2, Math.max(0, -state.pitch) * 3.2);
    if (!state.initialized) {
      state.focus.copy(targetPos);
      state.focus.y += lift;
      state.initialized = true;
    } else {
      const k = 1 - Math.exp(-(cfg.followLerp ?? 9) * dt);
      focusTarget.copy(targetPos);
      focusTarget.y += lift;
      state.focus.lerp(focusTarget, k);
    }

    // 视线方向的单位向量（从焦点指向相机）
    const cp = Math.cos(state.pitch);
    dirV.set(Math.sin(state.yaw) * cp, Math.sin(state.pitch), Math.cos(state.yaw) * cp).normalize();

    // 射线缩距：撞到地形/建筑就把相机沿视线拉近，而不是把高度顶起来
    // （高度硬顶会和"拉回目标位"打架，来回弹 → 就是之前那种抽动）
    let allowed = state.distance;
    if (collider) allowed = collider(state.focus, dirV, state.distance);
    // 收近：立即生效（宁可收得快，也不能让镜头钻进墙里）；
    // 放远：慢慢来，避免"贴着墙角走"时镜头一抽一抽地伸缩。
    // 之前那种"先抬高再拉回"的弹跳，是因为硬顶高度，现在已经不存在了。
    if (allowed < state.currentDist) state.currentDist = allowed;
    else state.currentDist += (allowed - state.currentDist) * (1 - Math.exp(-3.0 * dt));

    desired.copy(state.focus).addScaledVector(dirV, state.currentDist);
    // 直接落位：焦点和朝向本来就已经平滑了。
    // 这里若再做一次插值，转视角时相机会「慢半拍」，短暂钻进墙里。
    camera.position.copy(desired);
    // 最后一道保险：如果连最近距离都还在某个物件里，就**水平**推开一点点
    // （只推水平方向，不动高度 —— 动高度就会和"回到目标位"打架，那才是之前抽动的原因）
    if (postAdjust) postAdjust(camera.position);
    camera.lookAt(state.focus.x, state.focus.y + 0.1, state.focus.z);
  }

  const fixed = {
    top: { pos: new THREE.Vector3(0, 118, 96), look: new THREE.Vector3(0, 2, 0) },
    ground: { pos: new THREE.Vector3(-48, 6.2, 34), look: new THREE.Vector3(0, 8, -40) }
  };

  function fixedStep(dt, preset) {
    state.orbitTime += dt;
    if (preset === 'top') {
      const a = state.orbitTime * 0.055;
      const r = 132;
      camera.position.set(Math.sin(a) * r, 112, Math.cos(a) * r);
      camera.lookAt(0, 3, 0);
    } else {
      camera.position.lerp(fixed.ground.pos, 1 - Math.exp(-6 * dt));
      camera.lookAt(fixed.ground.look);
    }
  }

  function update(dt, targetPos) {
    handleInput(dt);
    if (state.mode === 'follow') {
      followStep(dt, targetPos);
    } else if (state.mode === 'gallery') {
      // gallery 视角由 main 单独控制位置
    } else {
      fixedStep(dt, state.mode);
    }
  }

  function setMode(mode) {
    state.mode = mode;
    state.orbitTime = 0;
  }

  function nextMode() {
    const i = modes.indexOf(state.mode);
    setMode(modes[(i + 1) % modes.length]);
    return state.mode;
  }

  function snapshot() {
    return {
      mode: state.mode,
      name: modeNames[state.mode],
      pos: camera.position.clone()
    };
  }

  return {
    state,
    update,
    setMode,
    nextMode,
    snapshot,
    modes,
    setCollider(fn) {
      collider = fn;
    },
    setPostAdjust(fn) {
      postAdjust = fn;
    },
    modeName: (m) => modeNames[m] ?? m,
    get mode() { return state.mode; },
    // 相机水平的 前进/右 方向（用于 WASD 移动）
    // 右手系：right = cross(forward, up) = (-forward.z, 0, forward.x)
    basis() {
      forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
      right.set(-forward.z, 0, forward.x);
      return { forward, right };
    }
  };
}
