import * as THREE from 'three';

// P5-2 色彩分级：场景先画进离屏缓冲，再用一个全屏 pass 调色
//   （曝光 / 对比 / 饱和 / 暖高光 / 冷阴影 / 暗角 / 暗部提亮）
// 颜色空间是手工处理的：场景渲染得到**线性**值 → 在 sRGB 显示空间调色（和常见调色软件的滑块手感一致）
//   → 最后自己编码回 sRGB 输出。这样 "开 / 关分级" 的对照才是干净的。
// ?grade=0 或 world.json 里 grade.enabled=false 可关闭（做对照截图用）。

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uFxaa;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uWarm;
uniform float uCool;
uniform float uVignette;
uniform float uLift;
uniform float uAspect;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// FXAA（简化版）：在离屏缓冲上做抗锯齿。
// 为什么不用 MSAA：离屏目标开 4xMSAA 等于每个物件都要按 4 倍采样写一遍，
// 实测帧时间几乎翻倍（177ms → 317ms），而 FXAA 只要多采几次纹理，几乎不花钱。
vec3 fxaa(vec2 uv, vec3 center) {
  vec2 t = uTexel;
  float lNW = luma(texture2D(tDiffuse, uv + vec2(-1.0, -1.0) * t).rgb);
  float lNE = luma(texture2D(tDiffuse, uv + vec2( 1.0, -1.0) * t).rgb);
  float lSW = luma(texture2D(tDiffuse, uv + vec2(-1.0,  1.0) * t).rgb);
  float lSE = luma(texture2D(tDiffuse, uv + vec2( 1.0,  1.0) * t).rgb);
  float lM = luma(center);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < 0.055) return center; // 平缓区域不动，省算力也不糊
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.02, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcp, -8.0, 8.0) * t;
  vec3 a = 0.5 * (texture2D(tDiffuse, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, uv + dir * -0.5).rgb + texture2D(tDiffuse, uv + dir * 0.5).rgb);
  float lB = luma(b);
  return (lB < lMin || lB > lMax) ? a : b;
}

vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec3 lin = texture2D(tDiffuse, vUv).rgb;
  if (uFxaa > 0.5) lin = fxaa(vUv, lin);
  vec3 col = toSRGB(lin);

  col *= uExposure;

  // 暗部提亮（把死黑抬起来一点，画面会"柔"）
  col += vec3(uLift) * (1.0 - smoothstep(0.0, 0.55, col));

  // 对比：围绕 0.5 的 S 曲线
  col = (col - 0.5) * uContrast + 0.5;

  // 饱和度
  float lum = luma(col);
  col = mix(vec3(lum), col, uSaturation);

  // 分离调色：亮部偏暖（阳光、稻草），暗部偏冷紫（阴影里的天光反射）
  float hi = smoothstep(0.42, 1.0, lum);
  float lo = 1.0 - smoothstep(0.02, 0.5, lum);
  col += vec3(0.055, 0.030, -0.022) * hi * uWarm;
  col += vec3(-0.020, 0.008, 0.050) * lo * uCool;

  // 暗角（按宽高比修正，不然宽屏会变成上下两道）
  vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
  float v = 1.0 - dot(d, d) * uVignette;
  col *= clamp(v, 0.0, 1.0);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function createGrade(renderer, scene, camera, cfg = {}) {
  const uniforms = {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
    uFxaa: { value: cfg.fxaa === false ? 0 : 1 },
    uExposure: { value: cfg.exposure ?? 1.0 },
    uContrast: { value: cfg.contrast ?? 1.05 },
    uSaturation: { value: cfg.saturation ?? 1.1 },
    uWarm: { value: cfg.warmHighlights ?? 1.0 },
    uCool: { value: cfg.coolShadows ?? 1.0 },
    uVignette: { value: cfg.vignette ?? 0.22 },
    uLift: { value: cfg.liftShadows ?? 0.012 },
    uAspect: { value: 16 / 9 }
  };
  const target = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    samples: cfg.samples ?? 4, // 保留 MSAA（渲染不再直接进画布，抗锯齿得自己带上）
    depthBuffer: true
  });
  target.texture.colorSpace = THREE.NoColorSpace; // 线性存放，调色时自己转 sRGB

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quadScene.add(quad);

  function setSize(w, h, pixelRatio = 1) {
    const pr = Math.min(pixelRatio, 2);
    const tw = Math.max(2, Math.floor(w * pr));
    const th = Math.max(2, Math.floor(h * pr));
    target.setSize(tw, th);
    uniforms.uTexel.value.set(1 / tw, 1 / th);
    uniforms.uAspect.value = w / Math.max(1, h);
  }

  function render() {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    // 场景这一趟的统计要当场记下来：下面再画全屏 pass 会把 info 重置成 1 个 draw call
    stats.calls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    renderer.setRenderTarget(null);
    // 关键：把离屏纹理接到调色 pass 上（漏了这句画面就是全黑）
    uniforms.tDiffuse.value = target.texture;
    renderer.render(quadScene, quadCam);
    stats.calls += renderer.info.render.calls;
    stats.triangles += renderer.info.render.triangles;
  }

  const stats = { calls: 0, triangles: 0 };

  // ?samples=N 可以在运行时改 MSAA 档位（调性能用）
  function setSamples(n) {
    target.samples = Math.max(0, n | 0);
    target.dispose();
  }

  return { render, setSize, setSamples, uniforms, material, target, quadScene, stats };
}
