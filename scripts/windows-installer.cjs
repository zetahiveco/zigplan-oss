'use strict'

const path = require('path')
const fs = require('fs')
const { createWindowsInstaller } = require('electron-winstaller')

async function main() {
  const root = path.join(__dirname, '..')
  const appDirectory = path.join(root, 'dist', 'win-unpacked')
  const outputDirectory = path.join(root, 'dist', 'windows-installer')
  const setupIcon = path.join(root, 'build', 'icon.ico')
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

  if (!fs.existsSync(appDirectory)) {
    throw new Error(
      `Missing unpacked Windows app at ${appDirectory}. Run electron-builder --win nsis first.`
    )
  }

  console.log('[zigplan] Creating Squirrel.Windows installer with electron-winstaller')

  await createWindowsInstaller({
    appDirectory,
    outputDirectory,
    authors: 'Zetahive Technologies Private Limited',
    exe: 'zigplan.exe',
    setupIcon,
    setupExe: 'Zigplan-Setup.exe',
    noMsi: true,
    noDelta: true,
    title: 'Zigplan',
    name: 'zigplan',
    version: pkg.version,
    description: pkg.description,
    skipUpdateIcon: process.platform !== 'win32'
  })

  console.log(`[zigplan] Windows installer written to ${outputDirectory}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
