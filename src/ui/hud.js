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
    viewSub: document.getElementById('view-sub'),
    // P2
    crosshair: document.getElementById('crosshair'),
    prompt: document.getElementById('prompt'),
    affection: document.getElementById('affection'),
    affAv: document.getElementById('aff-av'),
    affName: document.getElementById('aff-name'),
    affLevel: document.getElementById('aff-level'),
    affBar: document.getElementById('aff-bar'),
    affTip: document.getElementById('aff-tip'),
    inventory: document.getElementById('inventory'),
    invSlots: document.getElementById('inv-slots'),
    observeCard: document.getElementById('observe-card'),
    cardAv: document.getElementById('card-av'),
    cardName: document.getElementById('card-name'),
    cardSpecies: document.getElementById('card-species'),
    cardState: document.getElementById('card-state'),
    cardBody: document.getElementById('card-body'),
    cardQuote: document.getElementById('card-quote'),
    cardAff: document.getElementById('card-aff'),
    cardLike: document.getElementById('card-like'),
    toasts: document.getElementById('toasts')
  };

  const phaseClass = (phase) => {
    if (phase === '夜晚') return 'night';
    if (phase === '黄昏' || phase === '黎明' || phase === '傍晚') return 'dusk';
    return '';
  };

  let fpsAccum = 0;
  let fpsFrames = 0;
  // P2：避免每帧重写 DOM
  let crosshairGold = null;
  let crosshairText = null;
  let lastInventoryHtml = '';
  let lastToastsHtml = '';

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
    },

    // ---------- P2 ----------
    setCrosshair({ observable, canFeed }) {
      if (!el.crosshair) return;
      const gold = observable || canFeed;
      if (gold !== crosshairGold) {
        crosshairGold = gold;
        el.crosshair.classList.toggle('gold', gold);
      }
      let text = '';
      if (canFeed) text = 'E 观察 · F 投喂';
      else if (observable) text = 'E 观察';
      if (text !== crosshairText) {
        crosshairText = text;
        if (el.prompt) {
          el.prompt.textContent = text;
          el.prompt.classList.toggle('show', !!text);
        }
      }
    },

    updateAffection({ visible, name, emoji, level, value, max, tip }) {
      if (!el.affection) return;
      if (el.affection.hidden === visible) el.affection.hidden = !visible;
      if (!visible) return;
      if (el.affName) el.affName.textContent = name;
      if (el.affAv) el.affAv.textContent = emoji;
      if (el.affLevel) el.affLevel.textContent = `${level.name} · ${Math.round(value)} / ${max}`;
      if (el.affBar) el.affBar.style.width = `${Math.round((value / max) * 100)}%`;
      if (el.affTip) el.affTip.textContent = tip;
    },

    updateInventory(list, selected, visible) {
      if (!el.inventory) return;
      if (el.inventory.hidden === visible) el.inventory.hidden = !visible;
      if (!visible) return;
      const icons = { bone: '🦴', fish: '🐟', seed: '🌻', weed: '🌿' };
      const html = list
        .map(
          (f, i) =>
            `<div class="slot ${selected === f.id ? 'sel' : ''} ${f.count <= 0 ? 'empty' : ''}">` +
            `<div class="ic">${icons[f.id] ?? '🍽'}</div>` +
            `<div class="nm2">${f.name}</div>` +
            `<div class="cn">${f.count} · 按 ${i + 1}</div></div>`
        )
        .join('');
      if (html !== lastInventoryHtml) {
        lastInventoryHtml = html;
        el.invSlots.innerHTML = html;
      }
    },

    updateToasts(toasts) {
      if (!el.toasts) return;
      const html = toasts
        .map((t) => {
          const fade = t.age > t.life - 0.6 ? 'opacity:0;' : 'opacity:1;';
          return `<div class="t" style="color:${t.color};${fade}transition:opacity .4s ease">${t.text}</div>`;
        })
        .join('');
      if (html !== lastToastsHtml) {
        lastToastsHtml = html;
        el.toasts.innerHTML = html;
      }
    },

    updateObserveCard(data) {
      if (!el.observeCard) return;
      el.observeCard.hidden = false;
      if (el.cardAv) el.cardAv.textContent = data.emoji;
      if (el.cardName) el.cardName.textContent = data.name;
      if (el.cardSpecies) el.cardSpecies.textContent = data.species;
      if (el.cardState) {
        el.cardState.textContent = data.stateText;
        el.cardState.className = `chip ${data.state === 'flee' ? 'flee' : data.state === 'alert' ? 'alert' : 'calm'}`;
      }
      if (el.cardBody) el.cardBody.textContent = data.body;
      if (el.cardQuote) el.cardQuote.textContent = data.quote;
      if (el.cardAff) el.cardAff.textContent = Math.round(data.affection);
      if (el.cardLike) el.cardLike.textContent = data.likeFood;
    },

    hideObserveCard() {
      if (el.observeCard) el.observeCard.hidden = true;
    },

    get observeCardOpen() {
      return el.observeCard ? !el.observeCard.hidden : false;
    }
  };
}
