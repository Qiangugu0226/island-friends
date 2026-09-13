import * as THREE from 'three';

// 海面 + 环岛浪花 + 池塘水面 + 荷叶
export function createOcean(scene, layout, palette) {
  const island = layout.island;

  // ---------- 海岸线（给浪花环用） ----------
  const raw = layout.shoreline(200);
  let pts = raw.map((p, i) => (p ? p.r : (raw[(i + 1) % raw.length]?.r ?? island.radius)));
  const n = pts.length;
  for (let pass = 0; pass < 6; pass++) {
    const next = pts.slice();
    for (let i = 0; i < n; i++) {
      next[i] = (pts[(i - 1 + n) % n] + pts[i] * 2 + pts[(i + 1) % n]) / 4;
    }
    pts = next;
  }
  const shoreAvg = pts.reduce((a, b) => a + b, 0) / n;
  const shore = pts.map((r, i) => ({ r, angle: (i / n) * Math.PI * 2 }));

  const fogUniforms = {
    uFogColor: { value: new THREE.Color(palette.skyHorizon) },
    uFogNear: { value: 240 },
    uFogFar: { value: 820 }
  };

  // ---------- 海面 ----------
  const oceanUniforms = {
    uShallow: { value: new THREE.Color(palette.waterShallow) },
    uDeep: { value: new THREE.Color(palette.waterDeep) },
    uFoam: { value: new THREE.Color(palette.foam) },
    uShore: { value: shoreAvg },
    uTime: { value: 0 },
    ...fogUniforms
  };

  const oceanGeo = new THREE.PlaneGeometry(1600, 1600, 1, 1);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uShore;
      uniform float uTime;
      varying vec3 vWorld;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 p = vWorld.xz;
        float d = length(p);
        float t = smoothstep(uShore * 0.94, uShore * 2.35, d);
        vec3 col = mix(uShallow, uDeep, t);

        // 缓慢起伏的水面色差
        float w = sin(p.x * 0.42 + uTime * 1.05) * 0.5 + sin(p.y * 0.31 - uTime * 0.85) * 0.5;
        col *= 0.955 + 0.075 * w;

        // 近岸白沫带
        float band = 1.0 - smoothstep(uShore * 0.995, uShore * 1.06, d);
        float wobble = 0.5 + 0.5 * sin(p.x * 0.9 + p.y * 0.7 + uTime * 1.6);
        col = mix(col, uFoam, band * 0.30 * wobble);

        // 阳光碎闪
        float sparkle = step(0.987, hash(floor(p * 2.6) + floor(uTime * 1.8)));
        col += sparkle * 0.16;

        float f = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
        col = mix(col, uFogColor, f);

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `
  });

  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.name = 'ocean';
  ocean.position.y = 0;
  ocean.renderOrder = -5;
  scene.add(ocean);

  // ---------- 环岛浪花（沿岸线生成的带子） ----------
  function buildFoamBand(innerOffset, outerOffset, y, peakPos, peakWidth, strength) {
    const count = shore.length;
    const positions = new Float32Array(count * 6 * 3);
    const uvs = new Float32Array(count * 6 * 2);
    let o = 0;
    let u = 0;
    const put = (x, yv, z, uu, vv) => {
      positions[o++] = x;
      positions[o++] = yv;
      positions[o++] = z;
      uvs[u++] = uu;
      uvs[u++] = vv;
    };
    for (let i = 0; i < count; i++) {
      const a = shore[i];
      const b = shore[(i + 1) % count];
      const ra = a.r;
      const rb = b.r;
      const ia = Math.max(ra + innerOffset, 1);
      const ib = Math.max(rb + innerOffset, 1);
      const oa = ra + outerOffset;
      const ob = rb + outerOffset;
      const v0 = i / count;
      const v1 = (i + 1) / count;
      const ax = Math.cos(a.angle), az = Math.sin(a.angle);
      const bx = Math.cos(b.angle), bz = Math.sin(b.angle);
      // 三角形 1
      put(ax * ia, y, az * ia, 0, v0);
      put(bx * ib, y, bz * ib, 0, v1);
      put(ax * oa, y, az * oa, 1, v0);
      // 三角形 2
      put(bx * ib, y, bz * ib, 0, v1);
      put(bx * ob, y, bz * ob, 1, v1);
      put(ax * oa, y, az * oa, 1, v0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();

    const uniforms = {
      uFoam: { value: new THREE.Color(palette.foam) },
      uTime: { value: 0 },
      uPeak: { value: peakPos },
      uWidth: { value: peakWidth },
      uStrength: { value: strength },
      ...fogUniforms
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uFoam;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uTime;
        uniform float uPeak;
        uniform float uWidth;
        uniform float uStrength;
        varying vec2 vUv;
        varying vec3 vWorld;

        void main() {
          float u = vUv.x;
          float line = exp(-pow((u - uPeak) / uWidth, 2.0));
          float ripple = 0.55 + 0.45 * sin(vUv.y * 16.0 - uTime * 1.9);
          float ripple2 = 0.5 + 0.5 * sin(vUv.y * 8.0 + uTime * 1.15);
          float a = line * (0.5 + 0.5 * ripple) + 0.16 * ripple2 * smoothstep(1.0, 0.1, u);
          a *= uStrength;
          float f = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
          vec3 col = mix(uFoam, uFogColor, f);
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.9));
          #include <colorspace_fragment>
        }
      `
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    return { mesh, uniforms };
  }

  const foamCore = buildFoamBand(-1.2, 2.8, 0.09, 0.32, 0.16, 1.0);
  const foamHalo = buildFoamBand(-2.4, 5.5, 0.05, 0.78, 0.26, 0.16);
  scene.add(foamCore.mesh, foamHalo.mesh);

  // ---------- 池塘水面 + 荷叶 ----------
  const pondGroup = new THREE.Group();
  pondGroup.name = 'ponds';
  const pondMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(palette.waterPond),
    transparent: true,
    opacity: 0.88,
    flatShading: true
  });
  const padMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(palette.grassDark), flatShading: true });

  for (const p of layout.ponds) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.94, 26), pondMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(p.x, p.surfaceY + 0.04, p.z);
    water.receiveShadow = false;
    pondGroup.add(water);

    // 荷叶
    const rng = layout.random;
    const padCount = Math.round(p.r * 1.1);
    for (let i = 0; i < padCount; i++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * p.r * 0.78;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.5 + rng() * 0.35, 7), padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = rng() * Math.PI;
      pad.position.set(p.x + Math.cos(a) * rr, p.surfaceY + 0.08, p.z + Math.sin(a) * rr);
      pondGroup.add(pad);
    }
  }
  scene.add(pondGroup);

  function update(elapsed, hour, fogColor, fogNear, fogFar) {
    oceanUniforms.uTime.value = elapsed;
    foamCore.uniforms.uTime.value = elapsed;
    foamHalo.uniforms.uTime.value = elapsed;
    oceanUniforms.uFogColor.value.copy(fogColor);
    foamCore.uniforms.uFogColor.value.copy(fogColor);
    foamHalo.uniforms.uFogColor.value.copy(fogColor);
    oceanUniforms.uFogNear.value = fogNear;
    oceanUniforms.uFogFar.value = fogFar;
    foamCore.uniforms.uFogNear.value = fogNear;
    foamCore.uniforms.uFogFar.value = fogFar;
    foamHalo.uniforms.uFogNear.value = fogNear;
    foamHalo.uniforms.uFogFar.value = fogFar;
  }

  return { ocean, foamCore, foamHalo, pondGroup, shoreAvg, update };
}
