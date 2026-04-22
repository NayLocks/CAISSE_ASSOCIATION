import { useCallback, useLayoutEffect, useRef, useState } from 'react'

type Mode = 'setup' | 'login'

const MAX_LEN = 32

export default function PinPanel({
  mode,
  title,
  onSuccess
}: {
  mode: Mode
  title?: string
  onSuccess: () => void | Promise<void>
}): JSX.Element {
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [focusField, setFocusField] = useState<'pin' | 'pin2'>('pin')
  const pinRef = useRef<HTMLInputElement>(null)
  const pin2Ref = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    const t = window.setTimeout(() => {
      pinRef.current?.focus()
      pinRef.current?.select?.()
    }, 50)
    return () => window.clearTimeout(t)
  }, [mode])

  const appendDigit = useCallback(
    (d: string) => {
      setErr(null)
      if (mode === 'login') {
        setPin((s) => (s.length >= MAX_LEN ? s : s + d))
        return
      }
      if (focusField === 'pin') {
        setPin((s) => (s.length >= MAX_LEN ? s : s + d))
      } else {
        setPin2((s) => (s.length >= MAX_LEN ? s : s + d))
      }
    },
    [mode, focusField]
  )

  const backspace = useCallback(() => {
    setErr(null)
    if (mode === 'login') {
      setPin((s) => s.slice(0, -1))
      return
    }
    if (focusField === 'pin') {
      setPin((s) => s.slice(0, -1))
    } else {
      setPin2((s) => s.slice(0, -1))
    }
  }, [mode, focusField])

  const clearField = useCallback(() => {
    setErr(null)
    if (mode === 'login') {
      setPin('')
      return
    }
    if (focusField === 'pin') setPin('')
    else setPin2('')
  }, [mode, focusField])

  const submitLogin = useCallback(async () => {
    setErr(null)
    setBusy(true)
    try {
      const r = await window.caisse.verifyPin(pin)
      if (r.ok) {
        setPin('')
        await onSuccess()
      } else {
        setErr('Code incorrect.')
      }
    } finally {
      setBusy(false)
    }
  }, [pin, onSuccess])

  const submitSetup = useCallback(async () => {
    setErr(null)
    if (pin.length < 4) {
      setErr('Le code doit contenir au moins 4 caractères.')
      return
    }
    if (pin !== pin2) {
      setErr('Les deux saisies ne correspondent pas.')
      return
    }
    setBusy(true)
    try {
      const r = await window.caisse.setInitialPin(pin)
      if (r.ok) {
        setPin('')
        setPin2('')
        await onSuccess()
      } else if (r.error === 'weak') {
        setErr('Code trop court (minimum 4 caractères).')
      } else {
        setErr('Un code existe déjà. Utilisez « Changer le code » dans Association.')
      }
    } finally {
      setBusy(false)
    }
  }, [pin, pin2, onSuccess])

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (mode === 'login') void submitLogin()
    else void submitSetup()
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div
      className="auth-overlay-full"
      role="presentation"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="auth-card auth-card-pin" role="document" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="auth-title">{title ?? (mode === 'setup' ? 'Créer un code PIN' : 'Code PIN')}</h2>
        <p className="auth-sub">
          {mode === 'setup'
            ? 'Choisissez un code d’au moins 4 caractères pour protéger l’application.'
            : 'Saisissez votre code au clavier ou avec le pavé ci-dessous.'}
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <label className="field">
            <span>{mode === 'setup' ? 'Nouveau code' : 'Code'}</span>
            <input
              ref={pinRef}
              type="password"
              name="caisse-pin"
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
              className="auth-pin-input mono"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onFocus={() => setFocusField('pin')}
              maxLength={MAX_LEN}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="numeric"
            />
          </label>
          {mode === 'setup' && (
            <label className="field">
              <span>Confirmer</span>
              <input
                ref={pin2Ref}
                type="password"
                name="caisse-pin-confirm"
                autoComplete="new-password"
                className="auth-pin-input mono"
                value={pin2}
                onChange={(e) => setPin2(e.target.value)}
                onFocus={() => setFocusField('pin2')}
                maxLength={MAX_LEN}
                autoCapitalize="off"
                spellCheck={false}
                inputMode="numeric"
              />
            </label>
          )}

          <div className="pin-keypad" aria-label="Pavé numérique">
            {digits.map((d) => (
              <button
                key={d}
                type="button"
                className="pin-key"
                onClick={() => appendDigit(d)}
              >
                {d}
              </button>
            ))}
            <button type="button" className="pin-key pin-key-wide" onClick={clearField}>
              Effacer
            </button>
            <button type="button" className="pin-key" onClick={() => appendDigit('0')}>
              0
            </button>
            <button type="button" className="pin-key" onClick={backspace} aria-label="Corriger">
              ⌫
            </button>
          </div>

          {err && <p className="auth-err">{err}</p>}
          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {mode === 'setup' ? 'Enregistrer' : 'Valider'}
          </button>
        </form>
      </div>
    </div>
  )
}
