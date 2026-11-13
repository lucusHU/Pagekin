# 承接快照 · Pagekin 自由画布思维导图（接 S2）

> 用途：新对话开工前先读本文件，再按「启动步骤」核对仓库现状。本快照不依赖对话历史；仓库内文档为准。
> 最近更新：2026-11-13（UTC+8）。

## 1. 一句话现状

fork 自留仓库 `lucusHU/Pagekin`，分支 `feat/canvas-mindmap`；**S1（React Flow 引擎接入 + 最小画布）** 与 **阶段 0（S2 资料树合同 + 复用调研 + 开发台账）** 已完成并推远端。下一步是 **S2 资料树实现**。

## 2. 环境与仓库

| 项 | 值 |
|---|---|
| VM 仓库路径 | `/home/user/Doubao/chats/38453600587724546/projects/Pagekin` |
| 上游 | `EthanYoQ/Pagekin`（GPL-3.0，默认分支 `master`）；**不向上游提 PR** |
| 分支 | `feat/canvas-mindmap` |
| HEAD（本地=远端） | `6bcb9733c4052b51dc0cc07014fdcce7566d98fa` |
| git 身份 | `lucusHU` / `2414154422@qq.com` |
| 推送通道 | 已打通：`credential.helper=store`，凭据在本机 `~/.git-credentials`（600 权限，不在仓库内）；直接 `git push origin feat/canvas-mindmap`。token 不回显、不进提交记录；旧无效 token 已撤销 |
| Node / pnpm | Node v22.23.2；pnpm 自举 11.11.0 做**非 frozen** 依赖解析会停滞，须用全局 11.7.0；`--frozen-lockfile` 正常 |
| 云端无头限制 | Electron 窗口行为、better-sqlite3 / LanceDB 原生模块运行、Windows 打包留本机或 CI 补测；云端只保证静态检查与相关单测 |

### 检查命令（只记录真实跑过的结果，未运行不得写通过）

- 类型检查：`pnpm exec tsc --noEmit`
- Lint：`pnpm run lint`（eslint `--max-warnings 0` + 颜色字面量检查）
- i18n：`pnpm run check:i18n`（`node scripts/check-i18n-coverage.mjs`）
- 单测：`npx vitest run <相关测试文件>`；全量 vitest 有 legacy 用例挂起，**只跑相关文件**

## 3. 硬边界（不可破）

- **画布是作者主动草稿层，不得成为第二套项目事实源**；与 ADR-0014 派生剧情树单向引用（`refs` / `chapterRefs`），不互相复制内容，不反写大纲/蓝图/线索/定稿事实。
- 只引入 **MIT** 依赖；tldraw 4.0+ 为 source-available，已排除，不进依赖树。
- 旧只读星图 `src/components/editor/RelationshipGraph.tsx` 及其 layout **禁止改动**。
- AI 产出先出候选卡片，作者确认后落库；不直接改图、不覆盖原稿。
- 复用优先：先确认书童已有可复用模块，缺口才自写；借鉴开源示例须保留 MIT 版权头。
- 不提交 API Key / Token / 完整小说正文 / 私人路径 / 个人信息。
- 未经允许不 `apt` / `pip` 装包或下载外部软件。

## 4. 已完成产物（仓库内路径）

### S1 · 引擎接入

- `src/shared/canvas-schema.ts`：画布节点/边/快照类型；`DocTreeNode` 已改为 type-only 再导出到 `./doc-tree`。
- `src/components/stage/canvas/StageCanvas.tsx` + `canvas.css`：只读示例节点/父子连线、Background 点阵、Controls、fitView。
- 接线：`src/stores/editor-store.ts`（`canvas` 进 type 联合与项目白名单）、`src/components/stage/StageWorkspace.tsx`（TabContent 分发）、`src/stores/navigation/stage-progress.ts`（位置映射）。
- 依赖：`@xyflow/react ^12.12.1`、`dagre ^0.8.5`、`@types/dagre ^0.7.54`（均 MIT）。

### 阶段 0 · 合同 / 调研 / 台账

- `src/shared/doc-tree.ts`：`DocTreeNode` / `DocTreeSnapshot` / `DocTreeEntityRef` 单向引用联合类型；双断言器（`assertStoredDocTreeSnapshot` 离线结构校验、`assertDocTreeSnapshot` 来源比对 + 悬空引用检测）；乐观锁复用剧情树 `isPlotTreeSourceRevision`，未复刻第二份。
- `docs/plans/canvas-doc-tree-contract.md`：S2 仓储方法签名、IPC 通道预留（`db:doc-tree-*` / `doc-tree:trash-*`，未改 `ipc-channels.ts`）、侧栏会话状态字段、边界复核。
- `docs/research/canvas-reuse-inventory.md`：react-complex-tree 2.6.4（MIT, Lukas Bach）、xyflow/dagre/nanoid License 与 API 落点；本仓可复用模块定位表；rct × React 19 / Tailwind 4 兼容待 S2 实测。
- `docs/dev-notes.md`：真实检查记录、环境约束、S2–S6 出口预留位。

