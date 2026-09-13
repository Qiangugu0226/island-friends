// 键盘 / 鼠标输入。鼠标视角用 Pointer Lock，点击画面锁定，Esc 释放。
export function createInput(domElement) {
  const keys = new Set();
  const pressedOnce = new Set();
  const axis = { mouseDX: 0, mouseDY: 0, wheel: 0, locked: false };
  let onClickHandlers = [];

  const codeOf = (e) => e.code || e.key;

  window.addEventListener('keydown', (e) => {
    const code = codeOf(e);
    if (!keys.has(code)) pressedOnce.add(code);
    keys.add(code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(codeOf(e));
  });

  window.addEventListener('blur', () => keys.clear());

  domElement.addEventListener('mousedown', () => {
    if (!axis.locked && domElement.requestPointerLock) {
      domElement.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    axis.locked = document.pointerLockElement === domElement;
  });

  window.addEventListener('mousemove', (e) => {
    if (!axis.locked) return;
    axis.mouseDX += e.movementX || 0;
    axis.mouseDY += e.movementY || 0;
  });

  window.addEventListener(
    'wheel',
    (e) => {
      axis.wheel += e.deltaY;
      e.preventDefault();
    },
    { passive: false }
  );

  return {
    axis,
    isDown: (code) => keys.has(code),
    wasPressed: (code) => pressedOnce.has(code),
    consumeMouse() {
      const dx = axis.mouseDX;
      const dy = axis.mouseDY;
      axis.mouseDX = 0;
      axis.mouseDY = 0;
      return { dx, dy };
    },
    consumeWheel() {
      const w = axis.wheel;
      axis.wheel = 0;
      return w;
    },
    endFrame() {
      pressedOnce.clear();
    },
    onClick(handler) {
      onClickHandlers.push(handler);
    }
  };
}
