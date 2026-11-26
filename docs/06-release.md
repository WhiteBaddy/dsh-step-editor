# 06 发布说明

> 状态：发布准备完成，待 registry 凭据 ｜ 版本：v1.0 ｜ 最后更新：2026-11-26
> 上游：[05-integration-test.md](05-integration-test.md)

## 1. 包元数据（已是可发布形态）

| 字段 | 值 |
| --- | --- |
| name | `dsh-step-editor` |
| version | `0.1.0` |
| license | MIT |
| engines | `dsh: ">=0.2.2-rc.5 <0.3.0"`，`node: ">=20"` |
| dependencies | `zod ^4.6.6` |
| peerDependencies | `@deepseek-ai/schemastery ^3.19.0`（由 DSH 提供） |
| files | `index.js`、`client.js`、`step-index.js`、patch、locale、icon、`docs/DETAIL.md`、README |
| 安装方式 | 插件管理器安装框输入包名 → registry 解析 → 安装 |

`npm pack` 结果：**10 个文件，13.7 KB**；独立临时工程安装后 `import('dsh-step-editor')` 可正常加载 `apply` 与 `Config`（ISSUE-008 的依赖解析部分已闭环）。

## 2. 发布前检查

- [x] 16 条自动化测试通过
- [x] `npm pack` 内容正确
- [x] 独立工程安装 + 模块加载
- [x] 真实 profile 以新包名安装并 `fiberPhase: active`
- [ ] GUI：截断 / 设置页 / 轨迹页入口（发布前建议补）
- [ ] 浏览器硬刷新以加载新模块 id（`@local/...` → `dsh-step-editor`）

## 3. 发布命令

### 公开 npm

```sh
# 一次性登录（交互式）
npm login --registry https://registry.npmjs.org

# 或用 token（不要把 token 提交到仓库）
npm config set //registry.npmjs.org/:_authToken "<token>"

cd dsh-step-editor
npm publish --registry https://registry.npmjs.org --access public
```

发布后校验：

```sh
npm view dsh-step-editor version --registry https://registry.npmjs.org
```

### 公司内部 registry

```sh
npm publish --registry https://<internal-registry> --access public
```

安装时在插件管理器的 registry 选择器里选同一个源；否则会落到配置的镜像上找不到包。


## 3.5 通过 GitHub 分发（无需 npm 账号）

> 本仓库的实际发布信息（2026-11-26）：
> - 仓库：`https://github.com/WhiteBaddy/dsh-step-editor`
> - 插件提交：`2cbc989ab43622a7b7e43038c3387f2479c57201`
> - 直装 spec：`https://github.com/WhiteBaddy/dsh-step-editor`
> - 索引：仓库根目录 `index.json` + `icons/`；开启 Pages（main / root）后为
>   `https://whitebaddy.github.io/dsh-step-editor/index.json`
> - 状态：Git 直装已在独立工程实测；Pages 待仓库 Settings 开启。

### A. 直接 Git 安装（最快）

1. 把仓库推成**公开** GitHub 仓库，包放在仓库根（与 `package.json` 同级）。
2. 用户在插件安装框输入仓库地址：

```text
https://github.com/<user>/dsh-step-editor
```

安装框的 Git 示例就是这个格式；建议固定到一个提交，便于复现：

```text
https://github.com/<user>/dsh-step-editor#<40 位 commit SHA>
```

**限制**：以分支/标签保存的 Git spec 不能在插件页“更新”，换版本要重装；且用户机器必须能访问 `github.com`（公司网络可能拦截）。

### B. GitHub Pages 索引（可搜索）

如果希望“搜名字就装”，把索引和图标放到 GitHub Pages：

```text
index.json
icons/dsh-step-editor.svg
```

`index.json` 示例（`commit` 填 push 后的 `git rev-parse HEAD`）：

```json
{
  "format": 1,
  "title": { "en": "Step truncate", "zh": "步骤截断" },
  "plugins": [{
    "name": "dsh-step-editor",
    "title": { "en": "Step truncate", "zh": "步骤截断" },
    "description": {
      "en": "Truncate model context from a step to the end of the session, or branch before a step.",
      "zh": "按步骤把模型上下文截断到会话末尾，或在某一步之前分支。"
    },
    "icon": "icons/dsh-step-editor.svg",
    "author": "<你的名字>",
    "versions": [{
      "version": "0.1.0",
      "publishTimestamp": 1795670400,
      "source": {
        "type": "git",
        "url": "https://github.com/<user>/dsh-step-editor",
        "commit": "<40-hex-sha>",
        "path": "."
      },
      "engines": { "dsh": ">=0.2.2-rc.5 <0.3.0" }
    }]
  }]
}
```

发布：仓库 Settings → Pages → Deploy from a branch，选择 `main` 的 **/(root)**。索引 URL 为：

```text
https://whitebaddy.github.io/dsh-step-editor/index.json
```

用户端：插件 → 实验性插件 → 打开「自定义插件索引」→ 发现 → 添加索引源 → 填上面的 URL → 搜索「步骤截断」或 `dsh-step-editor` 安装。

### C. GitHub Packages（npm 兼容 registry）

可以用 GitHub token 发布到 `npm.pkg.github.com`，但每个用户都要配置 registry 与 token 才能安装，不适合“直接搜名字”，不推荐作为首选。

### 仓库初始化

```sh
cd dsh-step-editor
git init
git add .
git commit -m "feat: step-level context truncation and branching"
git branch -M main
git remote add origin https://github.com/<user>/dsh-step-editor.git
git push -u origin main
git rev-parse HEAD   # 填进 index.json 的 commit
```

包名与客户端模块 id 始终是 `dsh-step-editor`，与仓库名无关（建议同名）。

## 4. 用户侧安装

1. 插件页 → 安装 → 输入 `dsh-step-editor`（npm 路线），或粘贴 GitHub 仓库地址（Git 路线）；
2. 确认框显示包名、版本、registry 或 Git 提交；
3. 安装后刷新页面，会话头部出现「步骤」按钮。

**不需要**「自定义插件索引」或「发现」标签页——这条路是安装框的 registry 解析，与 dsh-pet 相同。

## 5. 已知限制

- 当前 npm registry 是 `registry.npmmirror.com`（只读镜像），不能发布；发布必须指向 npmjs.org 或内部 registry。
- 本机没有 npm 写凭据（无 token、未登录）。
- 发布后在镜像同步前，使用镜像的用户可能暂时搜不到；可先让对方用 `--registry` 或等待同步。
- 撤回：npm 允许 72 小时内 `npm unpublish`，之后建议 `npm deprecate`。

## 变更记录

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-11-26 | v1.0 | 发布准备：改名、元数据、打包与独立安装验证、发布命令 |
