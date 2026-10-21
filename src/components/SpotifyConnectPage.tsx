interface SpotifyConnectPageProps {
  configured: boolean
  onBack: () => void
  onConnect: () => void
}

const requestedAccess = [
  'Your top artists and tracks',
  'Your saved songs, followed artists, and playlists',
  'Your recently played tracks',
]

export default function SpotifyConnectPage({ configured, onBack, onConnect }: SpotifyConnectPageProps) {
  return (
    <main className="spotify-connect-shell">
      <a className="brand spotify-connect-brand" href="#" aria-label="Soundprint home" onClick={onBack}>
        <span className="brand-mark">s.</span><span>SOUNDPRINT</span>
      </a>
      <section className="spotify-connect-card" aria-labelledby="spotify-connect-title">
        <div className="spotify-connect-mark" aria-hidden="true">◉</div>
        <p className="eyebrow"><span>✳</span> YOUR MUSIC, YOUR MIRROR</p>
        <h1 id="spotify-connect-title">Bring your<br /><em>sound in.</em></h1>
        <p className="spotify-connect-copy">
          Connect through Spotify’s official sign-in. Soundprint only receives the access you approve.
        </p>
        <div className="spotify-access-list">
          <p className="mini-label">WHAT SOUNDPRINT CAN READ</p>
          {requestedAccess.map((item) => (
            <p key={item}><span aria-hidden="true">✓</span>{item}</p>
          ))}
        </div>
        {configured ? (
          <button className="button button-primary spotify-connect-action" type="button" onClick={onConnect}>
            CONTINUE TO SPOTIFY <span aria-hidden="true">↗</span>
          </button>
        ) : (
          <p className="spotify-connect-unavailable" role="status">
            Spotify sign-in is not enabled for this Soundprint app yet. You can explore a sample while the app owner finishes setup.
          </p>
        )}
        <p className="spotify-connect-privacy">Your Spotify password stays with Spotify. You can revoke Soundprint access at any time.</p>
        <button className="spotify-connect-back" type="button" onClick={onBack}>← BACK TO SOUNDPRINT</button>
      </section>
    </main>
  )
}
