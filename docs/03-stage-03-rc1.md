# 03 阶段三：0.1.1 兼容维护（S4-03）

> 状态：实现完成，待 npm 发布与 rc.1 真实 profile 验收 ｜ 版本：v1.0 ｜ 最后更新：2026-11-28
> 上游：[01-requirements.md](01-requirements.md)（FR-14）、[02-plan.md](02-plan.md)（S4-03）

## 1. 目标与范围

让同一份插件在 DSH `0.2.2-rc.1` 与 `0.2.2-rc.5` 上都能安装并运行；顺带完成面板窗口化、整轮删除提示、npm 元数据与索引更新。发布 `0.1.1`。

## 2. rc.1 API 差异核对

从 registry 拉取 `0.2.2-rc.1` 的相关包，与 rc.5 对比：

| API | rc.1 情况 | 结论 |
| --- | --- | --- |
| `session.append` + `surfaceOp: replace` | 存在（`surfaceOp` 25 处） | 兼容 |
| `Session.surface.nodes` / `deriveMessages` | 存在 | 兼容 |
| `ctx.sessionProjections.register` + `wire/stateSchema/viewSchema/stateVersion/stateOf` | 存在（zod 4.4.3） | 兼容 |
| `ctx.commands.register`（handler/input） | 存在 | 兼容 |
| `dsh.client`（`platform`/`inject`/`immediately`） | 存在 | 兼容 |
| `conversation.session.header.actions` slot | 存在 | 兼容 |
| `useProjection` | 存在（chat/input） | 兼容 |
| `agent.status` | 存在（agent-loop） | 兼容 |
| `@deepseek-ai/schemastery` | `~3.19.0` | 与 peer `^3.19.0` 一致 |

**根因**：`engines.dsh` 写的是 `>=0.2.2-rc.5`，rc.1 被兼容性检查拒绝；代码本身没有 rc.1 不支持的 API。

## 3. 实际改动

| 文件 | 改动 |
| --- | --- |
| `package.json` | 版本 `0.1.1`；`engines.dsh: >=0.2.2-rc.1 <0.3.0`；补 `author`/`repository`/`homepage`/`bugs` |
| `client.js` | 面板只渲染最后 80 步，可“显示更早”；提示“选某轮第 1 步即整轮删除”；新增 `panel.more` 文案与 `.dse-more` 样式 |
| `index.json` | 版本 `0.1.1`；engines 同步；git source 指向 `ccfe438` |
| `test/manifest.test.js` | 静态断言 engines、`dsh.bundle`、`dsh.client`、exports、license、repository |
| `README.md` / `docs/DETAIL.md` | 版本与 rc.1 兼容说明 |

整轮删除**不需要新逻辑**：某轮第 1 步的 `firstSeq` 就是该轮的用户消息，选它截断即整轮删除；本版只在面板文案与 DETAIL 里写明。

## 4. 测试记录

| 项 | 结果 |
| --- | --- |
| rc.5（当前安装）全套测试 | **17 passed / 0 failed** |
| rc.1 的 `dsh-session` 上核心测试（step-index + plugin） | **15 passed / 0 failed** |
| `npm pack` | 11 个文件，15.1 KB，版本 0.1.1 |
| 索引校验 | `parseMarketIndex` 通过，版本 0.1.1，engines rc.1–rc.5 |
| GitHub 推送 | `ccfe438`（代码）+ `3e1430e`（索引），raw `package.json` 为 0.1.1 |

未验证：真实 rc.1 profile 的安装、插件激活与面板呈现（需用户环境）。

## 5. 度量

| 指标 | 值 |
| --- | --- |
| 版本 | 0.1.1 |
| 包大小 | 15.1 KB（11 文件） |
| 兼容范围 | DSH `0.2.2-rc.1` ~ `0.2.2-rc.5` |
| 自动化测试 | 17（rc.5）/ 15（rc.1 核心） |
| 人日 | 2.0（维护阶段） |

## 6. 遗留问题

| ID | 状态 | 说明 |
| --- | --- | --- |
| ISSUE-011 | 待处理 | rc.1 真实 profile 的安装与面板未验；预期由用户验证。 |
| ISSUE-005 | 部分缓解 | 面板窗口化 80 步；完整分页留 v1.x。 |
| ISSUE-007/009 | 进行中 | GUI 截断、设置、轨迹仍未验。 |

## 7. 下一步

1. 发布 `dsh-step-editor@0.1.1` 到 npm（本机无凭据）。
2. 在 rc.1 profile 安装 0.1.1，确认激活、命令、面板。
3. 同步更新 GitHub Pages 索引（若启用）。

## 变更记录

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-11-28 | v1.0 | rc.1 兼容修复、面板窗口化、元数据与索引更新 |
