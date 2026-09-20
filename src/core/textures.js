import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// 程序化生成「手绘质感」贴图：全部用 canvas 画出来，不需要任何外部图片。
// 关键原则：贴图整体偏亮灰，靠 material.color 去染色 —— 这样一张贴图能给灰瓦/红瓦/青瓦共用。
export function createTextures(palette, seed = 1) {
  const rnd = mulberry32(seed);

  function canvas(size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
  }

  function finish(c, repeat = 1) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }

  // 细颗粒噪点（手绘纸感）
  function grain(ctx, size, amount = 10, alpha = 0.06) {
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * amount;
      d[i] = Math.min(255, Math.max(0, d[i] + n));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
      if (alpha > 0 && rnd() < 0.02) d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // 大块柔和斑点（水彩晕染感）
  function blotches(ctx, size, count, colorA, colorB, radius = 40) {
    for (let i = 0; i < count; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = radius * (0.5 + rnd());
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = rnd() < 0.5 ? colorA : colorB;
      g.addColorStop(0, c);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- 灰瓦 / 瓦垄 ----------
  function roofTiles() {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#dcdcdc';
    ctx.fillRect(0, 0, size, size);

    const rows = 6;
    const rowH = size / rows;
    const tileW = size / 8;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      // 每行瓦：上缘高光 + 下缘阴影沟
      for (let i = 0; i < 9; i++) {
        const x = i * tileW - tileW * 0.5;
        const shade = 0.9 + rnd() * 0.2;
        const g = ctx.createLinearGradient(0, y, 0, y + rowH);
        g.addColorStop(0, `rgba(255,255,255,${0.72 * shade})`);
        g.addColorStop(0.55, `rgba(210,210,210,${0.25 * shade})`);
        g.addColorStop(1, 'rgba(96,96,96,0.62)');
        ctx.fillStyle = g;
        ctx.beginPath();
        // 半圆瓦头
        ctx.moveTo(x, y + rowH);
        ctx.lineTo(x, y + rowH * 0.42);
        ctx.quadraticCurveTo(x + tileW * 0.5, y - rowH * 0.14, x + tileW, y + rowH * 0.42);
        ctx.lineTo(x + tileW, y + rowH);
        ctx.closePath();
        ctx.fill();
      }
      // 沟槽
      ctx.strokeStyle = 'rgba(52,52,52,0.62)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y + rowH - 1);
      ctx.lineTo(size, y + rowH - 1);
      ctx.stroke();
      // 偶发旧瓦
      if (rnd() < 0.6) {
        ctx.fillStyle = 'rgba(108,120,96,0.22)';
        ctx.fillRect(rnd() * size, y + 2, tileW * (0.6 + rnd()), rowH * 0.7);
      }
    }
    blotches(ctx, size, 14, 'rgba(255,255,255,0.10)', 'rgba(110,110,110,0.10)', 46);
    grain(ctx, size, 12);
    return finish(c, 1);
  }

  // ---------- 石墙（砌石 + 灰缝） ----------
  function stoneWall() {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#cfcfcf';
    ctx.fillRect(0, 0, size, size);

    const rows = 5;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      let x = -(r % 2) * 20;
      while (x < size) {
        const w = 26 + rnd() * 34;
        const shade = 0.84 + rnd() * 0.3;
        ctx.fillStyle = `rgba(${Math.round(215 * shade)},${Math.round(212 * shade)},${Math.round(203 * shade)},1)`;
        ctx.fillRect(x + 1.5, y + 1.5, w - 3, rowH - 3);
        // 石块顶部高光 / 底部阴影
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x + 1.5, y + 1.5, w - 3, 2.5);
        ctx.fillStyle = 'rgba(74,70,62,0.34)';
        ctx.fillRect(x + 1.5, y + rowH - 4, w - 3, 2.5);
        // 石面斑驳
        if (rnd() < 0.5) {
          ctx.fillStyle = 'rgba(160,155,145,0.18)';
          ctx.fillRect(x + 4 + rnd() * (w - 20), y + 4 + rnd() * (rowH - 12), 8 + rnd() * 14, 4 + rnd() * 8);
        }
        x += w;
      }
      // 灰缝
      ctx.strokeStyle = 'rgba(110,104,94,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    blotches(ctx, size, 26, 'rgba(255,255,255,0.16)', 'rgba(108,100,84,0.22)', 40);
    grain(ctx, size, 14);
    return finish(c, 1);
  }

  // ---------- 白墙抹灰 ----------
  function plaster() {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2f2f0';
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, 26, 'rgba(255,255,255,0.5)', 'rgba(214,210,198,0.28)', 54);
    // 底部返潮
    const g = ctx.createLinearGradient(0, size * 0.62, 0, size);
    g.addColorStop(0, 'rgba(190,186,170,0)');
    g.addColorStop(1, 'rgba(168,163,146,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, size * 0.62, size, size * 0.38);
    grain(ctx, size, 10);
    return finish(c, 1);
  }

  // ---------- 红砖 ----------
  function brick() {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#b9b0a4';
    ctx.fillRect(0, 0, size, size);
    const rows = 8;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      let x = -(r % 2) * 32;
      while (x < size) {
        const w = 58 + rnd() * 8;
        const shade = 0.9 + rnd() * 0.2;
        ctx.fillStyle = `rgba(${Math.round(226 * shade)},${Math.round(214 * shade)},${Math.round(202 * shade)},1)`;
        ctx.fillRect(x + 2, y + 2, w - 4, rowH - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 2, y + 2, w - 4, 2);
        x += w;
      }
    }
    blotches(ctx, size, 12, 'rgba(255,255,255,0.12)', 'rgba(120,90,70,0.14)', 40);
    grain(ctx, size, 12);
    return finish(c, 1);
  }

  // ---------- 木纹（做旧木板） ----------
  function wood() {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e6d7c0';
    ctx.fillRect(0, 0, size, size);
    // 竖向木纹
    for (let i = 0; i < 60; i++) {
      const x = rnd() * size;
      ctx.strokeStyle = `rgba(${Math.round(150 + rnd() * 60)},${Math.round(120 + rnd() * 50)},${Math.round(90 + rnd() * 40)},${0.10 + rnd() * 0.18})`;
      ctx.lineWidth = 0.8 + rnd() * 2.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rnd() - 0.5) * 18, size * 0.33, x + (rnd() - 0.5) * 18, size * 0.66, x + (rnd() - 0.5) * 14, size);
      ctx.stroke();
    }
    // 木节
    for (let i = 0; i < 3; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 12);
      g.addColorStop(0, 'rgba(120,92,64,0.5)');
      g.addColorStop(1, 'rgba(120,92,64,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    // 板缝
    const planks = 4;
    ctx.strokeStyle = 'rgba(96,72,50,0.5)';
    ctx.lineWidth = 3;
    for (let i = 1; i < planks; i++) {
      const x = (size / planks) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    grain(ctx, size, 12);
    return finish(c, 1);
  }

  // ---------- 稻草 ----------
  function thatch() {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#efe0b8';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 420; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const len = 10 + rnd() * 26;
      const a = -0.5 + rnd() * 0.3;
      ctx.strokeStyle = `rgba(${Math.round(190 + rnd() * 50)},${Math.round(160 + rnd() * 40)},${Math.round(96 + rnd() * 40)},${0.25 + rnd() * 0.4})`;
      ctx.lineWidth = 1 + rnd() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(a) * len, y + Math.cos(a) * len);
      ctx.stroke();
    }
    grain(ctx, size, 10);
    return finish(c, 1);
  }

  // ---------- 地面细节（草地色斑，给地形当 map 用） ----------
  function groundDetail() {
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, size, size);
    blotches(ctx, size, 60, 'rgba(255,255,255,0.5)', 'rgba(198,198,190,0.35)', 34);
    blotches(ctx, size, 26, 'rgba(255,255,255,0.3)', 'rgba(168,170,150,0.28)', 60);
    grain(ctx, size, 18);
    const t = finish(c, 1);
    t.repeat.set(28, 28);
    return t;
  }

  const tex = {
    roofTiles: roofTiles(),
    stone: stoneWall(),
    plaster: plaster(),
    brick: brick(),
    wood: wood(),
    thatch: thatch(),
    ground: groundDetail()
  };
  Object.entries(tex).forEach(([k, t]) => (t.name = k));
  return tex;
}

// 同一张贴图在不同用途下需要不同的重复次数 → 克隆一份（共享图像数据，只改 repeat）
export function withRepeat(texture, rx, ry = rx) {
  const t = texture.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}
