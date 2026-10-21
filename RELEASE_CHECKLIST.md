# Soundprint production release checklist

Use this checklist to move Soundprint from the current implementation to a verified web and mobile release. Check off items only after completing them in the relevant provider dashboard or on the target device.

## Current release status

- [x] Root Vite web app builds for Vercel; 21 root tests and lint pass.
- [x] Separate Expo mobile package builds for web; mobile typecheck, 8 mobile tests, and web export pass.
- [x] Spotify PKCE sign-in and mobile token refresh are implemented.
- [x] iOS widget and Android widget integration are present in Expo configuration.
- [x] Expo public configuration validates, and Android prebuild generated the widget receiver and resources.
- [x] Local Git has been initialized and `origin` points to the supplied GitHub repository.
- [ ] The supplied GitHub `main` currently contains only its initial README commit. The local app files have not been committed or pushed; integrate the README-only remote before the first push.
- [ ] No Vercel project/deployment, EAS project ID, production credentials, native store build, or physical-device widget test has been verified.
- [ ] Android native compilation is blocked locally: neither Java nor an Android SDK is installed/configured. Use a configured EAS remote build or install the required local toolchain.
- [ ] `mobile/app.json` still has example Android/iOS IDs and an example iOS widget App Group. Replace them with identifiers you own before creating EAS builds; do not publish with the examples.

## 1. Deploy the Vite web app to Vercel

### Before deployment

- [ ] Create or select the Vercel project connected to this repository.
- [ ] Set **Root Directory** to the repository root. Do not set it to `mobile/`.
- [ ] Configure the Vite build: `npm run build`; output directory: `dist`. Let Vercel install the root `package.json` dependencies.
- [ ] Add production environment variables in Vercel Project Settings:
  - `VITE_SPOTIFY_CLIENT_ID` — Spotify app client ID; public and intended for browser use.
  - `VITE_SPOTIFY_REDIRECT_URI` — exact production callback URL, including path and trailing slash, e.g. `https://your-domain.example/`.
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` — public anon/publishable key only.
  - Optional AI copy, server-side only: `COPY_PROVIDER_URL`, `COPY_PROVIDER_API_KEY`, and optionally `COPY_MODEL`. Never prefix these provider settings with `VITE_`.
- [ ] Do not add a Spotify client secret or Supabase service-role key to Vercel client variables.
- [ ] In the Spotify Developer Dashboard, register the exact production redirect URI. Register preview URLs only if previews are intentionally used for OAuth and comply with Spotify's current redirect rules.
- [ ] In Supabase Authentication settings, set the production Site URL and add the production URL and any intentionally supported callback/preview URLs to the redirect allow-list.
- [ ] Confirm Supabase email/password sign-in is enabled and choose whether email confirmation is required.

### Deploy and verify

- [ ] Deploy to a Vercel preview first; verify the build succeeds and the intended environment variables are assigned to Preview.
- [ ] Test sample access, account sign-up, sign-in, sign-out, and a failed login. Confirm the app gives actionable errors.
- [ ] Test Spotify connect/cancel, successful callback, and a callback mismatch. Confirm the live callback matches exactly.
- [ ] Verify top listening data, library permissions, recommendations, clearing session data, and Spotify disconnect/reconnect.
- [ ] Verify optional AI copy is disabled gracefully when provider settings are absent. If enabled, confirm the route receives only the derived summary described in the README, not access tokens or raw listening history.
- [ ] Test production on desktop and phone browsers, including share/download fallback and compact widget layout.
- [ ] Promote the verified deployment to Production and test the custom domain and TLS callback again.

## 2. Configure Expo/EAS mobile deployment

### App identity and project

- [ ] Choose the final app name, slug, URL scheme, and permanent IDs. Replace `com.example.spotify.personality` in `mobile/app.json` with an identifier owned by you; keep the iOS bundle ID and Android application ID stable after store publication.
- [ ] Replace the example iOS widget app-group identifier in `mobile/app.json` with an App Group owned by your Apple Developer team and ensure the iOS widget target uses that same group.
- [ ] Add production app icon, Android adaptive icon foreground, splash assets, screenshots, support URL, privacy policy URL, and store metadata.
- [ ] From `mobile/`, sign in to Expo/EAS and configure the project (`npx eas-cli login`, then `npx eas-cli build:configure`). Persist the generated EAS `projectId` in Expo config as instructed by the CLI.
- [ ] Check `mobile/eas.json` build profiles and set any required distribution, credentials, and submit configuration for your release workflow.

### Production environment

- [ ] Set EAS build environment values for `EXPO_PUBLIC_AUTH_MODE=supabase`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`.
- [ ] Set `EXPO_PUBLIC_SPOTIFY_REDIRECT_URI` for the target build. Use the exact native deep-link callback registered in Spotify for a native build; use the deployed HTTPS callback for an Expo web build. The redirect is compiled into the app, so do not assume the web and native callbacks are interchangeable.
- [ ] Keep `EXPO_PUBLIC_*` values limited to public client configuration. Never include Spotify client secrets, Supabase service-role keys, or other server secrets.
- [ ] Configure Supabase Site URL and redirect allow-list for the native deep link and, if hosted, the Expo web origin.
- [ ] Decide whether Expo web needs its own Vercel deployment. If so, create a separate Vercel project with `mobile/` as Root Directory, `npm run export:web` as build command, and `dist` as output. Do not change the root Vite deployment's settings.
- [ ] Run from `mobile/`: `npm run typecheck`, `npm test`, and `npm run export:web`.

