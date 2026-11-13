# Pagekin 自由画布思维导图 P0 · 开发台账与环境约束记录

- 日期：2026-11-13（UTC+8）
- 仓库：`lucusHU/Pagekin`（fork 自留；上游 `EthanYoQ/Pagekin`，GPL-3.0，不向上游提 PR）
- 分支：`feat/canvas-mindmap`
- 本地 HEAD：`9293926dc241c5d41c027fb5f8f2fcdd07e25dae`（S1：接入 React Flow 引擎并起最小画布页面）
- 远端 HEAD：`b5cfc22809c123e2c47f54f8398ea3c11fb9c8f1`
- 参照文档：`docs/plans/canvas-mindmap-p0.md`、`docs/adr/0029-canvas-mindmap-engine-and-draft-layer.md`

## 证据规则

- 本台账只记录在本仓真实跑过的检查：命令、退出码、通过/失败用例数；**未运行的检查不写成通过**。
- 工作区可能存在并行切片的未提交 WIP；每条结论标注其归因范围（已提交 HEAD / 含并行 WIP 的工作区）。
- 本轮（线 F）只建台账：不改业务源码与共享接线文件，不装依赖，不 commit、不 push。

---

## 1. S1 基线与画布引擎接入 · 真实检查记录

检查时点工作区备注：除 S1 已提交内容外，检出并行切片 WIP——
- `M src/shared/canvas-schema.ts`（`DocTreeNode` 改为 type-only 再导出）
- `?? src/shared/doc-tree.ts`（未跟踪）
- `?? docs/plans/canvas-doc-tree-contract.md`（未跟踪）
- `?? docs/research/canvas-reuse-inventory.md`（未跟踪）

以上均非本轮（线 F）改动；本轮唯一新建文件为 `docs/dev-notes.md`。

### 1.1 静态检查与 i18n

复核复跑（2026-11-13 22:10 前后，含并行 WIP 的工作区）：

| 检查项 | 命令 | 真实结果 | 退出码 | 归因与备注 |
|---|---|---|---|---|
| 类型检查 | `pnpm run typecheck`（`tsc --noEmit`） | 零错误；tsc 无诊断输出 | 0 | 复跑通过 |
| Lint | `pnpm run lint`（`eslint . --ext ts,tsx,mjs --report-unused-disable-directives --max-warnings 0` && `node scripts/check-color-literals.mjs`） | eslint 无告警/错误输出；`check-color-literals: 通过` | 0 | 复跑通过 |
| i18n 覆盖 | `pnpm run check:i18n`（`node scripts/check-i18n-coverage.mjs`） | 通过：`i18n coverage check passed: no unlocalized renderer or main-boundary copy` | 0 | 复跑通过；首跑失败轨迹见下，属并行 S2 WIP 的修复 |

**证据轨迹 · 首跑（2026-11-13 晚，修复前）**

首跑 `check:i18n` 失败，exit 1，脚本原始输出：

```
Found 4 unlocalized visible strings:
src/shared/doc-tree.ts:89  [thrown-error] `资料树${label}无效`
src/shared/doc-tree.ts:94  [thrown-error] `资料树${label}无效`
src/shared/doc-tree.ts:106 [thrown-error] `资料树${label}无效`
src/shared/doc-tree.ts:142 [thrown-error] '资料树节点不能自连'
```

- 失败归因：4 条中文抛错文案全部位于未跟踪并行 WIP 文件 `src/shared/doc-tree.ts`；`git grep "资料树\|不能自连" HEAD -- src/ electron/` 仅命中已提交 `src/shared/canvas-schema.ts` 第 32 行注释，上述文案不在 S1 已提交代码中——**是并行 S2 合同 WIP 的问题，不是 S1 已提交代码的问题**。
- 修复方式（线 A 完成，非线 F 改动）：4 个抛错辅助函数在声明行补 `// i18n-exempt:` 注释；豁免理由沿用 `src/shared/plot-tree.ts` 既有惯例（资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉，作者看不到这条说明）。
- 修复后复跑：`check:i18n` exit 0；`typecheck` exit 0；eslint exit 0（原始输出见上表）。

