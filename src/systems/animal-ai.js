import * as THREE from 'three';
import { clamp } from '../core/rng.js';
import { createDogModel } from '../entities/animal.js';

// 动物 AI：躲藏 / 警觉 / 吓跑 / 好奇 四态 + 三层线索距离分档
// 设计稿要点：
//   · 正常走路靠近 → 吓跑（头顶 !），跑到最远的窝重新躲好，无任何惩罚
//   · 按 C 蹲行靠近 → 警觉（头顶 ?），8 秒后放松回窝
//   · 好感 ≥ 认识 → 不再跑，接受投喂，看着你
//   · 好感 ≥ 熟悉 → 会凑过来一点，尾巴摇得欢
export function createAnimal({ scene, assets, palette, layout, cfg, audio, bubbleMakers }) {
  const model = createDogModel(assets, cfg);
  model.root.visible = false;
  scene.add(model.root);

  // ---------- 躲藏点（非法位置自动挪到旁边空地） ----------
  function resolveSpot(h) {
    let x = h.x;
    let z = h.z;
    const bad = (px, pz) => layout.insideCompound(px, pz, 1.2) || !layout.isFree(px, pz, 0.8) || layout.heightAt(px, pz) < 0.4;
    if (bad(x, z)) {
      outer: for (const r of [1.5, 2.6, 4.0, 5.6, 7.5]) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2 + r;
          const px = h.x + Math.cos(a) * r;
          const pz = h.z + Math.sin(a) * r;
          if (!bad(px, pz)) {
            x = px;
            z = pz;
            break outer;
          }
        }
      }
    }
    return { ...h, x, z, y: layout.heightAt(x, z) };
  }

  const hideouts = cfg.hideouts.map(resolveSpot);
  const trust = cfg.trust;
  const speed = cfg.speed;

  // 每个躲藏点周围种一圈掩体草丛：躲进去时只露出耳朵和尾巴尖
  const coverGroup = new THREE.Group();
  coverGroup.name = 'animalCover';
  scene.add(coverGroup);
  const coverRng = (() => {
    let s = 1337;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  })();
  hideouts.forEach((h) => {
    const y = layout.heightAt(h.x, h.z);
    const count = 3 + Math.floor(coverRng() * 2);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + coverRng() * 0.7;
      const r = 0.62 + coverRng() * 0.5;
      const bx = h.x + Math.cos(a) * r;
      const bz = h.z + Math.sin(a) * r;
      const bush = assets.makeBush(coverRng);
      bush.position.set(bx, layout.heightAt(bx, bz) - 0.06, bz);
      bush.scale.setScalar(0.75 + coverRng() * 0.45);
      coverGroup.add(bush);
    }
  });

  const state = {
    mode: 'hidden',
    hideoutIndex: Math.min(cfg.startHideout ?? 0, hideouts.length - 1),
    position: new THREE.Vector3(),
    facing: 0,
    alertTimer: 0,
    fleeTarget: null,
    hideTimer: 0,
    happyTimer: 0,
    distance: 0,
    tier: 'none',
    barkCooldown: 0,
    posture: 'walk'
  };

  function teleportToHideout(i) {
    const h = hideouts[i];
    state.hideoutIndex = i;
    state.position.set(h.x, layout.heightAt(h.x, h.z), h.z);
    model.root.position.copy(state.position);
    model.root.visible = true;
  }
  teleportToHideout(state.hideoutIndex);

  // 面朝玩家
  function faceTowards(x, z, dt, rate = 4) {
    const target = Math.atan2(x - state.position.x, z - state.position.z);
    let diff = target - state.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.facing += diff * (1 - Math.exp(-rate * dt));
  }

  function moveTowards(x, z, dt, spd) {
    const dx = x - state.position.x;
    const dz = z - state.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(spd * dt, d);
    state.position.x += (dx / d) * step;
    state.position.z += (dz / d) * step;
    state.position.y = layout.heightAt(state.position.x, state.position.z);
    model.root.position.copy(state.position);
    faceTowards(x, z, dt, speed.turn);
    return d - step < 0.25;
  }

  // 选逃跑目标：优先离玩家远、但别跑到岛的另一头（fleeDistance 之外就不考虑）
  function farthestHideoutFrom(px, pz) {
    const ranked = hideouts
      .map((h, i) => ({ i, dPlayer: Math.hypot(h.x - px, h.z - pz), dSelf: Math.hypot(h.x - state.position.x, h.z - state.position.z) }))
      .filter((c) => c.i !== state.hideoutIndex)
      .sort((a, b) => b.dPlayer - a.dPlayer);
    if (!ranked.length) return state.hideoutIndex;
    const within = ranked.find((c) => c.dSelf <= (trust.fleeDistance ?? 24));
    if (within) return within.i;
    const byDistance = [...ranked].sort((a, b) => a.dSelf - b.dSelf);
    return byDistance[0].i;
  }

  function enterFlee(px, pz) {
    const target = farthestHideoutFrom(px, pz);
    state.fleeTarget = hideouts[target];
    state.hideoutIndex = target;
    state.mode = 'flee';
    state.alertTimer = 0;
    bubbleMakers?.exclaim(state.position);
  }

  function bark(balance) {
    audio?.bark(clamp(balance, -1, 1) * 0.85, 0.5);
  }

  function update(dt, time, ctx) {
    const { playerPos, posture, affection } = ctx;
    state.posture = posture;
    const dx = playerPos.x - state.position.x;
    const dz = playerPos.z - state.position.z;
    const d = Math.hypot(dx, dz);
    state.distance = d;

    const known = affection >= 20; // 认识
    const familiar = affection >= 60; // 熟悉
    const fleeRadius = posture === 'run' ? trust.fleeRadiusRun : posture === 'crouch' ? trust.fleeRadiusCrouch : trust.fleeRadiusWalk;
    const alertRadius = posture === 'run' ? trust.alertRadiusRun : posture === 'crouch' ? trust.alertRadiusCrouch : trust.alertRadiusWalk;

    // 玩家在左边还是右边（给立体声用）
    const toPlayer = Math.atan2(dx, dz);
    let rel = toPlayer - state.facing;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;

    // ---------- 状态迁移 ----------
    if (state.mode === 'hidden') {
      if (!known && d < fleeRadius) enterFlee(playerPos.x, playerPos.z);
      else if (d < alertRadius) {
        state.mode = 'alert';
        state.alertTimer = 0;
        bubbleMakers?.question(state.position);
        audio?.whine(clamp(rel, -1, 1) * 0.8, 0.28);
      }
    } else if (state.mode === 'alert') {
      state.alertTimer += dt;
      if (!known && d < fleeRadius) enterFlee(playerPos.x, playerPos.z);
      else if (d > alertRadius * 1.2 || state.alertTimer > trust.calmAfterSec) {
        state.mode = 'hidden';
        state.hideTimer = 0;
      }
    } else if (state.mode === 'flee') {
      const arrived = state.fleeTarget ? moveTowards(state.fleeTarget.x, state.fleeTarget.z, dt, speed.flee) : true;
      if (arrived) {
        state.mode = 'hidden';
        state.hideTimer = 0;
      }
    }

    if (state.mode === 'hidden' || state.mode === 'alert') {
      if (known) {
        state.mode = 'curious';
        state.hideTimer = 0;
      }
    }

    if (state.mode === 'curious') {
      model.root.visible = true;
      if (d < 14) faceTowards(playerPos.x, playerPos.z, dt, 2.4);
      if (familiar && d > 3.2) {
        // 熟悉后会主动凑过来一点（跟随留到 P4）
        moveTowards(
          state.position.x + (dx / (d || 1)) * 1.2,
          state.position.z + (dz / (d || 1)) * 1.2,
          dt,
          speed.walk * 0.8
        );
      }
    }

    if (state.happyTimer > 0) state.happyTimer -= dt;

    // ---------- 三层线索分档 ----------
    const hiding = state.mode === 'hidden' || state.mode === 'alert';
    if (!hiding) state.tier = 'none';
    else if (d > trust.clueFar) state.tier = 'none';
    else if (d > trust.clueMid) state.tier = 'far';
    else if (d > trust.clueNear) state.tier = 'mid';
    else state.tier = 'near';

    // 中距离线索：隔一会儿叫一声（能听声辨位）
    state.barkCooldown -= dt;
    if (hiding && state.tier === 'mid' && state.barkCooldown <= 0) {
      bark(rel);
      state.barkCooldown = 2.4 + Math.random() * 1.2;
    }
    if (!hiding) state.barkCooldown = 0.8;

    // ---------- 姿态 ----------
    let pose;
    if (state.mode === 'hidden') {
      const near = state.tier === 'near';
      pose = {
        crouch: 1,
        earUp: near ? 0.65 : 0.2,
        tailUp: near ? 0.5 : 0.12,
        tailWag: near ? 0.12 : 0.03,
        headPitch: near ? 0.04 : -0.12,
        headYaw: 0,
        lean: 0
      };
    } else if (state.mode === 'alert') {
      pose = {
        crouch: 0.35,
        earUp: 1,
        tailUp: 0.62,
        tailWag: 0.22,
        headPitch: 0.06,
        headYaw: clamp(-rel * 0.8, -0.7, 0.7),
        lean: 0
      };
    } else if (state.mode === 'flee') {
      pose = { crouch: 0, earUp: 0.3, tailUp: 0.05, tailWag: 0, headPitch: -0.06, headYaw: 0, lean: -0.24 };
    } else if (state.mode === 'curious') {
      const excited = state.happyTimer > 0 ? 1 : 0;
      pose = {
        crouch: 0,
        earUp: 0.95,
        tailUp: 0.8,
        tailWag: 0.5 + excited * 0.5,
        headPitch: 0.06 + excited * 0.08,
        headYaw: clamp(-rel * 0.85, -0.8, 0.8),
        lean: 0
      };
    } else {
      pose = { crouch: 0.2, earUp: 0.8, tailUp: 0.5, tailWag: 0.2, headPitch: 0, headYaw: 0, lean: 0 };
    }
    model.setPose(pose);

    const moving = state.mode === 'flee' ? speed.flee : state.mode === 'curious' && familiar && d > 3.2 ? speed.walk * 0.8 : 0;
    model.update(dt, { speed: moving });
    model.root.rotation.y = state.facing;
  }

  function onFeed(good) {
    state.happyTimer = 1.6;
    audio?.happy(0, 0.45);
    if (good) bubbleMakers?.heart(state.position);
    model.setPose({ crouch: 0, earUp: 1, tailUp: 0.95, tailWag: 1, headPitch: 0.12 });
  }

  function reset(i) {
    teleportToHideout(i ?? Math.min(cfg.startHideout ?? 0, hideouts.length - 1));
    state.mode = 'hidden';
    state.alertTimer = 0;
    state.fleeTarget = null;
  }

  return {
    cfg,
    model,
    state,
    hideouts,
    update,
    onFeed,
    reset,
    get position() { return state.position; },
    get visible() { return model.root.visible; },
    isHiding: () => state.mode === 'hidden' || state.mode === 'alert',
    jumpToHideout: (i) => reset(i)
  };
}
