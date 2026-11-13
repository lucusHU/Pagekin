# 资料树（Doc Tree）类型合同 — S2 线 A 阶段 0

2026-11-13，分支 `feat/canvas-mindmap`。对应 ADR-0029 与 `docs/plans/canvas-mindmap-p0.md` 的 S2 切片。
本文件只冻结类型合同、接口形状与边界；仓储、IPC 接线、侧栏 UI 留待 S2 落地。本阶段不改 `editor-store.ts`、`StageWorkspace.tsx`、`stage-progress.ts`、`ipc-channels.ts`、`MIGRATION_LANE`，不改旧星图 `RelationshipGraph.tsx`。

## 1. 类型字段表与枚举取值

完整合同在 `src/shared/doc-tree.ts`；`src/shared/canvas-schema.ts` 旧桩 `DocTreeNode` 已改为 type-only 再导出，重复定义消除。

### 1.1 `DocTreeNode`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | 节点稳定句柄，快照内唯一、非空。 |
| `parentId` | `string \| null` | 父节点 id；`null` 为根级。不得指向自身，不得悬空，父链不得成环。 |
| `title` | `string` | 节点标题，trim 后非空。 |
| `kind` | `'folder' \| 'document' \| 'canvas'` | 节点类型。沿用 `canvas-schema.ts` 旧桩既有取值，未调整枚举。 |
| `origin` | `'human' \| 'ai' \| 'imported'` | 来源标记，与 `CanvasNodeOrigin` 口径一致。 |
| `state` | `'active' \| 'locked'` | 业务状态。`locked` 预留给 S4 锁定操作（禁拖拽/改名/删除）；S2 写入路径只产生 `active`，读取路径容忍历史 `locked`。 |
| `refs` | `DocTreeEntityRef[]` | 单向引用权威实体的句柄列表，可为空；只存句柄，不复制正文。 |
| `deletedAt` | `string \| null` | 软删除时间（ISO 字符串）；`null` 表示在树内。被删节点保留在快照里进回收站，恢复时清空。 |
| `order` | `number` | 同级排序序号，0 起安全整数。 |
| `revision` | `number` | 节点级单调版本号，1 起；随快照一并乐观锁校验。 |
| `createdAt` | `string` | ISO 时间戳。 |
| `updatedAt` | `string` | ISO 时间戳。 |

### 1.2 `DocTreeEntityRef`（联合类型，只存句柄）

| 变体 | 句柄字段 | 指向的权威实体 |
|---|---|---|
| `{ type: 'character'; characterId: string }` | `characterId` | 角色卡 / 结构化角色名单条目。 |
| `{ type: 'blueprint'; chapterNumber: number }` | `chapterNumber` | 蓝图章节。 |
| `{ type: 'finalized-chapter'; draftId: number; chapterNumber: number }` | `draftId` + `chapterNumber` | 定稿章节。 |
| `{ type: 'narrative-thread'; planId: number }` | `planId` | 叙事计划（线索）。 |

### 1.3 `DocTreeSnapshot`

| 字段 | 类型 | 说明 |
|---|---|---|
| `version` | `1` | 快照合同版本。 |
| `generatedAt` | `string` | ISO 生成时间。 |
| `sourceRevision` | `string \| undefined` | sha256 64 位十六进制乐观锁；正则口径复用剧情树 `isPlotTreeSourceRevision`（从 `plot-tree.ts` 导入，本文件以 `isDocTreeSourceRevision` 别名再导出），不在本文件复刻第二份正则。 |
| `nodes` | `DocTreeNode[]` | 全部节点（含回收站节点）；允许空数组（新项目空树）。 |

### 1.4 断言器骨架（纯函数，不接仓储）

| 导出 | 职责 |
|---|---|
| `assertStoredDocTreeSnapshot(value)` | 持久化快照结构校验：版本、时间戳、sourceRevision 格式、节点枚举、ID 唯一、父节点存在、自连检测、成环检测。不要求历史来源仍存在。 |
| `assertDocTreeSnapshot(value, sources)` | 在存储校验之上，对当前权威来源校验：`sourceRevision` 与当前来源包一致；逐条 `refs` 悬空引用检测。 |
| `isDocTreeSourceRevision(value)` | 乐观锁格式类型谓词（复用剧情树口径）。 |

