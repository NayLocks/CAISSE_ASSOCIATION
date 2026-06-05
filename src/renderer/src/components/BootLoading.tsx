/**
 * Chargement initial (données association, session) — même langage visuel que l’écran d’accueil.
 */
export default function BootLoading({
  message = 'Chargement des données…'
}: {
  message?: string
}): JSX.Element {
  return (
    <div className="boot-screen boot-screen--rich" role="status">
      <div className="boot-screen-inner">
        <div className="boot-spinner" aria-hidden />
        <p className="boot-screen-msg">{message}</p>
      </div>
    </div>
  )
}
