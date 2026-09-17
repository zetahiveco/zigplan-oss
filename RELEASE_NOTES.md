# Zigplan 1.0.0

The first public release of **Zigplan** — a free, open source desktop app for construction takeoff and quantity estimation.

Download for Windows, macOS, and Linux, then work from PDF or image plans on your own machine. There is no account and no subscription.

The hosted AI-native back office remains at [zigplan.com](https://www.zigplan.com) (takeoff, estimating, and procurement as a service, starting at $599/mo). This app is the free local alternative.

## Downloads

| Platform | File |
| --- | --- |
| Windows | `Zigplan-1.0.0-win-x64-setup.exe` (NSIS) and `Zigplan-Setup.exe` (Squirrel / electron-winstaller) |
| macOS | `Zigplan-1.0.0-mac-universal.dmg` |
| Linux | `Zigplan-1.0.0-linux-x86_64.AppImage` and `.deb` |

If GitHub Actions is still publishing assets, refresh the [release page](https://github.com/zetahiveco/zigplan-oss/releases/tag/v1.0.0) in a few minutes.

## In this release

- Create projects and keep drawings, takeoff, and a cost database together
- Takeoff on PDF and image sheets: pan, path, rectangle, count, find, snip
- Calibrate scale and record lengths, areas, and counts
- Cost groups, line items, units, prices, and vendors — stored locally with PouchDB

## Notes

- macOS builds are not notarized yet. Allow the app in **Privacy & Security**, or right-click and choose **Open**.
- Windows SmartScreen may warn on unsigned installers. Choose **More info → Run anyway**.
- The Estimation screen is a placeholder. Takeoff, Files, and Cost Database are ready to use.
- MCP (Model Context Protocol) support is planned so agents can work with Zigplan projects in a future version.

## Links

- App page: https://www.zigplan.com/oss-app
- Hosted service: https://www.zigplan.com
- Source: https://github.com/zetahiveco/zigplan-oss
