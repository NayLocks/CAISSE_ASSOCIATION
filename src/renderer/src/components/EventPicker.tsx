import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type EventPickerRow = {
  id: string
  name: string
  date?: string | null
  closed?: boolean
}

export default function EventPicker({
  value,
  events,
  onChange,
  disabled
}: {
  value: string | null
  events: EventPickerRow[]
  onChange: (id: string | null) => void
  disabled?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(() => events.find((e) => e.id === value) ?? null, [events, value])

  const selectedLabel = selected
    ? `${selected.name}${selected.date ? ` (${selected.date})` : ''}${selected.closed ? ' — clôturé' : ''}`
    : '— Événement —'

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return events
    return events.filter((e) => {
      const blob = `${e.name} ${e.date ?? ''}`.toLowerCase()
      return blob.includes(n)
    })
  }, [events, q])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => filterRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current
      if (!el || el.contains(e.target as Node)) return
      setOpen(false)
      setQ('')
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = useCallback(
    (id: string | null) => {
      onChange(id)
      setOpen(false)
      setQ('')
    },
    [onChange]
  )

  return (
    <div className={`event-picker${open ? ' event-picker--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="event-picker-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (disabled ? undefined : setOpen((o) => !o))}
      >
        <span className="event-picker-trigger-label">{selectedLabel}</span>
        <span className="event-picker-chev" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="event-picker-panel" role="listbox" aria-label="Choisir un événement">
          <input
            ref={filterRef}
            type="search"
            className="event-picker-filter"
            placeholder="Rechercher un événement…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setOpen(false)
                setQ('')
              }
            }}
          />
          <ul className="event-picker-list">
            <li>
              <button type="button" className="event-picker-option" onClick={() => pick(null)}>
                <span className="event-picker-option-muted">— Aucun événement sélectionné —</span>
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="event-picker-empty">Aucun résultat.</li>
            ) : (
              filtered.map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === ev.id}
                    className={`event-picker-option${value === ev.id ? ' is-active' : ''}${
                      ev.closed ? ' is-closed' : ''
                    }`}
                    onClick={() => pick(ev.id)}
                  >
                    <span className="event-picker-option-name">{ev.name}</span>
                    {ev.date ? (
                      <span className="event-picker-option-date">{ev.date}</span>
                    ) : null}
                    {ev.closed ? <span className="event-picker-option-badge">Clôturé</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
