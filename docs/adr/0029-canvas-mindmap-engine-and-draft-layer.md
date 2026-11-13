# 自由画布思维导图用 React Flow 承载，作为作者主动草稿层

2026-11-13，fork 自留分支 `feat/canvas-mindmap`。本 ADR 记录画布引擎选型、草稿层与派生快照的边界，以及模块落点。选型复核日期与开源库 Star/License 以落地时 GitHub 实况为准。

## 背景

- 现有 `RelationshipGraph` 是角色关系只读星图（Canvas 2D 自绘）：可拖节点、缩放、适应视图，但不能新建/编辑节点与边、不能改名、无树层级布局、无撤销重做。它服务角色档案视图，不承担导图编辑。
- ADR-0014 的剧情树是 AI 归纳的只读派生快照，只用于可视化与来源导航，不参与正文提示词，也不反写大纲、蓝图、线索或定稿事实。
- 复刻目标需要一个作者可直接编辑的草稿画布：节点自由摆放、父子树、连线新建/断开/改连、一键整理成树、AI 提案先候选再确认落库。

## 决定

1. **画布引擎选 `@xyflow/react`（xyflow 12，MIT），树布局接 `dagre`（MIT）。**
   - React 原生、TypeScript 友好；节点/边/缩放/小地图/受控状态由库提供；12.x 适配 React 19 与 Tailwind 4。
   - dagre 负责一键整理时的树布局坐标计算；elkjs 留作复杂布局备选，P0 不引入。
2. **不引入 tldraw。** tldraw 4.0 起为 source-available，生产环境需 license key，非 OSI 开源，与本仓库 GPL-3.0 嵌入口径冲突；仅作交互参考，不进依赖树。
3. **新画布是作者主动草稿层，与 ADR-0014 派生快照分层。**
   - 节点 `origin` 标 `human` / `ai` / `imported`，作者可直接编辑，是结构输入的权威草稿。
   - 画布与派生剧情树通过 `refs` / `chapterRefs` 单向引用，不互相复制内容；画布不成为第二套项目事实源。
   - 若日后允许从画布回写章节/角色状态，编辑动作必须路由到现有权威事实（角色库/蓝图/草稿），再刷新派生快照，而不是直接改派生图。
4. **自由拖拽 + 一键整理的混合形态。** 节点位置可自由摆放；「一键整理」只按 dagre 回写坐标，不改父子结构、不改节点内容与状态。
5. **AI 产出先候选、作者确认后落库。** 提案走现有 `ConfirmCard` / `DomainProposalDiff` 模式预览；不直接改图、不覆盖原稿。结构应用进画布历史栈可撤销；文本修改走现有 `draft-version` / `revision-repository` 链路。
6. **旧 `RelationshipGraph` 保留给角色关系视图**，不改造成导图；新画布另起模块，不复用其 Canvas 自绘代码。
7. **模块落点对齐既有所有权边界（ADR-0018）。**
   - `src/shared/canvas-schema.ts`：节点/边/快照类型与校验器。
   - `src/stores/canvas-store.ts`：节点/边/选区/视口/历史栈/UI 态。
   - `src/services/canvas/`：IPC adapter 与画布 AI 提案组装。
   - `src/components/stage/canvas/`：画布页面、节点、边、工具条、AI 浮层、状态栏。
   - `electron/repositories/canvas-repository.ts`：快照读写、`sourceRevision` 乐观锁、坏快照隔离。
   - 快照对齐 `plot_tree_snapshot` 既有模式：`project_core` 增 JSON 列存当前画布与资料树快照。

## 不做

- 不做手绘白板、自由画笔、多人实时协作。
- 不复制第二套角色/蓝图/章节事实；只引用现有权威实体。
- P0 不做节点内富文本编辑器、在线模板市场、画布快照版本历史 UI（快照历史列 P1）。

## 后果

- 新增 `@xyflow/react`、`dagre` 两个 MIT 依赖，与 GPL-3.0 兼容。
- 新迁移 **M09**（schema 9 → 10）登记进 `MIGRATION_LANE`，按 ADR-0018 由主集成者串行接线，业务模块不另造迁移框架。
- 画布历史栈独立于正文版本历史；派生剧情树仍由现有链路重建，不从画布反推。
- 无头云端环境只验证静态检查与单测；Electron 窗口行为、原生模块运行与打包回本机或 CI 补测。
