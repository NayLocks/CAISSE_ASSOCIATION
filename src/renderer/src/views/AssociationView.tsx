import { useCallback, useState } from 'react'
import { useAppState } from '@renderer/state/AppStateContext'
import { useAssociationSession } from '@renderer/state/AssociationSessionContext'

export default function AssociationView(): JSX.Element {
  const { data, setData, logoHref, refreshData } = useAppState()
  const { switchAssociation } = useAssociationSession()
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

  const setLicenseAssociationCode = useCallback(
    (raw: string) => {
      const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
      setData((prev) => ({
        ...prev,
        association: {
          ...prev.association,
          licenseAssociationCode: t.length >= 2 ? t : null
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
    if (!window.confirm(msg1)) return
    const msg2 =
      'Confirmation finale :\n\n' +
      'Cette opération est irréversible pour cette association.\n\n' +
      'Confirmer ?'
    if (!window.confirm(msg2)) return
    await window.caisse.factoryResetAssociation()
    await refreshData()
    window.alert(
      'Association réinitialisée. Définissez un nouveau code PIN à l’écran suivant si demandé.'
    )
  }, [refreshData])

  const factoryReset = useCallback(async () => {
    const msg1 =
      'Première confirmation :\n\n' +
      'Remettre le logiciel à zéro supprime TOUTES les associations et données locales sur cet ordinateur : caisses, événements, articles, stock, sessions, historique des ventes, paramètres et codes PIN.\n\n' +
      'Continuer ?'
    if (!window.confirm(msg1)) return
    const msg2 =
      'Seconde confirmation :\n\n' +
      'Cette action est DÉFINITIVE et ne peut pas être annulée.\n\n' +
      'Confirmer la remise à zéro ?'
    if (!window.confirm(msg2)) return
    await window.caisse.factoryReset()
    switchAssociation()
    window.alert(
      'Remise à zéro effectuée. Aucune association ne subsiste sur ce poste ; créez-en une nouvelle ou importez une sauvegarde depuis l’écran de choix.'
    )
  }, [switchAssociation])

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

        <div className="card form-card assoc-switch-card">
          <h3 className="card-title">Changer d’association</h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            Pour travailler sur une autre structure (fichiers de données distincts), quittez cette session et
            sélectionnez une autre association.
          </p>
          <div className="assoc-switch-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                void window.caisse.setClientDisplaySessionOpen(false)
                switchAssociation()
              }}
            >
              Choisir une autre association…
            </button>
          </div>
        </div>

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
            <span>Code licence (clés courtes CAISSE_LICENCE)</span>
            <input
              type="text"
              className="mono"
              value={a.licenseAssociationCode ?? ''}
              onChange={(e) => setLicenseAssociationCode(e.target.value)}
              placeholder="ex. ABC12 — 2 à 6 caractères, identique à la licence"
              autoComplete="off"
              maxLength={6}
            />
            <p className="page-desc" style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
              Obligatoire si vous utilisez une <strong>clé courte</strong> ; laisser vide pour un{' '}
              <strong>jeton long</strong> (l’UUID de cette association doit figurer dans le jeton).
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

        <div className="card form-card">
          <h3 className="card-title">Autre association</h3>
          <p className="page-desc factory-reset-desc">
            Retourner à l’écran de choix pour ouvrir une autre caisse sur cet ordinateur (la session actuelle
            est fermée).
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void window.caisse.setClientDisplaySessionOpen(false)
              switchAssociation()
            }}
          >
            Choisir une autre association…
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

        <div className="card form-card factory-reset-card">
          <h3 className="card-title danger-title">Remise à zéro complète</h3>
          <p className="page-desc factory-reset-desc">
            Efface <strong>toutes les associations</strong> et leurs données sur cet ordinateur (historique des
            ventes, articles, événements, PIN, etc.). Après remise à zéro, la liste des associations est vide.
            Deux boîtes de confirmation successives sont nécessaires.
          </p>
          <button
            type="button"
            className="btn btn-danger-reset"
            onClick={() => void factoryReset()}
          >
            Remettre tout le logiciel à zéro…
          </button>
        </div>
      </div>
    </div>
  )
}
