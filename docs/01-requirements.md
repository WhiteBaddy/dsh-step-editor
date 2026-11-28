# 01 需求分析与功能分析：DSH 步骤级消息删除 / 分支插件

> 状态：已锁定 ｜ 版本：v1.1 ｜ 最后更新：2026-11-28
> 上游：[00-feasibility.md](00-feasibility.md)（v1.0 已锁定）
> 本文只锁定需求与契约；实现方案、任务拆分见 02；术语只在本文维护。

## 1. 术语与口径

| 术语 | 定义 |
| --- | --- |
| 轮次（Turn） | `turn/start` 到 `turn/end` 的生命周期，包含 0..N 个步骤；输入在此认领，工作不再欠账时关闭 |
| 步骤（Step） | 一次模型请求 + 它调用的工具；删除的最小单位 |
| 请求（Request） | 一次对模型提供方的调用；一个步骤至少一次，重试会多出请求 |
| 表层（surface） | 由 `surfaceOp` 声明的事件有序投影，模型历史只从它派生 |
| 替换（replace） | `surfaceOp: { op:'replace', startSeq, endSeq }`，从未来请求移除被遮蔽条目，不删日志 |
| 截断 | 本插件的删除操作：从选定步骤起替换到会话末尾 |
| 分支 | 从某个事件 seq fork 出新会话 |
| 墓碑 | 替换事件携带的替代消息：visible 为一行说明，silent 为空 system 节点 |
| 步界 | 步骤的结束事件 `step/end` 的 seq，分支的切点 |

**口径**：1 轮次 ≥ 0 步骤；1 步骤 ≥ 1 请求；截断单位是步骤，不提供单条消息删除。

## 2. 范围与锁定

| 优先级 | 内容 |
| --- | --- |
| **P0（v1.0）** | FR-01 ~ FR-10 |
| **P1（v1.x）** | FR-11 ~ FR-13 |
| **P2（不做）** | 中间步骤删除、聊天界面隐藏、撤销、轨迹表行内按钮（见 00 §6.1） |

与 00 的差异：D-08 的设置字段在本阶段收敛为 **仅 `tombstone`**。理由：确认框对破坏性操作应始终开启；估算列始终显示；`requestByteLimit` 需要客户端读取插件 Config 的可靠通道，未验证前不进 v1（登记为 ISSUE-001，见 §10）。

## 3. 功能需求（P0）

每条含：描述、验收标准（可执行/可观察）、来源。

### FR-01 步骤索引投影

**描述**：注册 Host 投影 `stepEditor`，折叠 `turn/start`、`step/start`、`step/end` 与全部 surface 事件，产出每一步的坐标、序号范围、消息数、字节数、图片数与状态。面板与截断命令共用这一份读模型。

**验收**：

- 给定 fixture 会话（3 轮、含读图步骤），`stateOf(session).steps` 的 `(turn, step)` 序列与日志中的 `step/start` 一一对应。
- 无关事件（如 `request/header`）返回**同一** state 引用。
- 含替换事件的会话，被遮蔽步骤的 `status === 'shadowed'`，其消息从累计字节中剔除。
- 1000 步的 fixture，冷 fold 耗时 < 100 ms（本地基准）。

**来源**：RC-01、RC-08。

### FR-02 会话头部入口

**描述**：在 `conversation.session.header.actions` 注册一个自有 id 的按钮；Chat 与 Trajectory 两个视图切换时都可见；点击打开步骤面板。

**验收**：

- 同一会话在 Chat / Trajectory 下都能看到该按钮。
- 不替换 shipped 条目（同 id 复用会替换，禁止）。
- 空会话点击显示"还没有步骤"空态。

**来源**：RC-05。

### FR-03 步骤面板

**描述**：面板从 `stepEditor` 读取步骤列表，展示：轮次、步骤、内容摘要（首条 assistant 文本或工具名）、本步字节、图片数、累计字节、累计估算、状态。默认定位最近一轮；支持"加载更早"（调用会话分页）。

**验收**：

- 列表行数与投影 `steps.length` 一致。
- 每行数字与投影字段一致（字节、图片数）。
- 被遮蔽行显示"已不在当前上下文"且不可操作。
- 运行中的步骤显示"运行中"。

