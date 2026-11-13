# 画布思维导图 · 阶段 0 线 B 调研复用清单

- 分支：`feat/canvas-mindmap`，HEAD `9293926`，工作区干净。
- 范围：只读调研与台账；不改业务源码、不安装依赖、不提交/推送。本阶段不安装 `react-complex-tree`、`nanoid 6.0.2`，结论供 S2 及后续切片决策。
- 对齐口径：`docs/plans/canvas-mindmap-p0.md`、`docs/adr/0029-canvas-mindmap-engine-and-draft-layer.md`。
- 硬边界复核：旧只读星图 `src/components/editor/RelationshipGraph.tsx` 及其 layout 未改动；未触碰 `editor-store.ts`、`StageWorkspace.tsx`、`stage-progress.ts`、`ipc-channels.ts`、`MIGRATION_LANE` 等共享接线文件。
- 工作区存在并行 S2 切片产生的合同草稿（`src/shared/doc-tree.ts`、`docs/plans/canvas-doc-tree-contract.md` 等，非本线 B 产出）；本清单按只读参考读取并对齐其字段口径，未改动这些文件。

---

## 1. react-complex-tree 2.6.4 调研

### 1.1 License（原文核对，非二手转述）

| 项 | 结论 | 来源 |
|---|---|---|
| npm registry `license` 字段 | `MIT` | https://registry.npmjs.org/react-complex-tree/2.6.4 |
| LICENSE 原文 | 取到原文：`MIT License`，`Copyright (c) 2023 Lukas Bach`；标准 MIT 条款（保留版权与许可声明） | https://raw.githubusercontent.com/lukasbach/react-complex-tree/main/LICENSE |
| 版权持有人 | Lukas Bach（npm author 同为 `Lukas Bach <npm@lukasbach.com>`） | registry 元数据 + LICENSE 原文 |
| 运行时依赖 | 无（`dependencies: {}`）；peerDependencies 仅 `react: >=16.0.0` | https://registry.npmjs.org/react-complex-tree/2.6.4 |
| 包内多 LICENSE 路径 | 仓库根 `LICENSE` 生效；`packages/core/LICENSE` 为 404，包内不另挂副本 | 上述 raw URL 探测记录 |

未取到原文的 URL 记录：`https://raw.githubusercontent.com/lukasbach/react-complex-tree/master/LICENSE`（同文镜像，HTTP 200，内容与 main 一致）；`https://raw.githubusercontent.com/lukasbach/react-complex-tree/main/packages/core/LICENSE`、`.../master/packages/core/LICENSE`（均 404）。

### 1.2 API 落点与 S2 资料树需求映射

依据包源码类型定义 `packages/core/src/types.ts`（main 分支 raw 拉取核对）：

| S2 需求 | rct API / 受控状态 | 映射点 |
|---|---|---|
| 文件夹 / 文档 / 画布混排 | 节点模型 `TreeItem<T> = { index: TreeItemIndex; children?: TreeItemIndex[]; isFolder?: boolean; canMove?: boolean; canRename?: boolean; data: T }`；`data` 自定义载荷挂 `kind: 'folder' \| 'document' \| 'canvas'` 与标题 | `DocTreeNode` 映射进 `data`；`isFolder` 对应文件夹；`children` 数组即层级 |
| 层级缩进、展开折叠 | 受控环境 `ControlledTreeEnvironment`：`expandedItems?: TreeItemIndex[]`，处理器 `onExpandItem(item, treeId)` / `onCollapseItem(item, treeId)`；视图状态 `IndividualTreeViewState { selectedItems, expandedItems, focusedItem }` | 展开/折叠态由本仓 store 持有；rct 只回传展开/折叠事件，结构与层级不交给库内部状态 |
| 选中 / 聚焦 | `selectedItems?: TreeItemIndex[]` + `onSelectItems(items, treeId)`；`focusedItem?` + `onFocusItem(item, treeId, setDomFocus?)` | 侧栏选中项对齐现有 Stage 列表的 `aria-current` 选中模式 |
| 拖拽排序、跨层级移动 | 拖拽落点 `DraggingPosition`：`targetType: 'item'`（移入某节点，含 `parentItem`）、`'between-items'`（同级排序，`childIndex` + `linePosition: 'top' \| 'bottom'`）、`'root'`（根级）；回调 `onDrop(items: TreeItem<T>[], target: DraggingPosition)` | 同级排序走 `between-items`；归入文件夹走 `item`；根级走 `root`。`canMove` 按节点类型控制是否可拖 |
| 改名 | `onRenameItem(item, name, treeId)`；`TreeItem.canRename`；环境动作 `renameItem(itemId, name, treeId)` | 节点标题内联改名；校验与落库在本仓服务层 |
| 软删除 / 恢复 | **库内无回收站/软删除概念**：rct 只渲染给定的 `items`/`dataProvider` 与拖拽交互；软删除是应用层职责 | 并行 S2 合同草稿 `src/shared/doc-tree.ts` 已用 `deletedAt: string | null` 标记软删除（被删节点保留在快照内进回收站，恢复时清空）；主树按 `deletedAt === null` 过滤，回收站列表单独读取；rct 不承担删除收据与恢复事务，模式对照 ADR-0025（见 §3.2） |
| 受控 vs 非受控 | 提供 `UncontrolledTreeEnvironment`（库自管选中/展开态）与 `ControlledTreeEnvironment`（全受控）两套 | S2 应选受控环境，与 `canvas-store` / 资料树快照合同对齐，避免库内状态与权威快照分叉 |

