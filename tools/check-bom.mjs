// 防呆检查：源码里有 BOM（EF BB BF）会让 vite 构建直接失败（历史上踩过两次）。
// 用法：node tools/check-bom.mjs   —— 有问题时退出码 1。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['src', 'tools', 'docs'];
const EXT = new Set(['.js', '.mjs', '.json', '.html', '.css', '.md']);
const SKIP = new Set(['node_modules', 'dist', '.git', 'shots', 'concepts']);

const bad = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (EXT.has(extname(name))) {
      const head = readFileSync(p).subarray(0, 3);
      if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) bad.push(p);
    }
  }
}
for (const r of ROOTS) {
  try {
    walk(r);
  } catch {
    /* 目录不存在就算了 */
  }
}
for (const f of ['index.html', 'package.json', 'vite.config.js', 'vite.config.single.js']) {
  try {
    const head = readFileSync(f).subarray(0, 3);
    if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) bad.push(f);
  } catch {
    /* 没这个文件就算了 */
  }
}

if (bad.length) {
  console.log('❌ 这些文件带 BOM（会让 vite 构建失败）：');
  for (const f of bad) console.log('   ' + f);
  console.log('\n清理：把文件前 3 个字节 EF BB BF 删掉（不要用 PowerShell 的 Set-Content 写源码）');
  process.exit(1);
}
console.log('✅ 没有 BOM 的文件');
