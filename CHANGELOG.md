# Changelog

All notable changes to Zigplan are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Production startup update check against GitHub Releases, with Download / Skip dialog
- File → Check for Updates (also under the app menu on macOS)

### Changed

- Windows packaging uses NSIS only; Squirrel / electron-winstaller removed

### Planned

- Cost estimation workspace (line items tied to takeoff quantities)
- MCP (Model Context Protocol) so agents and external tools can read and write Zigplan projects
- Signed and notarized installers

## [1.0.0] - 2026-09-17

First public release of the free open source Zigplan desktop app.

### Added

- Local project workspace with PouchDB
- PDF and image plan files (PDF, PNG, JPEG, SVG)
- Takeoff tools: pan, path, rectangle, count, find, and snip
- Drawing scale calibration with length and area quantities
- Cost database with nested groups, vendors, and copy-between-projects
- Desktop builds for Windows (NSIS), macOS, and Linux

[Unreleased]: https://github.com/zetahiveco/zigplan-oss/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/zetahiveco/zigplan-oss/releases/tag/v1.0.0