### 1.3 兼容性口径与待验证项

**React 版本**
- peerDependencies 声明 `react: >=16.0.0`，未封 React 19 上限；registry 元数据中包自身 devDependencies 自测目标为 `react ^18.2.0`（`@types/react ^18.0.14`）。
- 与本仓 React `^19.2.5` 的兼容风险：peer 范围不排除 19，但包未在 registry 元数据中声明 React 19 实测；需在 S2 安装后验证：
  1. pnpm peer 解析是否告警/报错；
  2. 受控环境在 React 19 下渲染、展开/折叠、多选是否触发 `act` 警告或事件监听异常；
  3. 拖拽基于 HTML5 DnD / 指针事件的路径在 Electron 19 渲染进程内是否正常；
  4. 类型定义与 `@types/react ^19.2.14` 之间有无不兼容签名。
- 本阶段不安装，上述为 S2 实测清单，不在阶段 0 下结论。

**Tailwind 4 下样式覆盖**
- rct 自带 `style.css` / `style-modern.css`；现代主题以根级 CSS 变量驱动，前缀 `--rct-*`（已核对 `packages/core/src/style-modern.css`：`--rct-color-tree-bg`、`--rct-item-height`、`--rct-item-padding`、`--rct-radius`、`--rct-bar-color`、`--rct-color-focustree-item-selected-bg`、`--rct-color-focustree-item-hover-bg`、`--rct-arrow-size` 等）。
- S2 落地时样式覆盖清单：
  1. 在画布/资料树侧栏 CSS 层把 `--rct-*` 变量映射到本仓 `--color-*` 主题变量（背景、选中/悬停/激活底色、文字色、边框、圆角、拖拽指示条颜色）；
  2. 行高、内边距、箭头尺寸对齐现有 Stage 列表项密度（参考 `stage-kb-list` / `stage-thread` 既有尺寸）；
  3. 自定义 `renderItem` 渲染器时，节点内容用本仓 `Button` / `Menu` / 图标体系，rct 仅提供容器与缩进；
  4. 暗色/主题切换跟随本仓 `theme-store`，不另起一套 rct 主题；
  5. 检查 Tailwind 4 预flight 与 rct 自带 CSS 的层叠顺序，必要时用 `@layer` 收敛。

### 1.4 阶段声明

本阶段**不安装** `react-complex-tree`；以上 API 映射与兼容性判断供 S2 选型与切片设计使用。若 S2 评估后改用自写树组件，本清单第 1.2 节的交互契约（层级、拖拽落点、展开折叠、改名事件）仍可作为自写组件的需求对照。

---

## 2. xyflow 官方示例可复用模式

### 2.1 已核实的本地基线

本仓已装 `@xyflow/react ^12.12.1`（`node_modules/@xyflow/react`，license `MIT`，`LICENSE` 原文 `Copyright (c) 2019-2025 webkid GmbH`）。以下模式先以本地包类型定义核实，再对照官方文档示例路由归纳。

