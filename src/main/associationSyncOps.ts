import { normalizeLicenseAssociationCode } from '../shared/associationCode.js'
import { WEB_LICENSE_API_PUBLIC_BASE, resolveWebLicencesPublicProjectCode } from '../shared/webLicenseEndpoint.js'
import { loadPersistedData, savePersistedData } from './stateStore.js'
import { getOrCreateMachineId } from './licenseStore.js'
import {
  associationSyncFetchCheck,
  associationSyncFetchDownload,
  associationSyncFetchUpload,
  type AssociationSyncCheckOk
} from './associationSyncClient.js'
import {
  applyAssociationImportReplace,
  buildActiveAssociationSyncPayloadJson,
  licenseCodeFromBackupFiles,
  parseBackupPayload,
  verifyActiveAssociationBackupPin
} from './backup.js'
import { broadcastAssociationDataApplied } from './associationSyncEvents.js'

function requireNormalizedAssociationCode(): string | { message: string; code: 'no_association_code' } {
  const data = loadPersistedData()
  const c = normalizeLicenseAssociationCode(data.association.licenseAssociationCode ?? '')
  if (!c) {
    return {
      message:
        'Renseignez le code licence / association dans les infos de cette caisse avant d’utiliser la copie sur le serveur.',
      code: 'no_association_code'
    }
  }
  return c
}

/** Exposé à l’UI : dernier résultat de vérification + révision suivie localement. */
export type AssociationSyncCheckForIpc = {
  ok: true
  localRevision: number | null
  check: AssociationSyncCheckOk
}

export async function associationSyncPerformCheck(): Promise<
  AssociationSyncCheckForIpc | { ok: false; message: string; code?: string }
> {
  const assoc = requireNormalizedAssociationCode()
  if (typeof assoc !== 'string') return { ok: false, message: assoc.message, code: assoc.code }

  const data = loadPersistedData()
  const localRevRaw = data.associationServerSnapshotRevision
  const localRevision =
    typeof localRevRaw === 'number' && Number.isFinite(localRevRaw) && localRevRaw >= 1 ? localRevRaw : null

  const r = await associationSyncFetchCheck(
    WEB_LICENSE_API_PUBLIC_BASE,
    resolveWebLicencesPublicProjectCode(),
    assoc,
    localRevision
  )
  if (!r.ok) {
    return {
      ok: false,
      message: r.message,
      code: r.error
    }
  }
  return { ok: true, localRevision, check: r }
}

export async function associationSyncPerformUpload(
  pin: string
): Promise<{ ok: true; revision: number; message: string } | { ok: false; message: string; code?: string }> {
  if (!(await verifyActiveAssociationBackupPin(pin))) {
    return { ok: false, message: 'Code PIN incorrect.', code: 'wrong_pin' }
  }
  const assoc = requireNormalizedAssociationCode()
  if (typeof assoc !== 'string') return { ok: false, message: assoc.message, code: assoc.code }

  const data = loadPersistedData()
  const localRevRaw = data.associationServerSnapshotRevision
  const localRev =
    typeof localRevRaw === 'number' && Number.isFinite(localRevRaw) && localRevRaw >= 1 ? localRevRaw : null

  const pre = await associationSyncFetchCheck(
    WEB_LICENSE_API_PUBLIC_BASE,
    resolveWebLicencesPublicProjectCode(),
    assoc,
    localRev
  )
  if (!pre.ok) {
    return { ok: false, message: pre.message, code: pre.error }
  }

  const serverRev =
    pre.has_server_snapshot && typeof pre.server_revision === 'number' && pre.server_revision >= 1
      ? pre.server_revision
      : null

  if (serverRev != null && localRev != null && localRev < serverRev) {
    return {
      ok: false,
      message: `Le serveur a une copie plus récente (révision ${serverRev}) que celle indiquée sur ce poste (${localRev}). Téléchargez la copie serveur avant d’envoyer la vôtre.`,
      code: 'behind_server'
    }
  }

  const nextRev = Math.max((localRev ?? 0) + 1, serverRev ?? 0)

  const built = buildActiveAssociationSyncPayloadJson()
  if (!built.ok) {
    return {
      ok: false,
      message:
        built.error === 'no_active'
          ? 'Aucune association active.'
          : 'Association introuvable dans le registre local.',
      code: built.error
    }
  }

  const buf = Buffer.from(built.json, 'utf8')
  const up = await associationSyncFetchUpload({
    apiBaseUrl: WEB_LICENSE_API_PUBLIC_BASE,
    projectCode: resolveWebLicencesPublicProjectCode(),
    associationCodeRaw: assoc,
    revision: nextRev,
    payloadUtf8: buf,
    clientMachineId: getOrCreateMachineId()
  })
  if (!up.ok) {
    if (up.error === 'revision_stale' && typeof up.server_revision === 'number') {
      return {
        ok: false,
        message: `${up.message ?? 'Révision refusée.'} (révision serveur : ${up.server_revision})`,
        code: up.error
      }
    }
    return { ok: false, message: up.message, code: up.error }
  }

  const fresh = loadPersistedData()
  fresh.associationServerSnapshotRevision = up.revision
  savePersistedData(fresh)
  broadcastAssociationDataApplied()

  return {
    ok: true,
    revision: up.revision,
    message: `Copie envoyée (révision ${up.revision}).`
  }
}

