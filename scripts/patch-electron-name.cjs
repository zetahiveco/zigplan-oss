'use strict'

const { existsSync } = require('fs')
const { join } = require('path')
const { execFileSync } = require('child_process')

if (process.platform !== 'darwin') {
  process.exit(0)
}

const plistPath = join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'Info.plist'
)

if (!existsSync(plistPath)) {
  console.warn('[zigplan] Electron.app Info.plist not found; skip macOS name patch')
  process.exit(0)
}

const keys = ['CFBundleName', 'CFBundleDisplayName']

for (const key of keys) {
  execFileSync('plutil', ['-replace', key, '-string', 'Zigplan', plistPath], {
    stdio: 'inherit'
  })
}

console.log('[zigplan] Patched Electron.app menu name to Zigplan')