### 1.2 相关单测（只跑相关文件，未跑全量）

执行方式：`npx vitest run <具体文件...>`（等价于计划中的 `vitest run <相关文件>`）；vitest 4.1.12。

| 测试文件 | 用例数 | 结果 |
|---|---:|---|
| `src/shared/__tests__/plot-outline-contract.test.ts` | 56 | passed |
| `src/shared/__tests__/plot-tree-generation-pure.test.ts` | 26 | passed |
| `src/shared/__tests__/relationship-presentation.test.ts` | 8 | passed |
| `src/shared/__tests__/relationship-identity.test.ts` | 3 | passed |
| `electron/repositories/__tests__/plot-tree-repository.test.ts` | 17 | passed |
| `electron/repositories/__tests__/chapter-deletion-repository.test.ts` | 2 | passed |
| **合计** | **112** | **6 文件全部通过，0 失败，退出码 0** |

分批记录：
- 第一批（共享层 4 文件）：93 passed，退出码 0，Duration 12.65s。
- 第二批（仓库层 2 文件）：19 passed，退出码 0，Duration 17.06s。

复核复跑：同一批 6 个文件再次 `npx vitest run`，112 passed（各文件用例数与首跑一致，无变化），退出码 0，Duration 23.08s。

### 1.3 未运行项及原因

- **全量 `vitest run`：未运行。** 原因：既有 legacy 用例挂起；后续只跑与改动相关的单测文件。
- **浏览器/Storybook 用例**（`test:browser`、`build-storybook`）：未运行；云端无头环境不做窗口与浏览器实测。
- **画布目录单测**：`src/components/stage/canvas/` 下当前仅有 `StageCanvas.tsx`、`canvas.css`，无测试文件；S1 未补单测。
- `src/__tests__/theme-text-contrast.test.ts` 未纳入本轮：全仓检索命中的 "canvas" 为通用画布底色语义（旧关系图谱标签对比度用例），不在本轮划定的三个测试目录内。
- 旧 `RelationshipGraph` 相关回归：仅跑上述 relationship 两个共享层用例；窗口内视觉行为未测（见第 2 节无头限制）。

### 1.4 S1 已落地依赖（node_modules 实测版本）

| 依赖 | package.json 声明 | 已安装版本 |
|---|---|---|
| `@xyflow/react` | `^12.12.1` | 12.12.1 |
| `dagre` | `^0.8.5` | 0.8.5 |
| `@types/dagre` | `^0.7.54` | 0.7.54 |

---

## 2. 环境约束

### 2.1 运行时与包管理器

| 项 | 实测/记录 |
|---|---|
| Node | `v22.23.2` |
| pnpm（PATH 调用） | `pnpm -v` = **11.11.0**（自举版本） |
| pnpm 全局包目录元数据 | 11.7.0（`/opt/vm/preinstall/npm-global/lib/node_modules/pnpm`） |
| 版本坑 | 本仓在 pnpm 11.11.0 下做**非 frozen** 依赖解析会停滞；须用全局 11.7.0；`--frozen-lockfile` 安装正常。本轮未执行 `pnpm install`。 |
| 本轮脚本执行 | `pnpm run typecheck / lint / check:i18n` 均未触发依赖解析停滞；pnpm 仅输出 "Already up to date" 后执行脚本。 |

### 2.2 云端无头环境限制清单（留本机或 GitHub Actions CI 补测）

| 事项 | 云端状态 | 补测位置 |
|---|---|---|
| Electron 窗口行为：最小画布页面真实加载、节点拖拽/视口缩放/连线目视 | 未实测（无头环境不开窗口） | 本机 Electron 实机或 CI 桌面会话 |
| `better-sqlite3 ^13.0.3` 原生模块完整运行验证 | 未做全量原生模块运行验证；本轮仓库层相关单测在当前 node_modules 下可运行通过（19 用例），不等同于原生模块全量验证 | 本机或 GitHub Actions CI |
| `@lancedb/lancedb 0.22.3` 原生模块运行 | 未验证 | 本机或 GitHub Actions CI |
| Windows 打包（`electron-builder --win --x64`、`smoke:win-*` 系列脚本） | 未执行 | 本机 Windows 或 GitHub Actions CI |

