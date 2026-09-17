# Zigplan v1.0.1 Beta

Beta / Early Access release of **Zigplan** — a free, open source desktop app for construction takeoff and quantity estimation.

This build is an early public beta. Features and installers may change. Download for Windows and macOS, then work from PDF or image plans on your own machine. There is no account and no subscription.

The hosted AI-native back office remains at [zigplan.com](https://www.zigplan.com) (takeoff, estimating, and procurement as a service, starting at $599/mo). This app is the free local alternative.

## Downloads

| Platform | File |
| --- | --- |
| Windows | `Zigplan-1.0.1-beta-win-x64-setup.exe` (NSIS) |
| macOS | `Zigplan-1.0.1-beta-mac-arm64.dmg` / `Zigplan-1.0.1-beta-mac-x64.dmg` |
| Linux | `Zigplan-1.0.1-beta-linux-x86_64.AppImage` and `.deb` |

Installers are attached by GitHub Actions after this release is published. Refresh this page if assets are still uploading.

## In this release

- **Estimation** — map cost catalog items to takeoff quantities, set cost qty per takeoff qty, download CSV
- **MCP** — start/stop an HTTP MCP server from File menu; Claude Code / Cursor / OpenCode can CRUD projects (no delete), files, takeoff (incl. path select/delete), cost catalog, vendors, and estimates
- **Cost Catalog** — renamed from Cost Database; add/edit vendors (full details) inline
- Icon-button tooltips, Select fixes in dialogs, aligned takeoff toolbars, input placeholders

## Notes

- **Beta / Early Access** — expect rough edges and ongoing changes
- macOS builds are not notarized yet. Allow the app in **Privacy & Security**, or right-click and choose **Open**.
- Windows SmartScreen may warn on unsigned installers. Choose **More info → Run anyway**.
- Keep Zigplan open while using the in-app MCP server (`http://127.0.0.1:47821/mcp`).

## Links

- App page: https://www.zigplan.com/oss-app
- Hosted service: https://www.zigplan.com
- Source: https://github.com/zetahiveco/zigplan-oss
