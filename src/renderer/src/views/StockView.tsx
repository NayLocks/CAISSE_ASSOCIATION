import { useMemo, useState } from 'react'
import type { ProductConfig } from '@shared/catalog'
import { getStockMap } from '@shared/inventory'
import { useAppState } from '@renderer/state/AppStateContext'

function parseQty(raw: string): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export default function StockView(): JSX.Element {
  const { data, setData } = useAppState()
  const eventId = data.selectedEventId
  const stockMap = useMemo(() => getStockMap(data, eventId), [data.stockByEvent, eventId])
  const [filter, setFilter] = useState('')
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({})

  const products = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = [...data.products]
    list.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    if (!q) return list
    return list.filter((p) => {
      const cat =
        data.categories.find((c) => c.id === p.category)?.label ?? p.category
      return (
        p.name.toLowerCase().includes(q) || String(cat).toLowerCase().includes(q)
      )
    })
  }, [data.products, data.categories, filter])

  function stockVal(p: ProductConfig): number | null {
    return p.trackStock ? stockMap[p.id] ?? 0 : null
  }

  function setDraft(id: string, v: string): void {
    setQtyDraft((prev) => ({ ...prev, [id]: v }))
  }

  function opQty(id: string): number {
    return parseQty(qtyDraft[id] ?? '0')
  }

  function patchEventStock(productId: string, fn: (cur: number) => number): void {
    setData((prev) => {
      const eid = prev.selectedEventId
      if (!eid) return prev
      const map = { ...(prev.stockByEvent[eid] ?? {}) }
      const cur = map[productId] ?? 0
      map[productId] = Math.max(0, fn(cur))
      return { ...prev, stockByEvent: { ...prev.stockByEvent, [eid]: map } }
    })
  }

  function addStock(p: ProductConfig): void {
    if (!p.trackStock || !eventId) return
    const q = opQty(p.id)
    if (q <= 0) return
    patchEventStock(p.id, (cur) => cur + q)
  }

  function removeStock(p: ProductConfig): void {
    if (!p.trackStock || !eventId) return
    const q = opQty(p.id)
    if (q <= 0) return
    patchEventStock(p.id, (cur) => Math.max(0, cur - q))
  }

  function replaceStock(p: ProductConfig): void {
    if (!p.trackStock || !eventId) return
    const q = opQty(p.id)
    patchEventStock(p.id, () => q)
  }

  function catLabel(id: string): string {
    return data.categories.find((c) => c.id === id)?.label ?? id
  }

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h2 className="page-title">Stock</h2>
            <p className="page-desc">
              Stock par <strong>événement actif</strong> (en-tête). <strong>Ajouter</strong> (stock +
              saisie), <strong>retirer</strong> (stock − saisie), <strong>remplacer</strong> (la saisie
              devient le stock). Les articles sans suivi se règlent dans <strong>Articles</strong>.
            </p>
          </div>
        </div>
        {!eventId && (
          <p className="banner-warn articles-event-warn">
            Sélectionnez un événement dans l’en-tête pour gérer les quantités.
          </p>
        )}

        <label className="field stock-filter-field">
          <span>Rechercher</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Nom ou catégorie…"
          />
        </label>

        <div className="table-wrap">
          <table className="data-table stock-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Catégorie</th>
                <th>Suivi</th>
                <th className="td-right">Stock actuel</th>
                <th>Saisie</th>
                <th className="stock-actions-col">Opérations</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const cur = stockVal(p)
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="hist-emoji">{p.emoji}</span> {p.name}
                    </td>
                    <td>{catLabel(p.category)}</td>
                    <td>{p.trackStock ? 'Oui' : <span className="muted">Non</span>}</td>
                    <td className="td-right mono strong">
                      {cur !== null ? cur : <span className="muted">—</span>}
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="input-inline narrow mono"
                        disabled={!p.trackStock}
                        value={qtyDraft[p.id] ?? ''}
                        placeholder="0"
                        onChange={(e) => setDraft(p.id, e.target.value)}
                      />
                    </td>
                    <td className="stock-actions-cell">
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        disabled={!p.trackStock || !eventId}
                        onClick={() => addStock(p)}
                      >
                        + Ajouter
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        disabled={!p.trackStock || !eventId}
                        onClick={() => removeStock(p)}
                      >
                        − Retirer
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        disabled={!p.trackStock || !eventId}
                        onClick={() => replaceStock(p)}
                      >
                        Remplacer
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
