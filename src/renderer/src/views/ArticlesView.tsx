import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProductConfig } from '@shared/catalog'
import { getStockMap, initProductStockAcrossEvents, removeProductFromAllDisabledByEvent, removeProductFromAllStock } from '@shared/inventory'
import { useAppState } from '@renderer/state/AppStateContext'
import { useToast } from '@renderer/state/ToastContext'
import { centsToEurosInput, parseEurosToCents } from '@renderer/utils/money'
import {
  blurActiveElement,
  stabilizeFocusAfterDelete,
  stabilizeFocusAfterNativeDialog
} from '@renderer/utils/blurActiveElement'
import { blurNativeSelectSoon } from '@renderer/utils/blurNativeSelect'
import { EMOJI_CHOICES } from '@renderer/data/emojiChoices'
import EmptyState from '@renderer/components/EmptyState'
import { parseArticlesCsv } from '@renderer/utils/articlesCsvImport'

function newId(): string {
  return crypto.randomUUID()
}

export default function ArticlesView(): JSX.Element {
  const { data, setData } = useAppState()
  const { showToast } = useToast()
  const eventId = data.selectedEventId
  const csvInputRef = useRef<HTMLInputElement>(null)
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
      trackStock: false,
      lowStockThreshold: null,
      variablePrice: false,
      cardCashExchange: false
    }
    setData((prev) => ({
      ...prev,
      products: [...prev.products, product]
    }))
  }, [defaultCategoryId, setData])

  const duplicateProduct = useCallback(
    (p: ProductConfig) => {
      const nid = newId()
      setData((prev) => {
        const nextP: ProductConfig = {
          id: nid,
          name: `${p.name.trim()} (copie)`,
          priceCents: p.priceCents,
          category: p.category,
          emoji: p.emoji,
          imageFile: null,
          trackStock: p.trackStock,
          lowStockThreshold: p.lowStockThreshold,
          variablePrice: p.variablePrice === true,
          cardCashExchange: p.cardCashExchange === true
        }
        let stockByEvent = prev.stockByEvent
        if (nextP.trackStock) {
          const eids = prev.events.map((e) => e.id)
          stockByEvent = initProductStockAcrossEvents(stockByEvent, eids, nid)
          for (const eid of eids) {
            const q = prev.stockByEvent[eid]?.[p.id] ?? 0
            stockByEvent = {
              ...stockByEvent,
              [eid]: { ...(stockByEvent[eid] ?? {}), [nid]: q }
            }
          }
        }
        return { ...prev, products: [...prev.products, nextP], stockByEvent }
      })
    },
    [setData]
  )

  const onArticlesCsv = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      const text = await file.text()
      const { rows, errors } = parseArticlesCsv(text, data.categories, defaultCategoryId)
      if (rows.length === 0) {
        showToast({
          variant: 'error',
          message: errors.length ? errors.slice(0, 4).join(' ') : 'Aucune ligne importée.'
        })
        return
      }
      if (errors.length) {
        showToast({
          variant: 'warning',
          message: `${rows.length} article(s) ajouté(s). ${errors.length} ligne(s) ignorée(s).`
        })
      } else {
        showToast({ message: `${rows.length} article(s) importé(s).` })
      }
      setData((prev) => {
        const additions: ProductConfig[] = rows.map((r) => ({ ...r, id: newId() }))
        let stockByEvent = prev.stockByEvent
        for (const p of additions) {
          if (p.trackStock) {
            const eids = prev.events.map((ev) => ev.id)
            stockByEvent = initProductStockAcrossEvents(stockByEvent, eids, p.id)
          }
        }
        return {
          ...prev,
          products: [...prev.products, ...additions],
          stockByEvent
        }
      })
    },
    [data.categories, defaultCategoryId, setData, showToast]
  )

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
      if (!confirm('Supprimer cet article ?')) {
        stabilizeFocusAfterNativeDialog()
        return
      }
      blurActiveElement()
      const p = data.products.find((x) => x.id === id)
      if (p?.imageFile) await window.caisse.unlinkProductImage(p.imageFile)
      blurActiveElement()
      window.setTimeout(() => {
        setData((prev) => ({
          ...prev,
          products: prev.products.filter((x) => x.id !== id),
          stockByEvent: removeProductFromAllStock(prev.stockByEvent, id),
          disabledProductsByEvent: removeProductFromAllDisabledByEvent(prev.disabledProductsByEvent, id)
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
              Prix fixe ou <strong>prix variable</strong>, option <strong>échange carte / espèces</strong>{' '}
              (carte seule, seul dans le panier), catégorie, icône et stock par{' '}
              <strong>événement actif</strong>. CSV :{' '}
              <span className="mono">nom, prix, categorie, emoji, suivi_stock, prix_variable, echange_carte</span>.
            </p>
          </div>
          <div className="page-head-actions">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(ev) => void onArticlesCsv(ev)}
            />
            <button type="button" className="btn btn-secondary" onClick={() => csvInputRef.current?.click()}>
              Importer CSV…
            </button>
            <button type="button" className="btn btn-primary" onClick={addArticle}>
              + Article
            </button>
          </div>
        </div>
        {!eventId && (
          <p className="banner-warn articles-event-warn">
            Sélectionnez un événement dans l’en-tête pour voir et modifier les quantités en stock.
          </p>
        )}

        {data.products.length === 0 ? (
          <div className="table-wrap articles-empty-wrap">
            <EmptyState
              icon="📦"
              title="Aucun article"
              description="Créez votre premier article ou importez une liste au format CSV (voir l’aide en tête de page)."
              actions={
                <>
                  <button type="button" className="btn btn-primary" onClick={addArticle}>
                    + Article
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => csvInputRef.current?.click()}>
                    Importer CSV…
                  </button>
                </>
              }
            />
          </div>
        ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Icône</th>
                <th>Image</th>
                <th>Nom</th>
                <th>Prix (€)</th>
                <th>Prix variable</th>
                <th>Échange carte / espèces</th>
                <th>Catégorie</th>
                <th>Stock suivi</th>
                <th>Quantité</th>
                <th>Seuil alerte</th>
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
                    <td className="td-name">
                      <input
                        type="text"
                        className="input-inline"
                        value={p.name}
                        onChange={(e) => updateProduct(p.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      {p.variablePrice ? (
                        <span className="muted" title="Prix demandé à la caisse à chaque ajout">
                          —
                        </span>
                      ) : (
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
                      )}
                    </td>
                    <td className="td-center">
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={p.variablePrice === true}
                          onChange={(e) =>
                            updateProduct(p.id, {
                              variablePrice: e.target.checked,
                              ...(e.target.checked ? { priceCents: 0 } : {})
                            })
                          }
                        />
                        <span>Oui</span>
                      </label>
                    </td>
                    <td className="td-center">
                      <label className="check-label" title="Paiement carte obligatoire, article seul dans le panier (quantité libre) ; sortie d’espèces du tiroir">
                        <input
                          type="checkbox"
                          checked={p.cardCashExchange === true}
                          onChange={(e) =>
                            updateProduct(p.id, { cardCashExchange: e.target.checked })
                          }
                        />
                        <span>Oui</span>
                      </label>
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
                    <td>
                      {p.trackStock ? (
                        <input
                          type="number"
                          min={0}
                          className="input-inline narrow mono"
                          title="Alerte caisse si stock ≤ ce seuil (vide = pas d’alerte)"
                          value={p.lowStockThreshold ?? ''}
                          placeholder="—"
                          onChange={(e) => {
                            const raw = e.target.value.trim()
                            updateProduct(p.id, {
                              lowStockThreshold: raw === '' ? null : Math.max(0, Math.floor(Number(raw)))
                            })
                          }}
                        />
                      ) : (
                        <span className="muted td-dash">—</span>
                      )}
                    </td>
                    <td className="td-actions">
                      <div className="article-row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact"
                          onClick={() => duplicateProduct(p)}
                        >
                          Dupliquer
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost danger"
                          onClick={() => removeProduct(p.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  )
}
