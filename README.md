# Soundprint — Spotify Music Personality

A standalone Vite + React + TypeScript app that turns Spotify listening into a small, explainable music-personality portrait. It uses Spotify Authorization Code with PKCE, a deterministic eight-archetype scoring model, optional server-side AI copy, and client-side share-card export.

The web app runs in desktop and mobile browsers. A compact floating recommendation/playback widget appears with results; the `mobile/` companion adds a native phone app and home-screen widget when built for supported platforms.

## Requirements

- Node.js 20.19+ or 22.12+
- A Spotify developer app and its **Client ID** (no client secret is used)
- Optional: a Vercel deployment and an OpenAI-compatible text-generation endpoint for AI copy

## Run locally

```sh
npm install
copy .env.example .env.local
```

The app owner configures `VITE_SPOTIFY_CLIENT_ID` once in `.env.local` for local development and as a Vercel project environment variable for deployment. Users never enter a Client ID: they choose **Connect Spotify** in Soundprint and continue through Spotify's official authorization page. `VITE_SPOTIFY_REDIRECT_URI` is optional; if omitted, the app uses the current page URL. In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), register that exact redirect URI (for local development, commonly `http://127.0.0.1:5173/` or `http://localhost:5173/`).

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project to enable Soundprint email/password accounts. The Supabase anon key is intended for client applications; never put a Supabase service-role key in this frontend. Enable email/password authentication and set the local/deployed Site URL and allowed redirect URLs in Supabase Auth settings. Users sign in to Soundprint first, then link Spotify with PKCE. Until Supabase is configured, the sample preview is available but account sign-in and Spotify linking are not.

```sh
npm run dev
```

The sample preview works without Spotify configuration. After signing in to Soundprint, connect Spotify and approve the requested scopes: `user-top-read`, `user-read-recently-played`, `user-library-read`, `user-follow-read`, `playlist-read-private`, `playlist-read-collaborative`, `user-read-playback-state`, `user-modify-playback-state`, and `user-read-currently-playing`. The first six enable listening/library access; the last three support best-effort playback controls. Playback requires Spotify Premium and an active device. Spotify redirect URIs must match exactly. The app uses Authorization Code with PKCE and does not require a client secret.

## Deploy the web app to Vercel

The existing web app is the repository-root Vercel project. Keep **Root Directory** at the repository root (not `mobile/`); use the Vite preset, `npm run build` as the build command, and `dist` as the output directory. Vercel can deploy the optional `api/interpret.ts` function from the root `api/` directory. This configuration has not yet been deployed to Vercel.

For an end-to-end production readiness checklist covering Vercel, EAS, native widgets, Spotify, and Supabase, see [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).

Add these Vercel Project Environment Variables for each environment you intend to deploy:

- `VITE_SPOTIFY_CLIENT_ID` — Spotify public client ID.
- `VITE_SPOTIFY_REDIRECT_URI` — exact callback URL for the deployed root web app, such as `https://your-domain.example/`.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — public Supabase project URL and anon key; never use the service-role key in frontend variables.
- `COPY_PROVIDER_URL`, `COPY_PROVIDER_API_KEY`, and optional `COPY_MODEL` — server-side Vercel Function settings for optional AI copy. Do not prefix these secrets with `VITE_`.

After choosing the production domain, register the exact HTTPS Spotify redirect URI in the Spotify Developer Dashboard. Set the Supabase Auth Site URL to the production origin and add the production callback/origin plus any preview URLs you use to its allowed redirect URLs. Preview deployment domains may need separate allow-list entries and matching Spotify redirects. Redeploy after changing build-time `VITE_*` values. Configure localhost and production callbacks separately; never assume their URL or trailing slash is interchangeable.

The separate Expo companion lives in [`mobile/`](./mobile/). It has its own package, environment variables, and native-build lifecycle; do not point the root Vercel project at that folder. For an optional separately hosted Expo web build, configure a second deployment with `mobile/` as its Root Directory. For later iOS/Android downloads, build and distribute the native apps through EAS and the relevant app stores; a Vercel web deployment does not produce phone binaries or enable native home-screen widgets. See [`mobile/README.md`](./mobile/README.md).

## AI copy (optional)

The browser calls `/api/interpret`; the Vercel function is provider-neutral at the configuration layer and expects an OpenAI-compatible Chat Completions API response. Configure these **server-side only** in Vercel Project Settings:

- `COPY_PROVIDER_URL` — full chat-completions endpoint
- `COPY_PROVIDER_API_KEY` — provider key
- `COPY_MODEL` — optional model name

Do not prefix server secrets with `VITE_`. The app sends only the archetype, tagline, genre labels, and matching rule signals to this route when a user explicitly presses **Add an AI note**. Without a configured route/provider, the deterministic local explanation remains available.

## What it reads and stores

- Requests up to 50 top artists/tracks, followed artists, saved tracks, and recently played tracks, plus the user's playlists via Spotify Web API.
- Followed artists, saved tracks, and playlists are paginated in batches of 50. Playlist track contents are fetched only when the user opens a playlist; recent plays can page backwards using Spotify's cursor.
- The recommendation panel searches Spotify for tracks matching the listener's strongest genres and top artists (derived from top, saved, recent, and loaded playlist tracks), removes tracks already present in the loaded history, and ranks the remaining songs by Spotify popularity. This is a transparent discovery aid, not Spotify's proprietary recommendation algorithm.
- Spotify's recently played endpoint is limited; it does not provide a complete lifetime listening history. Spotify API access and returned fields can also vary with account/app access.
- Uses Authorization Code with PKCE; no Spotify client secret is present in the browser.
- Spotify access and refresh tokens are held in `sessionStorage` for the current tab and automatically refreshed when possible. Spotify authorization is not currently synchronized across browsers or devices. Listening data and results are held in React memory and are not persisted to local storage or a database.
- **Clear my data** removes the tab’s Spotify session and result state. You can also revoke Soundprint access from your Spotify account settings.
- PNG generation and native share happen locally in the browser.

Spotify is a trademark of Spotify AB. Soundprint is an independent demo and is not affiliated with Spotify.

## Scoring

The scoring recipe is deterministic and inspectable in `src/lib/scoring.ts`: each matching artist/genre pair adds two points, each matching archetype keyword adds one point, and a modest popularity nudge (at most three points) applies to selected archetypes. Points are normalized to percentages across eight archetypes. Genre signals and the leading artists are shown alongside the result. A genre-light history gets a stable, explicitly qualified fallback.

## Commands

```sh
npm run dev       # local development
npm run test      # scoring tests
npm run build     # TypeScript check and production build
npm run preview   # preview production bundle
npm run lint      # lint project files
```

Deploy the frontend to Vercel to enable `api/interpret.ts`; the optional API route requires the provider environment variables above. No external account setup, credentials, Vercel deployment, native build, or store release has been performed for you.
