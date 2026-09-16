// 程序化音效（WebAudio，不需要任何音频文件）：狗叫 / 呜咽 / 开心哼叫
// 关键：用 StereoPanner 做左右定位，玩家能「听声辨位」（三层线索里的"中距离"线索）
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        enabled = false;
        return null;
      }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function noiseBuffer(duration = 0.2) {
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }

  // 一次短促的"汪"：噪声爆音 + 两个快速下滑的振荡器
  function bark(pan = 0, vol = 0.6, pitch = 1) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime;
    const out = c.createGain();
    out.gain.value = 0;
    const panner = c.createStereoPanner ? c.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner);
      panner.connect(master);
    } else {
      out.connect(master);
    }

    // 噪声层
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.16);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700 * pitch;
    bp.Q.value = 1.1;
    src.connect(bp).connect(out);

    // 音高层
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420 * pitch, t0);
    osc.frequency.exponentialRampToValueAtTime(150 * pitch, t0 + 0.14);
    const oscGain = c.createGain();
    oscGain.gain.value = 0.35;
    osc.connect(oscGain).connect(out);

    const peak = vol;
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);

    src.start(t0);
    osc.start(t0);
    src.stop(t0 + 0.24);
    osc.stop(t0 + 0.24);
  }

  // 呜咽（警觉/不安）
  function whine(pan = 0, vol = 0.35) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime;
    const out = c.createGain();
    const panner = c.createStereoPanner ? c.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner);
      panner.connect(master);
    } else {
      out.connect(master);
    }
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(760, t0);
    osc.frequency.linearRampToValueAtTime(520, t0 + 0.5);
    osc.connect(out);
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(vol, t0 + 0.08);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    osc.start(t0);
    osc.stop(t0 + 0.6);
  }

  // 开心（投喂成功）：两声上扬短叫
  function happy(pan = 0, vol = 0.5) {
    const c = ensure();
    if (!c) return;
    [0, 0.14].forEach((delay, i) => {
      setTimeout(() => {
        if (!ctx) return;
        const t0 = ctx.currentTime;
        const out = ctx.createGain();
        const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (panner) {
          panner.pan.value = Math.max(-1, Math.min(1, pan));
          out.connect(panner);
          panner.connect(master);
        } else {
          out.connect(master);
        }
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(i === 0 ? 680 : 880, t0);
        osc.frequency.exponentialRampToValueAtTime(i === 0 ? 980 : 1240, t0 + 0.1);
        osc.connect(out);
        out.gain.setValueAtTime(0.0001, t0);
        out.gain.exponentialRampToValueAtTime(vol * 0.5, t0 + 0.01);
        out.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
        osc.start(t0);
        osc.stop(t0 + 0.15);
      }, delay * 1000);
    });
  }

  return {
    bark,
    whine,
    happy,
    resume: () => ensure(),
    get ready() { return !!ctx && ctx.state === 'running'; }
  };
}
