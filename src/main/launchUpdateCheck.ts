import { app, BrowserWindow, dialog, shell } from 'electron'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, extname } from 'path'
import {
  WEB_LICENSE_API_PUBLIC_BASE,
  resolveWebLicencesPublicProjectCode
} from '../shared/webLicenseEndpoint.js'
import { webUpdateCheck, webUpdateDownloadToPath } from './webUpdateClient.js'

let launchUpdateCheckStarted = false

function launchInstaller(installerPath: string): void {
  if (process.platform === 'win32') {
    const ext = extname(installerPath).toLowerCase()
    if (ext === '.msi') {
      spawn('msiexec', ['/i', installerPath], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref()
    }
    return
  }
  void shell.openPath(installerPath)
}

/**
 * Au premier affichage de la fenêtre : vérifie les mises à jour sur WEB_LICENCES
 * (`resolveWebLicencesPublicProjectCode`, sans licence enregistrée).
 * Si une version plus récente existe, propose téléchargement + lancement de l’installateur ou « Plus tard ».
 * Fonctionne aussi en mode développement.
 */
export function scheduleLaunchUpdateCheck(mainWindow: BrowserWindow): void {
  if (launchUpdateCheckStarted) return
  launchUpdateCheckStarted = true

  void runLaunchUpdateCheck(mainWindow)
}

async function runLaunchUpdateCheck(win: BrowserWindow): Promise<void> {
  const projectCode = resolveWebLicencesPublicProjectCode()
  const currentVersion = app.getVersion()

  let check: Awaited<ReturnType<typeof webUpdateCheck>>
  try {
    check = await webUpdateCheck(WEB_LICENSE_API_PUBLIC_BASE, projectCode, currentVersion)
  } catch {
    return
  }

  if (!check.ok) return
  if (check.update_available !== true || !check.latest) return

  const latest = check.latest

  if (win.isDestroyed()) return

  const offer = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'Mise à jour disponible',
    message: `La version ${latest.version} est disponible sur le serveur (vous utilisez la ${currentVersion}).`,
    detail: `Fichier : ${latest.filename}\n\nSouhaitez-vous télécharger et lancer l’installateur maintenant ?`,
    buttons: ['Télécharger et installer', 'Plus tard'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })

  if (offer.response !== 0) return
  if (win.isDestroyed()) return

  const safeExt = extname(latest.filename) || '.exe'
  const dir = join(app.getPath('temp'), 'caisse-association-updates')
  mkdirSync(dir, { recursive: true })
  const destPath = join(dir, `caisse-update-${latest.release_id}${safeExt}`)

  if (existsSync(destPath)) {
    try {
      unlinkSync(destPath)
    } catch {
      /* ignore */
    }
  }

  const dl = await webUpdateDownloadToPath({
    apiBaseUrl: WEB_LICENSE_API_PUBLIC_BASE,
    projectCode,
    releaseId: latest.release_id,
    destPath
  })

  if (!dl.ok) {
    try {
      unlinkSync(destPath)
    } catch {
      /* ignore */
    }
    if (!win.isDestroyed()) {
      await dialog.showMessageBox(win, {
        type: 'error',
        title: 'Mise à jour',
        message: 'Le téléchargement de la mise à jour a échoué.',
        detail: dl.message,
        noLink: true
      })
    }
    return
  }

  if (process.platform === 'win32') {
    launchInstaller(destPath)
    setTimeout(() => app.quit(), 800)
    return
  }

  if (win.isDestroyed()) {
    launchInstaller(destPath)
    return
  }

  await dialog.showMessageBox(win, {
    type: 'info',
    title: 'Mise à jour',
    message: 'Téléchargement terminé.',
    detail: 'Le fichier d’installation va être ouvert. Fermez cette application avant d’installer si nécessaire.',
    buttons: ['OK'],
    noLink: true
  })
  launchInstaller(destPath)
}
