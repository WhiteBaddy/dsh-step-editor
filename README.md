# dsh-step-editor

DSH 插件：**按步骤**修剪模型上下文 / 分支会话。

> 状态：**v0.1.1**：兼容 DSH `0.2.2-rc.1` ~ `0.2.2-rc.5`；分支已验收，截断/设置/轨迹的 GUI 验收待补。
> 起因：读图步骤把请求顶爆网关，而该错误不被 DSH 识别为 context-overflow，compaction 不触发，会话卡死（详见 `docs/00-feasibility.md` §1）。

## 安装

兼容性：DSH `0.2.2-rc.1` ~ `0.2.2-rc.5`（`engines.dsh: >=0.2.2-rc.1 <0.3.0`）。

- GitHub 直装（已发布）：在插件安装框粘贴 `https://github.com/WhiteBaddy/dsh-step-editor`
- npm：`dsh-step-editor`（发布待 registry 凭据）
- 搜索安装：开启「自定义插件索引」后添加 `https://whitebaddy.github.io/dsh-step-editor/index.json`（需仓库先开启 GitHub Pages）

## 现在能做什么

```
/truncate --dry                  # 列出各步的字节/图片/状态，不写入
/truncate <轮次> <步骤>          # 从该步起截断到会话末尾
/truncate <轮次> <步骤> --silent # 本次不向模型留下替代消息
```

也可以点会话头部的「步骤」按钮：面板里看每步体积、截断、或从某步之前分支。设置页可切换墓碑模式。

## 这个插件解决什么

| 能力 | 语义 | 版本 |
| --- | --- | --- |
| 后缀截断 | 从指定 `(轮次, 步骤)` 删除到会话末尾，**只改模型可见表层**，会话继续可用 | v1 ✅ |
| 步骤级分支 | 从某步之前 fork 新会话 | v1 ✅ |
| 操作入口 | 会话头部共享入口 + 步骤面板，对话页与轨迹页都可操作 | v1 ✅ |
| 操作标记 | 模型可见墓碑 / 完全无痕，可配 | v1 ✅（Config） |
| 设置页 | 墓碑模式在 DSH 设置页可改 | v1（待可视化验证） |
| 兜底命令 | `/truncate --dry`、`/truncate <turn> <step>` | v1 ✅ |

两条硬约束：

- **删除不是真删**：会话日志仅追加，`replace` 只从未来请求移除被遮蔽条目；聊天 transcript 仍显示原始行（审计）。
- **删除单位是步骤**：一次模型请求加它调用的工具；按步骤删才能保持工具调用/结果配对。

## 项目结构

```
index.js           # Host 插件入口：投影注册 + truncate 命令
client.js          # 会话头部入口 + 步骤面板 + 分支
step-index.js      # 纯函数：步骤 fold、范围推导、墓碑写入（无 Cordis 依赖）
test/              # node:test，16 条用例（含客户端装配）
locale/            # 插件页元数据
cordis.patch.yml   # bundle 行
docs/              # Stage 0–4 文档
```

## 开发

```sh
node --test test/step-index.test.js test/plugin.test.js
```

## 文档

| 文件 | 阶段 |
| --- | --- |
| [docs/00-feasibility.md](docs/00-feasibility.md) | Stage 0 可行性草案（已锁定） |
| [docs/01-requirements.md](docs/01-requirements.md) | Stage 1 需求与功能分析（已锁定） |
| [docs/02-plan.md](docs/02-plan.md) | Stage 2 开发计划 + Stage 3 追溯矩阵（已锁定） |
| [docs/03-stage-01-host.md](docs/03-stage-01-host.md) | Stage 4 阶段一：Host 基础（已完成） |
| [docs/03-stage-02-client.md](docs/03-stage-02-client.md) | Stage 4 阶段二：Client 界面（实现完成，待验收） |
| [docs/05-integration-test.md](docs/05-integration-test.md) | Stage 5 集成测试与总结（部分通过） |
| [docs/06-release.md](docs/06-release.md) | 发布说明：元数据、命令、安装方式 |
| [docs/appendix/poc-surface-replace.mjs](docs/appendix/poc-surface-replace.mjs) | Stage 0 PoC |
