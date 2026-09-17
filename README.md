# Zigplan

Free, open source construction takeoff and quantity estimation for Windows, macOS, and Linux.

Zigplan is a desktop app for contractors, estimators, and quantity surveyors. Open a PDF or image plan set, calibrate scale, measure lengths and areas, count symbols, and keep a project cost database next to the drawings. Work stays on your machine — no account and no subscription.

The hosted product at [zigplan.com](https://www.zigplan.com) is a separate AI-native back office (takeoff, estimating, and procurement as a service). This repository is the free app you download and run locally.

**[Download the latest release](https://github.com/zetahiveco/zigplan-oss/releases/latest)** · **[zigplan.com](https://www.zigplan.com)** · **[Open source app page](https://www.zigplan.com/oss-app)**

## Features

- **Projects** — create and manage jobs locally
- **Plan files** — PDF, PNG, JPEG, and SVG drawings stored with the project
- **Takeoff** — pan, path, rectangle, count, find, and snip tools on the sheet
- **Scale** — calibrate drawings and compute real lengths and areas
- **Cost database** — groups, line items, units, prices, and vendors
- **Offline-first** — [PouchDB](https://pouchdb.com) on disk, no cloud required

Estimation workflows and [MCP](https://modelcontextprotocol.io) (Model Context Protocol) support are on the roadmap so agents and other tools can work with Zigplan projects in a later release.

## Zigplan.com vs this app

| | [zigplan.com](https://www.zigplan.com) | This app (open source) |
| --- | --- | --- |
| What it is | Hosted AI-native back office | Free desktop takeoff app |
| Who it is for | Teams that want takeoff, estimating, and procurement run as a service | Anyone who wants to measure and estimate on their own machine |
| Pricing | Starts at $599/mo | Free |
| Data | Zigplan workspace | Local database on your computer |

Use the hosted service when you want estimator review, location pricing, proposals, and procurement. Use this app when you want a free, private takeoff desk.

## Download

Installers are attached to each [GitHub Release](https://github.com/zetahiveco/zigplan-oss/releases):

| Platform | Package |
| --- | --- |
| Windows | `Zigplan-*-win-x64-setup.exe` (NSIS) |
| macOS | `Zigplan-*-mac-arm64.dmg` / `Zigplan-*-mac-x64.dmg` |
| Linux | `Zigplan-*-linux-*.AppImage` and `.deb` |

macOS builds are not notarized yet. If Gatekeeper blocks the app, open **System Settings → Privacy & Security** and allow it, or right-click the app and choose **Open**. Windows may show SmartScreen on unsigned builds — choose **More info → Run anyway**.

## Develop

Requires [Node.js](https://nodejs.org/) 22+ and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev
```

```bash
pnpm typecheck
pnpm lint
pnpm format
```

## Build

```bash
# Current platform unpack (useful for debugging)
pnpm build:unpack

# macOS
pnpm build:mac

# Linux
pnpm build:linux

# Windows (run on Windows)
pnpm build:win
```

Windows uses an NSIS installer via [electron-builder](https://www.electron.build/). GitHub Actions builds Windows, macOS, and Linux for each release.

## Stack

Electron, React, TypeScript, Tailwind CSS, PouchDB, and PDF.js. Packaged with [electron-builder](https://www.electron.build/).

## Contributing

Issues and pull requests are welcome. Please describe the takeoff or estimating workflow you are changing and test on the platform you use.

## License

[MIT](LICENSE) © Zetahive Technologies Private Limited
