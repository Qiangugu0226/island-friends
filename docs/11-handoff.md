# 交接说明（换电脑 / 换 DSH 客户端必读）

> 这份文件是给**新会话的 AI**（和未来的你）看的：读完它就能接着干，不需要翻聊天记录。
> 最后更新：P5-9 之后。

---

## 0. 一句话现状

一个**纯程序化生成**的低多边形小岛探索游戏（Three.js + 浏览器），玩法是"走路探索 → 观察/喂食岛上动物 → 建立信任"。
美术方向已定为**手绘质感低多边形**，设定是**中国东南沿海渔村小岛**。
最新里程碑：tag **`p5.9-door-gate-mailbox`**，单文件离线版可直接玩。

## 1. 马上跑起来

```powershell
cd D:\DSH\Projects\1
npm install                 # 装 three / vite / puppeteer-core（首次或换电脑后）
npm run dev                 # 开发服务器（改代码自动刷新）
npm run build:single        # 生成 小岛朋友.html（单文件离线版，双击即玩）
```

- Node 需要 **22+**（开发时用的是 v24.15.0）。
- 自动化测试工具用**系统已装的 Edge/Chrome**，不下载浏览器。
- `小岛朋友.html` / `island-friends.html` 是 **gitignore** 的，换电脑后要重新 `build:single`。
- 别用 PowerShell 的 `Set-Content` 改源码：会把 UTF-8 中文写成乱码（踩过），且可能写进 BOM 让构建失败。
  改完可以跑 `node tools/check-bom.mjs` 兜一下。

## 2. 项目地图（改哪里）

| 目录/文件 | 作用 |
| --- | --- |
| `src/main.js` | 主循环、世界装配顺序、全部调试钩子 `window.__island` |
| `src/data/world.json` | **全部可调参数**：地形/配色/昼夜关键帧/散布数量/池塘/道路/建筑/道具/相机/玩家/色彩分级/接触阴影 |
| `src/data/animals.json` | 动物（大黄）的窝、信任半径、好感度、食物与刷新点 |
| `src/world/layout.js` | `heightAt()` 是唯一地形真值（地形网格、玩家行走、物件摆放都用它） |
| `src/world/terrain.js` / `ocean.js` / `scatter.js` | 地形 / 海面与浪花 / 树木石头野花（InstancedMesh） |
| `src/world/structures.js` | 石厝小院（院子/院门/信箱）、航标塔、土地庙、码头、道具摆放、碰撞与"占位"规则 |
| `src/world/assets.js` | **全部资产都是代码生成的几何体**（房子/塔/庙/码头/船/井/道具/植被/院墙） |
| `src/core/textures.js` | 7+1 张程序化 canvas 贴图（瓦垄/砌石/抹灰/红砖/木纹/稻草/暖夯土/草地） |
| `src/core/grade.js` / `contact-shadows.js` | P5-2：色彩分级后处理（含 FXAA）/ 接触阴影暗片 |
| `src/core/camera.js` | 第三人称相机（射线缩距避让、收快放慢、抬头抬高注视点） |
| `src/systems/collision.js` | 圆形 + 墙段（线段）+ 平台 的碰撞系统 |
| `src/entities/player.js` | 玩家移动/蹲行/贴地/卡住自救 |
| `src/systems/animal-ai.js` `affection.js` `clues.js` `bubbles.js` `audio.js` | P2 信任闭环：状态机、好感度、三层线索、气泡、程序化音效 |
| `src/dev/audit.js` | **自动穿模审计**（浮空/埋地/压路/压水边/物件重叠/路穿院子/零件悬浮/墙体悬空/墙网格错位/房门没对着院门/信箱位置不合理） |
| `tools/*.mjs` | 测试与出图工具，见下 |
| `docs/01..11` | 设计文档：玩法规格 / 美术方向 / 分阶段计划 / 各阶段交付记录 / 设定圣经 / 本文件 |

## 3. 验收与自动化（都要能跑）

