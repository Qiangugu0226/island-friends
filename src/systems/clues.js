import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// 三层线索（越靠近越明确）：
//   远 15m+  ：地上的脚印、掉落的羽毛、草丛轻微晃动
//   中 8-15m ：立体声叫声（能听声辨位，音频在 audio.js）
//   近 5-8m  ：草丛里露出尾巴尖/耳朵（由动物姿态表现）+ 眼睛反光
// 这里负责"看得见"的那部分；声音由 audio.js 负责。
export function createClues(scene, palette, assets, cfg = {}) {
  const rand = mulberry32(0x51ce00);
  const group = new THREE.Group();
  group.name = 'clues';
  scene.add(group);

  // ---------- 脚印 ----------
  const pawGeo = new THREE.BoxGeometry(0.16, 0.02, 0.22);
  const pawMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#8A6A44'), transparent: true, opacity: 0.55 });
  const paws = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(pawGeo, pawMat);
    m.visible = false;
    m.receiveShadow = false;
    m.castShadow = false;
    group.add(m);
    paws.push(m);
  }

  // ---------- 掉落的羽毛 ----------
  const featherGeo = new THREE.BoxGeometry(0.1, 0.02, 0.3);
  const featherMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.lanternRed ?? '#D9453A'), flatShading: true });
  const feathers = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(featherGeo, featherMat);
    m.visible = false;
    group.add(m);
    feathers.push(m);
  }

  // ---------- 会晃动的草丛（线索专用，比散布的草丛更靠近躲藏点） ----------
  const tuftGeo = assets.geos.tuftGeo;
  const tuftMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.grassDark), flatShading: true });
  const tufts = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(tuftGeo, tuftMat);
    m.visible = false;
    group.add(m);
    tufts.push({ mesh: m, phase: rand() * Math.PI * 2 });
  }

  // ---------- 眼睛反光 ----------
  const glintMat = new THREE.SpriteMaterial({
    map: (() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const c = canvas.getContext('2d');
      const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,246,214,1)');
      grd.addColorStop(0.4, 'rgba(255,220,140,0.55)');
      grd.addColorStop(1, 'rgba(255,220,140,0)');
      c.fillStyle = grd;
      c.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })(),
    transparent: true,
    depthWrite: false
  });
  const glint = new THREE.Sprite(glintMat);
  glint.scale.set(0.34, 0.34, 1);
  glint.visible = false;
  group.add(glint);

  const layoutRef = { heightAt: null };

  function placeFootprints(cx, cz, angle, count, spread = 0.55) {
    for (let i = 0; i < paws.length; i++) {
      const m = paws[i];
      if (i >= count) {
        m.visible = false;
        continue;
      }
      const t = i * spread;
      const side = i % 2 === 0 ? -0.18 : 0.18;
      const x = cx - Math.sin(angle) * t + Math.cos(angle) * side;
      const z = cz - Math.cos(angle) * t - Math.sin(angle) * side;
      const y = layoutRef.heightAt ? layoutRef.heightAt(x, z) + 0.03 : 0.03;
      m.position.set(x, y, z);
      m.rotation.y = angle + (i % 2 ? 0.12 : -0.12);
      m.visible = true;
    }
  }

  function hideAll() {
    paws.forEach((p) => (p.visible = false));
    feathers.forEach((f) => (f.visible = false));
    tufts.forEach((t) => (t.mesh.visible = false));
    glint.visible = false;
  }

  // tier: 'far' | 'mid' | 'near' | 'none'；t 是累计时间
  function update(dt, t, ctx) {
    const { position, tier, facing = 0, hidden = true, visibleToPlayer = true } = ctx;
    if (tier === 'none' || !visibleToPlayer) {
      hideAll();
      return;
    }
    // 远线索：脚印 + 羽毛 + 草动
    placeFootprints(position.x, position.z, facing + Math.PI, tier === 'far' ? 6 : 8);
    feathers.forEach((f, i) => {
      f.visible = true;
      const ph = t * 0.9 + i * 1.7;
      f.position.set(
        position.x + Math.cos(ph * 0.7 + i) * 0.9,
        (layoutRef.heightAt ? layoutRef.heightAt(position.x, position.z) : 0) + 0.35 + Math.sin(ph) * 0.12,
        position.z + Math.sin(ph * 0.6 + i) * 0.9
      );
      f.rotation.set(ph * 0.8, ph, ph * 0.5);
    });
    tufts.forEach((tf, i) => {
      tf.mesh.visible = true;
      const a = (i / tufts.length) * Math.PI * 2 + 0.4;
      const r = 0.7 + (i % 3) * 0.35;
      const x = position.x + Math.cos(a) * r;
      const z = position.z + Math.sin(a) * r;
      tf.mesh.position.set(x, layoutRef.heightAt ? layoutRef.heightAt(x, z) : 0, z);
      const wiggle = 1 + Math.sin(t * 6 + tf.phase) * (hidden ? 0.28 : 0.1);
      tf.mesh.scale.set(1, wiggle, 1);
      tf.mesh.rotation.z = Math.sin(t * 5 + tf.phase) * (hidden ? 0.22 : 0.08);
    });
    // 近线索：眼睛反光
    const showGlint = tier === 'near';
    glint.visible = showGlint;
    if (showGlint) {
      glint.position.set(position.x, (layoutRef.heightAt ? layoutRef.heightAt(position.x, position.z) : 0) + 0.62, position.z + 0.28);
      const pulse = 0.28 + Math.sin(t * 3.4) * 0.06;
      glint.scale.set(pulse, pulse, 1);
    }
  }

  function attachLayout(layout) {
    layoutRef.heightAt = layout.heightAt;
  }

  return { group, update, hideAll, attachLayout, count: { paws: paws.length, feathers: feathers.length, tufts: tufts.length } };
}
