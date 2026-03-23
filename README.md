<div align="center">

# <img src="https://img.icons8.com/fluency/48/cloud-development.png" width="32" height="32" /> tabby-bianbu-mcp

**Tabby terminal plugin for Bianbu Cloud &mdash; Shell & File Manager over MCP**

**Bianbu Cloud 的 Tabby 终端插件 &mdash; 基于 MCP 的远程 Shell 和文件管理器**

[![npm version](https://img.shields.io/npm/v/tabby-bianbu-mcp?style=flat-square&color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/tabby-bianbu-mcp)
[![license](https://img.shields.io/npm/l/tabby-bianbu-mcp?style=flat-square&color=blue)](LICENSE)
[![node](https://img.shields.io/node/v/tabby-bianbu-mcp?style=flat-square&color=339933&logo=node.js&logoColor=white)](package.json)
[![npm downloads](https://img.shields.io/npm/dm/tabby-bianbu-mcp?style=flat-square&color=orange)](https://www.npmjs.com/package/tabby-bianbu-mcp)
[![GitHub stars](https://img.shields.io/github/stars/niver2002/tabby-bianbu-mcp?style=flat-square&logo=github)](https://github.com/niver2002/tabby-bianbu-mcp)

---

[English](#-overview) &nbsp;&bull;&nbsp; [中文](#-概述)

</div>

<br/>

## <img src="https://img.icons8.com/fluency/24/info.png" width="20" /> Overview

> A [Tabby](https://tabby.sh) plugin that brings **cloud shell** and **file manager** experiences to Bianbu Cloud virtual machines,
> powered by the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).
> No SSH keys. No SFTP setup. Just MCP over HTTPS.

<br/>

## <img src="https://img.icons8.com/fluency/24/info.png" width="20" /> 概述

> 一款 [Tabby](https://tabby.sh) 插件，为算能板卡宇宙(Bianbu Cloud) 虚拟机提供**云端 Shell** 和**文件管理器**体验，
> 基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 通信。
> 无需 SSH 密钥，无需 SFTP，仅需 HTTPS + MCP。

<br/>

---

## ✨ Features / 功能特性

<table>
<thead>
<tr>
<th width="50%">English</th>
<th width="50%">中文</th>
</tr>
</thead>
<tbody>
<tr>
<td>

**🖥 Cloud Shell**
- Full terminal experience via MCP shell sessions
- Persistent sessions with working directory tracking
- Character-at-a-time input with prompt detection

</td>
<td>

**🖥 云端 Shell**
- 通过 MCP Shell 会话实现完整终端体验
- 持久会话，自动跟踪工作目录
- 逐字符输入，智能提示符检测

</td>
</tr>
<tr>
<td>

**📁 File Manager**
- Browse, create, rename, delete files & directories
- Inline text editor with save support
- Drag-and-drop file upload
- Keyboard shortcuts (F2, F5, Del, Ctrl+N, Ctrl+Shift+N)

</td>
<td>

**📁 文件管理器**
- 浏览、新建、重命名、删除文件和目录
- 内联文本编辑器，支持保存
- 拖拽上传文件
- 快捷键（F2 重命名 / F5 刷新 / Del 删除 / Ctrl+N 新文件 / Ctrl+Shift+N 新文件夹）

</td>
</tr>
<tr>
<td>

**⚡ High-Performance Transfers**
- Parallel chunked upload & download
- 32-slot request scheduler (2 interactive + 30 transfer)
- Configurable chunk sizes and concurrency
- Transfer queue with cancel support

</td>
<td>

**⚡ 高性能传输**
- 并行分块上传和下载
- 32 槽位请求调度器（2 交互 + 30 传输）
- 可配置分块大小和并发数
- 传输队列，支持取消

</td>
</tr>
<tr>
<td>

**🔧 Remote Maintenance**
- One-click push-upgrade from Tabby
- Auto-rollback on failed deployments
- Remote health diagnostics & version tracking
- Downloadable session logs (local + remote)

</td>
<td>

**🔧 远程维护**
- Tabby 内一键推送升级
- 部署失败自动回滚
- 远程健康诊断和版本追踪
- 可下载会话日志（本地 + 远端）

</td>
</tr>
</tbody>
</table>

<br/>

---

## 📦 Installation / 安装

<table>
<tr>
<td><b>npm (recommended)</b></td>
<td>

```bash
npm install tabby-bianbu-mcp
```

</td>
</tr>
<tr>
<td><b>Tabby Plugin Manager</b></td>
<td>

Search for `tabby-bianbu-mcp` in **Settings → Plugins → Install from npm**

在 **设置 → 插件 → 从 npm 安装** 中搜索 `tabby-bianbu-mcp`

</td>
</tr>
</table>

<br/>

---

## 🚀 Quick Start / 快速上手

### 1. Get API Key / 获取 API 密钥

<table>
<tr><td width="50%">

**English**: Log in to [Bianbu Cloud](https://cloud.bianbu.org) console, click your avatar (top-right) → **API Key** in the sidebar. Copy the full key.

</td><td width="50%">

**中文**: 登录 [算能板卡宇宙](https://cloud.bianbu.org) 控制台，点击右上角头像 → 左侧菜单 **API Key**，复制完整密钥。

</td></tr>
</table>

<div align="center">
<img src="docs/images/bianbu-console-overview.png" width="720" />
<br/>
<sub>控制台首页 — 点击右上角头像进入个人设置 / Console home — click avatar to enter profile settings</sub>
<br/><br/>
<img src="docs/images/bianbu-api-key.png" width="720" />
<br/>
<sub>侧栏点击 "API Key"，复制星号处的完整密钥 / Click "API Key" in sidebar, copy the full key</sub>
</div>

<br/>

### 2. Get MCP URL / 获取 MCP 地址

<table>
<tr><td width="50%">

**English**: On the console home page, click **"开始远程"** (Start Remote) on your instance card. In the popup, find the domain like `xxx.gdriscv.com`. Your MCP URL is:

`https://<that-domain>/mcp`

In the plugin settings, you only need to paste the domain part (without `https://` or `/mcp`).

</td><td width="50%">

**中文**: 在控制台首页，点击实例卡片上的 **"开始远程"**。在弹窗中找到类似 `xxx.gdriscv.com` 的域名。你的 MCP 地址是：

`https://<该域名>/mcp`

在插件设置中，只需粘贴域名部分（不含 `https://` 和 `/mcp`）。

</td></tr>
</table>

<div align="center">
<img src="docs/images/bianbu-mcp-url.png" width="720" />
<br/>
<sub>点击"本地连接"，在 connect 行找到域名 / Click "本地连接", find the domain in the connect line</sub>
</div>

<br/>

### 3. Configure Plugin / 配置插件

Open **Settings → Bianbu MCP** in Tabby and fill in:

在 Tabby 中打开 **设置 → Bianbu MCP**，填写：

| Field / 字段 | Description / 说明 | Example / 示例 |
|:---|:---|:---|
| **Domain** | Paste domain only (no `https://`, no `/mcp`) / 只粘贴域名 | `xxx.gdriscv.com` |
| **API Key** | Full key from step 1 / 第 1 步复制的完整密钥 | `your-api-key` |
| **Name** | Display name / 显示名称 | `bianbu` |

### 4. Connect / 连接

Click **"Test connection"** to verify. Then use:

点击 **"Test connection"** 验证。然后使用：

- **"Open Shell"** — for terminal access / 打开终端
- **"Open Files"** — for file management / 打开文件管理器

### 5. MCP Snippet / MCP 配置片段

Copy the auto-generated JSON config for other MCP clients:

复制自动生成的 JSON 配置，用于其他 MCP 客户端（如 Claude Desktop）：

```json
{
  "mcpServers": {
    "bianbu": {
      "type": "http",
      "url": "https://your-domain.example.com/mcp",
      "headers": {
        "X-API-KEY": "your-api-key"
      }
    }
  }
}
```

<br/>

---

## ⚙️ Settings Reference / 配置参考

<details>
<summary><b>Click to expand full settings table / 点击展开完整配置表</b></summary>

<br/>

| Key / 键 | Default / 默认值 | Description (EN) | 说明 (中文) |
|:---|:---|:---|:---|
| `name` | `bianbu` | Profile display name | 配置显示名称 |
| `domain` | *(empty)* | MCP domain (without `https://` or `/mcp`) | MCP 域名（不含 `https://` 和 `/mcp`） |
| `apiKey` | *(empty)* | `X-API-KEY` header value | API 密钥 |
| `interactiveConcurrency` | `2` | Interactive request slots | 交互请求并发槽位数 |
| `transferConcurrency` | `30` | Transfer request slots | 传输请求并发槽位数 |
| `maxConcurrentFiles` | `3` | Max parallel file transfers | 最大并行文件传输数 |
| `workerCadenceMs` | `0` | Dispatch cycle interval (ms); adaptive throttling auto-adjusts | 调度周期间隔 (毫秒)；自适应节流自动调整 |
| `maxRetries` | `2` | Max retry attempts | 最大重试次数 |
| `retryBaseMs` | `1000` | Base delay between retries (ms) | 重试基础间隔 (毫秒) |
| `uploadChunkBytes` | `65536` | Upload chunk size (bytes) | 上传分块大小 (字节) |
| `downloadChunkBytes` | `262144` | Download chunk size (bytes) | 下载分块大小 (字节) |
| `notes` | *(empty)* | User notes | 用户备注 |
| `installerRemotePath` | `/tmp/bianbu_agent_proxy.sh` | Remote installer path | 远端安装脚本路径 |
| `maintenanceAsRoot` | `true` | Run maintenance as root | 以 root 执行维护 |
| `reconnectPollMs` | `2000` | Health poll interval during upgrade | 升级时健康检测间隔 |
| `upgradeHealthTimeoutMs` | `120000` | Max wait time for upgrade (ms) | 升级最大等待时间 |

</details>

<br/>

---

## 🔄 Remote Maintenance / 远程维护

<table>
<tr><td width="50%">

### English

The plugin bundles `bianbu_agent_proxy.sh` — a self-contained MCP server installer with **blue/green deployment** and **automatic rollback**.

**Upgrade flow:**
1. Upload bundled installer → remote host
2. Launch detached `up` or `repair` process
3. Installer stages the new release, validates with `node`, then swaps atomically
4. Plugin polls remote health until expected version appears
5. On failure: previous installation is auto-restored

**After maintenance**, download session logs from the Settings page for debugging.

> **Note:** `ENABLE_PASSWORDLESS_SUDO` defaults to `false`. Opt in explicitly if needed.

</td><td width="50%">

### 中文

插件内置了 `bianbu_agent_proxy.sh` — 一个自包含的 MCP 服务器安装脚本，支持**蓝绿部署**和**自动回滚**。

**升级流程:**
1. 上传内置安装脚本到远端主机
2. 后台启动 `up` 或 `repair` 进程
3. 安装脚本在暂存区准备新版本，用 `node` 验证后原子切换
4. 插件持续轮询远端健康状态，直到出现预期版本号
5. 如果失败：自动恢复到之前的安装

**维护完成后**，可在设置页面下载会话日志用于调试。

> **注意:** `ENABLE_PASSWORDLESS_SUDO` 默认为 `false`。如需无密码 sudo，请明确开启并了解安全影响。

</td></tr>
</table>

<br/>

---

## 🏗 Architecture / 架构

```
┌───────────────────────────────────────────────────────┐
│                    Tabby Terminal                      │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  Shell Tab   │  │  Files Tab   │  │ Settings Tab│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│         │                 │                  │         │
│  ┌──────┴─────────────────┴──────────────────┴──────┐  │
│  │              BianbuMcpService                    │  │
│  │  ┌─────────────────┐  ┌────────────────────────┐ │  │
│  │  │ Interactive Lane│  │     Transfer Lane      │ │  │
│  │  │   (2 slots)     │  │     (30 slots)         │ │  │
│  │  └────────┬────────┘  └───────────┬────────────┘ │  │
│  │           └───────────┬───────────┘              │  │
│  │                       │                          │  │
│  │             JSON-RPC / HTTP(S)                   │  │
│  └───────────────────────┼──────────────────────────┘  │
└──────────────────────────┼─────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  X-API-KEY  │
                    │   Gateway   │
                    └──────┬──────┘
                           │
                ┌──────────▼──────────┐
                │  bianbu-mcp-server  │
                │   (Express + MCP)   │
                │                     │
                │  20 MCP Tools:      │
                │  health, shell,     │
                │  files, chunked     │
                │  transfers ...      │
                └─────────────────────┘
```

<br/>

---

## 🛠 Development / 开发

```bash
# Clone / 克隆
git clone https://github.com/niver2002/tabby-bianbu-mcp.git
cd tabby-bianbu-mcp

# Install dependencies / 安装依赖
npm install

# Build (sync assets → types → webpack)
npm run build

# Watch mode / 监视模式
npm run watch

# Run tests / 运行测试
npm test

# Full release verification / 完整发布验证
npm run verify
```

<br/>

---

## ⚠️ Security Considerations / 安全注意事项

<table>
<thead>
<tr>
<th width="50%">English</th>
<th width="50%">中文</th>
</tr>
</thead>
<tbody>
<tr>
<td>

- **Always use HTTPS** — API key is sent in `X-API-KEY` header; HTTP transmits it in plaintext
- **`as_root=true`** bypasses `FILE_ROOT` restrictions and uses `sudo -n`
- The **MCP snippet** in settings shows the real API key — don't share it publicly
- `pug@2.x` has known prototype pollution CVEs; this is a **build-time-only** dependency

</td>
<td>

- **始终使用 HTTPS** — API 密钥通过 `X-API-KEY` 头传输，HTTP 会明文传输
- **`as_root=true`** 会绕过 `FILE_ROOT` 限制，使用 `sudo -n` 执行
- 设置页的 **MCP 配置片段**会显示真实 API 密钥 — 不要公开分享
- `pug@2.x` 有已知的原型链污染漏洞，但这只是**构建时依赖**，不影响运行时

</td>
</tr>
</tbody>
</table>

<br/>

---

## 📋 Changelog / 变更日志

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

完整版本历史请查看 [CHANGELOG.md](CHANGELOG.md)。

<br/>

---

## 📄 License / 许可证

[MIT](LICENSE) &copy; [niver2002](https://github.com/niver2002)

---

<div align="center">

**Made with** ❤️ **for the Bianbu Cloud community**

**为算能板卡宇宙社区倾心打造**

<br/>

<sub>

[Report Bug / 反馈问题](https://github.com/niver2002/tabby-bianbu-mcp/issues) &nbsp;&bull;&nbsp;
[npm Package](https://www.npmjs.com/package/tabby-bianbu-mcp) &nbsp;&bull;&nbsp;
[Tabby Terminal](https://tabby.sh)

</sub>

</div>
