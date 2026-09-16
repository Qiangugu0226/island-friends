import * as THREE from 'three';
import { clamp } from '../core/rng.js';

// 低模大黄：躯干 / 头 / 耳朵 / 尾巴 / 四条腿，全部程序化。
// 姿态由 AI 给目标值，这里做平滑，动作就不会跳。
export function createDogModel(assets, cfg) {
  const mat = assets.mat;
  const furMat = mat(cfg.color);
  const darkMat = mat(cfg.darkColor);
  const bellyMat = mat(cfg.bellyColor ?? '#F0DCBB');
  const noseMat = mat('#3A2E26');
  const eyeMat = mat('#2A2118');

  const root = new THREE.Group();
  root.name = 'animal:dahuang';

  const body = new THREE.Group(); // 整体升降 / 前倾
  root.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.8), furMat);
  torso.position.set(0, 0.52, 0);
  body.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.26), bellyMat);
  chest.position.set(0, 0.5, 0.4);
  body.add(chest);

  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.24), furMat);
  hip.position.set(0, 0.52, -0.44);
  body.add(hip);

  // 头（独立 group，便于低头/抬头/转向）
  const head = new THREE.Group();
  head.position.set(0, 0.76, 0.46);
  body.add(head);

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.34), furMat);
  head.add(skull);
  const blaze = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.06), bellyMat);
  blaze.position.set(0, 0.04, 0.17);
  head.add(blaze);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.24), bellyMat);
  muzzle.position.set(0, -0.07, 0.26);
  head.add(muzzle);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.06), noseMat);
  nose.position.set(0, -0.03, 0.4);
  head.add(nose);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.04), eyeMat);
    eye.position.set(s * 0.1, 0.06, 0.18);
    head.add(eye);
  }

  // 耳朵（能立起来 / 贴下去）
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.16, 0.15, -0.02);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.15), darkMat);
    flap.position.y = -0.1;
    ear.add(flap);
    head.add(ear);
    ears.push(ear);
  }

  // 尾巴（能垂下 / 翘起 / 摆动）
  const tail = new THREE.Group();
  tail.position.set(0, 0.6, -0.56);
  body.add(tail);
  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.08, 0.44, 6), darkMat);
  tailMesh.position.y = 0.2;
  tail.add(tailMesh);
  const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), bellyMat);
  tailTip.position.y = 0.42;
  tail.add(tailTip);

  // 四条腿（pivot 在肩/胯）
  const legs = [];
  for (const [x, z] of [[-0.16, 0.28], [0.16, 0.28], [-0.16, -0.3], [0.16, -0.3]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.5, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.1), furMat);
    leg.position.y = -0.22;
    pivot.add(leg);
    const paw = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.17), darkMat);
    paw.position.set(0, -0.45, 0.02);
    pivot.add(paw);
    body.add(pivot);
    legs.push(pivot);
  }

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // 当前值（平滑用）
  const cur = {
    crouch: 0, earUp: 1, tailUp: 0.4, tailWag: 0, headPitch: 0, headYaw: 0, bob: 0, lean: 0
  };
  const tgt = { ...cur };

  function setPose(pose) {
    Object.assign(tgt, pose);
  }

  let animPhase = 0;

  function update(dt, opts = {}) {
    const moving = opts.speed ?? 0;
    const k = 1 - Math.exp(-8 * dt);
    for (const key of Object.keys(cur)) cur[key] += (tgt[key] - cur[key]) * k;

    // 走路/跑步的腿摆动
    animPhase += dt * (moving > 0.1 ? 9 + moving * 1.4 : 2.2);
    const swing = moving > 0.1 ? clamp(moving / 6, 0.25, 1.2) : 0;
    const s = Math.sin(animPhase * 2) * 0.75 * swing;
    legs[0].rotation.x = s;
    legs[3].rotation.x = s;
    legs[1].rotation.x = -s;
    legs[2].rotation.x = -s;
    if (swing < 0.02) {
      // 站着时呼吸起伏
      const br = Math.sin(animPhase * 0.9) * 0.012;
      legs.forEach((l) => (l.rotation.x = 0));
      body.position.y = br;
    } else {
      body.position.y = Math.abs(Math.sin(animPhase * 2)) * 0.03 * swing;
    }

    // 蹲伏：整体压低 + 前腿收
    const crouch = cur.crouch;
    body.position.y -= crouch * 0.26;
    legs[0].rotation.x += crouch * 0.5;
    legs[1].rotation.x += crouch * 0.5;
    legs[2].rotation.x -= crouch * 0.35;
    legs[3].rotation.x -= crouch * 0.35;

    // 头（抬头/低头 + 朝向玩家）
    head.rotation.x = cur.headPitch - crouch * 0.25;
    head.rotation.y += (cur.headYaw - head.rotation.y) * k;

    // 耳朵
    ears.forEach((e, i) => {
      const t = -0.25 + cur.earUp * 0.55;
      e.rotation.x = t;
      e.rotation.z = (i === 0 ? -1 : 1) * (0.12 + (1 - cur.earUp) * 0.35);
    });

    // 尾巴：翘起角度 + 摆动
    tail.rotation.x = -0.5 + cur.tailUp * 1.5;
    tail.rotation.z = Math.sin(animPhase * (1 + cur.tailWag * 8)) * 0.5 * cur.tailWag;

    // 整体前倾（逃跑时）
    body.rotation.x = cur.lean;
  }

  return { root, body, head, tail, legs, ears, setPose, update, get phase() { return animPhase; } };
}
