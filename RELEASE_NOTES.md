# Zigplan v1.0 Beta

Beta / Early Access release of **Zigplan** — a free, open source desktop app for construction takeoff and quantity estimation.

This build is an early public beta. Features and installers may change. Download for Windows and macOS, then work from PDF or image plans on your own machine. There is no account and no subscription.

The hosted AI-native back office remains at [zigplan.com](https://www.zigplan.com) (takeoff, estimating, and procurement as a service, starting at $599/mo). This app is the free local alternative.

## Downloads

| Platform | File |
| --- | --- |
| Windows | `Zigplan-1.0.0-beta-win-x64-setup.exe` (NSIS) |
| macOS | `Zigplan-1.0.0-beta-mac-arm64.dmg` / `Zigplan-1.0.0-beta-mac-x64.dmg` |
| Linux | `Zigplan-1.0.0-beta-linux-x86_64.AppImage` and `.deb` |

Installers are attached by GitHub Actions after this release is published. Refresh this page if assets are still uploading.

## In this release

- Create projects and keep drawings, takeoff, and a cost database together
- Takeoff on PDF and image sheets: pan, path, rectangle, count, find, snip
- Calibrate scale and record lengths, areas, and counts
- Cost groups, line items, units, prices, and vendors — stored locally with PouchDB
- Check for updates from GitHub Releases (File → Check for Updates)

## Notes

- **Beta / Early Access** — expect rough edges and ongoing changes
- macOS builds are not notarized yet. Allow the app in **Privacy & Security**, or right-click and choose **Open**.
- Windows SmartScreen may warn on unsigned installers. Choose **More info → Run anyway**.
- The Estimation screen is a placeholder. Takeoff, Files, and Cost Database are ready to use.
- MCP (Model Context Protocol) support is planned so agents can work with Zigplan projects in a future version.

## Links

- App page: https://www.zigplan.com/oss-app
- Hosted service: https://www.zigplan.com
- Source: https://github.com/zetahiveco/zigplan-oss
