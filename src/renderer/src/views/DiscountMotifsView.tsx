import { useCallback } from 'react'
import type { DiscountMotifPreset } from '@shared/catalog'
import { useAppState } from '@renderer/state/AppStateContext'

export default function DiscountMotifsView(): JSX.Element {
  const { data, setData } = useAppState()
  const motifs = data.discountMotifs

  const updateMotif = useCallback(
    (id: string, patch: Partial<DiscountMotifPreset>) => {
      setData((prev) => ({
        ...prev,
        discountMotifs: prev.discountMotifs.map((m) => (m.id === id ? { ...m, ...patch } : m))
      }))
    },
    [setData]
  )

  const removeMotif = useCallback(
    (id: string) => {
      setData((prev) => ({
        ...prev,
        discountMotifs: prev.discountMotifs.filter((m) => m.id !== id)
      }))
    },
    [setData]
  )

  const addMotif = useCallback(() => {
    const row: DiscountMotifPreset = {
      id: crypto.randomUUID(),
      label: 'Nouveau motif',
      commentRequired: false,
      commentLabel: 'Commentaire'
    }
    setData((prev) => ({ ...prev, discountMotifs: [...prev.discountMotifs, row] }))
  }, [setData])

  return (
    <div className="page page-scroll">
      <div className="page-inner page-inner--full">
        <div className="page-head" style={{ marginBottom: '1rem' }}>
          <div>
            <h2 className="page-title">Motifs de remise</h2>
            <p className="page-desc">
              Liste des motifs proposés depuis la fenêtre <strong>Remise</strong> (sur une ligne ou le total).
              Si le commentaire est obligatoire, une fenêtre demande le détail avant application (ex.&nbsp;:{' '}
              «&nbsp;Bénévole — prénom&nbsp;»). Enregistré pour <strong>cette association</strong>.
            </p>
          </div>
        </div>

        <div className="card form-card settings-card settings-card--full">
          <div className="discount-motifs-editor">
            {motifs.map((m) => (
              <div key={m.id} className="discount-motifs-row">
                <label className="field discount-motifs-field-grow">
                  <span>Libellé du motif</span>
                  <input
                    type="text"
                    value={m.label}
                    maxLength={120}
                    onChange={(e) => updateMotif(m.id, { label: e.target.value })}
                  />
                </label>
                <label className="field discount-motifs-field-check">
                  <span>Commentaire obligatoire</span>
                  <input
                    type="checkbox"
                    checked={m.commentRequired}
                    onChange={(e) => updateMotif(m.id, { commentRequired: e.target.checked })}
                  />
                </label>
                <label className="field discount-motifs-field-grow">
                  <span>Libellé du champ commentaire</span>
                  <input
                    type="text"
                    value={m.commentLabel}
                    maxLength={80}
                    disabled={!m.commentRequired}
                    onChange={(e) => updateMotif(m.id, { commentLabel: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost discount-motifs-remove"
                  onClick={() => removeMotif(m.id)}
                  disabled={motifs.length <= 1}
                  title={motifs.length <= 1 ? 'Au moins un motif est requis.' : 'Supprimer ce motif'}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary" style={{ marginTop: '0.65rem' }} onClick={addMotif}>
            Ajouter un motif
          </button>
        </div>
      </div>
    </div>
  )
}
