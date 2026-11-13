# 自由画布思维导图 P0 切片计划（fork 自留）

对应 ADR-0029。开发分支 `feat/canvas-mindmap`，自留 `lucusHU/Pagekin`，不向上游提 PR；流程仍按上游 Issue-first 与单切片单问题口径组织，Issue 在自留仓库按需补登。设计依据见项目目录 `fx1-非凡复刻与Pagekin融入架构方案.md` v0.2。

## 产品行为

- 左侧资料树：文件夹 / 文档 / 画布混排，层级展开折叠、拖拽排序、软删除进回收站并可恢复。
- 主画布：节点自由拖拽摆放，父子连线；支持新建/改名/删除/复制/锁定/复制样式，连线新建/断开/改连；缩放、适应视图、小地图；一键 dagre 整理只回写坐标，不动结构。
- AI 浮层：复用现有对话面板与 BYOK 模型接入；@ 引用当前画布节点、关联角色与相关章节；节点展开、节点扩写/改写先出候选卡片，作者确认后落库；不直接改图、不覆盖原稿。
- 状态栏：节点数、字数统计；缩放百分比与适应视图入口。
- 剔除项不进 P0：充值/额度/积分/余额、客户端下载页、账号登录头像、资源站/教程页、皮肤商城、分享外链、在线模板市场。

## 合同与职责

- **共享合同（`src/shared/canvas-schema.ts`）**：`CanvasNode` / `CanvasEdge` / `CanvasSnapshot` / `DocTreeNode` 类型与快照校验器；枚举 `type` / `state` / `origin`；成环/自连/悬空引用校验；`sourceRevision` sha256 乐观锁结构。
- **主进程/仓库（`electron/repositories/`）**：`canvas-repository.ts` 负责画布与资料树快照读写、乐观锁冲突拒绝、坏快照隔离（`storedSnapshotInvalid`）；M09 迁移由主集成者串行登记进 `MIGRATION_LANE`，业务模块不另造迁移框架。
- **状态层（`src/stores/canvas-store.ts`）**：当前会话节点/边/选区/视口/历史栈；只持导航句柄与快照副本，不持有权威数据。
- **服务层（`src/services/canvas/`）**：IPC adapter（`read/save/ai-begin/execute/cancel/confirm`）与提案组装；身份校验 `projectId` / handle / epoch / `sourceRevision`，对齐现有 generation harness。
- **渲染层（`src/components/stage/canvas/`）**：画布页面、自定义节点/边、工具条、AI 浮层、状态栏；文档节点复用现有 `CodeMirrorEditor`，不另上编辑器。
- **复用不重写**：BYOK 模型链路、AI 对话面板骨架、`ConfirmCard` / `DomainProposalDiff`、diff-match-patch、版本历史、角色库、导出备份、主题与 i18n 全部复用现有模块。

## 切片划分

### S1 基线与画布引擎接入
- 安装 `@xyflow/react`、`dagre`（MIT）；在 `stage/canvas/` 起最小画布页面，渲染静态节点与父子连线，可缩放/拖动视口。
- 落地 ADR-0029；确认旧 `RelationshipGraph` 未被改动。
- 出口：`typecheck` / `lint` / `check:i18n` 通过；最小画布在渲染层可加载（云端无头环境不做窗口实测）。

### S2 资料树
- `DocTreeNode` 合同 + `doc_tree` 快照存储 + 侧栏树 UI：CRUD、拖拽排序与层级缩进、软删除/恢复。
- 复用章节回收站软删除模式（ADR-0025），不复用章节回收站代码。
- 出口：树增删改、软删除可恢复；相关单测通过。

### S3 画布快照与节点/边 CRUD
- `CanvasNode` / `CanvasEdge` / `CanvasSnapshot` 合同 + `canvas-repository` + 快照读写 IPC。
- React Flow 渲染现有快照；节点/边新建、改名、删除；自由拖拽、缩放、小地图。
- 出口：快照可存取刷新；节点边可增删改；刷新后位置与结构保留。

### S4 画布编辑操作
- 多选、复制节点、复制样式、锁定（禁拖拽/改名/删除）；撤销/重做历史栈（结构与位置操作）；dagre 一键整理；节点数/字数状态栏。
- 出口：误删可逆；锁定节点不可改；整理不改父子结构；相关单测通过。

### S5 AI 浮层与节点提案
- AI 面板挂回画布入口；@ 菜单数据源接当前节点 + 父链 + 兄弟 + 关联角色/章节；节点展开、扩写/改写提案走候选卡片。
- 提案先候选，作者确认后写入画布快照；取消/身份校验/切项目拒绝对齐现有 generation 链路。
- 出口：出候选卡片不直接落图；可取消；冲突提示重载不强制合并。

### S6 文本应用链路与收尾
- 文本修改提案接 diff-match-patch 逐条确认，应用到节点 intent / 文档；原稿进版本历史。
- 剔除项核查（无充值/额度/登录/商城/外链入口）；新文案补中英双语；补齐 vitest 单测与 Storybook 节点示例。
- 出口：不覆盖原稿；`typecheck` / `test`（相关用例）/ `lint` / `check:i18n` 通过。

## 验收门槛

1. 节点创建 ≤ 3 步；AI 展开一次点击出候选；应用不覆盖原稿；误删可逆。
2. 每个切片出口跑与改动相关的 `typecheck` / `test` / `lint` / `check:i18n`，记录真实结果；未运行的检查不写成通过。
3. 云端无头环境只保证静态检查与单测；Electron 窗口行为、原生模块（better-sqlite3 / LanceDB）运行与 Windows 打包回本机或 GitHub Actions CI 补测。
4. 不提交 API Key / Token / 完整小说正文 / 私人路径 / 个人信息；AI 辅助代码逐项人工核验后再提交。

## 明确未包含（P1/P2）

- P1：角色卡/蓝图/章节双向引用与状态回写；导图导出蓝图格式；接入知识库检索；画布快照版本历史 UI；导图结构导出。
- P2：关系图谱视图、支线访谈脚本、模板内容扩充、云同步评估。
