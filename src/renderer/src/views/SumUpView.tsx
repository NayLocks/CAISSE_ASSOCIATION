import { useCallback, useState } from 'react'
import { useAppState } from '@renderer/state/AppStateContext'

export default function SumUpView(): JSX.Element {
  const { data, setData } = useAppState()
  const s = data.integrations.sumup
  const [readersMsg, setReadersMsg] = useState<string | null>(null)
  const [readersBusy, setReadersBusy] = useState(false)

  const patch = useCallback(
    (partial: Partial<typeof s>) => {
      setData((prev) => ({
        ...prev,
        integrations: { ...prev.integrations, sumup: { ...prev.integrations.sumup, ...partial } }
      }))
    },
    [setData]
  )

  const loadReaders = useCallback(async () => {
    setReadersMsg(null)
    setReadersBusy(true)
    try {
      const r = await window.caisse.sumupListReaders()
      if (!r.ok) {
        setReadersMsg(
          r.error === 'not_configured'
            ? 'Renseignez le code marchand et la clé API (la case « Activer SumUp » n’est pas requise pour cette liste).'
            : r.error
        )
        return
      }
      if (r.items.length === 0) {
        setReadersMsg(
          [
            'Aucun lecteur renvoyé par l’API pour ce code marchand.',
            '',
            '• Virtual Solo (https://virtual-solo.sumup.com/) : le « code » affiché sert à l’appairage (Create reader), pas dans le champ rdr_ de la caisse.',
            '• Après appairage Cloud API, un id rdr_… apparaît — utilisez « Lister les terminaux » ou la réponse API.'
          ].join('\n')
        )
        return
      }
      const lines = r.items.map(
        (x) =>
          `${x.name} — ${x.id}${x.model ? ` (${x.model})` : ''} [${x.status}]`
      )
      setReadersMsg(lines.join('\n'))
    } finally {
      setReadersBusy(false)
    }
  }, [])

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h2 className="page-title">SumUp</h2>
            <p className="page-desc">
              Trois informations suffisent : <strong>code marchand</strong>,{' '}
              <strong>clé API</strong> (Bearer), <strong>identifiant terminal</strong> (<span className="mono">reader_id</span>{' '}
              type <span className="mono">rdr_…</span>). Laissez le terminal vide pour la carte en ligne uniquement.
              Détail terminal :{' '}
              <a href="https://developer.sumup.com/terminal-payments/cloud-api" target="_blank" rel="noreferrer">
                Cloud API
              </a>
              .
            </p>
          </div>
        </div>

        <div className="card form-card sumup-fieldmap-card">
          <h3 className="sumup-fieldmap-title">Champs</h3>
          <ul className="sumup-fieldmap-list">
            <li>
              <strong>Code marchand</strong> (<span className="mono">merchant_code</span>) — profil SumUp du compte marchand.
            </li>
            <li>
              <strong>Clé API</strong> — en-tête <span className="mono">Authorization: Bearer …</span> (
              <a href="https://developer.sumup.com/tools/authorization/api-keys" target="_blank" rel="noreferrer">
                portail développeur
              </a>
              ).
            </li>
            <li>
              <strong>Identifiant terminal</strong> (<span className="mono">reader_id</span>) — après appairage du Solo ; vide =
              paiement carte via checkout en ligne sans envoyer au terminal physique.
            </li>
          </ul>
        </div>

        <div className="card form-card">
          <label className="check-label sumup-enable-row">
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
            />
            <span>Activer SumUp pour le paiement carte</span>
          </label>

          <label className="field">
            <span>Code marchand SumUp</span>
            <input
              type="text"
              className="mono"
              autoComplete="off"
              value={s.merchantCode}
              onChange={(e) => patch({ merchantCode: e.target.value })}
              placeholder="ex. MK…"
            />
          </label>

          <label className="field">
            <span>Clé API (Bearer)</span>
            <input
              type="password"
              autoComplete="off"
              className="mono"
              value={s.apiKey}
              onChange={(e) => patch({ apiKey: e.target.value })}
              placeholder="sup_sk_…"
            />
          </label>

          <label className="field">
            <span>Identifiant terminal (reader_id)</span>
            <input
              type="text"
              className="mono"
              autoComplete="off"
              value={s.readerId ?? ''}
              onChange={(e) => patch({ readerId: e.target.value })}
              placeholder="rdr_… — laisser vide = carte en ligne sans terminal"
            />
          </label>

          <div className="sumup-readers-row">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={readersBusy || !s.merchantCode.trim() || !s.apiKey.trim()}
              onClick={() => void loadReaders()}
            >
              {readersBusy ? 'Chargement…' : 'Lister les terminaux'}
            </button>
          </div>
          {readersMsg && (
            <pre className="sumup-readers-pre mono" role="status">
              {readersMsg}
            </pre>
          )}

          <p className="sub sumup-hint">
            Les secrets restent dans les données locales de l’association.
          </p>
        </div>
      </div>
    </div>
  )
}