**来源**：RC-05、RC-08。

### FR-04 截断预览

**描述**：点"截断"后弹出确认框，展示：将移除的消息数、图片数、字节、截断前累计、截断后累计（= 累计 − 被删区间累计）、"日志与聊天记录保留、不可撤销"提示。确认前不写入任何事件。

**验收**：

- 确认框数字与投影一致。
- 打开确认框前后 `surface.nodes` 与日志长度不变。
- 文案包含不可撤销提示。

**来源**：RC-08、RC-03。

### FR-05 截断执行

**描述**：确认后通过 Host 命令执行：从选中步骤的第一条消息到当前表层末尾，append 一个替换事件。visible 模式替换为带自定义 `source.kind` 的 `user/message` 墓碑；silent 模式替换为空内容 `system/message`。

**验收**（端到端，Stage 4）：

- 执行后 `session.surface.nodes` 不再包含被删区间。
- `deriveMessages()` 不含被删消息，其前一条历史保持不变。
- visible：最后一条 wire 消息是 user 文本；silent：无新增 wire 消息。
- 下一次请求的字节数显著下降（按字节断言，阈值由 fixture 固定）。
- 发送新指令能正常完成一轮。

**来源**：RC-01、RC-03。

### FR-06 边界校验与错误

**描述**：执行前校验：agent 空闲、步骤存在且未被遮蔽、范围是整步、不覆盖系统节点 0、端点仍是当前 surface 成员。失败返回错误码 + 中文文案 + 下一步动作，且不写入任何事件。

**验收**：对每个错误码（§7.2）构造反例（场景见 UC-01 异常），断言返回对应错误且日志长度不变。

**来源**：RC-01。

### FR-07 分支

**描述**：面板对某步点"分支"，从该步之前 fork：边界为该步上一步的 `step/end`；第 1 步用该步的 `firstSeq`（用户消息），保留提示词。子会话创建后自动打开；父会话不变。

**验收**：

- 子会话 `inheritedEventCount === boundary + 1`。
- 子会话历史不含该步骤的消息。
- 父会话除标题外无新增事件。
- 子会话可继续发送指令。

**来源**：RC-02。

### FR-08 设置页

**描述**：声明 Host `Config`：`tombstone: 'visible' | 'silent'`（默认 `visible`）。DSH 设置页自动生成表单，修改后下一次操作生效。

**验收**：

- 设置页出现该插件表单，字段与 schema 一致。
- `visible` 下执行截断产生 user 墓碑；`silent` 下产生空 system 节点。
- 非法枚举值被 schema 拒绝。

**来源**：RC-10。

### FR-09 兜底命令

**描述**：注册用户命令 `truncate`：

```
/truncate --dry                  # 列出步骤、字节、图片数，不写入
/truncate <turn> <step>          # 执行截断
/truncate <turn> <step> --silent # 本次强制 silent（覆盖设置）
```

命令名以注册时不冲突为准；如冲突改用 `step-truncate`。

**验收**：

- `--dry` 前后日志与 surface 不变。
- 命令不产生模型消息（不触发请求）。
- 参数缺失/非法返回用法提示。

**来源**：RC-05、RC-08。

### FR-10 审计与状态刷新

**描述**：执行产生 `command/run` 记录；投影更新后面板刷新，被删步骤显示"已移除"；命令结果以面板提示呈现。刷新页面后状态从日志重建。

**验收**：

- 执行后 transcript 出现一条命令记录。
- 面板状态从"可截断"变为"已移除"。
- 重载页面后面板仍显示同一状态。

**来源**：RC-01。

### FR-14 DSH 0.2.2-rc.1 兼容

**描述**：`engines.dsh` 覆盖 `0.2.2-rc.1` ~ `0.2.2-rc.5`；核心逻辑（步骤索引、截断、命令）在 rc.1 的 `dsh-session` 上通过同一套测试；客户端入口在 rc.1 的 slot 契约下可用。

**验收**：

- `package.json.engines.dsh === ">=0.2.2-rc.1 <0.3.0"`，rc.1 与 rc.5 都在范围内。
- 用 rc.1 的 `dsh-session` 跑 `test/step-index.test.js` 与 `test/plugin.test.js` 全绿。
- 在真实 rc.1 profile 安装后插件激活、命令可用（用户验证）。

