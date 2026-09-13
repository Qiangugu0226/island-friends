// HUD：纯 DOM，轻量、方便你直接改文案
export function createHud() {
  const el = {
    clock: document.getElementById('clock'),
    phase: document.getElementById('phase'),
    timespeed: document.getElementById('timespeed'),
    fps: document.getElementById('fps'),
    coord: document.getElementById('coord'),
    viewName: document.getElementById('view-name'),
    objects: document.getElementById('objects'),
    loading: document.getElementById('loading'),
    loadingStep: document.getElementById('loading-step'),
    loadingBar: document.getElementById('loading-bar'),
    hint: document.getElementById('hint'),
    viewHint: document.getElementById('view-hint'),
    viewSub: document.getElementById('view-sub')
  };

  const phaseClass = (phase) => {
    if (phase === '夜晚') return 'night';
    if (phase === '黄昏' || phase === '黎明' || phase === '傍晚') return 'dusk';
    return '';
  };

  let fpsAccum = 0;
  let fpsFrames = 0;

  return {
    setLoading(step, ratio) {
      if (el.loadingStep) el.loadingStep.textContent = step;
      if (el.loadingBar) el.loadingBar.style.width = `${Math.round(ratio * 100)}%`;
    },
    hideLoading() {
      el.loading?.classList.add('hidden');
      setTimeout(() => el.loading?.remove(), 900);
      setTimeout(() => el.hint?.classList.add('hidden'), 6000);
    },
    update(dt, { clock, phase, speedIndex, speed, position, viewName, objects, hour }) {
      fpsAccum += dt;
      fpsFrames++;
      if (fpsAccum >= 0.5) {
        const fps = fpsFrames / fpsAccum;
        if (el.fps) el.fps.textContent = fps.toFixed(0);
        fpsAccum = 0;
        fpsFrames = 0;
      }
      if (el.clock) el.clock.textContent = clock;
      if (el.phase) {
        el.phase.textContent = phase;
        el.phase.className = `tag ${phaseClass(phase)}`;
      }
      if (el.timespeed) {
        el.timespeed.textContent = speed <= 0 ? '已暂停（T 恢复）' : `${speed}x（T 暂停 / [ ] 调整）`;
      }
      if (el.coord) el.coord.textContent = `${position.x.toFixed(0)}, ${position.z.toFixed(0)}`;
      if (el.viewName) el.viewName.textContent = viewName;
      if (el.objects) el.objects.textContent = objects;
      void speedIndex;
      void hour;
    },
    setViewHint(title, sub) {
      if (el.viewHint) el.viewHint.textContent = title;
      if (el.viewSub) el.viewSub.textContent = sub;
    }
  };
}
