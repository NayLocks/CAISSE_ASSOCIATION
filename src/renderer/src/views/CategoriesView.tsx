import { useCallback } from 'react'
import type { CategoryConfig } from '@shared/catalog'
import { useAppState } from '@renderer/state/AppStateContext'
import { CATEGORY_EMOJI_PRESETS } from '@renderer/data/emojiChoices'
import { blurActiveElement, stabilizeFocusAfterDelete } from '@renderer/utils/blurActiveElement'
import { blurNativeSelectSoon } from '@renderer/utils/blurNativeSelect'

function newId(): string {
  return crypto.randomUUID()
}

export default function CategoriesView(): JSX.Element {
  const { data, setData } = useAppState()

  const addCategory = useCallback(() => {
    const id = newId()
    const cat: CategoryConfig = {
      id,
      label: 'Nouvelle catégorie',
      short: '📁'
    }
    setData((prev) => ({
      ...prev,
      categories: [...prev.categories, cat]
    }))
  }, [setData])

  const updateCategory = useCallback(
    (id: string, patch: Partial<CategoryConfig>) => {
      setData((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === id ? { ...c, ...patch } : c))
      }))
    },
    [setData]
  )

  const removeCategory = useCallback(
    async (id: string) => {
      if (data.categories.length <= 1) {
        await window.caisse.showAlert({
          title: 'Catégories',
          type: 'warning',
          message: 'Il doit rester au moins une catégorie.'
        })
        return
      }
      const used = data.products.some((p) => p.category === id)
      if (used) {
        await window.caisse.showAlert({
          title: 'Catégories',
          type: 'warning',
          message:
            'Des articles utilisent cette catégorie. Changez leur catégorie avant de supprimer.'
        })
        return
      }
      const ok = await window.caisse.showConfirm({
        title: 'Catégories',
        message: 'Supprimer cette catégorie ?',
        confirmLabel: 'Supprimer'
      })
      if (!ok) return
      blurActiveElement()
      setData((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c.id !== id)
      }))
      stabilizeFocusAfterDelete()
    },
    [data.categories.length, data.products, setData]
  )

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h2 className="page-title">Catégories</h2>
            <p className="page-desc">
              Libellé et <strong>icône d’onglet</strong> : suggestions adaptées aux catégories (liste
              ci-dessous ou saisie libre). Les articles référencent une catégorie par son identifiant.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={addCategory}>
            + Catégorie
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Icône onglet</th>
                <th>Libellé</th>
                <th>Identifiant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => {
                const preset = CATEGORY_EMOJI_PRESETS.some((e) => e.value === c.short)
                return (
                <tr key={c.id}>
                  <td className="td-emoji-cell">
                    <div className="emoji-pick">
                      <select
                        className="input-inline emoji-select"
                        value={preset ? c.short : ''}
                        onChange={(e) => {
                          const el = e.currentTarget
                          const v = el.value
                          if (v) updateCategory(c.id, { short: v })
                          blurNativeSelectSoon(el)
                        }}
                        aria-label="Icône suggérée pour l’onglet"
                      >
                        <option value="">— Choisir —</option>
                        {CATEGORY_EMOJI_PRESETS.map((e) => (
                          <option key={e.value} value={e.value}>
                            {e.label} {e.value}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className="input-emoji"
                        value={c.short}
                        onChange={(e) =>
                          updateCategory(c.id, { short: e.target.value.slice(0, 8) })
                        }
                        title="Emoji affiché dans l’onglet de la caisse (saisie libre)"
                        aria-label="Icône catégorie"
                      />
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input-inline"
                      value={c.label}
                      onChange={(e) => updateCategory(c.id, { label: e.target.value })}
                    />
                  </td>
                  <td className="mono td-small">{c.id}</td>
                  <td className="td-actions">
                    <button
                      type="button"
                      className="btn btn-ghost danger"
                      onClick={() => removeCategory(c.id)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
