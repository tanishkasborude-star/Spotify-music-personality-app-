import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import AuthGate from './components/AuthGate'
import type { ListeningData, PersonalityResult, SpotifyPlaylist, SpotifyTrack } from './types'
import { scoreListening } from './lib/scoring'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import {
  beginSpotifyLogin,
  clearSpotifySession,
  fetchFollowedArtistsPage,
  fetchPlaylistTracksPage,
  fetchPlaylistsPage,
  fetchRecommendations,
  fetchRecentTracksPage,
  fetchSavedTracksPage,
  fetchListeningData,
  finishSpotifyLogin,
  hasSpotifySession,
  isSpotifyConfigured,
  playSpotifyTrack,
  toggleSpotifyPlayback,
} from './lib/spotify'
import { downloadShareCard, shareResult } from './lib/shareCard'
import { requestInterpretation } from './lib/interpretation'

const DEMO_DATA: ListeningData = {
  artists: [
    { id: '1', name: 'Beach House', genres: ['dream pop', 'shoegaze'], popularity: 71 },
    { id: '2', name: 'The xx', genres: ['indie pop', 'indie'], popularity: 68 },
    { id: '3', name: 'Khruangbin', genres: ['psychedelic', 'funk', 'indie'], popularity: 65 },
    { id: '4', name: 'Nala Sinephro', genres: ['ambient jazz', 'jazz'], popularity: 42 },
    { id: '5', name: 'Men I Trust', genres: ['bedroom pop', 'dream pop'], popularity: 61 },
    { id: '6', name: 'Little Dragon', genres: ['electronic', 'indie'], popularity: 58 },
  ],
  followedArtists: [],
  followedArtistsTotal: 0,
  tracks: [
    { id: 'a', name: 'Space Song', artists: [{ id: '1', name: 'Beach House' }], popularity: 79 },
    { id: 'b', name: 'Intro', artists: [{ id: '2', name: 'The xx' }], popularity: 67 },
    { id: 'c', name: 'August 10', artists: [{ id: '3', name: 'Khruangbin' }], popularity: 58 },
  ],
  recentTracks: [],
  recentTracksBefore: undefined,
  savedTracks: [],
  savedTracksTotal: 0,
  playlistTracks: [],
  playlists: [],
  playlistTotal: 0,
  dataWarnings: [],
}

const DEMO_RECOMMENDATIONS: SpotifyTrack[] = [
  { id: 'rec-1', name: 'Myth', artists: [{ id: 'bh', name: 'Beach House' }], popularity: 67, external_urls: { spotify: 'https://open.spotify.com/search/Myth%20Beach%20House' }, recommendationGenres: ['dream pop'] },
  { id: 'rec-2', name: 'Open Eye Signal', artists: [{ id: 'jh', name: 'Jon Hopkins' }], popularity: 58, external_urls: { spotify: 'https://open.spotify.com/search/Open%20Eye%20Signal' }, recommendationGenres: ['ambient'] },
  { id: 'rec-3', name: 'Show Me How', artists: [{ id: 'mit', name: 'Men I Trust' }], popularity: 63, external_urls: { spotify: 'https://open.spotify.com/search/Show%20Me%20How%20Men%20I%20Trust' }, recommendationGenres: ['indie pop'] },
]

