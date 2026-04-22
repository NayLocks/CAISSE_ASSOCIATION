import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const LICENSE_FILENAME = 'license.json'

interface LicenseFileV1 {
  key: string | null
}

function licensePath(): string {
  return join(app.getPath('userData'), LICENSE_FILENAME)
}

export function loadLicense(): LicenseFileV1 {
  const p = licensePath()
  if (!existsSync(p)) return { key: null }
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as Partial<LicenseFileV1>
    const k = j.key
    return { key: typeof k === 'string' && k.trim() ? k.trim() : null }
  } catch {
    return { key: null }
  }
}

export function saveLicenseKey(key: string | null): void {
  const data: LicenseFileV1 = { key: key && key.trim() ? key.trim() : null }
  writeFileSync(licensePath(), JSON.stringify(data, null, 2), 'utf8')
}

export function maskLicenseKey(key: string | null): string {
  if (!key) return '—'
  if (key.length <= 4) return '••••'
  return `${'•'.repeat(Math.min(16, key.length - 4))}${key.slice(-4)}`
}