校验失败抛 `Error`，沿用 `plot-tree.ts` 的 i18n-exempt 注释惯例：资料树只在主进程生成与保存，失败经 IPC 边界换成错误码，读快照失败被 catch 吞掉，作者看不到报错文案。

### 1.5 与 `canvas-schema.ts` 的关系

- `CanvasNode` / `CanvasEdge` / `CanvasSnapshot` 仍归 `canvas-schema.ts`，本合同不重复定义。
- `DocTreeNode` 唯一定义在 `doc-tree.ts`；`canvas-schema.ts` 仅 `export type { DocTreeNode } from './doc-tree'`，type-only、最小改动。
- `DocTreeNodeKind` / `DocTreeNodeOrigin` 枚举取值与桩、`CanvasNodeOrigin` 对齐；后续若需在 `canvas-schema.ts` 引用这些字面量，再从 `doc-tree.ts` type-only 导入，不就地重声明。

## 2. S2 接口清单（预留形状，本阶段不实现）

### 2.1 仓储方法签名

形态参照 `electron/repositories/plot-tree-repository.ts`（快照读写 + sourceRevision 乐观锁 + 坏快照隔离）与 `electron/repositories/chapter-deletion-repository.ts`（软删除/恢复/彻底清除）。方法在 S2 落地于 `electron/repositories/doc-tree-repository.ts`（文件名 S2 定）。

| 方法 | 签名形状 | 参照与说明 |
|---|---|---|
| 读快照 | `static read(db?): DocTreeReadBundle` | 对齐 `PlotTreeRepository.read`：返回当前权威来源包 + `snapshot: DocTreeSnapshot \| null`；快照解析失败时 `snapshot = null` 并置 `storedSnapshotInvalid: true`，坏快照隔离不删除原数据。 |
| 带乐观锁保存 | `static save(snapshot: DocTreeSnapshot, expectedSourceRevision: string, db?): DocTreeSnapshot` | 对齐 `PlotTreeRepository.save`：来源版本不符抛 `DOC_TREE_SOURCES_CHANGED`；过 `assertDocTreeSnapshot` 后写库；写库行数不符抛 `DOC_TREE_SAVE_FAILED`。 |
| 新建节点 | `static createNode(input: DocTreeNodeCreateInput, expectedSourceRevision: string, db?): DocTreeNode` | 输入：`parentId`、`kind`、`title`、`origin`、`refs?`；父级存在性、成环、悬空引用在事务内校验。 |
| 改名 | `static renameNode(id: string, title: string, expectedSourceRevision: string, db?): DocTreeNode` | 锁定节点拒绝改名（S4 接线，签名预留）。 |
| 移动/排序 | `static moveNode(id: string, parentId: string \| null, order: number, expectedSourceRevision: string, db?): DocTreeNode` | 禁止移入自身或自身子树（成环检测复用断言器规则）；同级序号由仓储重排。 |
| 软删除 | `static trashNode(id: string, expectedSourceRevision: string, db?): void` | 对齐 ADR-0025 软删除口径：行原地标记 `deletedAt`，不物理删除；子树策略见第 4 节未决项。 |
| 恢复 | `static restoreNode(id: string, expectedSourceRevision: string, db?): DocTreeNode` | 从回收站放回；事务内复核删除状态，重复恢复幂等返回已恢复。 |
| 彻底清除 | `static purgeNodes(request: { ids: string[] } \| { all: true }, db?): { purged: string[]; alreadyGone: string[] }` | 对齐 `ChapterDeletionRepository.purge`：一个事务；已不在回收站的列入 `alreadyGone`。 |
| 清空 | `static clear(db?): void` | 对齐 `PlotTreeRepository.clear`。 |