function App() {
  const dataGeneration = useRef(0)
  const recommendationGeneration = useRef(0)
  const [authSession, setAuthSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [previewMode, setPreviewMode] = useState(!isSupabaseConfigured)
  const [result, setResult] = useState<PersonalityResult | null>(null)
  const [spotifyData, setSpotifyData] = useState<ListeningData | null>(null)
  const [recommendations, setRecommendations] = useState<SpotifyTrack[]>([])
  const [recommendationBusy, setRecommendationBusy] = useState(false)
  const [recommendationError, setRecommendationError] = useState('')
  const [selectedRecommendation, setSelectedRecommendation] = useState(0)
  const [playbackBusy, setPlaybackBusy] = useState(false)
  const [playbackMessage, setPlaybackMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(hasSpotifySession())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [aiCopy, setAiCopy] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [activePlaylistId, setActivePlaylistId] = useState('')
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([])
  const [playlistTrackTotal, setPlaylistTrackTotal] = useState(0)
  const [playlistBusy, setPlaylistBusy] = useState(false)
  const [playlistsBusy, setPlaylistsBusy] = useState(false)
  const [artistsBusy, setArtistsBusy] = useState(false)
  const [savedTracksBusy, setSavedTracksBusy] = useState(false)
  const [recentBusy, setRecentBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'SIGNED_OUT') {
        dataGeneration.current += 1
        recommendationGeneration.current += 1
        clearSpotifySession()
        setResult(null)
        setSpotifyData(null)
        setRecommendations([])
        setConnected(false)
        setAiCopy('')
        setPlaybackMessage('')
      }
      setAuthSession(session)
      setAuthReady(true)
      setPreviewMode(false)
    })
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      setAuthSession(data.session)
      setAuthReady(true)
    }).catch((cause: unknown) => {
      if (!active) return
      setError(cause instanceof Error ? cause.message : 'Could not restore your Soundprint account session.')
      setAuthReady(true)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !authSession) return
    let active = true
    const finish = async () => {
      if (!new URLSearchParams(location.search).has('code') && !new URLSearchParams(location.search).has('error')) return
      const generation = dataGeneration.current
      setBusy(true)
      try {
        const didLogin = await finishSpotifyLogin()
        if (didLogin) {
          if (!active || generation !== dataGeneration.current) return
          setConnected(true)
          const data = await fetchListeningData()
          if (active && generation === dataGeneration.current) {
            const profile = scoreListening(data)
            setSpotifyData(data)
            setResult(profile)
            void generateRecommendations(data, profile)
          }
        }
      } catch (cause) {
        if (active && generation === dataGeneration.current) {
          setConnected(hasSpotifySession())
          setError(cause instanceof Error ? cause.message : 'Spotify connection did not complete.')
        }
      } finally {
        if (active && generation === dataGeneration.current) setBusy(false)
      }
    }
    void finish()
    return () => { active = false }
  }, [authSession])

  async function generateRecommendations(data: ListeningData, profile: PersonalityResult) {
    const generation = ++recommendationGeneration.current
    setRecommendationBusy(true)
    setRecommendationError('')
    try {
      const knownTracks = [...data.tracks, ...data.savedTracks, ...data.recentTracks, ...data.playlistTracks]
      const trackArtists = knownTracks.flatMap((track) => track.artists.map((artist) => artist.name))
      const preferredArtists = [
        ...data.artists.map((artist) => artist.name),
        ...data.followedArtists.map((artist) => artist.name),
        ...trackArtists,
      ]
      const items = await fetchRecommendations(profile.topGenres, knownTracks, preferredArtists)
      if (generation !== recommendationGeneration.current) return
      setRecommendations(items)
      setSelectedRecommendation(0)
      if (!items.length) setRecommendationError('No new tracks came back for these genres yet. Try refreshing your Spotify connection.')
    } catch (cause) {
      if (generation !== recommendationGeneration.current) return
      setRecommendations([])
      setRecommendationError(cause instanceof Error ? cause.message : 'Could not create personalized recommendations.')
    } finally {
      if (generation === recommendationGeneration.current) setRecommendationBusy(false)
    }
  }

  async function connect() {
    setError('')
    setNotice('')
    if (!authSession) {
      setPreviewMode(false)
      setError('Sign in to your Soundprint account before connecting Spotify.')
      return
    }
    try {
      await beginSpotifyLogin()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start Spotify sign-in.')
    }
  }

  async function analyseSpotify() {
    const generation = dataGeneration.current
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = await fetchListeningData()
      if (generation !== dataGeneration.current) return
      const profile = scoreListening(data)
      setSpotifyData(data)
      setResult(profile)
      setAiCopy('')
      setActivePlaylistId('')
      setPlaylistTracks([])
      setConnected(true)
      setNotice('Your listening portrait is ready.')
      void generateRecommendations(data, profile)
    } catch (cause) {
      if (generation !== dataGeneration.current) return
      setError(cause instanceof Error ? cause.message : 'Could not read your Spotify listening data.')
      setConnected(hasSpotifySession())
    } finally {
      if (generation === dataGeneration.current) setBusy(false)
    }
  }

  function previewDemo() {
    dataGeneration.current += 1
    recommendationGeneration.current += 1
    setBusy(false)
    setRecommendationBusy(false)
    setError('')
    setNotice('Previewing a sample listening history. Your Spotify account was not accessed.')
    setAiCopy('')
    setSpotifyData(DEMO_DATA)
    setRecommendations(DEMO_RECOMMENDATIONS)
    setSelectedRecommendation(0)
    setRecommendationError('')
    setActivePlaylistId('')
    setPlaylistTracks([])
    setResult(scoreListening(DEMO_DATA))
  }

  async function openPlaylist(playlist: SpotifyPlaylist) {
    const generation = dataGeneration.current
    const baseData = spotifyData
    setActivePlaylistId(playlist.id)
    setPlaylistTracks([])
    setPlaylistTrackTotal(playlist.trackCount)
    setPlaylistBusy(true)
    setError('')
    setAiCopy('')
    if (baseData) {
      const clearedData = { ...baseData, playlistTracks: [] }
      setSpotifyData(clearedData)
      setResult(scoreListening(clearedData))
    }
    try {
      const page = await fetchPlaylistTracksPage(playlist.id, 0)
      if (generation !== dataGeneration.current) return
      setPlaylistTracks(page.items)
      setPlaylistTrackTotal(page.total)
      if (baseData) {
        const updatedData = { ...baseData, playlistTracks: page.items }
        const profile = scoreListening(updatedData)
        setSpotifyData(updatedData)
        setResult(profile)
        setAiCopy('')
        void generateRecommendations(updatedData, profile)
      }
    } catch (cause) {
      if (generation !== dataGeneration.current) return
      setError(cause instanceof Error ? cause.message : 'Could not read this Spotify playlist.')
    } finally {
      if (generation === dataGeneration.current) setPlaylistBusy(false)
    }
  }

  async function loadMorePlaylistTracks() {
    if (!activePlaylistId || libraryBusy || playlistTracks.length >= playlistTrackTotal) return
    const generation = dataGeneration.current
    setPlaylistBusy(true)
    setError('')
    try {
      const page = await fetchPlaylistTracksPage(activePlaylistId, playlistTracks.length)
      if (generation !== dataGeneration.current) return
      const updatedTracks = [...playlistTracks, ...page.items]
      setPlaylistTracks(updatedTracks)
      setPlaylistTrackTotal(page.total)
      if (spotifyData) {
        const updatedData = { ...spotifyData, playlistTracks: updatedTracks }
        const profile = scoreListening(updatedData)
        setSpotifyData(updatedData)
        setResult(profile)
        setAiCopy('')
        void generateRecommendations(updatedData, profile)
      }
    } catch (cause) {
      if (generation !== dataGeneration.current) return
      setError(cause instanceof Error ? cause.message : 'Could not load more playlist tracks.')
    } finally {
      if (generation === dataGeneration.current) setPlaylistBusy(false)
    }
  }

  async function loadMorePlaylists() {
    if (!spotifyData || libraryBusy || spotifyData.playlists.length >= spotifyData.playlistTotal) return
    const generation = dataGeneration.current
    setPlaylistsBusy(true)
    setError('')
    try {
      const page = await fetchPlaylistsPage(spotifyData.playlists.length)
      if (generation !== dataGeneration.current) return
      const updatedData = {
        ...spotifyData,
        playlists: [...spotifyData.playlists, ...page.items],
        playlistTotal: page.total,
      }
      setSpotifyData(updatedData)
      const profile = scoreListening(updatedData)
      setResult(profile)
      void generateRecommendations(updatedData, profile)
    } catch (cause) {
      if (generation !== dataGeneration.current) return
      setError(cause instanceof Error ? cause.message : 'Could not load more Spotify playlists.')
    } finally {
      if (generation === dataGeneration.current) setPlaylistsBusy(false)
    }
  }

  async function loadMoreFollowedArtists() {
    if (!spotifyData?.followedArtistsAfter || libraryBusy) return
    const generation = dataGeneration.current
    setArtistsBusy(true)
    setError('')
    try {
      const page = await fetchFollowedArtistsPage(spotifyData.followedArtistsAfter)
      if (generation !== dataGeneration.current) return
      const updatedData = {
        ...spotifyData,
        followedArtists: [...spotifyData.followedArtists, ...page.items],
        followedArtistsTotal: page.total,
        followedArtistsAfter: page.next,
      }
      setSpotifyData(updatedData)
      const profile = scoreListening(updatedData)
      setResult(profile)
      setAiCopy('')
      void generateRecommendations(updatedData, profile)
    } catch (cause) {
      if (generation !== dataGeneration.current) return
      setError(cause instanceof Error ? cause.message : 'Could not load more followed artists.')
    } finally {
      if (generation === dataGeneration.current) setArtistsBusy(false)
    }
  }

  async function loadMoreSavedTracks() {
    if (!spotifyData || libraryBusy || spotifyData.savedTracks.length >= spotifyData.savedTracksTotal) return
    const generation = dataGeneration.current
    setSavedTracksBusy(true)
    setError('')
    try {
      const page = await fetchSavedTracksPage(spotifyData.savedTracks.length)
      if (generation !== dataGeneration.current) return
      const updatedData = {
        ...spotifyData,
        savedTracks: [...spotifyData.savedTracks, ...page.items],
        savedTracksTotal: page.total,
      }
      setSpotifyData(updatedData)
      const profile = scoreListening(updatedData)
      setResult(profile)
      setAiCopy('')
      void generateRecommendations(updatedData, profile)
    } catch (cause) {
      if (generation !== dataGeneration.current) return
      setError(cause instanceof Error ? cause.message : 'Could not load more saved tracks.')
    } finally {
      if (generation === dataGeneration.current) setSavedTracksBusy(false)
    }
  }

  async function loadOlderListeningHistory() {
    if (!spotifyData?.recentTracksBefore || libraryBusy) return
    const generation = dataGeneration.current
    setRecentBusy(true)
    setError('')
    try {
      const page = await fetchRecentTracksPage(spotifyData.recentTracksBefore)
      if (generation !== dataGeneration.current) return
      const updatedData = {
        ...spotifyData,
        recentTracks: [...spotifyData.recentTracks, ...page.items],
        recentTracksBefore: page.before,
      }
      setSpotifyData(updatedData)
      const profile = scoreListening(updatedData)
      setResult(profile)
      setAiCopy('')
      void generateRecommendations(updatedData, profile)
    } catch (cause) {
      if (generation !== dataGeneration.current) return
      setError(cause instanceof Error ? cause.message : 'Could not load older listening history.')
    } finally {
      if (generation === dataGeneration.current) setRecentBusy(false)
    }
  }

  async function addAIContext() {
    if (!result) return
    setAiBusy(true)
    setError('')
    try {
      setAiCopy(await requestInterpretation(result))
      setNotice('A short interpretation was generated from your archetype and genre signals.')
    } catch (cause) {
      setAiCopy('')
      setNotice(cause instanceof Error ? cause.message : 'AI copy is unavailable; the rule-based explanation is still here.')
    } finally {
      setAiBusy(false)
    }
  }

  async function downloadCard() {
    if (!result) return
    try {
      await downloadShareCard(result)
      setNotice('Your PNG share card has been downloaded.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the PNG.')
    }
  }

  async function shareCard() {
    if (!result) return
    try {
      await shareResult(result)
      setNotice('Your share card is ready.')
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : 'Sharing is unavailable in this browser.')
    }
  }

  function clearData() {
    dataGeneration.current += 1
    recommendationGeneration.current += 1
    clearSpotifySession()
    setResult(null)
    setSpotifyData(null)
    setRecommendations([])
    setRecommendationError('')
    setRecommendationBusy(false)
    setPlaybackMessage('')
    setConnected(false)
    setAiCopy('')
    setActivePlaylistId('')
    setPlaylistTracks([])
    setBusy(false)
    setPlaylistBusy(false)
    setPlaylistsBusy(false)
    setArtistsBusy(false)
    setSavedTracksBusy(false)
    setRecentBusy(false)
    setError('')
    setNotice('Listening results and the Spotify session were cleared from this tab.')
  }

  const libraryBusy = playlistBusy || playlistsBusy || artistsBusy || savedTracksBusy || recentBusy

  async function accountSignOut() {
    if (!supabase) return
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) {
        setError(signOutError.message)
        return
      }
      clearData()
      setAuthSession(null)
      setPreviewMode(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out of your Soundprint account.')
    }
  }

  async function playRecommendation() {
    const track = recommendations[selectedRecommendation]
    if (!track) return
    setPlaybackBusy(true)
    setPlaybackMessage('')
    try {
      await playSpotifyTrack(track)
      setPlaybackMessage('Playing on your active Spotify device.')
    } catch (cause) {
      setPlaybackMessage(cause instanceof Error ? cause.message : 'Spotify playback is unavailable.')
    } finally {
      setPlaybackBusy(false)
    }
  }

  async function togglePlayback() {
    setPlaybackBusy(true)
    setPlaybackMessage('')
    try {
      await toggleSpotifyPlayback()
      setPlaybackMessage('Spotify playback updated.')
    } catch (cause) {
      setPlaybackMessage(cause instanceof Error ? cause.message : 'Spotify playback is unavailable.')
    } finally {
      setPlaybackBusy(false)
    }
  }

  if (!authReady) return <main className="auth-shell"><p className="auth-loading">Opening your listening room…</p></main>
  if (!authSession && !previewMode) {
    return (
      <AuthGate
        onPreview={() => { setPreviewMode(true); previewDemo() }}
        onSignedIn={(session) => { setAuthSession(session); setPreviewMode(false); setError('') }}
        initialError={error}
      />
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Soundprint home">
          <span className="brand-mark">s.</span><span>SOUNDPRINT</span>
        </a>
        <div className="topbar-meta"><span className="live-dot" /> YOUR LISTENING, DECODED</div>
        <div className="topbar-actions">
          <a className="quiet-link" href="#how-it-works">HOW IT WORKS <span aria-hidden="true">↘</span></a>
          {authSession
            ? <button className="account-button" type="button" onClick={() => void accountSignOut()} title={authSession.user.email}>SIGN OUT</button>
            : <button className="account-button" type="button" onClick={() => { setPreviewMode(false); setError('') }}>{isSupabaseConfigured ? 'SIGN IN' : 'SET UP ACCOUNT'}</button>}
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span>01</span> A SMALL MIRROR FOR YOUR MUSIC TASTE</p>
          <h1 id="hero-title">Your music<br />has a <em>personality.</em></h1>
          <p className="hero-description">A thoughtful little portrait of the sounds you return to. Connect Spotify and meet your listening DNA.</p>
          <div className="hero-actions">
            <button className="button button-primary" type="button" onClick={connected ? analyseSpotify : connect} disabled={busy}>
              <span className="spotify-glyph" aria-hidden="true">◉</span>
              {busy ? 'LISTENING…' : connected ? 'REFRESH MY PORTRAIT' : 'CONNECT SPOTIFY'}
              <span className="button-arrow" aria-hidden="true">↗</span>
            </button>
            <button className="button button-text" type="button" onClick={previewDemo}>TRY A SAMPLE <span aria-hidden="true">→</span></button>
          </div>
          <div className="privacy-line"><span aria-hidden="true">✳</span> Private by design. Your listening data stays in this tab.</div>
          {!isSpotifyConfigured() && <p className="setup-hint">Spotify connection needs a Client ID in <code>.env.local</code>. Try the sample while you set it up.</p>}
        </div>
        <div className="hero-art" aria-label="Abstract sound wave artwork">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-orbit orbit-three" />
          <div className="art-core"><span>♪</span></div>
          <div className="art-caption caption-one">A LITTLE OF THIS</div>
          <div className="art-caption caption-two">A LOT OF YOU</div>
          <div className="art-index">SOUND<br />/ 001</div>
        </div>
      </section>

      <div className="ticker" aria-label="Your taste is more than a genre">
        <div className="ticker-track">
          {Array.from({ length: 2 }, (_, idx) => <span key={idx}>TASTE IS A FEELING <b>✳</b> NOT A LABEL <b>✳</b> FOLLOW THE FREQUENCY <b>✳</b> YOUR MUSIC, YOUR MIRROR <b>✳</b> </span>)}
        </div>
      </div>

      {error && <div className="feedback feedback-error" role="alert"><span>!</span>{error}<button type="button" aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
      {notice && <div className="feedback feedback-notice" role="status"><span>✳</span>{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}

      {result ? (
        <section className="results-section" aria-labelledby="result-heading">
          <div className="section-heading">
            <div><p className="eyebrow"><span>02</span> YOUR SOUNDPRINT IS IN</p><h2 id="result-heading">A portrait in <em>frequencies.</em></h2></div>
            <button className="clear-button" type="button" onClick={clearData}>CLEAR MY DATA <span>×</span></button>
          </div>
          <div className="results-grid">
            <article className="personality-card" id="share-card">
              <div className="card-topline"><span>SOUNDPRINT / LISTENING DNA</span><span>NO. 001</span></div>
              <div className="card-glyph" style={{ color: result.primary.color }}>{result.primary.emoji}</div>
              <p className="card-kicker">YOUR LISTENING ARCHETYPE</p>
              <h3>{result.primary.name}</h3>
              <p className="card-tagline">{result.primary.tagline}</p>
              <div className="card-rule" />
              <p className="card-explanation">{aiCopy || result.explanation}</p>
              <div className="genre-chips">{result.topGenres.length ? result.topGenres.map((genre) => <span key={genre}>{genre}</span>) : <span>your listening mix</span>}</div>
              <div className="card-footer"><span>SOUNDPRINT <b>✳</b></span><span>YOUR MUSIC, YOUR MIRROR.</span></div>
            </article>

            <div className="insights-column">
              <div className="insight-panel">
                <div className="panel-title"><span>THE MIX</span><span>01 — 08</span></div>
                <p className="panel-intro">Your listening has a few different frequencies.</p>
                <div className="score-list">
                  {result.scores.slice(0, 5).map((item, index) => (
                    <div className="score-row" key={item.id}>
                      <div className="score-label"><span className="score-rank">0{index + 1}</span><span>{item.name}</span><span className="score-value">{item.score}%</span></div>
                      <div className="score-track"><span style={{ width: `${item.score}%`, backgroundColor: item.color }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="insight-panel signals-panel">
                <div className="panel-title"><span>THE CLUES</span><span>FROM YOUR ROTATION</span></div>
                <p className="signal-copy">{result.primary.description}</p>
                <div className="signal-columns">
                  <div><span className="mini-label">ARTISTS</span><p>{result.topArtists.length ? result.topArtists.join(' · ') : 'Your listening history'}</p></div>
                  <div><span className="mini-label">TOP TRACKS</span><p>{result.topTracks.length ? result.topTracks.join(' · ') : 'A sample of your sound'}</p></div>
                </div>
                <div className="signal-actions">
                  <button className="small-action" type="button" onClick={addAIContext} disabled={aiBusy}>{aiBusy ? 'WRITING…' : aiCopy ? 'REFRESH AI NOTE' : 'ADD AN AI NOTE'} <span>↗</span></button>
                  <span className="local-note">OPTIONAL · FALLS BACK TO LOCAL COPY</span>
                </div>
              </div>
              <div className="share-actions">
                <button className="button button-primary share-button" type="button" onClick={shareCard}>SHARE MY SOUNDPRINT <span className="button-arrow">↗</span></button>
                <button className="button button-outline" type="button" onClick={downloadCard}>DOWNLOAD PNG <span>↓</span></button>
              </div>
            </div>
          </div>
          <section className="spotify-library" aria-labelledby="spotify-library-title">
            <div className="library-heading">
              <div>
                <p className="eyebrow"><span>04</span> CONNECTED LISTENING</p>
                <h3 id="spotify-library-title">Your Spotify, <em>in the open.</em></h3>
              </div>
              {connected
                ? <span className="library-status"><span className="live-dot" /> CONNECTED · PRIVATE TO THIS TAB</span>
                : <span className="library-status">DEMO VIEW · CONNECT SPOTIFY TO LOAD YOUR LIBRARY</span>}
            </div>
            {spotifyData ? (
              <>
              {spotifyData.dataWarnings.length > 0 && (
                <p className="library-warning" role="status">
                  Some Spotify sources could not be read. Available data is shown; retry your connection if needed. {spotifyData.dataWarnings.join(' ')}
                </p>
              )}
              <div className="library-grid">
                <div className="library-panel">
                  <div className="panel-title"><span>FOLLOWED ARTISTS</span><span>{spotifyData.followedArtists.length} / {spotifyData.followedArtistsTotal}</span></div>
                  <ul className="library-list">
                    {spotifyData.followedArtists.map((artist) => (
                      <li key={artist.id}>
                        {artist.external_urls?.spotify
                          ? <a href={artist.external_urls.spotify} target="_blank" rel="noreferrer">{artist.name}<span aria-hidden="true">↗</span></a>
                          : <span>{artist.name}</span>}
                      </li>
                    ))}
                    {!spotifyData.followedArtists.length && <li className="library-empty">{connected ? 'No followed artists were returned.' : 'Connect Spotify to explore followed artists.'}</li>}
                  </ul>
                  {spotifyData.followedArtistsAfter && (
                    <button className="small-action" type="button" onClick={() => void loadMoreFollowedArtists()} disabled={libraryBusy}>
                      {artistsBusy ? 'LOADING…' : 'LOAD MORE ARTISTS'} <span>↓</span>
                    </button>
                  )}
                  <p className="library-note">Top listening artists also shape your portrait.</p>
                </div>

                <div className="library-panel">
                  <div className="panel-title"><span>RECENT HISTORY</span><span>UP TO 50</span></div>
                  <ul className="library-list">
                    {spotifyData.recentTracks.map((track, index) => (
                      <li key={`${track.id}-${index}`}>
                        {track.external_urls?.spotify
                          ? <a href={track.external_urls.spotify} target="_blank" rel="noreferrer">{track.name}<span aria-hidden="true">↗</span></a>
                          : <span>{track.name}</span>}
                      </li>
                    ))}
                    {!spotifyData.recentTracks.length && <li className="library-empty">{connected ? 'No recent plays were returned.' : 'Connect Spotify to explore recent plays.'}</li>}
                  </ul>
                  {spotifyData.recentTracksBefore && (
                    <button className="small-action" type="button" onClick={() => void loadOlderListeningHistory()} disabled={libraryBusy}>
                      {recentBusy ? 'LOADING…' : 'LOAD OLDER HISTORY'} <span>↓</span>
                    </button>
                  )}
                  <p className="library-note">Spotify exposes a limited recent-play window, not full account history.</p>
                </div>

                <div className="library-panel">
                  <div className="panel-title"><span>SAVED TRACKS</span><span>{spotifyData.savedTracks.length} / {spotifyData.savedTracksTotal}</span></div>
                  <ul className="library-list">
                    {spotifyData.savedTracks.map((track) => (
                      <li key={track.id}>
                        {track.external_urls?.spotify
                          ? <a href={track.external_urls.spotify} target="_blank" rel="noreferrer">{track.name}<span aria-hidden="true">↗</span></a>
                          : <span>{track.name}</span>}
                      </li>
                    ))}
                    {!spotifyData.savedTracks.length && <li className="library-empty">{connected ? 'No saved tracks were returned.' : 'Connect Spotify to explore saved tracks.'}</li>}
                  </ul>
                  {spotifyData.savedTracks.length < spotifyData.savedTracksTotal && (
                    <button className="small-action" type="button" onClick={() => void loadMoreSavedTracks()} disabled={libraryBusy}>
                      {savedTracksBusy ? 'LOADING…' : 'LOAD MORE SAVED TRACKS'} <span>↓</span>
                    </button>
                  )}
                  <p className="library-note">A snapshot of your saved songs from Spotify.</p>
                </div>

                <div className="library-panel playlist-panel">
                  <div className="panel-title"><span>YOUR PLAYLISTS</span><span>{spotifyData.playlists.length} / {spotifyData.playlistTotal}</span></div>
                  <ul className="playlist-list">
                    {spotifyData.playlists.map((playlist) => (
                      <li key={playlist.id}>
                        {playlist.spotifyUrl
                          ? <a className="playlist-link" href={playlist.spotifyUrl} target="_blank" rel="noreferrer">{playlist.name}<span aria-hidden="true">↗</span></a>
                          : <span className="playlist-link">{playlist.name}</span>}
                        <span className="playlist-count">{playlist.trackCount} tracks</span>
                        <button type="button" className="playlist-open" disabled={libraryBusy} onClick={() => void openPlaylist(playlist)}>
                          {activePlaylistId === playlist.id ? 'OPEN' : 'VIEW TRACKS'} <span aria-hidden="true">→</span>
                        </button>
                      </li>
                    ))}
                    {!spotifyData.playlists.length && <li className="library-empty">{connected ? 'No playlists were returned.' : 'Connect Spotify to explore your playlists.'}</li>}
                  </ul>
                  {spotifyData.playlists.length < spotifyData.playlistTotal && (
                    <button className="small-action" type="button" onClick={() => void loadMorePlaylists()} disabled={libraryBusy}>
                      {playlistsBusy ? 'LOADING…' : 'LOAD MORE PLAYLISTS'} <span>↓</span>
                    </button>
                  )}
                </div>
              </div>
              </>
            ) : (
              <p className="library-empty">Connect Spotify to explore your followed artists, recent plays, saved tracks, and playlists. A sample preview does not access your account.</p>
            )}
            {activePlaylistId && (
              <div className="playlist-tracks">
                <div className="panel-title"><span>SELECTED PLAYLIST TRACKS</span><span>{playlistTracks.length} / {playlistTrackTotal}</span></div>
                {playlistBusy && !playlistTracks.length ? <p className="library-empty">Loading playlist tracks…</p> : (
                  <>
                    <ol className="library-list">
                      {playlistTracks.map((track, index) => (
                        <li key={`${track.id}-${index}`}>
                          {track.external_urls?.spotify
                            ? <a href={track.external_urls.spotify} target="_blank" rel="noreferrer">{track.name}<span aria-hidden="true">↗</span></a>
                            : <span>{track.name}</span>}
                        </li>
                      ))}
                    </ol>
                    {playlistTracks.length < playlistTrackTotal && (
                      <button className="small-action" type="button" onClick={() => void loadMorePlaylistTracks()} disabled={libraryBusy}>
                        {playlistBusy ? 'LOADING…' : 'LOAD NEXT 50 TRACKS'} <span>↓</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
          <p className="results-footnote">A playful pattern read, not a scientific assessment. Spotify listening data is used only to create this result.</p>
        </section>
      ) : (
        <section className="empty-section" aria-label="How to get your result">
          <div className="empty-step"><span className="step-number">01</span><div><h2>Plug into your listening</h2><p>Connect Spotify securely with a one-time sign-in.</p></div><span className="step-icon">↗</span></div>
          <div className="empty-step"><span className="step-number">02</span><div><h2>Find your frequency</h2><p>Eight explainable archetypes, shaped by your top sounds.</p></div><span className="step-icon">⌁</span></div>
          <div className="empty-step"><span className="step-number">03</span><div><h2>Take it with you</h2><p>Make a share card. Keep your listening data private.</p></div><span className="step-icon">✳</span></div>
        </section>
      )}

      {result && (
        <section className="recommendations-section" aria-labelledby="recommendations-title">
          <div className="recommendations-heading">
            <div>
              <p className="eyebrow"><span>05</span> A FEW NEXT LISTENS</p>
              <h2 id="recommendations-title">Follow the <em>frequency.</em></h2>
              <p>New tracks surfaced from genres and artists in your listening history, excluding tracks already in your loaded rotation.</p>
            </div>
            {connected && spotifyData && (
              <button className="button button-outline" type="button" onClick={() => void generateRecommendations(spotifyData, result)} disabled={recommendationBusy}>
                {recommendationBusy ? 'FINDING TRACKS…' : 'REFRESH PICKS'} <span>↻</span>
              </button>
            )}
          </div>
          {recommendationBusy && <p className="library-note" role="status">Listening for your next favourite…</p>}
          {recommendationError && <p className="library-warning" role="status">{recommendationError}</p>}
          {recommendations.length > 0 && (
            <div className="recommendation-grid">
              {recommendations.slice(0, 6).map((track, index) => (
                <article className={selectedRecommendation === index ? 'recommendation-card is-selected' : 'recommendation-card'} key={track.id}>
                  <span className="recommendation-index">0{index + 1}</span>
                  <h3>{track.name}</h3>
                  <p>{track.artists.map((artist) => artist.name).join(' · ')}</p>
                  <div className="genre-chips">{(track.recommendationSignals ?? track.recommendationGenres ?? []).map((signal) => <span key={signal}>{signal}</span>)}</div>
                  <div className="recommendation-actions">
                    <button type="button" onClick={() => setSelectedRecommendation(index)}>FEATURE IN WIDGET</button>
                    {track.external_urls?.spotify && <a href={track.external_urls.spotify} target="_blank" rel="noreferrer">OPEN IN SPOTIFY ↗</a>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="how-section" id="how-it-works">
        <p className="eyebrow"><span>03</span> A NOTE ON THE METHOD</p>
        <div className="how-content">
          <h2>Not a test.<br />Just a <em>good listen.</em></h2>
          <div className="how-copy">
            <p>We look at the genres attached to your top artists and tracks, then use a fixed, transparent scoring recipe to find the closest match across eight listening archetypes.</p>
            <p>Soundprint accounts use Supabase email/password sign-in. Spotify sign-in then uses Authorization Code with PKCE. With your permission, Soundprint reads your top and followed artists, top and saved tracks, recently played tracks, and playlists. Playlist contents load only when you open a playlist. Spotify limits recent-play history; this is not a complete lifetime history.</p>
            <p>Listening data stays in this tab’s memory. Spotify tokens stay in session storage and are cleared with your data; no listening history is stored on a Soundprint server.</p>
            <p className="method-note"><span>✳</span> AI interpretation is optional and only sends your archetype and genre signals to your configured provider. The local explanation always works without it.</p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <a className="brand" href="#" aria-label="Soundprint home"><span className="brand-mark">s.</span><span>SOUNDPRINT</span></a>
        <span>MADE OF THE MUSIC YOU LOVE <b>✳</b></span>
        <button type="button" onClick={clearData}>CLEAR SESSION DATA</button>
      </footer>
      {result && recommendations.length > 0 && (
        <aside className="listening-widget" aria-label="Soundprint recommendation widget">
          <div className="widget-topline"><span>YOUR NEXT LISTEN</span><span>{selectedRecommendation + 1} / {recommendations.length}</span></div>
          <div className="widget-content">
            <span className="widget-glyph" style={{ color: result.primary.color }} aria-hidden="true">{result.primary.emoji}</span>
            <div className="widget-track">
              <strong>{recommendations[selectedRecommendation]?.name}</strong>
              <span>{recommendations[selectedRecommendation]?.artists.map((artist) => artist.name).join(' · ')}</span>
            </div>
          </div>
          <div className="widget-controls">
            <button type="button" aria-label="Previous recommendation" onClick={() => setSelectedRecommendation((index) => (index - 1 + recommendations.length) % recommendations.length)}>←</button>
            <button type="button" className="widget-play" onClick={() => void playRecommendation()} disabled={!connected || playbackBusy} aria-label="Play recommendation on Spotify">
              {playbackBusy ? '…' : '▶'}
            </button>
            <button type="button" aria-label="Pause or resume Spotify playback" onClick={() => void togglePlayback()} disabled={!connected || playbackBusy}>Ⅱ</button>
            <button type="button" aria-label="Next recommendation" onClick={() => setSelectedRecommendation((index) => (index + 1) % recommendations.length)}>→</button>
          </div>
          {!connected && <p className="widget-hint">Connect Spotify to enable playback controls.</p>}
          {playbackMessage && <p className="widget-hint" role="status">{playbackMessage}</p>}
          {recommendations[selectedRecommendation]?.external_urls?.spotify && (
            <a className="widget-open" href={recommendations[selectedRecommendation].external_urls?.spotify} target="_blank" rel="noreferrer">OPEN IN SPOTIFY ↗</a>
          )}
        </aside>
      )}
    </main>
  )
}

export default App
