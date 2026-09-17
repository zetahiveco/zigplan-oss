import { app, net } from 'electron'
import type { UpdateAvailableInfo } from '../shared/types'

const GITHUB_REPO = 'zetahiveco/zigplan-oss'
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

type GithubAsset = {
  name: string
  browser_download_url: string
}

type GithubRelease = {
  tag_name: string
  name: string | null
  html_url: string
  assets: GithubAsset[]
}

let skippedReleaseTag: string | null = null

export function skipReleaseForSession(tag: string): void {
  skippedReleaseTag = tag
}

export function getSkippedReleaseTag(): string | null {
  return skippedReleaseTag
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

/** Returns true when remote is strictly newer than local. */
export function isRemoteNewer(remoteVersion: string, localVersion: string): boolean {
  const remote = normalizeVersion(remoteVersion)
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0))
  const local = normalizeVersion(localVersion)
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0))

  const len = Math.max(remote.length, local.length)
  for (let i = 0; i < len; i++) {
    const a = remote[i] ?? 0
    const b = local[i] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

function pickDownloadAsset(assets: GithubAsset[]): GithubAsset | undefined {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin') {
    if (arch === 'arm64') {
      return (
        assets.find((asset) => /mac-arm64\.dmg$/i.test(asset.name)) ??
        assets.find((asset) => /\.dmg$/i.test(asset.name))
      )
    }
    return (
      assets.find((asset) => /mac-x64\.dmg$/i.test(asset.name)) ??
      assets.find((asset) => /\.dmg$/i.test(asset.name))
    )
  }

  if (platform === 'win32') {
    return (
      assets.find((asset) => /win.*setup\.exe$/i.test(asset.name)) ??
      assets.find((asset) => /\.exe$/i.test(asset.name) && !/uninstaller/i.test(asset.name))
    )
  }

  return (
    assets.find((asset) => /\.AppImage$/i.test(asset.name)) ??
    assets.find((asset) => /\.deb$/i.test(asset.name))
  )
}

async function fetchLatestRelease(): Promise<GithubRelease> {
  const response = await net.fetch(RELEASES_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Zigplan/${app.getVersion()}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`)
  }

  return (await response.json()) as GithubRelease
}

export type UpdateLookupResult =
  | { kind: 'latest'; version: string }
  | { kind: 'available'; update: UpdateAvailableInfo }
  | { kind: 'skipped'; tag: string }
  | { kind: 'error'; message: string }

export async function lookupLatestUpdate(options: {
  respectSessionSkip: boolean
}): Promise<UpdateLookupResult> {
  try {
    const currentVersion = app.getVersion()
    const release = await fetchLatestRelease()
    const remoteVersion = normalizeVersion(release.tag_name)

    if (!isRemoteNewer(remoteVersion, currentVersion)) {
      return { kind: 'latest', version: currentVersion }
    }

    if (options.respectSessionSkip && skippedReleaseTag === release.tag_name) {
      return { kind: 'skipped', tag: release.tag_name }
    }

    const asset = pickDownloadAsset(release.assets ?? [])
    if (!asset) {
      return {
        kind: 'error',
        message: `Update ${release.tag_name} has no installer for this platform yet.`
      }
    }

    return {
      kind: 'available',
      update: {
        tag: release.tag_name,
        version: remoteVersion,
        name: release.name?.trim() || `Zigplan ${remoteVersion}`,
        htmlUrl: release.html_url,
        downloadUrl: asset.browser_download_url,
        downloadName: asset.name
      }
    }
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Could not check for updates'
    }
  }
}