错误码沿用既有 `UPPER_SNAKE_CASE` 形态（`PROJECT_NOT_OPEN`、`*_SOURCES_CHANGED`、`*_SAVE_FAILED`、`*_NODE_NOT_FOUND`、`*_CYCLE_DETECTED` 等），具体清单 S2 落地时对齐现有仓储命名。

### 2.2 IPC 通道名预留

遵循 `src/shared/ipc-channels.ts` 现有惯例：读/写走 `db:` 前缀（参照 `db:plot-tree-read` / `db:plot-tree-clear`），回收站操作走领域前缀（参照 `chapter:trash-list` / `chapter:trash-restore` / `chapter:trash-purge`）。**本阶段不修改 `ipc-channels.ts`**；以下名称与参数形状仅预留，S2 按既有通道注册模式接线。

| 预留通道名 | 参数形状 | 返回形状 |
|---|---|---|
| `db:doc-tree-read` | `[expectedProjectPath: string]` | `DocTreeReadBundle`（来源包 + 快照 + `storedSnapshotInvalid?`） |
| `db:doc-tree-save` | `[snapshot: DocTreeSnapshot, expectedSourceRevision: string, expectedProjectPath: string]` | `{ success: boolean; snapshot?: DocTreeSnapshot; error?: string; errorCode?: string }` |
| `db:doc-tree-node-create` | `[input: DocTreeNodeCreateInput, expectedSourceRevision: string, expectedProjectPath: string]` | `{ success: boolean; node?: DocTreeNode; error?: string; errorCode?: string }` |
| `db:doc-tree-node-rename` | `[id: string, title: string, expectedSourceRevision: string, expectedProjectPath: string]` | `{ success: boolean; node?: DocTreeNode; error?: string; errorCode?: string }` |
| `db:doc-tree-node-move` | `[id: string, parentId: string \| null, order: number, expectedSourceRevision: string, expectedProjectPath: string]` | `{ success: boolean; node?: DocTreeNode; error?: string; errorCode?: string }` |
| `doc-tree:trash-list` | `[expectedProjectPath: string]` | 回收站条目列表 + 单项损坏单列（参照 `ChapterTrashListResult`） |
| `doc-tree:trash-restore` | `[request: { id: string }, expectedProjectPath: string]` | 恢复结果联合类型（参照 `RestoreTrashedChapterResult`） |
| `doc-tree:trash-purge` | `[request: PurgeDocTreeRequest, expectedProjectPath: string]` | `{ success: true; purged: string[]; alreadyGone: string[] } \| { success: false; error: string }` |

### 2.3 侧栏 UI 会话状态（不进持久化快照）

以下为 `src/stores/canvas-store.ts`（S2/S3）持有的会话态，只存导航句柄与快照副本，不持有权威数据：

| 状态字段 | 形状 | 用途 |
|---|---|---|
| `expandedIds` | `Record<string, boolean>` | 文件夹展开/折叠。 |
| `selectedIds` | `string[]` | 树内多选。 |
| `activeNodeId` | `string \| null` | 主舞台当前打开的文档/画布节点。 |
| `draggingId` | `string \| null` | 拖拽中的节点。 |
| `dropTarget` | `{ id: string; position: 'before' \| 'after' \| 'inside' } \| null` | 拖拽落点指示。 |
| `trashViewOpen` | `boolean` | 回收站视图开关。 |

## 3. 复用对照

### 3.1 复用剧情树快照模式（ADR-0014 / `plot-tree.ts` + `plot-tree-repository.ts`）

- 快照合同三段式：版本号 `version: 1`、`generatedAt`、`sourceRevision` sha256 乐观锁；正则口径直接复用 `isPlotTreeSourceRevision`。
- 双断言器分层：`assertStored*` 只做结构校验（不要求历史来源存在），`assert*` 再对当前来源包做版本比对与引用存在性校验。
- 坏快照隔离：读路径 `try/catch` 解析失败后置 `storedSnapshotInvalid = true`、快照置 `null`，不删除库内原数据。
- 保存事务：先比对 `expectedSourceRevision`，再过当前来源断言，最后写库并核对影响行数。
- 快照存 `project_core` JSON 列（M09 迁移由主集成者串行登记进 `MIGRATION_LANE`，业务模块不另造迁移框架）。

