// 把 dist-single 的 JS 内联进 HTML，产出一个双击即可玩的单文件
// 用法：npm run build:single
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const htmlPath = 'dist-single/index.html';
const jsPath = 'dist-single/app.js';

if (!existsSync(htmlPath) || !existsSync(jsPath)) {
  console.error('请先运行：npx vite build --config vite.config.single.js');
  process.exit(1);
}

let html = readFileSync(htmlPath, 'utf8');
const js = readFileSync(jsPath, 'utf8').replace(/<\/script/gi, '<\\/script');

// 去掉外链脚本标签，替换成内联（同时去掉 modulepreload）
// 注意：必须用「函数替换」，否则 JS 里的 $& / $' 会被 replace 当成替换模式，代码会被改坏
html = html
  .replace(/<link[^>]+rel="modulepreload"[^>]*>/gi, '')
  .replace(/<script[^>]*src="[^"]*app\.js"[^>]*><\/script>/gi, '')
  .replace(/<\/body>/i, () => `<script>\n${js}\n</script>\n</body>`);

const targets = ['小岛朋友.html', 'island-friends.html'];
for (const t of targets) writeFileSync(t, html, 'utf8');

const size = (Buffer.byteLength(html, 'utf8') / 1024 / 1024).toFixed(2);
console.log(`已生成单文件：${targets.join(' / ')}（${size} MB）—— 双击即可玩，不需要服务器`);