**来源**：RC-12。

## 4. 功能需求（P1，v1.x）

| 编号 | 描述 | 触发条件 |
| --- | --- | --- |
| FR-11 | 聊天内联标记行：在截断位置显示"已移除 N 条消息"，从替换事件派生 | P-03 验证替换型 Definition 不重复渲染 |
| FR-12 | 整轮删除：把该轮用户消息一并移除 | 有用户提出"整轮从未发生"的诉求 |
| FR-13 | 截断前自动 fork 备份 | 用户开启"备份"设置，且会话可 fork |

## 5. 非功能需求

| 编号 | 需求 | 验收 |
| --- | --- | --- |
| NFR-01 | 兼容 DSH `0.2.2-rc.1` ~ `0.2.2-rc.5`（`engines.dsh: >=0.2.2-rc.1 <0.3.0`）；以 bundle 安装，不改 DSH 本体 | 在 rc.1 与 rc.5 两个 profile 安装后功能可用 |
| NFR-02 | 卸载/禁用插件后，含替换事件的会话仍可 open / resume / fork | 禁用后重开同一会话，历史可读、可继续 |
| NFR-03 | 性能：冷 fold < 100 ms（1000 步）；面板打开 < 200 ms；单次截断 append < 50 ms | 本地基准脚本 |
| NFR-04 | 原子性：读表层→校验→append 在同一同步块完成；失败不写入 | 错误反例下日志长度不变 |
| NFR-05 | 安全：无网络外发；不读取密钥；只操作当前会话 | 代码审查 + 网络抓包 |
| NFR-06 | 可维护：不复制 shipped 客户端代码；不 shadow shipped slot 条目 | 代码审查 |
| NFR-07 | 可观测：错误码 + 中文文案 + 下一步动作 | 错误反例逐条检查 |

## 6. 用例

### UC-01 截断救回超限会话

- **前置**：会话因请求超限被网关拒绝；用户已停止当前轮；插件已启用。
- **主流程**：打开面板 → 找到出问题的步骤 → 点截断 → 看预览 → 确认 → 面板显示已移除 → 输入新指令 → 请求成功。
- **异常**：
  - 轮次仍在运行 → 按钮置灰，提示先停止。
  - 步骤已被压缩/截断遮蔽 → 标记不可操作。
  - 端点失效 → 报 `RANGE_INVALID`，不写入。
  - 截断后仍超限 → 预览给新估算，用户继续向前截断。
- **后置**：表层缩短；日志完整；会话可继续。

### UC-02 从某步之前分支

- **前置**：会话有已关闭的步骤。
- **主流程**：面板选步 → 分支 → 子会话创建并打开 → 在子会话继续。
- **异常**：源会话不可读、fork 边界不存在、工作区附加失败 → 给出错误，不产生半成品子会话。
- **后置**：父会话不变；子会话含边界前历史。

### UC-03 修改设置

- **前置**：插件已启用。
- **主流程**：设置页改 `tombstone` → 下次截断生效。
- **异常**：非法值 → 表单拒绝。
- **后置**：配置写入 profile patch，重启后保持。

### UC-04 兜底命令

- **前置**：UI 不可用或需要脚本化。
- **主流程**：`/truncate --dry` 查看 → `/truncate <turn> <step>` 执行。
- **异常**：参数错误 → 用法提示；非空闲 → 拒绝。
- **后置**：同 UC-01。

### UC-05 在 DSH 0.2.2-rc.1 上安装

- **前置**：rc.1 profile；registry 或 GitHub 可达。
- **主流程**：安装 `dsh-step-editor@0.1.1`（或粘贴 Git URL）→ 插件激活 → `/truncate --dry` 可用 → 面板可见。
- **异常**：兼容性检查拒绝 → 检查 `engines.dsh`；面板空白 → 记录 rc.1 的 slot props；命令不可用 → 检查 `commands` 注入。
- **后置**：可执行一次截断；版本记录为 0.1.1。

## 7. 数据与接口契约

### 7.1 投影 `stepEditor`

