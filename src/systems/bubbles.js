import * as THREE from 'three';

// 头顶气泡：! 吓跑 / ? 警觉 / ♥ 投喂成功
export function createBubbles(scene) {
  const group = new THREE.Group();
  group.name = 'bubbles';
  scene.add(group);

  function makeTexture(text, color, stroke) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, 128, 128);
    // 圆底
    c.beginPath();
    c.arc(64, 58, 44, 0, Math.PI * 2);
    c.fillStyle = 'rgba(253,245,228,0.95)';
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = stroke;
    c.stroke();
    // 小尖角
    c.beginPath();
    c.moveTo(52, 96);
    c.lineTo(64, 118);
    c.lineTo(76, 96);
    c.closePath();
    c.fillStyle = 'rgba(253,245,228,0.95)';
    c.fill();
    c.fillStyle = color;
    c.font = 'bold 62px "PingFang SC","Microsoft YaHei",sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 64, 60);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  const tex = {
    exclaim: makeTexture('!', '#D9453A', '#D9453A'),
    question: makeTexture('?', '#E8A93C', '#E8A93C'),
    heart: makeTexture('♥', '#E8628C', '#E8628C')
  };

  const live = [];

  function spawn(kind, position) {
    const mat = new THREE.SpriteMaterial({ map: tex[kind], transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.5, 0.5, 1);
    sprite.position.set(position.x, position.y + 1.1, position.z);
    group.add(sprite);
    live.push({ sprite, age: 0, life: kind === 'question' ? 1.6 : 1.3 });
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i];
      b.age += dt;
      const t = b.age / b.life;
      b.sprite.position.y += dt * 0.7;
      const pop = t < 0.18 ? 1 + (0.18 - t) * 2.2 : 1;
      b.sprite.scale.set(0.5 * pop, 0.5 * pop, 1);
      b.sprite.material.opacity = t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.28) : 1;
      if (b.age >= b.life) {
        group.remove(b.sprite);
        b.sprite.material.dispose();
        live.splice(i, 1);
      }
    }
  }

  return {
    exclaim: (p) => spawn('exclaim', p),
    question: (p) => spawn('question', p),
    heart: (p) => spawn('heart', p),
    update,
    get count() { return live.length; }
  };
}
