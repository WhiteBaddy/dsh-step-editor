# 03 阶段一：Host 基础（S4-01）

> 状态：已完成 ｜ 版本：v1.0 ｜ 最后更新：2026-11-26
> 上游：[01-requirements.md](01-requirements.md)、[02-plan.md](02-plan.md)
> 范围：FR-01、FR-05、FR-06、FR-09、FR-10（Host 侧）；NFR-01 ~ NFR-05

## 1. 阶段目标与范围

在测试 profile 内，对 fixture 会话执行 `/truncate <轮次> <步骤>`，能把该步起的消息从模型可见历史移除；失败路径不写入任何事件。对应计划中的 T1.1 ~ T1.9。

## 2. 实际完成内容

| 任务 | 状态 | 产物 |
| --- | --- | --- |
| T1.1 bundle 骨架 | ✅ | `package.json`、`cordis.patch.yml`、`locale/{zh,en}.json`、`icon.svg`、`docs/DETAIL.md` |
| T1.2 步骤索引 fold | ✅ | `step-index.js` 的 `init/apply/view` 与契约 |
| T1.3 遮蔽追踪 | ✅ | 用替换事件的 `sourceEventSeqs` 标记被遮蔽节点 |
| T1.4 范围推导与校验 | ✅ | `planTruncation`：idle、存在、未遮蔽、节点 0、端点成员 |
| T1.5 替换写入 | ✅ | `appendTruncation`：visible / silent 两种墓碑 |
| T1.6 命令 `truncate` | ✅ | `--dry`、`--silent`、错误码、用法 |
| T1.7 单测与 fixture | ✅ | 2 个测试文件、15 条用例 |
| T1.8 性能基准 | ✅ | 1000 步冷 fold 实测 71 ms |
| T1.9 Host 文档 | ✅ | `docs/DETAIL.md`、项目 README |

**与计划的差异**：

1. **新增 `firstNodeType` 守卫**：原计划的节点 0 校验只凭「位置为 0」判断，会在没有系统提示词的会话里误报 `SYSTEM_NODE`。改为传入首节点事件类型，仅当首节点确为 `system/message` 时拒绝。
2. **写路径的 GUI 端到端留到 S4-02**：命令 handler 已在 `Session` 层完成 visible/silent 的真实追加与 `deriveMessages()` 断言；通过 GUI 触发 `/truncate` 的验收（TC-08/TC-10）并入阶段二。
3. **安装姿态**：为完成 T1.1/T1.6 的真实验证，bundle 已以 `link:` 方式装进 `web` profile 并激活。这是真实的 profile 变更，需在协议中保留记录（ISSUE-008）。

## 3. 关键实现决策

- **投影即读模型**：`stepEditor` 同时服务面板与命令；命令不重新扫描事件，直接从 `handle.stateOf(session)` 取步骤，避免两套推导漂移。
- **遮蔽不重放 surface**：替换事件按校验要求必须在 `sourceEventSeqs` 中列出全部被遮蔽节点，因此投影只需收集这些 seq，不必自行折叠 surface 顺序。
- **状态里不放派生值**：`status`、`cumulativeBytes` 在 `view` 中计算；state 保持 plain JSON，便于 projection cache 检查点。
- **墓碑两种形态**：visible 用带自定义 `source.kind` 的 `user/message`（模型可见一行说明，聊天视图默认不渲染）；silent 用空内容 `system/message`（不派生 wire 消息）。
- **命令是唯一写入口**：UI 面板（阶段二）与斜杠命令共用同一个 handler，符合 DSH「一个操作、两个调用方」的做法，并留下 `command/run` 审计。

## 4. 测试记录

运行方式：

```sh
cd dsh-step-editor && node --test test/step-index.test.js test/plugin.test.js
```

结果：**15 passed / 0 failed**（约 0.7 s）。

| 用例 | 覆盖 | 结果 |
| --- | --- | --- |
| 投影坐标/字节/图片/标签 | FR-01 | ✅ |
| 无关事件返回同一引用 | FR-01 | ✅ |
| 替换后遮蔽与累计扣减 | FR-01 | ✅ |
| visible 截断后 `deriveMessages` | FR-05 | ✅ |
| silent 截断无新增 wire 消息 | FR-05 | ✅ |
| 缺失步骤 / 已遮蔽错误 | FR-06 | ✅ |
| 命令参数解析 | FR-09 | ✅ |
| dry-run 文本 | FR-09 | ✅ |
| 1000 步性能 | NFR-03 | ✅ |
| 插件注册（投影 + 命令） | FR-01/FR-09 | ✅ |
| 运行中拒绝 | FR-06 | ✅ |
| dry-run 不写入 | FR-04/FR-09 | ✅ |
| 可见/静默执行 | FR-05 | ✅ |
| 用法与未知步骤 | FR-09 | ✅ |

未覆盖（按计划留给后续）：GUI 内触发（TC-08/TC-10 的 UI 侧）、真实超限会话的网关验证（TC-10 人工）、设置页表单（P-04，阶段二）。

## 5. 度量

| 指标 | 实测 |
| --- | --- |
| 包体积（不含 node_modules/docs） | 75 KB |
| 代码行数 | `index.js` 112 + `step-index.js` 382 + 测试 324 = 818 行 |
| 1000 步冷 fold | 71 ms（预算 < 100 ms） |
| 真实会话投影 | 1725 事件 → 198 步；`stepEditor` 已写入 projection cache |
| 激活状态 | `include:dsh-step-editor`：`enabled: true`，`fiberPhase: active` |
| 依赖解析 | 本地 `link:` 安装，`zod` / `@deepseek-ai/schemastery` 由 checkout 的 `node_modules` 符号链接解析 |

## 6. 遗留问题（更新全局登记表）

| ID | 状态 | 说明 |
| --- | --- | --- |
| ISSUE-003 | **已闭环** | `truncate` 与现有命令无冲突：全量搜索仅在 inspector 的前端 bundle 内出现同名，不是命令注册；插件 fiber 已 active。 |
| ISSUE-004 | 待处理 | silent 模式已在 Session 层验证（无新增 wire 消息），GUI 端到端待 TC-09。预期闭环：S4-02 结束前。 |
| ISSUE-007（新增） | 待处理 | `/truncate` 命令尚未在 GUI 中真实触发；写路径 UI 侧端到端未验。预期闭环：S4-02 的 TC-08/TC-10。 |
| ISSUE-008（新增） | 待处理 | 当前为 `link:` 安装，依赖 checkout 的 `node_modules` 符号链接；打包安装（pnpm 正常解析依赖）未验证。预期闭环：S5 打包验证。 |

## 7. 下一阶段输入

- ✅ 投影 wire view 已注册并可在客户端读取（`stepEditor`）。
- ✅ 命令 `truncate` 已注册，参数/错误契约稳定。
- ✅ 阶段二所需的步骤字段（`turn/step/firstSeq/endSeq/bytes/images/status/cumulativeBytes`）已就绪。
- ⬜ S4-02 开始前先做 P-04（设置页自动表单）30 分钟验证；不成立则改 `settings.section`。
- ⬜ 面板的「加载更早」需验证客户端分页 API（`session.loadOlder`）。

## 变更记录

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-11-26 | v1.0 | 阶段一完成：Host 实现、15 条测试、真实 profile 激活与投影验证 |