### 2.3 装包纪律

- 不得私自 `apt` / `pip` 装包或下载外部软件。
- 确需安装时：先说明用途、风险，征得同意后再执行；本轮未安装任何依赖。

---

## 3. 推送通道现状

### 3.1 现状（2026-11-13 晚已打通）

- **git 写凭据已配置**：`credential.helper=store`，凭据存本机 `~/.git-credentials`（600 权限），不在仓库内、不进提交记录；PAT 为 `repo` scope，身份 `lucusHU`。
- **本地与远端一致**：分支 `feat/canvas-mindmap` HEAD `6bcb9733c4052b51dc0cc07014fdcce7566d98fa`；`pnpm-lock.yaml` 已随 S1 commit 推上远端，含 xyflow/dagre 条目，`--frozen-lockfile` 可过。
- 后续切片直接 `git push origin feat/canvas-mindmap`；仅在需要覆盖分叉历史时用 `--force-with-lease`。
- 安全纪律：不回显 token；旧无效 token 已在 GitHub 侧撤销；不把凭据写入仓库文件。

### 3.2 推送备忘

1. 推送前 `git status` 区分归属，不混入无关 WIP；
2. 确认 `pnpm-lock.yaml` 与 `package.json` 一致；
3. 推送后核对远端 HEAD 与本地一致（`git ls-remote` / `git rev-parse`）。

---

## 4. 切片出口预留位（S2–S6）

切片划分对照 `docs/plans/canvas-mindmap-p0.md`。每节在对应切片完成后填写真实结果；未运行项必须写明原因，不得填「通过」。

### 4.1 S2 资料树

范围：`DocTreeNode` 合同 + `doc_tree` 快照存储 + 侧栏树 UI：CRUD、拖拽排序与层级缩进、软删除/恢复；复用章节回收站软删除模式（ADR-0025），不复用章节回收站代码。

落点：`electron/migrations/m09-doc-tree-snapshot.ts`（M09，schema 9→10）、`electron/repositories/doc-tree-repository.ts`、`src/stores/canvas-store.ts`（资料树会话态）、`src/services/canvas/doc-tree-service.ts`、`src/components/stage/canvas/`（`DocTreeSidebar.tsx`、`use-doc-tree.ts`、`doc-tree-view.ts`、`doc-tree-errors.ts`）。落地决定见 `docs/plans/canvas-doc-tree-contract.md` 第 6 节。

| 检查命令 | 真实结果（退出码 / 用例数） | 未运行项与原因 |
|---|---|---|
| `pnpm run typecheck`（`tsc --noEmit`，直接跑 `node_modules/.bin/tsc`） | 退出码 0；无诊断输出；耗时约 52s。注：`pnpm exec tsc --noEmit` 在本机只打印 pnpm 自身耗时（约 0.6s）而不透传诊断，故以直接调用二进制的结果为准 | — |
| `pnpm run lint` | 退出码 0；eslint 无告警（首跑 1 条 `react-hooks/exhaustive-deps`，`nodes` 改 `useMemo` 后清零）；`check-color-literals: 通过` | — |
| `pnpm run check:i18n` | 退出码 0；`i18n coverage check passed`。首跑失败 1 条：`DocTreeSidebar.tsx` 的 `... damaged entries are hidden.` 被判 `english-plural`，改为 `Damaged: ${n}` 后通过 | — |
| `vitest run src/shared/__tests__/doc-tree.test.ts` | 10 passed，退出码 0 | — |
| `vitest run electron/repositories/__tests__/doc-tree-repository.test.ts` | 11 passed，退出码 0，12.26s | — |
| `vitest run src/components/stage/canvas/__tests__/doc-tree-view.test.ts` | 5 passed，退出码 0 | — |
| `vitest run` 迁移相关 5 文件（runner / m05–m08 installed-lane） | 60 passed，退出码 0 | 改动 M09 后既有断言同步更新（lane 清单、pinned 版本 9→10、m08 两条用例目标版本） |
| **S2 合计新增/相关用例** | **86 passed，0 失败**（26 新用例 + 60 迁移回归） | Electron 窗口内拖拽/折叠/主题观感未实测（无头环境，留本机或 CI） |