### 2.2 可复用模式

| 模式 | 接线方式（本地包已核实的导出） | S3–S4 落点 | 官方示例来源 |
|---|---|---|---|
| 节点/边受控状态 | `useNodesState` / `useEdgesState`；变更经 `applyNodeChanges` / `applyEdgeChanges` 归并到受控数组；`ReactFlow` 接 `nodes` / `edges` / `onNodesChange` / `onEdgesChange` | S3 快照读入后由 store 持有节点/边；变更走受控回调，不直接改快照副本 | 官方导图教程：https://reactflow.dev/learn/tutorials/building-a-mind-map |
| 适应视图 | `ReactFlow` 布尔 prop `fitView`；实例方法 `useReactFlow().fitView(options)`（`component-props.d.ts` 中 `fitView?: boolean` 及实例 `fitView` / `zoomTo`） | S3 初始载入适应视图；S4 状态栏「适应视图」入口调实例方法 | 同上导图教程；组件 API：https://reactflow.dev/api-reference/components/react-flow |
| 小地图 | 附加组件 `MiniMap`（`dist/esm/additional-components/MiniMap/MiniMap.tsx`），可自定义 `MiniMapNode` | S3 画布挂 `MiniMap`，节点颜色/形状跟随本仓节点类型 | 官方示例：https://reactflow.dev/examples/panels/minimap ；API：https://reactflow.dev/api-reference/components/minimap |
| dagre 布局计算（只回写坐标，不动结构） | 官方 dagre 示例惯例：建 `dagre.graphlib.Graph()` → `setDefaultEdgeLabel(() => ({}))` → `setGraph({ rankdir: 'TB' })` → 逐节点 `setNode(id, { width, height })`、逐边 `setEdge(source, target)` → `dagre.layout(graph)` → 仅把 `graph.node(id)` 的 `x/y` 换算后写回节点 `position`（`x - width/2`, `y - height/2`）；**不增删节点、不改边、不改节点内容与状态** | S4「一键整理」：dagre 只产出坐标，父子结构与 `CanvasNode.data` 原样保留；与 ADR-0029 第 4 条「自由拖拽 + 一键整理混合形态」对齐 | 官方布局示例：https://reactflow.dev/examples/layouting/dagre-layout |
| 背景 / 控制条 | `Background`（点阵/线条）、`Controls`；S1 `StageCanvas.tsx` 已接入 | S3 沿用，样式接本仓主题变量 | 本地包导出；教程同上 |

### 2.3 版权头与 License 口径

- `@xyflow/react` 为 **MIT**，Copyright `2019-2025 webkid GmbH`（本地 `node_modules/@xyflow/react/LICENSE` 与仓库根 LICENSE 原文一致：https://raw.githubusercontent.com/xyflow/xyflow/main/LICENSE ；registry：https://registry.npmjs.org/@xyflow/react/latest ）。
- `dagre 0.8.5` 为 **MIT**，Copyright `2012-2014 Chris Pettitt`（本地 `node_modules/dagre/LICENSE`）；`@types/dagre ^0.7.54` 同为 MIT。
- 若 S2–S4 vendoring（拷贝）官方示例代码进本仓：
  1. 必须在拷贝文件头部保留 xyflow 的 MIT 版权声明与许可声明（`Copyright (c) 2019-2025 webkid GmbH` + MIT 许可全文或指针）；
  2. 基于示例改造的部分按本仓 GPL-3.0 口径标注；不得删除既有版权头；
  3. dagre 示例代码若一并拷贝，保留 dagre MIT 版权头；
  4. 示例中的品牌文案、截图资源不随代码拷贝。

### 2.4 调研局限

reactflow.dev 为客户端渲染站点，本次 `web.fetch` 抓取示例正文返回 link dead；上表模式以本地已装包 12.12.1 的类型定义与组件源码为准，示例路由 URL 经站点页面 canonical 链接核实。S3 落地时建议再对照官方示例源码复核一次受控回调签名。

---

## 3. 本仓可复用模块定位表

路径均经 Glob/Read 核实（阶段 0 只读）。「复用点」指 S2–S6 可借鉴的模式、组件或接线；除明确标注外，不复用章节回收站等业务代码本体。

### 3.1 现有列表 / 树 UI