export async function associationSyncPerformDownloadApply(
  pin: string
): Promise<{ ok: true; revision: number; message: string } | { ok: false; message: string; code?: string }> {
  if (!(await verifyActiveAssociationBackupPin(pin))) {
    return { ok: false, message: 'Code PIN incorrect.', code: 'wrong_pin' }
  }
  const assoc = requireNormalizedAssociationCode()
  if (typeof assoc !== 'string') return { ok: false, message: assoc.message, code: assoc.code }

  const before = loadPersistedData()
  const localLic = normalizeLicenseAssociationCode(before.association.licenseAssociationCode ?? '')
  if (!localLic) {
    return { ok: false, message: 'Code association invalide.', code: 'no_association_code' }
  }

  const dl = await associationSyncFetchDownload(WEB_LICENSE_API_PUBLIC_BASE, resolveWebLicencesPublicProjectCode(), assoc)
  if (!dl.ok) {
    return {
      ok: false,
      message: dl.message,
      code: dl.error
    }
  }

  const rawStr = dl.buffer.toString('utf8')
  const payload = parseBackupPayload(rawStr)
  if (!payload || payload.scope !== 'association') {
    return {
      ok: false,
      message: 'Copie serveur : format inconnu ou sauvegarde complète non prise en charge ici.',
      code: 'invalid_file'
    }
  }
  if (payload.associations.length !== 1) {
    return { ok: false, message: 'Copie serveur : plusieurs associations dans le fichier distant.', code: 'invalid_file' }
  }

  const remoteLic = licenseCodeFromBackupFiles(payload.associations[0].files)
  if (!remoteLic || remoteLic !== localLic) {
    return {
      ok: false,
      message: 'La copie sur le serveur ne correspond pas au code licence de ce profil. Import bloqué pour éviter une confusion entre associations.',
      code: 'code_mismatch'
    }
  }

  const rep = await applyAssociationImportReplace(payload, pin)
  if (!rep.ok) {
    const err = rep.error
    return {
      ok: false,
      message:
        err === 'wrong_pin'
          ? 'Code PIN incorrect.'
          : err === 'no_active'
            ? 'Aucune association active.'
            : String(err ?? 'Erreur d’application de la sauvegarde.'),
      code: err
    }
  }

  const after = loadPersistedData()
  after.associationServerSnapshotRevision = dl.revision
  savePersistedData(after)
  broadcastAssociationDataApplied()

  return {
    ok: true,
    revision: dl.revision,
    message: `Données remplacées par la copie serveur (révision ${dl.revision}).`
  }
}
