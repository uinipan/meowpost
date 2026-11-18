# 阅读室 · Z-Library Reading Room

<img src="public/app-icon.png" alt="阅读室" width="160">

基于 [heartleo/zlib](https://github.com/heartleo/zlib) 的本地图形界面，提供搜索、版本查看、微信读书导入及独立 macOS 应用窗口。

A local graphical front end for [heartleo/zlib](https://github.com/heartleo/zlib), with WeRead imports and a macOS desktop window.

## 上游项目与致谢

感谢 [heartleo](https://github.com/heartleo) 开发的 [zlib](https://github.com/heartleo/zlib)。Z-Library 连接、检索、下载、账号会话、微信读书与 Kindle 相关能力由上游 CLI 提供。本项目实现中文可视化界面、本机 HTTP 服务、传送队列、临时文件清理及 macOS 窗口封装，通过命令行和 MCP 接口调用上游。

上游项目采用 MIT 许可证。使用时请同时遵循其[许可证](https://github.com/heartleo/zlib/blob/main/LICENSE)及[使用说明](https://github.com/heartleo/zlib#readme)。

## 功能

- 按书名、作者或 ISBN 搜索，筛选格式、语言、出版年份及排序方式
- 查看封面、出版社、译者、ISBN、简介、兴趣评分与文件质量评分
- 浏览热门图书、个性化推荐、已有收藏和下载历史
- 下载并导入微信读书，显示下载、上传和入架进度
- 导入本地电子书，配置 Kindle 投递
- 管理登录、微信扫码连接、域名、代理与偏好设置
- 奶油杏与暖灰配色，支持浅色和深色主题
- macOS 独立窗口、应用菜单及文件选择器

传送任务使用应用专属临时目录，任务结束后清理临时副本。点击“保存到电脑”会将文件保存在用户的下载文件夹。本地导入所选择的源文件仍由用户管理。

## 运行环境

- Node.js 22 或更新版本
- 已安装的 `zlib` CLI，当前版本基于 `v0.0.14` 验证
- 构建 macOS 应用需要 Xcode Command Line Tools

macOS 可以通过 Homebrew 安装上游 CLI。

```sh
brew install heartleo/tap/zlib-cli
```

其他安装方式请查看上游[安装文档](https://github.com/heartleo/zlib/blob/main/docs/installation.md)。

## 浏览器中运行

```sh
git clone https://github.com/uinipan/zlib-reading-room.git
cd zlib-reading-room
npm start
```

打开 <http://127.0.0.1:4318>。项目使用 Node.js 内置模块，可以直接运行。

首次使用，在“账号与连接”页面检测可用域名、登录 Z-Library，并扫码连接微信读书。已有的本机 `zlib` 登录可以直接复用。

## 构建 macOS 应用

安装 Xcode Command Line Tools 后，在项目目录执行以下命令。

```sh
npm run build:mac
```

默认输出到 `~/Applications/Z-Library 阅读室.app`。双击应用即可打开独立窗口，并自动连接或启动本机服务。

可以指定构建输出目录。

```sh
APP_OUTPUT_DIR="$PWD/build/Z-Library 阅读室.app" npm run build:mac
```

构建脚本使用本机临时签名，适合在本机使用。分发应用时可按需要配置 Apple Developer 签名与公证。

## 本机配置与数据

| 位置 | 内容 |
| --- | --- |
| `~/.config/zlib/` | 上游 CLI 的登录会话、网络设置和投递配置 |
| `~/.local/share/zlib-ui/` | 界面偏好、传送任务元数据及专属临时目录 |
| 系统临时目录中的 `zlib-reading-room.log` | macOS 应用启动日志 |

HTTP 服务监听 `127.0.0.1`。账号、密码、Cookie、微信读书会话和 SMTP 授权码使用用户自己的本机配置。提交代码前请检查 Git 暂存区，`.gitignore` 已包含常见配置、凭据、日志、电子书与个人截图规则。

可通过环境变量调整运行位置。

| 变量 | 用途 |
| --- | --- |
| `ZLIB_UI_BINARY` | 指定 `zlib` 可执行文件路径 |
| `ZLIB_UI_STATE_DIR` | 指定应用数据目录 |
| `PORT` | 浏览器模式的服务端口，默认 `4318` |
| `APP_OUTPUT_DIR` | macOS 应用构建输出路径 |

macOS 窗口使用固定的本机端口 `4318`。`zlib` 的网络、搜索、代理和 SMTP 设置可在界面中配置，详见上游[配置文档](https://github.com/heartleo/zlib/blob/main/docs/configuration.md)。

## 开发检查

```sh
npm run check
```

主要文件如下。

| 文件 | 职责 |
| --- | --- |
| `server.mjs` | 本机服务、CLI 调用、任务队列及临时文件清理 |
| `public/` | 中文界面、样式与应用图标 |
| `native/ReadingRoom.swift` | AppKit / WKWebView 应用窗口 |
| `native/build.sh` | macOS 应用与图标打包 |

## 当前验证范围

真实搜索、账号连接、图书详情和列表接口已验证。任务成功、失败、重复提交和重启后的临时文件清理已通过隔离测试。Kindle 实际投递尚未验证，macOS 原生窗口的自动视觉检查尚未完成。

微信读书导入使用上游实现的接口，账号验证、支持格式和导入限制以微信读书实际返回为准。请使用自己的账号并导入有权使用的电子书。

## 许可证

本项目采用 [MIT License](LICENSE)。