```ts
interface StepEntry {
  turn: number
  step: number
  /** 该轮 turn/start 的 seq，用于第 1 步的分支边界。 */
  turnStartSeq: SessionSeq
  /** 该步骤第一条 surface 消息的 seq，作为截断 startSeq。 */
  firstSeq: SessionSeq
  /** 该步骤 step/end 的 seq，作为分支边界。 */
  endSeq: SessionSeq
  messages: number
  bytes: number
  images: number
  /** 面板行摘要：首条 assistant 文本前缀或工具名，截断到 80 字符。 */
  label: string
  status: 'closed' | 'open' | 'shadowed'
}

interface StepEditorView {
  steps: readonly StepEntry[]
  /** 已提交事件水位。 */
  asOfSeq: SessionSeq
}
```

- state 为 plain JSON；`stateVersion: 1`。
- 替换事件通过 `sourceEventSeqs` 标记被遮蔽消息（校验要求其覆盖全部被遮蔽节点）。
- 字节数 = `JSON.stringify(content).length` 之和；token 为粗估（文本 ≈ 字节/4，图片按固定成本），在 `view` 中计算。
- 客户端读取：`session.projections.faceOf('stepEditor')`。

### 7.2 命令 `truncate`

| 项 | 契约 |
| --- | --- |
| 语法 | `truncate --dry` \| `truncate <turn> <step> [--silent]` |
| 成功结果 | `{ kind: 'success', text }`，text 含移除条数、图片数、字节、模式 |
| 错误码 | `NOT_IDLE`、`STEP_NOT_FOUND`、`STEP_SHADOWED`、`RANGE_INVALID`、`SYSTEM_NODE`、`APPEND_FAILED`、`USAGE` |
| 副作用 | 成功时 append 一个替换事件；始终记录 `command/run` |

### 7.3 设置

```ts
interface Config {
  /** 删除处给模型的替代内容。 */
  tombstone: 'visible' | 'silent'
}
```

DSH 设置页由 Config schema 自动生成。

### 7.4 替换事件形状

```ts
// visible
session.append('user/message', {
  id, role: 'user',
  content: [{ type: 'text', text: `[已移除第 ${turn} 轮第 ${step} 步起的 ${n} 条消息]` }],
  source: { kind: 'step-editor-truncate' },
}, { surfaceOp: { op: 'replace', startSeq, endSeq }, sourceEventSeqs: shadowed })

// silent
session.append('system/message', {
  turn, step,
  message: { id, role: 'system', content: [], source: { kind: 'system-prompt' } },
}, { surfaceOp: { op: 'replace', startSeq, endSeq }, sourceEventSeqs: shadowed })
```

### 7.5 面板状态机

```text
idle ──open──▶ listing ──select──▶ previewing ──confirm──▶ executing ──▶ idle(updated)
                   │                    │                      └──error──▶ idle(error)
                   └──unavailable(row)──┘
```

`executing` 期间所有动作按钮禁用；失败回到 `idle` 并展示错误码。

## 8. 约束与假设

- 网关的请求体积上限不对外暴露；v1 只展示字节数，不判断是否达标。
- 客户端事件窗口分页；面板默认最近一轮，更早的步骤需"加载更早"。
- `user/message` 事件不带 turn/step，步骤归属由投影按游标推导。
- 同一时刻只允许一个截断操作（命令串行）。
- 目标 DSH 版本锁定 `0.2.2-rc.5`；升级需回归。

## 9. 难点分析

| 编号 | 难点 | 影响 | 对策 | 验证方式 |
| --- | --- | --- | --- | --- |
| D-01 | 步骤→表层映射（`user/message` 无坐标） | 截断点偏移 | 投影统一用 `turn/start`、`step/start`、`step/end` 推导游标；命令复用投影 | fixture 断言 `firstSeq`/`endSeq` |
| D-02 | 端点被历史替换遮蔽 | 截断失败 | 执行前用 `surface.nodes` 校验端点成员 | 先 compaction 再截断的反例 |
| D-03 | silent 墓碑属非常规用法 | 模型/客户端行为不可预期 | 默认 visible；silent 端到端实测后保留 | P-02 + 恢复会话 |
| D-04 | 大会话 fold 成本 | 面板打开慢 | 增量 fold、同引用短路、默认最近一轮 | 1000 步基准 |
| D-05 | 卸载插件后的可读性 | 遗留会话打不开 | 只用标准事件与标准字段；自定义 source kind 由消费者 fall through | 禁用插件后 open/resume |
| D-06 | 投影与真实 surface 不一致 | 状态显示错误 | 用替换事件的 `sourceEventSeqs` 标记遮蔽，不自行重放 surface | 与 `session.surface.nodes` 对拍 |

