import { defineConfig } from 'vite';

// 单文件离线构建：把 JS 全部内联进一个 HTML，双击即可用（file:// 也能跑）
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-single',
    target: 'es2019',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]'
      }
    }
  }
});