| 模块 | 文件路径（已核实） | S2–S6 可复用点 |
|---|---|---|
| 知识库资料列表 | `src/components/stage/knowledge/StageKnowledge.tsx`；`src/components/stage/knowledge/use-knowledge-base.ts`；`src/components/stage/knowledge/KnowledgeIndexSection.tsx`；`src/components/stage/knowledge/search-highlight.tsx`；`src/components/stage/knowledge/knowledge.css` | 左列资料列表项渲染、选中态（`aria-current`）、分段切换、搜索词高亮、空态/加载态/读失败 `stale` 提示、危险确认弹窗骨架；S2 资料树侧栏的列表项与选中/搜索交互直接对照 |
| 剧情与伏笔列表 | `src/components/stage/plot/StagePlot.tsx`；`src/components/stage/plot/PlotThreads.tsx`；`src/components/stage/plot/PlotTimeline.tsx`；`src/components/stage/plot/use-plot-threads.ts`；`src/components/stage/plot/plot-shape.ts` | 分段视图切换；生成记录列表（恢复原生成 / 继续原运行 / 取消 / 保存原结果）；来源变化 `conflict` 只读提示；S5 提案记录与 S4 历史栈的交互骨架参考 |
| 书架卡片与菜单 | `src/components/stage/library/StageLibrary.tsx`；`src/components/stage/library/ShelfBook.tsx`；`src/components/stage/library/BookOverview.tsx`；`src/components/stage/library/use-shelf-overview.ts`；菜单 `src/components/ui/Menu.tsx` | 卡片式条目、上下文菜单组（普通项 / danger 项分组）、概览卡；S2 节点类型图标与右键/更多菜单参考 |
| 通用 UI 底座 | `src/components/ui/`（`Button`、`DangerConfirm`、`EmptyState`、`Notice`、`Menu`、`Input`、`Popover`、`SegmentedControl`、`InkDialog` 等） | S2 侧栏与 S5 浮层统一复用既有 UI 底座，不另起组件库 |

### 3.2 回收站 / 软删除（ADR-0025 模式复用，代码不复用）

| 模块 | 文件路径（已核实） | 复用点 |
|---|---|---|
| 回收站 UI 与 hook | `src/components/stage/trash/TrashDialog.tsx`；`src/components/stage/trash/use-chapter-trash.ts`；`src/components/stage/trash/trash-actions.ts`；`src/components/stage/trash/trash.css` | 回收站列表、恢复/彻底删除/重试清理动作；`useChapterTrash` 的会话校验、读失败保留旧列表并标 `stale`、事件总线通知各处重读（`CHAPTER_DELETION_UPDATED`）模式 |
| 软删除合同 | `src/shared/chapter-deletion.ts` | 删除状态枚举、`TrashedChapter` 投影、`DamagedTrashEntry` 坏项单列、恢复模式三态（`into-gap` / `as-history` / `reopen-as-draft`）的类型组织方式；S2 资料树软删除合同可对照设计 |
| 删除/恢复仓储 | `electron/repositories/chapter-deletion-repository.ts` | 事务内软删（状态置 `deleted` + `deletion_id` 收据）、事务内全有或全无恢复、恢复前重算状态与请求不符则拒绝、坏项不挡其余项、彻底删除保留收据的模式；**模式参考，不直接复用章节仓储** |
| 设计依据 | `docs/adr/0025-chapter-trash-soft-delete-and-restore.md` | 软删除/恢复的边界与不可逆口径；P0 计划 S2 明确「复用章节回收站软删除模式，不复用章节回收站代码」 |

### 3.3 快照仓储（S3 画布快照直接对齐的既有模式）