## 10. 技术选型（ADR 摘要）

### ADR-01 读模型：session projection + wire view

- **背景**：面板需要全量步骤与体积，客户端事件窗口分页。
- **选项**：客户端自行 fold / 自定义 RPC / projection。
- **结论**：projection。框架驱动、增量、可缓存；客户端不折叠事件。
- **代价**：state 必须 plain JSON、纯同步、维护 `stateVersion`。

### ADR-02 写入口：用户命令

- **背景**：UI 按钮与斜杠命令要共用一套逻辑；删除是用户特权。
- **选项**：命令 / 自定义 RPC / agent tool。
- **结论**：用户命令。DSH 文档明确把命令列为 UI 调用 Host 操作的入口；顺带留审计。
- **代价**：每次执行在 transcript 留一条命令记录。

### ADR-03 墓碑：两种模式

- **选项**：user 墓碑 / 空 system 节点 / developer 节点。
- **结论**：visible 用带自定义 source 的 `user/message`；silent 用空 `system/message`。
- **代价**：silent 属非常规用法，需实测；自定义 source 需消费者 fall through。

### ADR-04 入口：会话头部 slot

- **选项**：头部 slot / 侧栏 tab / 行内按钮。
- **结论**：头部 slot。Chat/Trajectory 共享，不依赖轨迹渲染器，不复制 shipped 代码。
- **代价**：轨迹页需打开面板，不是行内按钮（00 §6.1 已记录替代路径）。

## 11. 需求 → RC 映射

| RC | 承接 |
| --- | --- |
| RC-01 后缀截断 | FR-01、FR-04、FR-05、FR-06、FR-10 |
| RC-02 步骤级分支 | FR-07 |
| RC-03 删除标记 | FR-05、FR-08 |
| RC-04 中间步骤删除 | 明确不做（P2） |
| RC-05 操作入口 | FR-02、FR-03、FR-09 |
| RC-06 UI 隐藏 | 明确不做（P2） |
| RC-07 运行中排队 | 明确不做（P2，待 v1.x 评估） |
| RC-08 预览与估算 | FR-01、FR-03、FR-04、FR-09 |
| RC-09 撤销 | 明确不做（P2） |
| RC-10 设置页 | FR-08 |
| RC-11 轨迹行内 | 明确不做（P2，见 00 §6.1） |
| RC-12 rc.1 兼容 | FR-14、NFR-01 |

## 12. 遗留问题登记

| ID | 描述 | 来源 | 影响 | 预期闭环 | 状态 |
| --- | --- | --- | --- | --- | --- |
| ISSUE-001 | 客户端读取插件 Config（`requestByteLimit` 等）的可靠通道未验证，故 v1 设置只保留 `tombstone` | Stage 1 | 面板无法按用户上限提前标红 | v1.x | 待处理 |
| ISSUE-002 | P-03（自定义 chat 节点是否被 `process-groups` 折叠）与 P-04（设置页自动表单）尚未实测 | Stage 1 | 影响 FR-11 与 FR-08 的呈现 | Stage 4 阶段二前 | 待处理 |

## 13. 准出检查

- [x] 00 的每条 RC 都能映射到至少一条 FR 或"明确不做"
- [x] 每条 P0 FR 有可判定的验收标准（命令/断言/可观察现象）
- [x] 难点分析每条都有验证方式
- [x] 技术栈选型没有悬空项（ISSUE 已登记闭环时间）
- [x] 术语只在本文维护，后续文档引用不复制

---

## 变更记录

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-11-26 | v1.0 | 初稿并锁定：术语、FR-01~13、NFR、UC、契约、ADR、RC 映射 |
| 2026-11-28 | v1.1 | 新增 FR-14（rc.1 兼容）、UC-05，NFR-01 范围放宽到 rc.1 |
