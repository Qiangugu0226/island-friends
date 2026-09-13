# 版本管理约定（每阶段验收都用它）

这个仓库的规矩很简单：**一个阶段 = 一个提交 + 一个 tag**。你验收哪个 tag，就等于验收了那个阶段的全部内容；不满意就回退到上一个 tag。

---

## 1. 分支与提交

| 项 | 约定 |
| --- | --- |
| 主分支 | `main`（始终是"你已验收过的最新状态"） |
| 提交信息 | `[Pn] 一句话说明` —— 例：`[P2] 大黄状态机 + 蹲伏潜行 + 观察卡` |
| 提交粒度 | 一个阶段结束时提交一次；阶段内的碎改动可以随时提交，但都标 `[Pn]` |

## 2. Tag（阶段锚点）

| tag | 对应阶段 | 含义 |
| --- | --- | --- |
| `p0-design-locked` | P0 | 说明书 + 画风方向 + 路线图 + 概念图定稿 |
| `p1-walking-island` | P1 | 能走路的小岛（地形/海/植被/建筑/玩家/昼夜/资产总览） |
| `p2-trust-loop` | P2 | 大黄 + 信任闭环 MVP（潜行、观察、投喂、好感度）——待创建 |
| `p3-full-loop` | P3 | 朋友簿 + 对话 + 秘密线索 + 存档——待创建 |
| `p4-four-animals` | P4 | 四只动物 + 动物小队 + 时间天气——待创建 |
| `p5-polish` | P5 | 内容与打磨——待创建 |
| `v1.0.0` | P6 | 发布版 |

tag 用**附注标签**（带说明），方便你 `git show p1-walking-island` 看到"这一版交付了什么"。

## 3. 你常用的几条命令

```bash
git log --oneline --decorate          # 看所有阶段与 tag
git show p1-walking-island            # 看某个阶段交付了什么（含说明）
git diff p1-walking-island..HEAD --stat   # 从某阶段到现在的改动概览
git checkout p1-walking-island        # 回到那一版看看（看完记得 git switch main）
git revert <commit>                   # 撤销某次提交（保留历史，安全）
```

> 想直接回退整棵工作区到某个阶段：`git switch -c tmp p1-walking-island`（开个临时分支，不动 main）。

## 4. 每次阶段验收，我会给你

1. **一个 tag**（例：`p2-trust-loop`）+ 该 tag 的说明
2. **`CHANGELOG.md` 新增条目**：这一阶段做了什么、改了什么、已知问题
3. **`shots/` 里的截图**：按阶段命名，方便和上一版对比
4. **`docs/` 里的阶段交付说明**（如 `04-p1-delivery.md`）
5. 你点头后我才开始下一阶段，并在下一个 tag 上继续

## 5. 截图命名规范（方便对比同一视角）

```
shots/p1-overview.png        全岛俯瞰
shots/p1-hero.png            村子中心
shots/p1-gallery.png         资产总览
shots/p2-dog-hide.png        P2 的"大黄躲藏"画面
```

同一视角在不同阶段的截图，**文件名前半段保持一致**（`overview` / `hero` / `gallery`），这样你把两张图并排就能看出变化。

## 6. 仓库位置与身份

- 仓库：`D:\DSH\Projects\1`（本地 git，**没有**推到任何远端）
- 提交身份：本仓库本地配置（见 `git config user.name`），要改成你自己的名字/邮箱：
  ```bash
  git config user.name "你的名字"
  git config user.email "你的邮箱"
  ```
- 想推到 GitHub 等远端：先建空仓库，再
  ```bash
  git remote add origin <你的仓库地址>
  git push -u origin main --tags
  ```

## 7. 什么进仓库、什么不进

| 进仓库 | 不进仓库（见 `.gitignore`） |
| --- | --- |
| `src/`、`index.html`、`vite.config.js`、`package.json`、`package-lock.json` | `node_modules/` |
| `docs/`、`shots/`、`concepts/`、`CHANGELOG.md` | `dist/` 构建产物 |
| `启动游戏.cmd` 等启动脚本 | `*.log` 日志 |