| 模块 | 文件路径（已核实） | 复用点 |
|---|---|---|
| 剧情树快照仓储 | `electron/repositories/plot-tree-repository.ts` | JSON 列读写（`project_core.plot_tree_snapshot`）；读快照失败 catch 后隔离为 `storedSnapshotInvalid` 不删数据；保存时先比对 `sourceRevision` 不一致抛 `PLOT_TREE_SOURCES_CHANGED` 乐观锁冲突；`assertPlotTreeSnapshot(snapshot, sources)` 新快照对当前来源校验、`assertStoredPlotTreeSnapshot` 持久化快照离线校验；`createHash('sha256').update(JSON.stringify(sources)).digest('hex')` 来源版本指纹 |
| 剧情树快照合同 | `src/shared/plot-tree.ts` | `PlotTreeSnapshot.version` 形状；`sourceRevision?: string`（`isPlotTreeSourceRevision` 校验 64 位 hex sha256）；`storedSnapshotInvalid?: true` 坏快照隔离标记；双层校验器分工（在线对来源 / 离线只验结构） |
| 资料树合同草稿（并行 S2） | `src/shared/doc-tree.ts`；合同说明 `docs/plans/canvas-doc-tree-contract.md` | `DocTreeNode`（`parentId`/`kind`/`origin`/`state`/`refs`/`deletedAt`/`order`/`revision`）、`DocTreeSnapshot`、`assertDocTreeSnapshot` / `assertStoredDocTreeSnapshot`、自连/成环/悬空引用校验；`sourceRevision` 复用剧情树 `isPlotTreeSourceRevision`；S2 仓储与 S3 画布仓储对齐这一套双层校验与乐观锁口径 |
| S3 对齐目标 | 待建 `electron/repositories/canvas-repository.ts`；`src/shared/canvas-schema.ts`（S1 已建基础类型，完整校验器 S3 落地） | 复刻上述：快照 JSON 列、sha256 `sourceRevision` 乐观锁、坏快照隔离；迁移 M09 由主集成者登记进 `MIGRATION_LANE`，业务模块不另造迁移框架 |

### 3.4 提案卡片 / diff

| 模块 | 文件路径（已核实） | 复用点 |
|---|---|---|
| 确认卡片 | `src/components/panels/agent/ConfirmCard.tsx` | Agent 提案批准/拒绝骨架；头部警示、正文预览、拒绝/批准按钮、`canApprove` 按预览有效性禁用；S5 节点提案候选卡片直接对照复用 |
| 领域提案 diff | `src/components/panels/agent/DomainProposalDiff.tsx`；`src/components/panels/agent/ConfigImpactPreview.tsx` | `DomainProposalPreview` 状态机（`none / loading / valid / invalid / stale`）；字段级「当前 vs 建议」双列 diff；项目切换后 `stale` 提案不写入；会话身份比对 `sameProjectSessionContext` |
| 提案构建器 | `src/services/agent/tools/propose-chapter-blueprint.tool.ts`；`src/services/agent/tools/propose-novel-config.tool.ts` | `ProposalFieldDiff` 字段差异结构、提案 `valid/invalid/error` 产出方式；S5 节点展开/扩写提案可按同构方式产出候选 diff |
| diff-match-patch 引擎 | `src/components/stage/history/version-diff.ts`（`diff_main` + `diff_cleanupSemantic`，按段落切分 `DiffSegment[][]`，统计增删片段）；依赖 `diff-match-patch ^1.0.5`、`@types/diff-match-patch ^1.0.36` | S6 文本修改提案逐条确认的逐字 diff 展示；引擎已在依赖树内，不新增依赖 |

### 3.5 版本历史

| 模块 | 文件路径（已核实） | 复用点 |
|---|---|---|
| 版本历史页与 hook | `src/components/stage/history/StageHistory.tsx`；`src/components/stage/history/use-version-history.ts`；`src/components/stage/history/RevertDialog.tsx`；`src/components/stage/history/version-diff.ts` | 章节各稿列表、两边正文对比、回滚不覆盖原稿而用旧稿正文新建一稿的口径；会话切换/读失败状态处理 |
| 修稿仓储 | `electron/repositories/revision-repository.ts`；`electron/repositories/draft-version.ts` | 修稿分支状态流转（`pending → merged / discarded`）、内容 sha256 指纹、版本号分配；S6 文本应用前原稿进版本历史的链路参考 |
| 运行记录仓储 | `electron/repositories/generation-run-repository.ts` | 生成运行 durable 记录、预算/用量收据、运行句柄（`MainGenerationRunHandle`）；S5 提案批次可对照记录结构 |

### 3.6 BYOK / 模型接入链路（S5 复用）

