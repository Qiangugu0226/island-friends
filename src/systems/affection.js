import * as THREE from 'three';
import { clamp } from '../core/rng.js';

// 好感度 + 食物背包 + 村里散落的食物拾取点
export function createAffection({ scene, layout, assets, palette, cfg, bubbles, audio }) {
  const foods = cfg.foods.list;
  const foodById = Object.fromEntries(foods.map((f) => [f.id, f]));

  const state = {
    inventory: {},          // { bone: 2, fish: 0, ... }
    selected: null,
    affection: {},          // { dahuang: 0 }
    observed: {},           // { dahuang: true } 首次观察后进"朋友簿"
    feedCooldown: 0,
    pickups: [],
    toasts: []
  };

  for (const f of foods) state.inventory[f.id] = 0;

  // ---------- 食物小模型 ----------
  function makeFoodMesh(food) {
    const g = new THREE.Group();
    const m = assets.mat(food.color);
    if (food.shape === 'bone') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.07), m);
      g.add(bar);
      for (const s of [-1, 1]) {
        for (const t of [-1, 1]) {
          const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), m);
          knob.position.set(s * 0.16, t * 0.06, 0);
          g.add(knob);
        }
      }
    } else if (food.shape === 'fish') {
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), m);
      body.scale.set(0.5, 0.9, 0.35);
      g.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), m);
      tail.position.y = -0.2;
      tail.rotation.x = Math.PI;
      g.add(tail);
    } else if (food.shape === 'seed') {
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), m);
        s.position.set((i % 3) * 0.09 - 0.09, 0, Math.floor(i / 3) * 0.09);
        g.add(s);
      }
    } else {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.34), m);
      g.add(leaf);
      const leaf2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.28), m);
      leaf2.position.set(0.06, 0.06, -0.04);
      leaf2.rotation.y = 0.5;
      g.add(leaf2);
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    return g;
  }

  // ---------- 村里散落的食物 ----------
  const pickupsGroup = new THREE.Group();
  pickupsGroup.name = 'foodPickups';
  scene.add(pickupsGroup);

  // 拾取物头顶的闪光标记（让它在草丛里也好认）
  const sparkleTex = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const c = canvas.getContext('2d');
    const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,252,232,1)');
    grd.addColorStop(0.35, 'rgba(255,226,150,0.7)');
    grd.addColorStop(1, 'rgba(255,226,150,0)');
    c.fillStyle = grd;
    c.fillRect(0, 0, 64, 64);
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(32, 10); c.lineTo(32, 54);
    c.moveTo(10, 32); c.lineTo(54, 32);
    c.stroke();
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  for (const spawn of cfg.foods.spawns) {
    const food = foodById[spawn.food];
    if (!food) continue;
    if (layout.insideCompound(spawn.x, spawn.z, 0.5)) continue;

    const holder = new THREE.Group();
    const mesh = makeFoodMesh(food);
    mesh.scale.setScalar(1.25);
    holder.add(mesh);

    const sparkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, transparent: true, depthWrite: false }));
    sparkle.scale.set(0.42, 0.42, 1);
    sparkle.position.y = 0.46;
    holder.add(sparkle);

    const y = layout.heightAt(spawn.x, spawn.z) + 0.16;
    holder.position.set(spawn.x, y, spawn.z);
    pickupsGroup.add(holder);
    state.pickups.push({
      food: food.id,
      mesh: holder,
      spin: mesh,
      sparkle,
      baseY: y,
      taken: false,
      phase: Math.random() * 6.28
    });
  }

  function toast(text, color = '#3A2E26') {
    state.toasts.push({ text, color, age: 0, life: 2.6 });
  }

  // ---------- 好感度 ----------
  function levelOf(animalId) {
    const a = cfg.animals.find((x) => x.id === animalId);
    const levels = a?.affection?.levels ?? [{ at: 0, name: '陌生' }];
    const v = state.affection[animalId] ?? 0;
    let cur = levels[0];
    for (const l of levels) if (v >= l.at) cur = l;
    return cur;
  }

  function observe(animalId) {
    const first = !state.observed[animalId];
    state.observed[animalId] = true;
    if (state.affection[animalId] === undefined) state.affection[animalId] = 0;
    return first;
  }

  function selectFood(id) {
    if ((state.inventory[id] ?? 0) <= 0) {
      toast(`${foodById[id]?.name ?? id} 没有了`, '#B4553F');
      return false;
    }
    state.selected = id;
    return true;
  }

  function autoSelectFood() {
    if (state.selected && state.inventory[state.selected] > 0) return state.selected;
    const found = foods.find((f) => state.inventory[f.id] > 0);
    state.selected = found ? found.id : null;
    return state.selected;
  }

  function feed(animalId) {
    const a = cfg.animals.find((x) => x.id === animalId);
    const id = autoSelectFood();
    if (!id) {
      toast('手里没有食物（村里找找看）', '#8A6A44');
      return { ok: false, reason: 'nofood' };
    }
    if (state.feedCooldown > 0) {
      toast('它刚吃过，等一会儿再喂', '#8A6A44');
      return { ok: false, reason: 'cooldown' };
    }
    const good = a?.likeFood === id;
    state.inventory[id] -= 1;
    if (good) {
      const gain = a.affection.feedGain;
      state.affection[animalId] = clamp((state.affection[animalId] ?? 0) + gain, 0, a.affection.max);
      state.feedCooldown = a.affection.feedCooldownSec;
      state.observed[animalId] = true;
      toast(`${a.name} 吃得很开心  好感 +${gain}`, '#3E7A3A');
      audio?.happy(0, 0.4);
      return { ok: true, gain, level: levelOf(animalId) };
    }
    state.feedCooldown = 4;
    toast(`${a.name} 对${foodById[id].name}不太感兴趣…`, '#8A6A44');
    return { ok: false, reason: 'wrongFood' };
  }

  function update(dt, playerPos) {
    state.feedCooldown = Math.max(0, state.feedCooldown - dt);

    // 拾取
    for (const p of state.pickups) {
      if (p.taken) continue;
      p.phase += dt;
      p.mesh.position.y = p.baseY + Math.sin(p.phase * 1.6) * 0.06;
      p.spin.rotation.y += dt * 0.9;
      const d = Math.hypot(p.mesh.position.x - playerPos.x, p.mesh.position.z - playerPos.z);
      // 靠近就放大 + 闪光更亮，草丛里也好认
      const near = d < 8;
      const pop = (near ? 1.22 : 1) * (1 + Math.sin(p.phase * 2.2) * 0.05);
      p.mesh.scale.setScalar(pop);
      const s = (near ? 0.6 : 0.42) * (1 + Math.sin(p.phase * 3.1) * 0.12);
      p.sparkle.scale.set(s, s, 1);
      p.sparkle.material.opacity = near ? 1 : 0.75;
      if (d < 1.7) {
        p.taken = true;
        pickupsGroup.remove(p.mesh);
        state.inventory[p.food] = (state.inventory[p.food] ?? 0) + 1;
        autoSelectFood();
        toast(`捡到 ${foodById[p.food].name} ×1`, '#3E5A7A');
      }
    }

    // 提示条
    for (let i = state.toasts.length - 1; i >= 0; i--) {
      state.toasts[i].age += dt;
      if (state.toasts[i].age > state.toasts[i].life) state.toasts.splice(i, 1);
    }
  }

  return {
    state,
    foods,
    foodById,
    levelOf,
    observe,
    feed,
    selectFood,
    autoSelectFood,
    toast,
    update,
    get selectedFood() { return state.selected ? foodById[state.selected] : null; },
    get inventoryList() {
      return foods.map((f) => ({ ...f, count: state.inventory[f.id] ?? 0 }));
    }
  };
}