### 3.2 复用章节回收站模式（ADR-0025，不复用其代码）

- 软删除：节点原地标记删除时间，不物理删除；被删项保留在快照/视图之外，可恢复。
- 恢复：放回原层级；事务内复核删除状态；重复请求幂等。
- 彻底清除：单项与清空都在一个事务；已不在回收站的列为 `alreadyGone`；收据/删除证据保留口径参照章节回收站。
- 不复用：章节定稿的收据体系、三态恢复模式（`into-gap` / `as-history` / `reopen-as-draft`）、知识库与实体稿清理链路、连续性水位规则；资料树是草稿层，不触发这些副效应。

## 4. 边界复核记录

### 4.1 草稿层边界（ADR-0029）

- 资料树是作者主动草稿层，**不是第二套项目事实源**；与 ADR-0014 派生剧情树单向引用，不互相复制内容，不反写大纲、蓝图、线索、定稿事实。
- `refs` 只指向现有权威实体；被引用实体的标题、正文、状态、关系一律由对应权威仓储持有，树节点与快照内不复制。
- 日后若允许从画布/树回写实体状态，编辑动作必须路由到现有权威事实（角色库 / 蓝图 / 草稿 / 叙事计划），再刷新派生快照，不直接改派生图。

### 4.2 引用实体在本仓的对应类型 / 文件

| ref 变体 | 权威类型 | 本仓位置 |
|---|---|---|
| `character` | `CharacterData.characterId`；结构化名单 `CharacterRosterEntry.characterId` | `electron/repositories/character-repository.ts`；`src/shared/character-roster.ts` |
| `blueprint` | `BlueprintData.chapterNumber` | `electron/repositories/blueprint-repository.ts` |
| `finalized-chapter` | `DraftMeta.id` / `DraftMeta.chapterNumber`（`status = 'finalized'`） | `electron/repositories/draft-repository.ts`；`src/services/draft-index.ts` |
| `narrative-thread` | `NarrativeThreadView.id` | `src/shared/narrative-thread.ts`；`electron/repositories/narrative-thread-repository.ts` |

### 4.3 本阶段未触碰的边界

- 不改共享接线文件：`editor-store.ts`、`StageWorkspace.tsx`、`stage-progress.ts`、`ipc-channels.ts`、`MIGRATION_LANE`。
- 不改旧星图 `src/components/editor/RelationshipGraph.tsx`。
- 不写仓储实现、不写 IPC adapter、不写侧栏 UI；不安装新依赖；不提交/推送。

## 5. 留给 S2 的未决项

1. **`sourceRevision` 计算口径**：对哪些权威实体字段做 JSON 哈希（参照 `plot-tree-repository.sourceRevision` 的 `createHash('sha256').update(JSON.stringify(facts))`）；角色名单可否直接纳入 `factHash`，需 S2 接仓储时定。
2. **软删除子树策略**：删文件夹时子树是否一并标记 `deletedAt`；恢复时是否连带恢复整棵子树；是否需要类似章节 `deletionId` 的分组句柄。
3. **旧项目姓名版角色**：身份 schema 升级前的角色无稳定 `characterId`，当前合同 refs 要求 `characterId` 句柄；姓名版回退方案 S2 定。
4. **document 节点正文落点**：文档正文复用现有 draft / revision 链路，还是独立草稿列；本合同明确树节点不复制正文。
5. **排序序号策略**：兄弟节点 `order` 采用删除后整体重排，还是稀疏序号 + 插入定位；拖拽排序交互随 S2 UI 定。
6. **快照存储列与迁移**：`project_core` 新增 JSON 列（M09，schema 9 → 10），列名与迁移登记由主集成者串行接线。
7. **`locked` 状态接线**：S4 锁定操作落地前，S2 不产生 `locked` 节点；读取路径已容忍该取值。
