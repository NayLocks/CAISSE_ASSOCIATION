import { BrowserWindow } from 'electron'

export const ASSOCIATION_AUTO_SYNC_STATUS_EVENT = 'association-sync:auto-status'
export const ASSOCIATION_AUTO_SYNC_DATA_APPLIED_EVENT = 'association-sync:data-applied'

export type AssociationAutoSyncStatusPayload = {
  banner: string | null
}

export function broadcastAssociationAutoSyncStatus(banner: string | null): void {
  const payload: AssociationAutoSyncStatusPayload = { banner }
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(ASSOCIATION_AUTO_SYNC_STATUS_EVENT, payload)
  }
}

export function broadcastAssociationDataApplied(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(ASSOCIATION_AUTO_SYNC_DATA_APPLIED_EVENT)
  }
}
