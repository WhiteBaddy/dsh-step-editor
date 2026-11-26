# 03 阶段二：Client 界面（S4-02）

> 状态：实现完成，待可视化验收 ｜ 版本：v1.0 ｜ 最后更新：2026-11-26
> 上游：[01-requirements.md](01-requirements.md)、[02-plan.md](02-plan.md)
> 范围：FR-02、FR-03、FR-04、FR-07、FR-08、FR-10（Client 侧）；NFR-06、NFR-07

## 1. 阶段目标与范围

在 Web UI 的会话头部打开步骤面板，完成一次截断与一次分支；设置页切换墓碑模式后下一次操作生效。

## 2. 实际完成内容

| 任务 | 状态 | 产物 |
| --- | --- | --- |
| T2.1 头部入口 | ✅ | `client.js` 注册 `conversation.session.header.actions`，自有 id，Chat/Trajectory 共享 |
| T2.2 面板列表 | ✅ | 读 `useProjection('stepEditor')`，展示坐标/摘要/字节/图片/状态，默认滚到底部 |
| T2.3 分页 | ⚠️ 未做 | 当前列出投影内全部步骤；"加载更早"依赖客户端分页，留待 ISSUE-005 |
| T2.4 截断预览与确认 | ✅ | 确认框展示移除消息数/字节/图片 + 不可撤销提示，portal 到 body |
| T2.5 执行与反馈 | ✅ | 调 `binding.session.command('/truncate T S')`，轮询投影确认 shadowed，失败给中文提示 |
| T2.6 分支 | ✅ | 边界 = 上一步 `endSeq`；第 1 步用 `firstSeq`；`ctx.sessions.fork` + 打开子会话 |
| T2.7 设置页 | ⚠️ 待验 | Host Config 已声明 `tombstone`；P-04 自动表单的可视化验证未做（无浏览器控制） |
| T2.8 空态/运行中/已遮蔽/可访问性 | ✅ | 运行中横幅、遮蔽置灰、Escape 关闭、`role="dialog"`、焦点落在关闭按钮 |
| T2.9 交互测试与文档 | ⚠️ 部分 | `node --check` 通过、Host 15 条测试通过；浏览器交互测试未执行 |

**与计划的差异**：

1. **没有做分页**：投影本身覆盖全量历史，面板直接列出；长会话的滚动体验留到 S5 观察。原计划的 T2.3 降级为 ISSUE-005。
2. **确认框不读 `confirm` 设置**：v1 设置只有 `tombstone`，确认框始终开启（01 §2 的决定）。
3. **命令结果不直接回传**：命令桥只返回 `matched`，面板用"投影是否出现 shadowed"判定成功，失败提示"查看命令记录"。
4. **未做可视化验收**：本环境无法驱动浏览器（页面需 `dsh web` 的鉴权 token），头部按钮与设置表单的呈现需人工刷新确认。

## 3. 关键实现决策

- **只注册一个 slot 条目**：`conversation.session.header.actions`，不替换 shipped 条目、不写 DOM；弹层用 React portal 到 `document.body`，满足该 slot "overlays must portal" 的要求。
- **面板数据只读投影**：不在客户端折叠事件，避免与 Host 的步骤推导漂移；命令执行后用 `binding.session.projections.faceOf('stepEditor')` 轮询确认结果。
- **分支是纯客户端动作**：`ctx.sessions.fork({ atSeq })` + `ctx.uiWorkspace.openSession`，不需要新增 Host 入口。
- **样式用主题 token**：`--dsw-alias-*`，不引入 shipped 客户端包；组件内渲染 `<style>`，随组件卸载移除。
- **双语**：`ctx.locale.register` + slot 的 `locale` 注入，中英文案随界面语言切换。

## 4. 测试记录

| 项 | 结果 |
| --- | --- |
| `node --check client.js` | ✅ 语法通过 |
| 客户端装配测试（`test/client-wiring.test.js`） | ✅ 模块 id、locale 字典、头部 slot 注册 |
| Host 15 条测试 | ✅ 全绿（见 03-stage-01） |
| 客户端模块发布 | ✅ bundle 重启后 `clientModules` 重新读取 `dsh.client`（manifest 含 `platform/immediately/inject`） |
| 浏览器交互 | ⚠️ 部分：用户已在面板内完成一次分支；截断/设置/轨迹未验 |
| 分支（真实会话） | ✅ 用户操作；数据层见 [05-integration-test.md](05-integration-test.md) §3 |

客户端自动化覆盖仅到装配层；未验证项：头部按钮在 Chat/Trajectory 的可见性（TC-04）、面板与投影一致性（TC-05）、确认框不写入（TC-07）、UI 内截断（TC-08/TC-10）、分支（TC-12/TC-13）、设置表单（TC-14/TC-15）、重载重建（TC-18）。

## 5. 度量

| 指标 | 实测 |
| --- | --- |
| `client.js` | 约 420 行（含中英文字典与内联样式） |
| 客户端依赖 | 仅 `react` / `react-dom`（浏览器基线模块） |
| 新增 bundle 资产 | `client.js`（约 18 KB） |

## 6. 遗留问题

| ID | 状态 | 说明 |
| --- | --- | --- |
| ISSUE-005 | 待处理 | 长会话分页与滚动体验；当前全量列出。预期闭环：S5。 |
| ISSUE-007 | 进行中 | 面板已调用 `/truncate`，但尚未在 GUI 内真实触发；需刷新后验收。 |
| ISSUE-009（新增） | 进行中 | 面板与分支已由用户验证；截断、设置、轨迹、重载待验。预期闭环：S5。 |
| ISSUE-010（新增） | 待处理 | 客户端无自动化交互测试（无 DOM 环境）。预期闭环：v1.x 或 S5 手工矩阵。 |

## 7. 下一阶段输入

- 需要用户刷新页面后确认：头部「步骤」按钮、面板列表、一次截断、一次分支、设置页表单。
- 若按钮未出现：检查 `clientModules` 是否发布该包（`dsh.client` manifest / entry 重启）与浏览器缓存。
- 可视化验收通过后进入 S5：安装/升级/卸载、Chat × Trajectory × visible/silent 矩阵、总结。

## 变更记录

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-11-26 | v1.0 | 客户端实现：头部入口、面板、确认框、分支、双语；待可视化验收 |
