<div align="center">

<img src="public/app-icon.png" alt="喵邮局" width="180">

<h1>喵邮局 · MeowPost</h1>

<p>把想读的书，递到你的书架。</p>

<p>连接 Z-Library、微信读书与 Kindle 的本地图形界面。</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-22%2B-856653?style=flat-square" alt="Node.js 22 或更新版本">
  <img src="https://img.shields.io/badge/macOS-12%2B-b8a797?style=flat-square" alt="macOS 12 或更新版本">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-c9a784?style=flat-square" alt="MIT 许可证"></a>
</p>

<p><a href="README.md">English</a> · <strong>简体中文</strong></p>

<p><a href="#功能">功能</a> · <a href="#平台支持">平台支持</a> · <a href="#安装">安装</a> · <a href="#快速开始">快速开始</a> · <a href="#macos-应用">macOS 应用</a> · <a href="#隐私与本机数据">隐私</a> · <a href="#致谢">致谢</a></p>

</div>

## 功能

- **找书与选版本** — 按书名、作者或 ISBN 搜索，筛选格式、语言与出版年份，查看版本、简介、兴趣评分和文件质量评分。
- **递到微信读书** — 下载并导入图书，显示下载、上传和入架确认进度。
- **发送至 Kindle** — 配置邮箱投递，通过上游 CLI 发送电子书。
- **导入已有文件** — 选择本地 EPUB、PDF、MOBI、AZW3 或 TXT 文件进行传送。
- **管理阅读与传送** — 浏览推荐、热门图书、已有收藏、下载历史与传送任务。
- **按习惯设置** — 管理账号、镜像、代理和搜索偏好，使用奶油杏与暖灰配色的浅色、深色主题。
- **独立 Mac 窗口** — 提供应用菜单和原生文件选择器。

喵邮局通过本机 `zlib` CLI 调用图书服务，当前应用界面使用简体中文。

## 平台支持

| 平台 | 使用方式 | 验证情况 |
| --- | --- | --- |
| macOS | 浏览器界面、独立 Mac 应用 | 已完成真实服务与集成检查，原生窗口的自动视觉验证待完成 |
| Windows | 浏览器界面 | 代码支持从 `PATH` 查找 `zlib.exe`，Windows 实机验证待完成 |

独立桌面应用基于 macOS 的 AppKit 和 WKWebView。Windows 可通过本机浏览器界面进行搜索与图书传送。

## 安装

需要 Node.js 22 或更新版本，以及上游 `zlib` CLI。当前集成已基于 `zlib v0.0.14` 验证。

macOS 可以通过 Homebrew 安装。

```sh
brew install node
brew install heartleo/tap/zlib-cli
```

### Windows

需要 Node.js 22 或更新版本、Git 和上游 CLI。可以在 PowerShell 中使用 WinGet 安装。

```powershell
winget install --id OpenJS.NodeJS.LTS --exact
winget install --id Git.Git --exact
winget install --id heartleo.zlib --exact
```

安装后重新打开 PowerShell，使更新后的 `PATH` 生效，然后启动喵邮局。

```powershell
git clone https://github.com/uinipan/zlib-reading-room.git
cd zlib-reading-room
npm.cmd start
```

打开 [127.0.0.1:4318](http://127.0.0.1:4318) 使用。Windows 兼容性尚未在 Windows 设备上实测。

其他 CLI 安装方式请查看上游[安装文档](https://github.com/heartleo/zlib/blob/main/docs/installation.md)。

## 快速开始

```sh
git clone https://github.com/uinipan/zlib-reading-room.git
cd zlib-reading-room
npm start
```

打开 [127.0.0.1:4318](http://127.0.0.1:4318)。服务使用 Node.js 内置模块，可在源码目录直接运行。

1. 在“账号与连接”页面检测可用的 Z-Library 域名。
2. 登录 Z-Library，用微信扫码连接微信读书。已有的本机 CLI 登录可以直接复用。
3. 搜索图书、比较版本，点击“导入微信读书”。
4. 在“传送任务”中查看进度，完成后打开微信读书阅读。

传送任务使用应用专属临时目录，任务结束后清理临时副本。手动点击“保存到电脑”会将文件保存在下载文件夹。本地导入所选的源文件仍由用户管理。

## macOS 应用

需要 macOS 12 或更新版本，以及 Xcode Command Line Tools。在源码目录执行以下命令构建应用。

```sh
npm run build:mac
```

默认输出到 `~/Applications/Z-Library 阅读室.app`。双击后打开独立窗口，并自动连接或启动本机服务。

可以通过环境变量指定构建输出位置。

```sh
APP_OUTPUT_DIR="$PWD/build/MeowPost.app" npm run build:mac
```

构建脚本使用本机临时签名。分发应用时可配置 Apple Developer 签名与公证。

## 隐私与本机数据

服务监听 `127.0.0.1`，登录会话与投递设置由每位用户自己的本机安装管理。

| 位置 | 内容 |
| --- | --- |
| `~/.config/zlib/` | 上游登录会话、网络设置和投递配置 |
| `~/.local/share/zlib-ui/` | 界面偏好、传送任务元数据及应用专属临时文件 |
| 系统临时目录中的 `zlib-reading-room.log` | macOS 应用启动日志 |

仓库的 `.gitignore` 已覆盖常见凭据文件、环境配置、日志、电子书与个人截图。发布更改前请检查 Git 暂存区。

## 配置

| 变量 | 用途 |
| --- | --- |
| `ZLIB_UI_BINARY` | `zlib` 可执行文件路径 |
| `ZLIB_UI_STATE_DIR` | 应用数据目录 |
| `PORT` | 浏览器模式端口，默认 `4318` |
| `APP_OUTPUT_DIR` | macOS 应用构建输出路径 |

macOS 窗口连接本机端口 `4318`。网络、搜索、代理与 SMTP 设置可在界面中编辑，CLI 设置详见上游[配置文档](https://github.com/heartleo/zlib/blob/main/docs/configuration.md)。

## 开发

```sh
npm run check
```

| 路径 | 职责 |
| --- | --- |
| `server.mjs` | 本机 HTTP 服务、CLI 集成、传送队列与临时文件清理 |
| `public/` | 界面、样式与应用图标 |
| `native/ReadingRoom.swift` | AppKit / WKWebView 桌面窗口 |
| `native/build.sh` | macOS 应用与图标打包 |

真实搜索、账号连接、图书详情和列表接口已验证。隔离测试覆盖任务成功、失败、重复提交和重启后的临时文件清理。Kindle 实际投递尚未完成端到端验证，原生窗口的自动视觉检查仍待完成。

微信读书集成使用上游实现，验证请求、支持格式和导入限制以微信读书实际返回为准。请使用自己的账号，并导入有权访问的电子书。

## 致谢

感谢 **heartleo** 开发的 **zlib**。上游 CLI 提供 Z-Library 连接、检索、下载、账号会话和微信读书 / Kindle 集成能力。喵邮局通过 CLI 与 MCP 调用这些能力，实现图形界面、本机服务、传送流程与 Mac 窗口。[上游项目](https://github.com/heartleo/zlib) · [原作者](https://github.com/heartleo)

上游项目采用 MIT 许可证，使用时请参考其许可证和使用说明。[上游许可证](https://github.com/heartleo/zlib/blob/main/LICENSE) · [上游文档](https://github.com/heartleo/zlib#readme)

## 许可证

喵邮局采用 [MIT License](LICENSE)。