### 既有参照模式（先 Read 再仿，不另造框架）

- 快照：`electron/repositories/plot-tree-repository.ts` + `src/shared/plot-tree.ts`（`project_core` JSON 列、断言器、sha256 `sourceRevision`）。
- 软删除：`electron/repositories/chapter-deletion-repository.ts`、`src/components/stage/trash/`、`src/shared/chapter-deletion.ts`（ADR-0025；复用模式，不复用代码）。
- 列表/树/知识库 UI：`src/components/stage/knowledge/`、`plot/`、`library/`。
- 提案卡片 / diff：现有 `ConfirmCard` / `DomainProposalDiff` / diff-match-patch。
- 方案与边界：`docs/adr/0029-canvas-mindmap-engine-and-draft-layer.md`、`docs/plans/canvas-mindmap-p0.md`。

## 5. 切片计划与下一步

| 切片 | 状态 | 范围与出口 |
|---|---|---|
| S1 引擎接入 | ✅ 完成并推远端 | 见上 |
| 阶段 0 合同/调研/台账 | ✅ 完成并推远端 | 见上 |
| **S2 资料树** | 🔜 下一步 | `DocTreeNode` 落地；`doc_tree` 快照存储 + 侧栏树 UI：CRUD、拖拽排序、层级缩进、软删除/恢复。装 `react-complex-tree 2.6.4`、`nanoid 6.0.2`（均 MIT）。出口：树增删改、软删可恢复；相关单测过 |
| S3 画布快照与节点/边 CRUD | ⬜ | 合同 + `canvas-repository` + 快照读写 IPC；React Flow 渲染快照；节点边增删改；自由拖拽/缩放/小地图 |
| S4 编辑操作 | ⬜ | 多选/复制/复制样式/锁定；轻量 undo-redo 栈；dagre 一键整理（只回写坐标不动结构）；节点数/字数状态栏 |
| S5 AI 浮层与节点提案 | ⬜ | 面板挂画布入口；@ 菜单聚合节点+父链+兄弟+关联角色/章节；展开/扩写/改写走候选卡片；确认落快照；取消/身份校验/切项目拒绝对齐现有 generation 链路 |
| S6 文本应用与收尾 | ⬜ | 文本提案接 diff-match-patch 逐条确认；原稿进版本历史；剔除项核查；中英双语；补单测与节点示例 |

### S2 待决项（阶段 0 遗留，实现前先定）

1. `sourceRevision` 对权威实体字段的哈希口径（角色 roster `factHash` 是否纳入）。
2. 软删除子树连带策略；是否需要 `deletionId` 分组句柄。
3. 旧项目姓名版角色无稳定 `characterId` 时的 refs 回退方案。
4. document 节点正文落点：复用 draft/revision 链路还是独立列。
5. 兄弟排序序号重排策略（整体重排 vs 稀疏序号）。
6. `project_core` JSON 列与 M09 迁移登记（`MIGRATION_LANE`，主集成者串行接线，业务模块不另造迁移框架）。
7. `locked` 状态留 S4；rct × React 19 / Tailwind 4 兼容性 S2 安装后实测。

## 6. 模块落点（ADR-0029）

- `src/shared/canvas-schema.ts`、`src/shared/doc-tree.ts`：类型合同与断言器。
- `src/stores/canvas-store.ts`（S3）：节点/边/选区/视口/历史栈/UI 态；只持导航句柄与快照副本，不持有权威数据。
- `src/services/canvas/`（S3+）：IPC adapter 与画布 AI 提案组装。
- `src/components/stage/canvas/`：画布页面、节点/边、工具条、AI 浮层、状态栏。
- `electron/repositories/canvas-repository.ts`（S3）：快照读写、`sourceRevision` 乐观锁、坏快照隔离。

## 7. 多 Agent 编排约定

- 可派生一个编排子任务把活拆成并行线；子任务共享同一台 VM 与同一仓库，文件落点必须互不重叠。
- **共享接线文件**（`editor-store.ts`、`StageWorkspace.tsx`、`stage-progress.ts`、`ipc-channels.ts`、迁移 registry）不由各线自行改，统一由主集成者接线。
- 每切片出口：工作区干净 → 跑相关检查并记录真实结果 → 再切下一切片。
- 若新对话需要复用阶段 0 的调研/合同上下文，优先读本快照与第 4 节列出的仓库文件，不要凭对话记忆。

## 8. 新对话启动步骤

1. 切到 VM 环境，`cd` 到仓库路径，`git status` / `git log --oneline -3` 核对 HEAD 是否 `6bcb973`；若落后先 `git fetch origin feat/canvas-mindmap`。
2. 读本文件 + `docs/plans/canvas-mindmap-p0.md` + `docs/adr/0029-…` + `docs/plans/canvas-doc-tree-contract.md`。
3. 复跑一次静态检查基线（typecheck / lint / check:i18n），确认起点全绿。
4. 先定 S2 待决项 1–6 中影响合同/仓储的几条，再动 `stores` / `services` / `electron repositories`，最后接 `components`。
5. 不要在未核对现状前修改旧星图、共享接线文件或既有事实源模块。
