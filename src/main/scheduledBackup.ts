import { exportCurrentToBackupFolder } from './backup.js'
import { getActiveAssociationId } from './associationRegistry.js'
import { loadPersistedData, savePersistedData } from './stateStore.js'

const CHECK_MS = 15 * 60 * 1000

function todayLocalYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function runAutoBackupIfDue(): Promise<void> {
  if (!getActiveAssociationId()) return
  const data = loadPersistedData()
  if (!data.autoBackupEnabled) return
  const folder = data.associationBackupPath?.trim()
  if (!folder) return
  const today = todayLocalYmd()
  if (data.autoBackupLastRunDate === today) return
  const r = await exportCurrentToBackupFolder(folder)
  if (!r.ok) return
  const fresh = loadPersistedData()
  savePersistedData({ ...fresh, autoBackupLastRunDate: today })
}

/** Vérifie toutes les 15 min si une sauvegarde quotidienne est due. */
export function startScheduledAutoBackup(): void {
  const tick = (): void => {
    void runAutoBackupIfDue()
  }
  tick()
  setInterval(tick, CHECK_MS)
}