| 模块 | 文件路径（已核实） | 复用点 |
|---|---|---|
| BYOK 模型配置 IPC | `electron/controllers/llm-controller.ts`（`llm:list-models` 等通道，全局配置文件读写 `ModelProfile[]`）；`src/stores/llm-store.ts`（模型列表、默认生成/向量/重排模型、阶段模型路由） | S5 AI 浮层直接读既有模型列表与默认模型，不另造模型配置入口；模型选择、连接测试、上下文窗口记忆沿用现有链路 |
| 模型提供方工厂 | `electron/llm/llm-factory.ts`；`electron/llm/openai-provider.ts`；`electron/llm/anthropic-provider.ts`；`electron/llm/gemini-provider.ts`；`electron/llm/openai-compatible-endpoint.ts` | 多提供方 completion 接缝；S5 提案生成经既有工厂取提供方 |
| 调用日志/统计 | `electron/repositories/llm-repository.ts` | LLM 调用日志与用量统计（`llm_calls` 表）；注意：本仓储是调用记录，**不是** BYOK 配置仓储；S5 提案调用可按既有 `logCall` 口径留痕 |
| 生成 harness | `src/services/generation/generation-harness.ts`；`src/services/generation/generation-runtime.ts`；`src/services/generation/main-generation-transport.ts`；`src/services/generation/task-budget-planner.ts` | 语义生成合同 `GenerationTask`、冻结模型身份 `FrozenGenerationModelIdentity`（id / configurationRevision / endpointFingerprint）、预算策略、AbortSignal 取消、completion 端口；S5 节点提案走同一 harness 的 begin/execute/cancel/确认口径 |
| 会话身份校验 | `src/components/project-session-gate.ts`；`src/shared/project-session-context.ts`；`src/shared/ipc-channels.ts`（`ProjectSessionContext`） | 提案/落库前校验 `projectId` / 句柄 / 会话一致；切项目拒绝旧提案写入；与 P0 计划「身份校验对齐现有 generation harness」一致 |
| Agent 对话面板 | `src/components/panels/agent/AgentConversation.tsx`；`src/components/panels/agent/AgentInputBox.tsx`；`src/components/panels/agent/MentionMenu.tsx`；`src/services/agent/context-builder.ts` | 对话面板骨架、输入框、`@` 提及选择菜单（`MentionMenu` 按关键词过滤目标）；S5 @ 引用当前节点 / 父链 / 兄弟 / 关联角色与章节时，数据源接既有菜单组件 |

---

## 4. License 复核结论

### 4.1 拟引入依赖

| 依赖 | 版本 | License | 版权 / 口径 | 备注 |
|---|---|---|---|---|
| react-complex-tree | 2.6.4 | MIT | Copyright (c) 2023 Lukas Bach | 阶段 0 **未安装**；registry 与 GitHub LICENSE 原文均已核对（见 §1.1） |
| nanoid | 6.0.2（拟议） | MIT | npm registry 元数据 `license: MIT`，无 peerDependencies | 阶段 0 **未安装**；仅记录 registry 口径 |
| nanoid（既有传递依赖） | 3.3.18 | MIT | 本地 `node_modules/.pnpm/nanoid@3.3.18`，`package.json` `license: MIT` | 本仓 `src/`、`electron/` 源码当前未直接引用 `nanoid`；6.0.2 是否引入待 S2/S3 定 ID 方案时再议 |

来源：
- https://registry.npmjs.org/react-complex-tree/2.6.4
- https://registry.npmjs.org/nanoid/6.0.2
- 本地 `node_modules/.pnpm/nanoid@3.3.18/node_modules/nanoid/package.json`

### 4.2 与 GPL-3.0 应用的兼容口径

- 本仓根 `LICENSE` 为 **GPL-3.0**（GNU GPL Version 3, 29 June 2007, FSF）。
- MIT 属 FSF 明确的 GPL 兼容宽松许可证：以动态链接、打包进渲染进程或随应用分发的方式嵌入 GPL-3.0 作品，均不构成 License 冲突；义务是在分发物中保留 MIT 版权声明与许可声明（随包 LICENSE 或 NOTICE 一并保留）。
- 本仓既有直接依赖已按同口径共存，可作旁证：`zustand` MIT、`clsx` MIT、`react-markdown` MIT、`@xyflow/react` MIT、`dagre` MIT、`@types/dagre` MIT；`lucide-react` ISC（ISC 与 MIT 等价宽松，GPL 兼容）；`diff-match-patch` Apache-2.0（Apache-2.0 与 GPLv3 兼容，FSF 口径）。
- 结论：`react-complex-tree 2.6.4`（MIT）、`nanoid 6.0.2`（MIT）与本仓既有依赖 License 口径一致，嵌入 GPL-3.0 应用兼容；落地时随依赖保留各自版权头。
- 注意：兼容判断针对许可证文本；实际打包仍需在打包/发布流程核对第三方声明完整性（本仓当前未见独立 THIRD_PARTY_NOTICES 文件，发布阶段补登记）。