### 4.2 S3 画布快照与节点/边 CRUD

范围：`CanvasNode` / `CanvasEdge` / `CanvasSnapshot` 合同 + `canvas-repository` + 快照读写 IPC；React Flow 渲染现有快照；节点/边新建、改名、删除；自由拖拽、缩放、小地图。

| 检查命令 | 真实结果（退出码 / 用例数） | 未运行项与原因 |
|---|---|---|
| `pnpm run typecheck` |  |  |
| `pnpm run lint` |  |  |
| `pnpm run check:i18n` |  |  |
| `vitest run <S3 相关测试文件>` |  |  |

### 4.3 S4 画布编辑操作

范围：多选、复制节点、复制样式、锁定；撤销/重做历史栈；dagre 一键整理；节点数/字数状态栏。

| 检查命令 | 真实结果（退出码 / 用例数） | 未运行项与原因 |
|---|---|---|
| `pnpm run typecheck` |  |  |
| `pnpm run lint` |  |  |
| `pnpm run check:i18n` |  |  |
| `vitest run <S4 相关测试文件>` |  |  |

### 4.4 S5 AI 浮层与节点提案

范围：AI 面板挂回画布入口；@ 菜单数据源；节点展开/扩写/改写提案走候选卡片；提案先候选、确认后落快照；取消/身份校验/切项目拒绝对齐现有 generation 链路。

| 检查命令 | 真实结果（退出码 / 用例数） | 未运行项与原因 |
|---|---|---|
| `pnpm run typecheck` |  |  |
| `pnpm run lint` |  |  |
| `pnpm run check:i18n` |  |  |
| `vitest run <S5 相关测试文件>` |  |  |

### 4.5 S6 文本应用链路与收尾

范围：文本修改提案接 diff-match-patch 逐条确认；原稿进版本历史；剔除项核查；新文案中英双语；补齐 vitest 单测与 Storybook 节点示例。

| 检查命令 | 真实结果（退出码 / 用例数） | 未运行项与原因 |
|---|---|---|
| `pnpm run typecheck` |  |  |
| `pnpm run lint` |  |  |
| `pnpm run check:i18n` |  |  |
| `vitest run <S6 相关测试文件>` |  |  |

## 5. S2 补充记录

- **共享接线（由主集成者本人改，未派生并行线）**：`electron/migrations/registry.ts`（M09 槽位、`LATEST_SCHEMA_VERSION=10`）、`electron/migrations/desktop-registry.ts`（M09 安装、指纹集、`CURRENT_DESKTOP_SCHEMA_VERSION=10`）、`src/shared/project-storage.ts`（`MIGRATION_IDS` 加 M09）、`src/shared/ipc-channels.ts`（8 条资料树通道）、`src/services/ipc-client.ts`（`doc-tree:` 进项目会话范围）、`src/components/stage/canvas/StageCanvas.tsx`（左树右画布布局）。`editor-store.ts`、`StageWorkspace.tsx`、`stage-progress.ts` 未改：`canvas` 标签 S1 已进联合类型，侧栏挂在画布页内。
- **生成链路最小改动**：`electron/services/generation-source-binding.ts` 与 `electron/services/main-generation-owner.ts` 的 `project_core` 排除名单各加 `doc_tree_snapshot`，与 `plot_tree_snapshot` 同口径，避免派生树快照混进生成来源与 baseline 哈希。业务语义未变。
- **旧星图未动**：`src/components/editor/RelationshipGraph.tsx` 及其 layout 无改动。
- **依赖未新增**：`react-complex-tree`、`nanoid` 均未安装；理由见合同第 6 节第 7 条。`pnpm-lock.yaml` 不变。
- **幂等迁移**：M09 先查 `PRAGMA table_info(project_core)`，列已在则跳过，避免旧库经 M00 补列后再 `ALTER` 报重复列。
