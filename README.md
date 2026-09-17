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
- **Cost catalog** — groups, line items, units, prices, and vendors
- **Estimation** — map cost catalog items to takeoff quantities and download CSV
- **MCP** — agents in Cursor, Claude Code, OpenCode, and other tools can CRUD projects (except delete), files, takeoff, cost catalog, vendors, and estimates
- **Offline-first** — [PouchDB](https://pouchdb.com) on disk, no cloud required

## MCP (agents & tools)

### From the Zigplan app (recommended)

1. Open Zigplan.
2. Choose **File → Start MCP Server** (or **Zigplan → Start MCP Server** on macOS).
3. A dialog shows Claude Code setup steps — copy the CLI command or JSON.
4. Keep Zigplan open while agents use MCP. Stop with **File → Stop MCP Server**.

The in-app server listens on `http://127.0.0.1:47821/mcp` and shares the live project database (no second PouchDB lock).

### Claude Code example

```bash
claude mcp add --transport http zigplan http://127.0.0.1:47821/mcp
```

Or in MCP settings / `.mcp.json`:

```json
{
  "mcpServers": {
    "zigplan": {
      "type": "http",
      "url": "http://127.0.0.1:47821/mcp"
    }
  }
}
```

### Stdio (repo / without the app UI)

```bash
pnpm install
pnpm mcp
```

Point Cursor / OpenCode at `pnpm --dir /absolute/path/to/zigplan-oss-app mcp`. Optional `ZIGPLAN_DATA_DIR` overrides the data root. Close the desktop app if stdio writes hit a database lock.

**Tools include:** project list/create/rename (**no project delete**), files CRUD, takeoff CRUD plus path list/delete, cost catalog CRUD, vendors CRUD, estimate get/add/update/remove/export CSV.

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
