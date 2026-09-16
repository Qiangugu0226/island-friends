# 小岛朋友 Island Friends

一个低多边形卡通的乡村小岛探索游戏：通过「潜行接近 → 观察 → 投喂 → 对话」和动物建立信任，成为朋友，解锁它们的能力，一起探索整座小岛。

- 技术：Three.js + Vite（浏览器网页游戏，纯离线，零 API 成本）
- 类型：治愈系探索 / 慢节奏 / 无战斗无失败
- 单次游玩：20–30 分钟
- 美术：**全程序化生成**（几何 + 顶点色 + flatShading），当前不使用任何外部模型/贴图

## 跑起来

**方式一（推荐，双击即玩）**：双击项目根目录的 **`小岛朋友.html`** —— 单文件离线版，不需要服务器、不需要网址。
（如果这个文件不存在，双击 `启动游戏.cmd` 或运行 `npm run build:single` 生成它）

**方式二（开发用，带热更新）**：双击 **`启动游戏.cmd`**，等它显示地址后浏览器会自动打开（那个命令行窗口是服务器，别关）。

**方式三（命令行）**：

```bash
npm install
npm run dev          # 开发服务器（热更新）
npm run build:single # 生成单文件离线版 小岛朋友.html
npm run build        # 常规构建到 dist/
npm run test:input   # 自动测 W/A/S/D 四个方向对不对
```

## 操作

`WASD` 移动 · `Shift` 跑 · 鼠标转视角（点击画面锁定）· 滚轮缩放 · `V` 切换视角（跟随/全岛俯瞰/地面/**资产总览**）· `T` 暂停时间 · `[` `]` 时间速度 · `R` 回出生点 · `H` 隐藏 HUD

调试参数：`?view=` `?hour=` `?x=&z=` `?hud=0` `?dist=4.5` `?cam=x,y,z&look=x,y,z`（自由相机）`?timing=1` `?probe=1`

## 文档

| 文件 | 内容 |
| --- | --- |
| [`docs/01-game-spec.md`](docs/01-game-spec.md) | 游戏说明书 v0.1（玩法闭环、五大闭环、四只动物、设计原则、技术架构） |
| [`docs/02-art-direction.md`](docs/02-art-direction.md) | 画风方向（参考 Piggy Island）、三方案对比、色板、场景扩展建议 |
| [`docs/03-phased-plan.md`](docs/03-phased-plan.md) | 分阶段开发路线图 P0–P6 与每阶段验收点 |
| [`docs/04-p1-delivery.md`](docs/04-p1-delivery.md) | P1 交付说明：怎么跑、做了什么、截图、文件地图 |
| [`docs/05-versioning.md`](docs/05-versioning.md) | 版本管理约定（阶段 = 提交 + tag） |
| [`docs/06-setting-and-story.md`](docs/06-setting-and-story.md) | 背景故事与地方特色决策文档（三方案对比 + 故事框架） |
| [`docs/07-setting-bible.md`](docs/07-setting-bible.md) | 设定大纲（地点 / 人物 / 故事框架，内容暂不做） |
| [`docs/08-p1.5-delivery.md`](docs/08-p1.5-delivery.md) | **P1.5 交付说明**：渔村地方化做了什么、截图、待你验收的点 |

## 当前阶段

**P2 · 大黄 + 信任闭环 MVP —— ✅ 已交付，待你验收。**
一只动物（大黄/狗）跑通「发现线索 → 潜行接近 → 观察 → 投喂 → 好感度」：四态状态机（躲藏/警觉/吓跑/好奇）、三层线索（脚印羽毛草动 / 立体声狗叫 / 尾巴尖眼睛反光）、C 蹲行潜行、准星变金 + E 观察卡、F 投喂 + 好感度四档、程序化音效。
验收点见 `docs/09-p2-delivery.md`。

## 设定（已定）

| 项 | 决定 |
| --- | --- |
| 地点 | **中国东南沿海渔村小岛**（闽南 / 浙东 / 粤东一带取材，童话化渲染） |
| 岛名（暂定） | 半月屿 |
| 故事框架 | **暑假回乡的外壳 + 守岛人传说的里子**（内容暂不做，只立设定） |
| 详细设定 | `docs/07-setting-bible.md` |

## 版本管理

一个阶段 = 一个提交 + 一个附注 tag：`p0-design-locked` → `p1-walking-island` → `p1.5-local-flavor` → …
约定与命令见 [`docs/05-versioning.md`](docs/05-versioning.md)，变更记录见 [`CHANGELOG.md`](CHANGELOG.md)。

## 资产验收工具

| 工具 | 说明 |
| --- | --- |
| 游戏内按 `V` | 切换视角（跟随 / 全岛俯瞰 / 地面 / **资产总览**） |
| `?cam=x,y,z&look=x,y,z` | 自由相机，任意位置给某件资产拍特写 |
| `node tools/shoot.mjs 名称 "view=top"` | 可靠截图到 `shots/名称.png`，并打印控制台错误 |

## 已定方向

| 项 | 决定 |
| --- | --- |
| 画风 | A · Piggy Island 手绘低多边形（程序化低模 + 顶点色 + 渐变奶油天空 + 暖雾） |
| 操作 | WASD + 鼠标转视角 |
| 镜头 | 第三人称斜俯视跟随（俯角约 40°） |
| 平台 | 桌面浏览器优先 |

## 协作方式

一步步来：先把基础玩法与游戏闭环跑通，再丰富内容。每个阶段我交付「可运行版本 + 资产清单 + 截图 + 待确认项」，你验收通过后才打 tag 进下一步；任何地方你都可以介入、要求修改或提供素材。
