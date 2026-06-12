import { app, BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { registerIpc } from './ipc'
import { runStartupLicenseDataRefreshIfOnline } from './licenseDataRefresh.js'
import { scheduleLaunchUpdateCheck } from './launchUpdateCheck.js'
import { startClientDisplayServer, stopClientDisplayServer } from './clientDisplayServer.js'
import { startRemoteCaisseServer, stopRemoteCaisseServer } from './remoteCaisseServer.js'
import { migrateLegacyIfNeeded } from './associationRegistry.js'
import { startScheduledAutoBackup } from './scheduledBackup.js'
import { startAssociationAutoSync } from './associationAutoSync.js'

/**
 * Doit être **strictement identique** à `build.appId` dans package.json.
 * Sans cela, Windows traite chaque version comme une autre app : épingle barre des tâches perdue,
 * raccourcis dupliqués, impression de « désinstallation + réinstallation ».
 */
if (process.platform === 'win32') {
  app.setAppUserModelId('com.buvette.caisse')
}

migrateLegacyIfNeeded()
registerIpc()
startClientDisplayServer()
startRemoteCaisseServer()

function preloadPath(): string {
  const base = join(__dirname, '../preload')
  /** electron-vite produit surtout `index.mjs` ; un vieux `index.js` ne doit pas écraser le preload à jour. */
  const mjs = join(base, 'index.mjs')
  const js = join(base, 'index.js')
  if (existsSync(mjs)) return mjs
  if (existsSync(js)) return js
  return mjs
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    title: 'Caisse - Association - Buvette',
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0c0f14',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
    scheduleLaunchUpdateCheck(mainWindow)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  startScheduledAutoBackup()
  startAssociationAutoSync()
  void runStartupLicenseDataRefreshIfOnline()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/** À la fermeture de l’app : arrêt des serveurs HTTP (affichage client + caisse distante). */
app.on('will-quit', () => {
  stopClientDisplayServer()
  stopRemoteCaisseServer()
})