### EAS builds

- [ ] Create and install internal development builds first using EAS; test the app without relying on Expo Go for native widgets.
- [ ] Build a preview/release-candidate binary for iOS and Android (`npm run build:ios`, `npm run build:android`, or `npm run build:all` from `mobile/`).
- [ ] Install the release candidate on real devices; validate OAuth callbacks, session restoration, token refresh, Spotify reconnect, recommendations, sign-out, and playback success/error states.
- [ ] After validation, create production binaries with the production EAS profile. Record each build number/version and retain the EAS build links.
- [ ] Complete the store-specific release steps below; an EAS build does not itself publish an app to either store.

## 3. Build and verify Android/iOS apps and widgets

### Android

- [ ] Install/configure the Android SDK locally or use EAS remote builds; accept licenses and verify the configured Java/Android Gradle toolchain.
- [ ] Run a clean Android prebuild and compile (`npx expo prebuild --platform android`, then an EAS build or `npx expo run:android`). Resolve any plugin, Kotlin, manifest, or resource errors before release.
- [ ] On a physical Android device, add the Soundprint widget from the launcher widget picker and verify initial empty state, size/resize, dark styling, and update after a recommendation is loaded.
- [ ] Verify Play opens Soundprint and requests playback of the track displayed in the widget; verify Pause, no Spotify connection, expired/revoked login, no active device, and unsupported playback states are reported safely.
- [ ] Verify widget state refreshes after sign-out, reconnect, app restart, and a changed recommendation. Confirm no full listening history is persisted by the widget.
- [ ] Test minimum supported Android version and a current Android version. Check launcher-specific layout differences and accessibility/font scaling.

### iOS

- [ ] Configure Apple signing, the App Group, and the widget extension/bundle identifiers for the chosen Apple Developer team.
- [ ] Build an EAS development/native binary; widgets cannot be verified in Expo Go.
- [ ] On a physical iPhone, add the widget in small and medium sizes and verify initial state, update after app refresh, text truncation, and dark appearance.
- [ ] Verify widget actions, cold/warm app launch, Spotify connection state, and best-effort playback behavior. Confirm a missing Spotify device or unavailable playback does not crash the widget/app.
- [ ] Test supported iOS versions and confirm the widget target is included in the signed archive/TestFlight build.

### Store distribution

- [ ] Apple: enroll in the Apple Developer Program, complete App Store Connect app/privacy information, configure signing, upload the production build, and complete TestFlight and App Review.
- [ ] Google Play: create the Play Console app, configure signing, complete the Data safety and content declarations, test the required release track, then submit for review.
- [ ] Review Spotify branding, data use, and playback against Spotify's current developer terms and store policies before release.
- [ ] Publish user-facing support, account deletion/contact instructions, privacy policy, and any disclosures required by the selected account backend and platform.

## 4. Configure and test live Spotify/Supabase

### Spotify Developer Dashboard

- [ ] Create the production Spotify app and record its **Client ID**. A client secret is not needed for this PKCE client and must not be shipped.
- [ ] Add exact callback URLs for each enabled target: local Vite, Vercel production, optional Vercel previews, optional Expo web, iOS deep link, and Android deep link. Use the callback actually generated by each installed build; exact matches matter.
- [ ] Confirm the app's current access mode, user/test allow-list, quota, and required review/extended-access steps in Spotify's dashboard. Follow current Spotify policy for requested library and playback scopes.
- [ ] Test consent grant, cancellation, reauthorization, token expiry/refresh, and access revocation from the Spotify account settings.
- [ ] Test with accounts/devices that do and do not support remote playback. Playback may require Spotify Premium and an active Spotify device; recommendation availability should remain independent of playback.
- [ ] Verify the product communicates that Spotify recent-play data is limited and does not represent complete lifetime listening history.

### Supabase

- [ ] Create separate Supabase projects for production and non-production environments if appropriate.
- [ ] Enable email/password auth, set email confirmation and password policies, configure SMTP for production if confirmation emails are required, and set production Site URL and exact allowed redirects.
- [ ] Set only the correct project URL and public anon/publishable key in each client environment. Store any privileged key only in a protected server environment if a future server feature requires it.
- [ ] Confirm the current app uses Supabase for authentication only; listening records and Spotify tokens are not stored in Supabase. Do not create user-data tables unless the product requires them, and apply RLS before exposing any table through the client.
- [ ] Run end-to-end tests for sign-up, duplicate email, invalid password, email confirmation, sign-in, session restoration, sign-out, and account deletion/support procedure.
- [ ] Confirm that signing out of Soundprint also clears Spotify credentials and that users can separately revoke Soundprint's Spotify access through Spotify account settings.

## Final release sign-off

- [ ] All checks above that apply to the chosen release targets are complete.
- [ ] Root web build, tests, and lint pass; mobile typecheck, tests, and web export pass.
- [ ] Production Spotify/Supabase OAuth, account, and recovery flows have been exercised with real accounts.
- [ ] Android and iOS release candidates and their widgets have been tested on physical target devices.
- [ ] Production URLs, app IDs, build versions, support/privacy links, and store listing details have been reviewed.
- [ ] Rollback plan, monitoring/alerts, and a contact for support are documented before public launch.
