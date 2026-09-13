// 游戏时间：一天 = dayLengthSec 真实秒；档位由 world.json 的 time.speeds 决定
export function createTime(cfg) {
  const state = {
    hour: cfg.startHour ?? 9.5,
    day: 1,
    speedIndex: 1,
    speeds: cfg.speeds ?? [0, 1, 4, 12],
    dayLengthSec: cfg.dayLengthSec ?? 300
  };

  function advance(dt) {
    const speed = state.speeds[state.speedIndex] ?? 1;
    if (speed <= 0) return;
    const hoursPerSecond = 24 / state.dayLengthSec;
    state.hour += dt * hoursPerSecond * speed;
    while (state.hour >= 24) {
      state.hour -= 24;
      state.day += 1;
    }
  }

  function setSpeedIndex(i) {
    state.speedIndex = ((i % state.speeds.length) + state.speeds.length) % state.speeds.length;
  }

  function clockText() {
    const h = Math.floor(state.hour) % 24;
    const m = Math.floor((state.hour - Math.floor(state.hour)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return {
    state,
    advance,
    setSpeedIndex,
    clockText,
    setHour(h) { state.hour = ((h % 24) + 24) % 24; },
    get hour() { return state.hour; },
    get day() { return state.day; },
    get speed() { return state.speeds[state.speedIndex]; }
  };
}
