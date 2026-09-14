import * as THREE from 'three';
import { clamp } from './rng.js';

// 第三人称斜俯视跟随相机（俯角约 40°），另外提供 3 个固定观察视角
export function createCameraRig(camera, cfg, input) {
  const state = {
    mode: 'follow',
    yaw: Math.PI * 0.92,
    pitch: THREE.MathUtils.degToRad(cfg.pitchDeg ?? 40),
    distance: cfg.distance ?? 13.5,
    focus: new THREE.Vector3(),
    initialized: false,
    orbitTime: 0
  };

  const minPitch = THREE.MathUtils.degToRad(cfg.minPitchDeg ?? 12);
  const maxPitch = THREE.MathUtils.degToRad(cfg.maxPitchDeg ?? 74);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const desired = new THREE.Vector3();

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
    if (!state.initialized) {
      state.focus.copy(targetPos);
      state.initialized = true;
    } else {
      const k = 1 - Math.exp(-(cfg.followLerp ?? 9) * dt);
      state.focus.lerp(targetPos, k);
    }
    const cp = Math.cos(state.pitch);
    desired.set(
      state.focus.x + Math.sin(state.yaw) * cp * state.distance,
      state.focus.y + Math.sin(state.pitch) * state.distance,
      state.focus.z + Math.cos(state.yaw) * cp * state.distance
    );
    camera.position.lerp(desired, 1 - Math.exp(-14 * dt));
    camera.lookAt(state.focus.x, state.focus.y + 0.6, state.focus.z);
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
