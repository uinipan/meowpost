<div align="center">

<img src="public/app-icon.png" alt="MeowPost" width="180">

<h1>MeowPost</h1>

<p>Find a book. Deliver it to your bookshelf.</p>

<p>A local graphical front end for Z-Library, WeRead, and Kindle.</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-22%2B-856653?style=flat-square" alt="Node.js 22 or newer">
  <img src="https://img.shields.io/badge/macOS-12%2B-b8a797?style=flat-square" alt="macOS 12 or newer">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-c9a784?style=flat-square" alt="MIT License"></a>
</p>

<p><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>

<p><a href="#features">Features</a> · <a href="#platforms">Platforms</a> · <a href="#installation">Install</a> · <a href="#quick-start">Quick start</a> · <a href="#macos-app">macOS app</a> · <a href="#privacy-and-local-data">Privacy</a> · <a href="#credits">Credits</a></p>

</div>

## Features

- **Find and compare** — search by title, author, or ISBN. Filter by format, language, and publication year. Inspect editions, descriptions, interest scores, and file-quality scores.
- **Deliver to WeRead** — download and import a book with progress for download, upload, and bookshelf confirmation.
- **Send to Kindle** — configure email delivery and send ebooks through the upstream CLI.
- **Import your files** — select a local EPUB, PDF, MOBI, AZW3, or TXT file for delivery.
- **Keep track** — browse recommendations, popular books, existing favorites, download history, and transfer tasks.
- **Make it yours** — manage accounts, mirrors, proxies, and search preferences in a cream-and-taupe interface with light and dark themes.
- **Use a Mac window** — open the interface in a dedicated application with menus and a native file picker.

MeowPost invokes the local `zlib` CLI for book services. The application interface currently uses Simplified Chinese.

## Platforms

| Platform | Application mode | Verification |
| --- | --- | --- |
| macOS | Browser interface and dedicated Mac application | Live service and integration checks completed; automated native-window visual verification pending |
| Windows | Browser interface | Executable discovery supports `zlib.exe` on `PATH`; awaiting testing on Windows |

The dedicated desktop application uses macOS AppKit and WKWebView. On Windows, use the local browser interface for searching and transferring books.

## Installation

Requires Node.js 22 or newer and the upstream `zlib` CLI. The current integration has been checked with `zlib v0.0.14`.

On macOS, install them with Homebrew.

```sh
brew install node
brew install heartleo/tap/zlib-cli
```

### Windows

Install Node.js 22 or newer, Git, and the upstream CLI. These PowerShell commands use WinGet.

```powershell
winget install --id OpenJS.NodeJS.LTS --exact
winget install --id Git.Git --exact
winget install --id heartleo.zlib --exact
```

After installation, open a new PowerShell window so the updated `PATH` takes effect, then start MeowPost.

```powershell
git clone https://github.com/uinipan/zlib-reading-room.git
cd zlib-reading-room
npm.cmd start
```

Open [127.0.0.1:4318](http://127.0.0.1:4318). Windows compatibility has not yet been tested on a Windows machine.

For other CLI installation methods, see the upstream [installation guide](https://github.com/heartleo/zlib/blob/main/docs/installation.md).

## Quick start

```sh
git clone https://github.com/uinipan/zlib-reading-room.git
cd zlib-reading-room
npm start
```

Open [127.0.0.1:4318](http://127.0.0.1:4318). The server uses Node.js built-in modules and runs directly from the checkout.

1. Open **Accounts & connections** (`账号与连接`) and check available Z-Library domains.
2. Sign in to Z-Library and scan the WeChat QR code to connect WeRead. Existing local CLI sessions can be reused.
3. Search for a book, compare its editions, and choose **Import to WeRead** (`导入微信读书`).
4. Follow the transfer in **Transfer tasks** (`传送任务`), then open WeRead to read it.

Transfer jobs use an application-owned temporary directory. Temporary copies are cleaned up when a job finishes. **Save to computer** explicitly keeps a copy in your Downloads folder. Local files selected for import remain under your control.

## macOS app

Requires macOS 12 or newer and Xcode Command Line Tools. From the checkout, build the application.

```sh
npm run build:mac
```

The default output is `~/Applications/Z-Library 阅读室.app`. Open it to launch a dedicated window and connect to or start the local service.

To choose an output path, use the build environment variable.

```sh
APP_OUTPUT_DIR="$PWD/build/MeowPost.app" npm run build:mac
```

The build uses an ad-hoc local signature. Distribution can be configured with Apple Developer signing and notarization.

## Privacy and local data

The service listens on `127.0.0.1`. Authentication sessions and delivery settings belong to each user's local installation.

| Location | Contents |
| --- | --- |
| `~/.config/zlib/` | Upstream sessions, network settings, and delivery configuration |
| `~/.local/share/zlib-ui/` | Interface preferences, transfer metadata, and application-owned temporary files |
| `zlib-reading-room.log` in the system temporary directory | macOS startup log |

The repository's `.gitignore` covers common credential files, environment configuration, logs, ebooks, and personal screenshots. Review staged files before publishing changes.

## Configuration

| Variable | Purpose |
| --- | --- |
| `ZLIB_UI_BINARY` | Path to the `zlib` executable |
| `ZLIB_UI_STATE_DIR` | Application data directory |
| `PORT` | Browser-mode port, defaults to `4318` |
| `APP_OUTPUT_DIR` | macOS build output path |

The macOS window connects to port `4318`. Network, search, proxy, and SMTP settings can be edited in the interface. The upstream [configuration guide](https://github.com/heartleo/zlib/blob/main/docs/configuration.md) describes the CLI settings.

## Development

```sh
npm run check
```

| Path | Responsibility |
| --- | --- |
| `server.mjs` | Local HTTP service, CLI integration, transfer queue, and temporary-file cleanup |
| `public/` | Interface, styles, and application icon |
| `native/ReadingRoom.swift` | AppKit / WKWebView desktop window |
| `native/build.sh` | macOS application and icon packaging |

Live search, account connections, book details, and listing endpoints have been checked. Isolated checks cover successful and failed jobs, duplicate submissions, and temporary-file cleanup after restart. Kindle delivery has not yet been tested end to end. Automated visual verification of the native window is still pending.

WeRead integration follows the upstream implementation. Verification requests, supported formats, and import limits depend on WeRead's responses. Use your own accounts and ebooks you are entitled to access.

## Credits

MeowPost is built on the capabilities of **zlib**, created by **heartleo**. The upstream CLI provides Z-Library connectivity, search, downloads, account sessions, and WeRead / Kindle integration. MeowPost adds the graphical interface, local service, transfer workflow, and Mac window through CLI and MCP calls. [Upstream project](https://github.com/heartleo/zlib) · [Author](https://github.com/heartleo)

The upstream project is licensed under MIT. Please refer to its license and usage documentation. [Upstream license](https://github.com/heartleo/zlib/blob/main/LICENSE) · [Upstream documentation](https://github.com/heartleo/zlib#readme)

## License

MeowPost is available under the [MIT License](LICENSE).