### 4.3 排除项重申

- **tldraw 4.0+ 不引入**：自 4.0（2025-09）起采用 tldraw Inc. 自有 source-available 许可（非 OSI 开源），生产环境需有效 License Key，禁止绕过/改动听证强制；与 GPL-3.0 嵌入口径冲突。仅作交互参考，不进依赖树。
  - 来源：https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md
  - 旁证：https://canary.tldraw.dev/ （License 章节：非商业 tldraw license，商用需购买商业许可）
- 本阶段不安装任何新包；排除项与 P0 计划、ADR-0029 第 2 条一致。

---

## 5. 未决问题与待 S2 实测项

1. **react-complex-tree × React 19.2.5**：peer `>=16.0.0` 未封上限，但包自测目标为 React 18；S2 安装后需验证 pnpm peer 解析、渲染/`act` 警告、HTML5 DnD/指针事件在 Electron 渲染进程行为、与 `@types/react ^19.2.14` 的类型兼容（清单见 §1.3）。
2. **rct × Tailwind 4 主题对接**：`--rct-*` 变量到本仓 `--color-*` 主题变量的映射、预flight 层叠顺序，需 S2 侧栏落地时实测；本阶段未装包，不做样式结论。
3. **nanoid 6.0.2**：仅记录 registry MIT 口径；是否引入、用于节点/边 ID 还是快照句柄，待 S2/S3 ID 方案确定后再议；本地传递依赖 3.3.18 保持原样。
4. **xyflow 示例源码复核**：reactflow.dev 客户端渲染，本次未能抓取示例正文逐行核对；受控状态、`fitView`、`MiniMap`、dagre 接线结论以本地已装 `@xyflow/react 12.12.1` 类型定义为准，S3 落地时再对照官方示例源码复核签名。
5. **快照仓储模式迁移**：`canvas-repository` / `doc_tree` 快照列与乐观锁复刻 plot-tree 模式；M09 迁移登记归属主集成者，阶段 0 不触碰 `MIGRATION_LANE` 与接线文件。

## 6. 关键结论来源 URL 汇总

- react-complex-tree 2.6.4 registry：https://registry.npmjs.org/react-complex-tree/2.6.4
- react-complex-tree LICENSE 原文：https://raw.githubusercontent.com/lukasbach/react-complex-tree/main/LICENSE
- react-complex-tree 类型定义（API 落点核对）：https://raw.githubusercontent.com/lukasbach/react-complex-tree/main/packages/core/src/types.ts
- react-complex-tree 现代样式表（CSS 变量核对）：https://raw.githubusercontent.com/lukasbach/react-complex-tree/main/packages/core/src/style-modern.css
- @xyflow/react registry（MIT 12.12.1）：https://registry.npmjs.org/@xyflow/react/latest
- xyflow LICENSE 原文：https://raw.githubusercontent.com/xyflow/xyflow/main/LICENSE
- xyflow 导图教程：https://reactflow.dev/learn/tutorials/building-a-mind-map
- xyflow dagre 布局示例：https://reactflow.dev/examples/layouting/dagre-layout
- xyflow MiniMap API：https://reactflow.dev/api-reference/components/minimap
- nanoid 6.0.2 registry：https://registry.npmjs.org/nanoid/6.0.2
- tldraw LICENSE：https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md
- tldraw 许可说明：https://canary.tldraw.dev/
- 本仓内部依据：`docs/plans/canvas-mindmap-p0.md`、`docs/adr/0029-canvas-mindmap-engine-and-draft-layer.md`、`docs/adr/0025-chapter-trash-soft-delete-and-restore.md`
