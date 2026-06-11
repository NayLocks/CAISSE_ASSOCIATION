import { useCallback, useState } from 'react'
import { useAppState } from '@renderer/state/AppStateContext'
import { useToast } from '@renderer/state/ToastContext'
import { stabilizeFocusAfterNativeDialog } from '@renderer/utils/blurActiveElement'
import { normalizeLicenseAssociationCode } from '@shared/associationCode'
import { DEFAULT_UNIT_TICKET_VALIDITY_FR } from '@shared/catalog'

export default function AssociationView(): JSX.Element {
  const { data, setData, logoHref, refreshData } = useAppState()
  const { showToast } = useToast()
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [pinMsg, setPinMsg] = useState<string | null>(null)

  const setName = useCallback(
    (name: string) => {
      setData((prev) => ({
        ...prev,
        association: { ...prev.association, name }
      }))
    },
    [setData]
  )

  const setNumero = useCallback(
    (numero: string) => {
      setData((prev) => ({
        ...prev,
        association: { ...prev.association, numero }
      }))
    },
    [setData]
  )

  const setLegalAddress = useCallback(
    (legalAddress: string) => {
      setData((prev) => ({
        ...prev,
        association: { ...prev.association, legalAddress }
      }))
    },
    [setData]
  )

  const setSiret = useCallback(
    (siret: string) => {
      setData((prev) => ({
        ...prev,
        association: { ...prev.association, siret }
      }))
    },
    [setData]
  )

  const setReceiptLegalNote = useCallback(
    (receiptLegalNote: string) => {
      setData((prev) => ({
        ...prev,
        association: { ...prev.association, receiptLegalNote }
      }))
    },
    [setData]
  )

  const setUnitTicketValidityNotice = useCallback(
    (unitTicketValidityNotice: string) => {
      setData((prev) => ({
        ...prev,
        association: { ...prev.association, unitTicketValidityNotice }
      }))
    },
    [setData]
  )

  const setReceiptLogoWidthPercent = useCallback(
    (receiptLogoWidthPercent: number) => {
      setData((prev) => ({
        ...prev,
        association: { ...prev.association, receiptLogoWidthPercent }
      }))
    },
    [setData]
  )

  const setUnitTicketShowLogo = useCallback(
    (unitTicketShowLogo: boolean) => {
      setData((prev) => ({
        ...prev,
        association: { ...prev.association, unitTicketShowLogo }
      }))
    },
    [setData]
  )

  const setUnitTicketShowDateTime = useCallback(
    (unitTicketShowDateTime: boolean) => {
      setData((prev) => ({
        ...prev,
        association: { ...prev.association, unitTicketShowDateTime }
      }))
    },
    [setData]
  )

  const setUnitTicketShowAssociationName = useCallback(
    (unitTicketShowAssociationName: boolean) => {
      setData((prev) => ({
        ...prev,
        association: { ...prev.association, unitTicketShowAssociationName }
      }))
    },
    [setData]
  )

  const setLicenseAssociationCode = useCallback(
    (raw: string) => {
      const t = raw.toUpperCase().replace(/\s+/g, '').slice(0, 32)
      if (!/^[A-Z0-9_-]*$/.test(t)) return
      const norm = normalizeLicenseAssociationCode(t)
      setData((prev) => ({
        ...prev,
        association: {
          ...prev.association,
          licenseAssociationCode: norm
        }
      }))
    },
    [setData]
  )

  const pickLogo = useCallback(async () => {
    const r = await window.caisse.pickLogo()
    if (!r) return
    setData((prev) => ({
      ...prev,
      association: { ...prev.association, logoFile: r.fileName }
    }))
  }, [setData])

  const removeLogo = useCallback(() => {
    setData((prev) => ({
      ...prev,
      association: { ...prev.association, logoFile: null }
    }))
  }, [setData])

  const factoryResetAssociationOnly = useCallback(async () => {
    const msg1 =
      'Réinitialiser uniquement cette association ?\n\n' +
      'Seront effacés sur ce profil : articles et catégories (remplacés par un jeu minimal), événements, ' +
      'sessions de caisse, stock, historique des ventes, logo, images d’articles, paramètres d’impression, ' +
      'intégration SumUp et code PIN.\n\n' +
      'Seront conservés : le nom, le numéro et le code licence de l’association. Les autres associations ' +
      'sur cet ordinateur ne sont pas touchées.\n\n' +
      'Continuer ?'
    if (!window.confirm(msg1)) {
      stabilizeFocusAfterNativeDialog()
      return
    }
    const msg2 =
      'Confirmation finale :\n\n' +
      'Cette opération est irréversible pour cette association.\n\n' +
      'Confirmer ?'
    if (!window.confirm(msg2)) {
      stabilizeFocusAfterNativeDialog()
      return
    }
    const pin =
      data.security.pinHash === null
        ? ''
        : window.prompt('Saisissez le code PIN pour confirmer la réinitialisation :')
    if (pin === null) {
      stabilizeFocusAfterNativeDialog()
      return
    }
    const r = await window.caisse.factoryResetAssociation(pin)
    if (!r.ok) {
      showToast({ variant: 'error', message: r.message })
      return
    }
    await refreshData()
    showToast({
      variant: 'success',
      message: 'Association réinitialisée. Définissez un nouveau code PIN à l’écran suivant si demandé.'
    })
  }, [data.security.pinHash, refreshData, showToast])

  const submitChangePin = useCallback(async () => {
    setPinMsg(null)
    if (data.security.pinHash === null) {
      setPinMsg('Créez d’abord un code au premier lancement.')
      return
    }
    if (newPin !== newPin2) {
      setPinMsg('Les deux nouveaux codes ne correspondent pas.')
      return
    }
    const r = await window.caisse.changePin(oldPin, newPin)
    if (r.ok) {
      setOldPin('')
      setNewPin('')
      setNewPin2('')
      setPinMsg('Code mis à jour.')
      await refreshData()
    } else if (r.error === 'wrong_old') {
      setPinMsg('Ancien code incorrect.')
    } else if (r.error === 'weak') {
      setPinMsg('Le nouveau code doit contenir au moins 4 caractères.')
    } else {
      setPinMsg('Modification impossible.')
    }
  }, [data.security.pinHash, oldPin, newPin, newPin2, refreshData])

  const a = data.association

  const numeroVal = a.numero ?? ''
  const siretVal = a.siret ?? ''

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <h2 className="page-title">Association</h2>
        <p className="page-desc">
          Ces informations apparaissent sur les tickets et le récapitulatif de paiement après encaissement.
        </p>

        <div className="form-grid">
          <label className="field">
            <span>Nom de l’association</span>
            <input
              type="text"
              value={a.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. Les Amis du stade"
              autoComplete="organization"
            />
          </label>
        </div>

        <div className="card form-card assoc-ident-card">
          <h3 className="card-title">Numéros d’identification (ticket de caisse)</h3>
          <p className="page-desc" style={{ marginBottom: '0.85rem' }}>
            Les deux champs sont distincts : le <strong>numéro d’association</strong> (RNA, SIREN, référence
            interne…) et le <strong>numéro SIRET</strong> à 14 chiffres de l’établissement si vous en disposez.
          </p>
          <div className="assoc-ident-grid">
            <label className="field">
              <span>Numéro d’association (RNA, SIREN, etc.)</span>
              <input
                type="text"
                className="mono"
                value={numeroVal}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="ex. W123456789"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Numéro SIRET</span>
              <input
                type="text"
                className="mono"
                inputMode="numeric"
                value={siretVal}
                onChange={(e) => setSiret(e.target.value.replace(/\D/g, '').slice(0, 14))}
                placeholder="14 chiffres — affiché sur le ticket : N° SIRET : …"
                autoComplete="off"
              />
            </label>
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Siège ou adresse de correspondance</span>
            <textarea
              rows={3}
              value={a.legalAddress}
              onChange={(e) => setLegalAddress(e.target.value)}
              placeholder={'ex. Association Les Amis du stade — 12 rue … — 59000 Lille'}
              autoComplete="street-address"
            />
          </label>
          <label className="field">
            <span>Mentions TVA / légales sur le ticket</span>
            <textarea
              rows={4}
              value={a.receiptLegalNote}
              onChange={(e) => setReceiptLegalNote(e.target.value)}
              placeholder={
                'Plusieurs lignes possibles. Laisser vide : sur le ticket sera affiché « TVA non applicable — article 293 B du CGI. »'
              }
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Texte du cadre « validité » (tickets unitaires, une ou plusieurs lignes)</span>
            <textarea
              rows={3}
              value={a.unitTicketValidityNotice ?? ''}
              onChange={(e) => setUnitTicketValidityNotice(e.target.value)}
              placeholder={DEFAULT_UNIT_TICKET_VALIDITY_FR}
              autoComplete="off"
            />
            <p className="page-desc" style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
              Laisser vide : aucun cadre n’est imprimé sur le ticket unitaire.
            </p>
          </label>
          <label className="field">
            <span>Code association (WEB_LICENCES)</span>
            <input
              type="text"
              className="mono"
              value={a.licenseAssociationCode ?? ''}
              onChange={(e) => setLicenseAssociationCode(e.target.value)}
              placeholder="ex. CLUB-2026 — 1 à 32 caractères (A-Z, 0-9, -, _)"
              autoComplete="off"
              maxLength={32}
            />
            <p className="page-desc" style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
              Identique au code défini sur le serveur de licences pour cette association. Laisser vide si non
              utilisé.
            </p>
          </label>
          <div className="field field-logo">
            <span>Logo</span>
            <div className="logo-row">
              <div className="logo-preview">
                {logoHref ? (
                  <img src={logoHref} alt="Logo association" />
                ) : (
                  <span className="muted">Aucun logo</span>
                )}
              </div>
              <div className="logo-actions">
                <button type="button" className="btn btn-secondary" onClick={() => void pickLogo()}>
                  Choisir une image…
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!a.logoFile}
                  onClick={removeLogo}
                >
                  Retirer
                </button>
              </div>
            </div>
            <label className="field" style={{ marginTop: '0.75rem' }}>
              <span>Largeur du logo sur les tickets (% de la largeur du papier)</span>
              <input
                type="number"
                min={5}
                max={100}
                step={1}
                className="mono"
                value={a.receiptLogoWidthPercent ?? 100}
                onChange={(e) => {
                  const v = e.target.valueAsNumber
                  if (!Number.isFinite(v)) return
                  setReceiptLogoWidthPercent(Math.max(5, Math.min(100, Math.round(v))))
                }}
                autoComplete="off"
              />
            </label>
            <fieldset
              className="field"
              style={{
                marginTop: '0.75rem',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.75rem 1rem'
              }}
            >
              <legend style={{ padding: '0 0.35rem' }}>Ticket unitaire (contenu imprimé)</legend>
              <p className="page-desc" style={{ margin: '0 0 0.65rem', fontSize: '0.85rem' }}>
                S’applique aux tickets unitaires (impression HTML ou ESC/POS) et au ticket « panier en
                attente ». Le récapitulatif de caisse n’est pas modifié.
              </p>
              <label className="check-label block-check">
                <input
                  type="checkbox"
                  checked={a.unitTicketShowLogo !== false}
                  onChange={(e) => setUnitTicketShowLogo(e.target.checked)}
                />
                <span>Afficher le logo</span>
              </label>
              <label className="check-label block-check">
                <input
                  type="checkbox"
                  checked={a.unitTicketShowDateTime !== false}
                  onChange={(e) => setUnitTicketShowDateTime(e.target.checked)}
                />
                <span>Afficher la date et l’heure en pied</span>
              </label>
              <label className="check-label block-check">
                <input
                  type="checkbox"
                  checked={a.unitTicketShowAssociationName !== false}
                  onChange={(e) => setUnitTicketShowAssociationName(e.target.checked)}
                />
                <span>Afficher le nom de l’association en pied</span>
              </label>
            </fieldset>
          </div>
        </div>

        <div className="card form-card pin-card">
          <h3 className="card-title">Code PIN</h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            Changez le code utilisé au démarrage et lors du verrouillage de l’application.
          </p>
          <div className="form-row">
            <label className="field">
              <span>Ancien code</span>
              <input
                type="password"
                autoComplete="current-password"
                value={oldPin}
                onChange={(e) => setOldPin(e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              <span>Nouveau code</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Confirmer</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPin2}
                onChange={(e) => setNewPin2(e.target.value)}
              />
            </label>
          </div>
          {pinMsg && <p className="sub export-msg">{pinMsg}</p>}
          <button type="button" className="btn btn-secondary" onClick={() => void submitChangePin()}>
            Mettre à jour le code
          </button>
        </div>

        <div className="card form-card factory-reset-card">
          <h3 className="card-title">Réinitialiser cette association</h3>
          <p className="page-desc factory-reset-desc">
            Remet à zéro <strong>uniquement la caisse ouverte</strong> : articles, événements, ventes, sessions,
            stock, logo, images, SumUp et PIN. Le nom, le numéro et le code licence de l’association sont
            conservés ; les autres profils sur cet ordinateur ne sont pas modifiés.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void factoryResetAssociationOnly()}
          >
            Réinitialiser cette association…
          </button>
        </div>
      </div>
    </div>
  )
}
