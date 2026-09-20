import * as THREE from 'three';
import { clamp } from '../core/rng.js';

// 玩家：低多边形的「来村里的小客人」+ 走路/跑步动画 + 地形贴合与碰撞
export function createPlayer(assets, palette, cfg, layout) {
  const mat = assets.mat;
  const root = new THREE.Group();
  root.name = 'player';

  const body = new THREE.Group();
  root.add(body);

  const skin = mat(palette.playerSkin);
  const shirt = mat(palette.playerShirt);
  const pants = mat(palette.playerPants);
  const hair = mat(palette.playerHair);
  const pack = mat(palette.playerPack);

  // 躯干
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.28), shirt);
  torso.position.y = 1.06;
  body.add(torso);

  // 背上的小包
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.2), pack);
  backpack.position.set(0, 1.06, -0.24);
  body.add(backpack);

  // 头 + 头发 + 眼睛
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.235, 1), skin);
  head.position.y = 1.53;
  head.scale.set(1, 1.02, 0.98);
  body.add(head);

  const hairBack = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), hair);
  hairBack.position.set(0, 1.57, -0.02);
  hairBack.scale.set(1.02, 0.92, 1.0);
  body.add(hairBack);

  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.4), hair);
  fringe.position.set(0, 1.66, 0.03);
  body.add(fringe);

  for (const x of [-0.085, 0.085]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.03), mat('#3A2E26'));
    eye.position.set(x, 1.53, 0.215);
    body.add(eye);
  }

  // 四肢（挂在 pivot 上，绕 pivot 摆动）
  const limbs = {};
  const makeLimb = (name, px, py, colorMat, length, width) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, width), colorMat);
    mesh.position.y = -length / 2;
    pivot.add(mesh);
    body.add(pivot);
    limbs[name] = pivot;
    return pivot;
  };

  makeLimb('legL', -0.13, 0.78, pants, 0.78, 0.17);
  makeLimb('legR', 0.13, 0.78, pants, 0.78, 0.17);
  makeLimb('armL', -0.3, 1.28, skin, 0.56, 0.14);
  makeLimb('armR', 0.3, 1.28, skin, 0.56, 0.14);

  // 小鞋子：挂在腿的关节下面，这样腿摆鞋子跟着摆
  const shoeGeo = new THREE.BoxGeometry(0.2, 0.12, 0.3);
  const shoeMat = mat('#7A5236');
  for (const [name, zOff] of [['legL', 0.04], ['legR', 0.04]]) {
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.72, zOff);
    limbs[name].add(shoe);
  }

  body.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  function buildPreview() {
    const clone = root.clone(true);
    return clone;
  }

  // 碰撞统一交给 collision 系统（圆形碰撞 + 院墙 + 平台），没传就退回旧逻辑
  const collider = cfg.collision ?? null;

  function groundHeightAt(x, z) {
    return collider ? collider.groundAt(x, z, layout.heightAt) : layout.heightAt(x, z);
  }

  const state = {
    position: new THREE.Vector3(cfg.spawn.x, 0, cfg.spawn.z),
    velocity: new THREE.Vector3(),
    speed: 0,
    facing: Math.PI * 0.25,
    animPhase: 0,
    running: false,
    crouching: false,
    crouchAmount: 0,
    posture: 'walk',
    inWater: false,
    onPlatform: false
  };
  state.position.y = groundHeightAt(state.position.x, state.position.z);
  root.position.copy(state.position);

  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function blocked(x, z, blockers) {
    if (collider) return collider.hitCircle(x, z, 0.34, null);
    for (const b of blockers) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz < (b.r + 0.34) ** 2) return b;
    }
    return null;
  }

  function canStand(x, z, blockers, fromY = null) {
    const h = groundHeightAt(x, z);
    if (h < -cfg.waterDepthLimit) return false;
    // 池塘：可以涉水走进去，只有最深处才拦住（不是整片禁区）
    for (const p of layout.ponds) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r && collider?.platformAt(x, z) == null) {
        const depth = p.surfaceY - layout.heightAt(x, z);
        if (depth > (cfg.pondDepthLimit ?? 0.75)) return false;
      }
    }
    if (collider?.hitWall(x, z)) return false;
    // 台阶落差太大就上不去（能走上码头栈台，但爬不上院墙）
    if (fromY !== null && h - fromY > (cfg.stepUp ?? 0.75)) return false;
    if (blocked(x, z, blockers)) return false;
    return true;
  }

  function update(dt, input, basis, blockers = []) {
    const forwardKey = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const strafeKey = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const running = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && !input.isDown('KeyC');
    // C 蹲下潜行：速度降下来，动物就不容易被惊动
    const crouching = input.isDown('KeyC');
    state.running = running;
    state.crouching = crouching;
    state.posture = crouching ? 'crouch' : running ? 'run' : 'walk';

    dir.set(0, 0, 0);
    if (forwardKey || strafeKey) {
      dir.addScaledVector(basis.forward, forwardKey).addScaledVector(basis.right, strafeKey);
      if (dir.lengthSq() > 0) dir.normalize();
    }

    const baseSpeed = running ? cfg.runSpeed : crouching ? cfg.walkSpeed * (cfg.crouchSpeedFactor ?? 0.42) : cfg.walkSpeed;
    const targetSpeed = dir.lengthSq() > 0 ? baseSpeed : 0;
    state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-10 * dt));
    if (state.speed < 0.02) state.speed = 0;

    if (dir.lengthSq() > 0) {
      const targetAngle = Math.atan2(dir.x, dir.z);
      let diff = targetAngle - state.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.facing += diff * (1 - Math.exp(-(cfg.turnLerp ?? 12) * dt));
    }

    // 已经卡在碰撞体里（例如被传送到障碍物上、或道具自动摆位挪到了脚下）：
    // 先慢慢挤出来，否则任何方向都判定为不可站立，会彻底动不了
    const stuck = blocked(state.position.x, state.position.z, blockers);
    if (stuck) {
      const dx = state.position.x - stuck.x;
      const dz = state.position.z - stuck.z;
      const len = Math.hypot(dx, dz) || 0.0001;
      const pushSpeed = Math.min(3.2 * dt, 0.2);
      state.position.x += (dx / len) * pushSpeed;
      state.position.z += (dz / len) * pushSpeed;
    }

    if (state.speed > 0) {
      const step = state.speed * dt;
      const nx = state.position.x + dir.x * step;
      const nz = state.position.z + dir.z * step;
      const fromY = groundHeightAt(state.position.x, state.position.z);
      if (canStand(nx, nz, blockers, fromY)) {
        state.position.x = nx;
        state.position.z = nz;
      } else if (canStand(nx, state.position.z, blockers, fromY)) {
        const hit = blocked(nx, state.position.z, blockers);
        if (hit) {
          const push = tmp.set(state.position.x - hit.x, 0, state.position.z - hit.z);
          if (push.lengthSq() > 1e-5) {
            push.normalize().multiplyScalar(hit.r + 0.36);
            state.position.x = hit.x + push.x;
            state.position.z = hit.z + push.z;
          }
        } else {
          state.position.x = nx;
        }
      } else if (canStand(state.position.x, nz, blockers, fromY)) {
        const hit = blocked(state.position.x, nz, blockers);
        if (hit) {
          const push = tmp.set(state.position.x - hit.x, 0, state.position.z - hit.z);
          if (push.lengthSq() > 1e-5) {
            push.normalize().multiplyScalar(hit.r + 0.36);
            state.position.x = hit.x + push.x;
            state.position.z = hit.z + push.z;
          }
        } else {
          state.position.z = nz;
        }
      }
    }

    // 站在平台上（码头栈台）时脚底取平台高度
    const standY = groundHeightAt(state.position.x, state.position.z);
    state.position.y += (standY - state.position.y) * (1 - Math.exp(-14 * dt));
    state.onPlatform = collider?.platformAt(state.position.x, state.position.z) != null;
    state.inWater = state.position.y < 0.35;

    root.position.copy(state.position);
    root.rotation.y = state.facing;

    // 动画
    const cadence = running ? 11.5 : 7.6;
    if (state.speed > 0.05) {
      state.animPhase += dt * cadence * clamp(state.speed / cfg.walkSpeed, 0.4, 1.7);
    } else {
      state.animPhase += dt * 1.4;
    }
    const swing = state.speed > 0.05 ? clamp(state.speed / (running ? cfg.runSpeed : cfg.walkSpeed), 0, 1.2) : 0;
    // 跑步时腿摆更大、身体略前倾、上下起伏更明显
    const legAmp = running ? 0.86 : 0.6;
    const s = Math.sin(state.animPhase * 2) * legAmp * swing;
    const s2 = Math.sin(state.animPhase * 2 + Math.PI) * legAmp * swing;
    limbs.legL.rotation.x = s;
    limbs.legR.rotation.x = s2;
    limbs.armL.rotation.x = -s * (running ? 0.95 : 0.75);
    limbs.armR.rotation.x = -s2 * (running ? 0.95 : 0.75);
    limbs.armL.rotation.z = 0.06 + (running ? 0.08 : 0);
    limbs.armR.rotation.z = -0.06 - (running ? 0.08 : 0);
    const bob = Math.abs(Math.sin(state.animPhase * 2)) * (running ? 0.075 : 0.045) * swing;
    const idle = state.speed < 0.05 ? Math.sin(state.animPhase) * 0.012 : 0;
    body.position.y = bob + idle;
    body.rotation.z = Math.sin(state.animPhase * 2) * 0.02 * swing;
    body.rotation.x = running ? -0.12 * swing : 0;

    // 蹲下：整体压低一点（脚不动，像是缩下去）
    const targetCrouch = crouching ? 1 : 0;
    state.crouchAmount += (targetCrouch - state.crouchAmount) * (1 - Math.exp(-10 * dt));
    const c = state.crouchAmount;
    body.scale.set(1 + c * 0.06, 1 - c * 0.3, 1 + c * 0.06);
    body.rotation.x += -c * 0.1;
  }

  return {
    root,
    state,
    update,
    buildPreview,
    get position() { return state.position; },
    teleport(x, z) {
      state.position.set(x, groundHeightAt(x, z), z);
      root.position.copy(state.position);
    }
  };
}
