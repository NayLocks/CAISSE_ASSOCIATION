import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProductConfig } from '@shared/catalog'
import { getStockMap, initProductStockAcrossEvents, removeProductFromAllStock } from '@shared/inventory'
import { useAppState } from '@renderer/state/AppStateContext'
import { centsToEurosInput, parseEurosToCents } from '@renderer/utils/money'
import { blurActiveElement, stabilizeFocusAfterDelete } from '@renderer/utils/blurActiveElement'
import { blurNativeSelectSoon } from '@renderer/utils/blurNativeSelect'
import { EMOJI_CHOICES } from '@renderer/data/emojiChoices'

function newId(): string {
  return crypto.randomUUID()
}

export default function ArticlesView(): JSX.Element {
  const { data, setData } = useAppState()
  const eventId = data.selectedEventId
  const stockMap = getStockMap(data, eventId)
  const [imgMap, setImgMap] = useState<Record<string, string>>({})
  const imgSig = useMemo(
    () => data.products.map((p) => `${p.id}:${p.imageFile ?? ''}`).join('|'),
    [data.products]
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: Record<string, string> = {}
      for (const p of data.products) {
        if (!p.imageFile) continue
        const u = await window.caisse.getProductImageDataUrl(p.imageFile)
        if (u && !cancelled) next[p.id] = u
      }
      if (!cancelled) setImgMap(next)
    })()
    return () => {
      cancelled = true
    }
  }, [imgSig, data.products])

  const defaultCategoryId = data.categories[0]?.id ?? 'boissons'

  const updateProduct = useCallback(
    (id: string, patch: Partial<ProductConfig>) => {
      setData((prev) => ({
        ...prev,
        products: prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p))
      }))
    },
    [setData]
  )

  const setStock = useCallback(
    (productId: string, qty: number) => {
      const q = Math.max(0, Math.floor(qty))
      setData((prev) => {
        const eid = prev.selectedEventId
        if (!eid) return prev
        const map = { ...(prev.stockByEvent[eid] ?? {}), [productId]: q }
        return { ...prev, stockByEvent: { ...prev.stockByEvent, [eid]: map } }
      })
    },
    [setData]
  )

  const toggleTrack = useCallback(
    (p: ProductConfig, on: boolean) => {
      setData((prev) => {
        const eids = prev.events.map((e) => e.id)
        const stockByEvent = on
          ? initProductStockAcrossEvents(prev.stockByEvent, eids, p.id)
          : prev.stockByEvent
        return {
          ...prev,
          products: prev.products.map((x) =>
            x.id === p.id ? { ...x, trackStock: on } : x
          ),
          stockByEvent
        }
      })
    },
    [setData]
  )

  const addArticle = useCallback(() => {
    const id = newId()
    const product: ProductConfig = {
      id,
      name: 'Nouvel article',
      priceCents: 100,
      category: defaultCategoryId,
      emoji: '📦',
      imageFile: null,
      trackStock: false
    }
    setData((prev) => ({
      ...prev,
      products: [...prev.products, product]
    }))
  }, [defaultCategoryId, setData])

  const pickProductImage = useCallback(
    async (id: string) => {
      const r = await window.caisse.pickProductImage()
      if (!r) return
      setData((prev) => {
        const cur = prev.products.find((p) => p.id === id)
        if (cur?.imageFile) void window.caisse.unlinkProductImage(cur.imageFile)
        return {
          ...prev,
          products: prev.products.map((p) =>
            p.id === id ? { ...p, imageFile: r.fileName } : p
          )
        }
      })
    },
    [setData]
  )

  const clearProductImage = useCallback(
    (id: string) => {
      setData((prev) => {
        const cur = prev.products.find((p) => p.id === id)
        if (cur?.imageFile) void window.caisse.unlinkProductImage(cur.imageFile)
        return {
          ...prev,
          products: prev.products.map((p) =>
            p.id === id ? { ...p, imageFile: null } : p
          )
        }
      })
    },
    [setData]
  )

  const removeProduct = useCallback(
    async (id: string) => {
      if (!confirm('Supprimer cet article ?')) return
      blurActiveElement()
      const p = data.products.find((x) => x.id === id)
      if (p?.imageFile) await window.caisse.unlinkProductImage(p.imageFile)
      blurActiveElement()
      window.setTimeout(() => {
        setData((prev) => ({
          ...prev,
          products: prev.products.filter((x) => x.id !== id),
          stockByEvent: removeProductFromAllStock(prev.stockByEvent, id)
        }))
        window.setTimeout(() => stabilizeFocusAfterDelete(), 0)
      }, 0)
    },
    [data.products, setData]
  )

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h2 className="page-title">Articles</h2>
            <p className="page-desc">
              Prix, catégorie, <strong>icône article</strong> (liste dédiée aux articles ou saisie libre) et stock
              optionnel par <strong>événement actif</strong> (sélection dans l’en-tête).
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={addArticle}>
            + Article
          </button>
        </div>
        {!eventId && (
          <p className="banner-warn articles-event-warn">
            Sélectionnez un événement dans l’en-tête pour voir et modifier les quantités en stock.
          </p>
        )}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Icône</th>
                <th>Image</th>
                <th>Nom</th>
                <th>Prix (€)</th>
                <th>Catégorie</th>
                <th>Stock suivi</th>
                <th>Quantité</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => {
                const preset = EMOJI_CHOICES.some((e) => e.value === p.emoji)
                return (
                  <tr key={p.id}>
                    <td className="td-emoji-cell">
                      <div className="emoji-pick">
                        <select
                          className="input-inline emoji-select"
                          value={preset ? p.emoji : ''}
                          onChange={(e) => {
                            const el = e.currentTarget
                            const v = el.value
                            if (v) updateProduct(p.id, { emoji: v })
                            blurNativeSelectSoon(el)
                          }}
                          aria-label="Icône suggérée"
                        >
                          <option value="">— Choisir —</option>
                          {EMOJI_CHOICES.map((e) => (
                            <option key={e.value} value={e.value}>
                              {e.label} {e.value}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          className="input-emoji"
                          value={p.emoji}
                          onChange={(e) =>
                            updateProduct(p.id, { emoji: e.target.value.slice(0, 8) })
                          }
                          title="Emoji affiché (saisie libre)"
                          aria-label="Emoji"
                        />
                      </div>
                    </td>
                    <td className="td-product-img">
                      <div className="article-img-cell">
                        {imgMap[p.id] ? (
                          <img src={imgMap[p.id]} alt="" className="article-thumb" />
                        ) : (
                          <span className="muted td-dash">—</span>
                        )}
                        <div className="article-img-btns">
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            onClick={() => void pickProductImage(p.id)}
                          >
                            Image…
                          </button>
                          {p.imageFile ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-compact"
                              onClick={() => clearProductImage(p.id)}
                            >
                              Retirer
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input-inline"
                        value={p.name}
                        onChange={(e) => updateProduct(p.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input-inline mono"
                        inputMode="decimal"
                        defaultValue={centsToEurosInput(p.priceCents)}
                        key={`${p.id}-p-${p.priceCents}`}
                        onBlur={(e) => {
                          const c = parseEurosToCents(e.target.value)
                          if (c !== null) updateProduct(p.id, { priceCents: c })
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={p.category}
                        onChange={(e) => {
                          const el = e.currentTarget
                          updateProduct(p.id, { category: el.value })
                          blurNativeSelectSoon(el)
                        }}
                      >
                        {data.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.short} {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td-center">
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={p.trackStock}
                          onChange={(e) => toggleTrack(p, e.target.checked)}
                        />
                        <span>Oui</span>
                      </label>
                    </td>
                    <td>
                      {p.trackStock ? (
                        <input
                          type="number"
                          min={0}
                          className="input-inline narrow mono"
                          disabled={!eventId}
                          value={stockMap[p.id] ?? 0}
                          onChange={(e) => setStock(p.id, Number(e.target.value))}
                        />
                      ) : (
                        <span className="muted td-dash">—</span>
                      )}
                    </td>
                    <td className="td-actions">
                      <button
                        type="button"
                        className="btn btn-ghost danger"
                        onClick={() => removeProduct(p.id)}
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
