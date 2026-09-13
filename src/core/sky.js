import * as THREE from 'three';
import { clamp, lerp } from './rng.js';

// 昼夜天空 + 光照。天空是一个跟在相机上的渐变穹顶（还原参考图的奶油天空）
export function createSky(scene, dayPhases, palette) {
  const uniforms = {
    uTop: { value: new THREE.Color(palette.skyTop) },
    uHorizon: { value: new THREE.Color(palette.skyHorizon) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(palette.sunLight) },
    uSunStrength: { value: 1.0 }
  };

  const domeMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uSunStrength;
      varying vec3 vDir;

      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y * 1.25 + 0.04, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.72));

        float sd = max(dot(dir, normalize(uSunDir)), 0.0);
        col += uSunColor * pow(sd, 260.0) * 1.6 * uSunStrength;          // 太阳本体
        col += uSunColor * pow(sd, 9.0) * 0.30 * uSunStrength;           // 光晕

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `
  });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(760, 32, 20), domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  scene.add(dome);

  // 太阳（平行光 + 软阴影）
  const sun = new THREE.DirectionalLight(new THREE.Color(palette.sunLight), 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -78; sc.right = 78; sc.top = 78; sc.bottom = -78; sc.near = 1; sc.far = 320;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(
    new THREE.Color(palette.ambientSky),
    new THREE.Color(palette.ambientGround),
    0.7
  );
  scene.add(hemi);

  const fog = new THREE.Fog(new THREE.Color(palette.skyHorizon), 240, 820);
  scene.fog = fog;

  const keys = [...dayPhases.keyframes].sort((a, b) => a.hour - b.hour);
  const sample = (hour) => {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].hour <= hour) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const span = b.hour - a.hour || 1;
    const t = clamp((hour - a.hour) / span, 0, 1);
    return {
      skyTop: new THREE.Color(a.skyTop).lerp(new THREE.Color(b.skyTop), t),
      skyHorizon: new THREE.Color(a.skyHorizon).lerp(new THREE.Color(b.skyHorizon), t),
      sun: new THREE.Color(a.sun).lerp(new THREE.Color(b.sun), t),
      ambient: new THREE.Color(a.ambient).lerp(new THREE.Color(b.ambient), t),
      fog: new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), t),
      sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
      ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, t),
      phase: t < 0.5 ? a.phase : b.phase
    };
  };

  const sunDir = new THREE.Vector3();
  let current = sample(dayPhases.keyframes[3].hour);

  function update(hour, focus) {
    const cfg = sample(hour);
    current = cfg;

    // 太阳方位：6 点东方升起、12 点最高、18 点西方落下
    const a = ((hour - 6) / 12) * Math.PI;
    const elev = Math.sin(a);
    sunDir.set(Math.cos(a) * 0.88, Math.max(elev, 0.16), -0.42).normalize();

    uniforms.uTop.value.copy(cfg.skyTop);
    uniforms.uHorizon.value.copy(cfg.skyHorizon);
    uniforms.uSunColor.value.copy(cfg.sun);
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uSunStrength.value = clamp(cfg.sunIntensity, 0.1, 1.4);

    sun.color.copy(cfg.sun);
    sun.intensity = cfg.sunIntensity;
    const focusPos = focus || new THREE.Vector3();
    sun.target.position.copy(focusPos);
    sun.position.copy(focusPos).addScaledVector(sunDir, 120);

    hemi.color.copy(cfg.ambient);
    hemi.intensity = cfg.ambientIntensity;

    fog.color.copy(cfg.fog);
    fog.near = 240;
    fog.far = 820;

    dome.position.set(focusPos.x, 0, focusPos.z);
  }

  return {
    update,
    sun,
    fog,
    dome,
    get phase() { return current; },
    get sunDirection() { return sunDir; }
  };
}
