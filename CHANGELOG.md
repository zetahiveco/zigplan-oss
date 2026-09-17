# Changelog

All notable changes to Zigplan are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Signed and notarized installers

## [1.0.1-beta] - 2026-09-17

### Added

- Estimation workspace: link cost catalog items to takeoff quantities, download CSV
- In-app MCP HTTP server (File → Start/Stop MCP Server) with Claude Code setup dialog
- Stdio MCP (`pnpm mcp`) for Cursor, Claude Code, OpenCode, and other tools
- Takeoff MCP path list / delete selected / select-all-and-delete
- Vendor create inline and full vendor edit (name, address, phone, email, website, notes)
- Icon-button tooltips across the app
- Input placeholders on common forms

### Changed

- Renamed Cost Database to Cost Catalog
- Aligned takeoff toolbar and Groups / Items header heights
- Select menus no longer mis-align inside dialogs (`alignItemWithTrigger` off by default)

## [1.0.0-beta] - 2026-09-17

First public **Beta / Early Access** release of the free open source Zigplan desktop app.

### Added

- Local project workspace with PouchDB
- PDF and image plan files (PDF, PNG, JPEG, SVG)
- Takeoff tools: pan, path, rectangle, count, find, and snip
- Drawing scale calibration with length and area quantities
- Cost database with nested groups, vendors, and copy-between-projects
- Desktop builds for Windows (NSIS), macOS, and Linux
- GitHub Releases update checks (startup toast + File → Check for Updates)
- macOS menu bar name patch for Zigplan in development

### Changed

- Windows packaging uses NSIS only (Squirrel / electron-winstaller removed)

[Unreleased]: https://github.com/zetahiveco/zigplan-oss/compare/v1.0.1-beta...HEAD
[1.0.1-beta]: https://github.com/zetahiveco/zigplan-oss/releases/tag/v1.0.1-beta
[1.0.0-beta]: https://github.com/zetahiveco/zigplan-oss/releases/tag/v1.0-beta
