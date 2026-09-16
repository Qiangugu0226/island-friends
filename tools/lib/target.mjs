// 统一的"游戏入口"解析：优先用开发服务器，服务器不在就退回单文件离线版
// 环境变量：GAME_URL 直接指定；SHOOT_PORT 指定开发服务器端口；USE_FILE=1 强制用单文件
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export async function pickTarget() {
  if (process.env.GAME_URL) return { kind: 'url', url: process.env.GAME_URL };

  if (process.env.USE_FILE !== '1') {
    const port = process.env.SHOOT_PORT ?? '5173';
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return { kind: 'http', url: `http://127.0.0.1:${port}/` };
    } catch {
      /* 服务器不在，退回单文件 */
    }
  }

  const file = resolve('小岛朋友.html');
  if (!existsSync(file)) {
    throw new Error('开发服务器没在运行，也找不到 小岛朋友.html —— 先执行 npm run build:single');
  }
  return { kind: 'file', url: `file:///${file.replace(/\\/g, '/')}` };
}

export const BROWSER_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--allow-file-access-from-files',
  '--hide-scrollbars'
];

export function browserPath(candidates) {
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('找不到 Edge/Chrome 可执行文件');
  return found;
}