```powershell
node tools/check-bom.mjs        # 源码不能带 BOM
node tools/audit.mjs            # 穿模审计（必须 0 问题）
node tools/test-collision.mjs   # 碰撞（墙/门洞/树/栈台）
node tools/test-trust.mjs       # P2 信任闭环 17 项
node tools/test-camera.mjs      # 相机（抖动/穿地/穿房子）
node tools/test-postfx.mjs      # 色彩分级与接触阴影（画面不能是全黑）
node tools/test-audit-guard.mjs # 护栏自测：把院墙下沉 1.05m 必须被抓到
node tools/shoot-fixes.mjs      # 池塘涉水/拾取物等修复项
node tools/shoot-doors.mjs      # 每栋石厝出一张"门—院门—信箱"核对图
node tools/probe-perf.mjs       # 四个机位的 draw call / 三角面 / 帧时间
node tools/probe-screen.mjs     # **把画面读成 ASCII 图**（视觉不可用时也能"看"场景）
node tools/probe-ground.mjs     # 院墙逐点测地（浮空/埋深）
node tools/probe-errors.mjs     # 页面加载不成功时打印报错与卡住的位置
```

**已知的红线**：draw call ≤ 2000/视角；60fps 桌面；贴图 256×256；粒子必须 instanced。

## 4. 调试入口（URL 参数 + 控制台钩子）

URL：`?hour=19`（时刻）· `?view=top`（视角）· `?hud=0`（隐藏 UI）· `?cam=x,y,z&look=x,y,z`（自由相机）·
`?preserve=1`（保留绘制缓冲，工具才能 readPixels）· `?grade=0`（关色彩分级）· `?shadows=0`（关接触阴影）·
`?sat=&contrast=&vignette=&warm=&cool=&exposure=&lift=`（实时调色）· `?debug=flat|wire` · `?hide=scatter,structures`

控制台：`window.__island.ready` · `pos()` `teleport()` `hitTest()` `wallsList()` `wallGates()` `padsInfo()` `audit()`
`dog()` `affection()` `feed()` `observe()` `setGrade()` `gradeInfo()` `renderStats()` `screenOf()` `setFreeCam()` …

## 5. 已完成 / 下一步

**已完成**：P0 方向定稿 → P1 能走的小岛 → P1.5 地方化（渔村设定） → P1.6~P1.8 摆位/穿模/道路 →
P2 信任闭环（观察→喂食→好感→朋友） → P2.1/P2.2 手感与相机 → **P5 美术打磨**：贴图 → 道具贴合 → 碰撞补全 →
院墙贴地 → 曲线院墙 → 院墙可见性抢修 → 四边院墙+暖夯土 → 色彩分级+接触阴影 → **门/院门/信箱对齐**。

**下一步（用户还没点单）**
1. **P3：朋友簿 + 对话 + 秘密线索 + 存档**（补齐玩法闭环，做完就是一版可以发出去的游戏）
2. P5 剩余：夜里窗灯+灯笼、萤火/光尘、灯塔旋转光束、植被风摆、动作曲线
3. 可选：院门收窄到 3m + 两侧门柱（现在是 5.2m 宽的大口子）

**发布计划**：先上 itch.io 收反馈（单文件 HTML 直接传），以后要上 Steam 用 Electron/Tauri 打包即可，代码不用重写。

## 6. 和用户协作的规矩（重要）

- 用户是**设计师、不写代码**：说人话，先说结论，数字要真实，别报"应该没问题"。
- **每个阶段 = 一个 commit + 一个 annotated tag**，并写进 `CHANGELOG.md`（格式见前几条）。
- **每做完一步都要给可运行版本 + 截图 + 诚实的数字**（`shots/` 下按阶段命名）。
- 用户要在每个环节都能介入：资产要给他看，不满意他能推翻重做（他确实推翻过：曲线院墙→四边、石砌→暖夯土）。
- 只做用户点单的事；顺手发现的问题要么一起修并说明，要么记录待办，别偷偷扩大范围。
- 视觉模型可能限流：此时用 `probe-screen.mjs`（ASCII 画面）+ 几何量测代替"看图"，并如实说明。

## 7. 环境事实（本机）

| 项 | 值 |
| --- | --- |
| 项目目录（workspace） | `D:\DSH\Projects\1` |
| DSH_HOME | `D:\DSH\.dsh`（`D:\DSH\start-dsh.bat` 里设置） |
| 会话存放 | `D:\DSH\.dsh\sessions\--D-DSH-Projects-1--\`（按 workspace 分桶，DSH_HOME 级共用） |
| Node / npm | v24.15.0 / 11.12.1 |
| git | 仓库已初始化，**无远程**；标签到 `p5.9-door-gate-mailbox` |
| 单文件产物 | `小岛朋友.html`（0.85MB，gitignore，需 `npm run build:single` 重建） |
