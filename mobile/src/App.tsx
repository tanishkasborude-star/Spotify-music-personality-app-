import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { authMode } from './config';
import { restoreProfile, signIn, signOut as signOutAccount, signUp } from './services/auth';
import { getRecommendedTrack, getToken, getTopTracks, playTrack, togglePlayback, connectSpotify, clearSpotifyToken } from './services/spotify';
import { personalityFor, pickFallbackRecommendation, fallbackTracks } from './services/personality';
import { listenForWidgetActions, publishWidget } from './widgets/widgetBridge';
import type { Profile, SpotifyPlayback, Track } from './types';

const colors = { background: '#0B100E', panel: '#151D19', muted: '#9BAAA2', text: '#F4F8F5', green: '#7BF0B6', stroke: '#29342E' };

export default function App() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 760;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [recommendation, setRecommendation] = useState<Track | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playback, setPlayback] = useState<SpotifyPlayback>('not-connected');
  const [pendingWidgetAction, setPendingWidgetAction] = useState<{ action: 'play'; trackUri?: string } | null>(null);
  const personality = useMemo(() => personalityFor(tracks), [tracks]);

  useEffect(() => {
    const subscription = listenForWidgetActions((action, trackUri) => {
      if (action === 'play') {
        const track = trackUri
          ? { ...(recommendation ?? { id: trackUri, name: 'Widget recommendation', artist: '', album: '' }), uri: trackUri }
          : recommendation;
        if (!track) {
          setPendingWidgetAction({ action, trackUri });
          return;
        }
        void playTrack(track).then(setPlayback);
        return;
      }
      void togglePlayback(action).then(setPlayback);
    });
    return () => subscription.remove();
  }, [recommendation]);

  useEffect(() => {
    if (!pendingWidgetAction) return;
    const track = pendingWidgetAction.trackUri
      ? { ...(recommendation ?? { id: pendingWidgetAction.trackUri, name: 'Widget recommendation', artist: '', album: '' }), uri: pendingWidgetAction.trackUri }
      : recommendation;
    if (!track) return;
    void playTrack(track).then(setPlayback).finally(() => setPendingWidgetAction(null));
  }, [pendingWidgetAction, recommendation]);

  const refreshMusic = useCallback(async (email = profile?.email) => {
    const token = await getToken();
    if (!token) return;
    setConnected(true);
    const top = await getTopTracks();
    const next = await getRecommendedTrack(top);
    setTracks(top.length ? top : fallbackTracks);
    setRecommendation(next ?? pickFallbackRecommendation(email));
    publishWidget({
      archetype: personalityFor(top).archetype,
      track: next?.name ?? 'Find your next favorite',
      artist: next?.artist ?? 'Open the app for picks',
      trackUri: next?.uri ?? '',
      action: '',
    });
  }, [profile?.email]);

  useEffect(() => {
    void restoreProfile().then((user) => {
      if (!user) return;
      setProfile(user);
      setTracks(fallbackTracks);
      setRecommendation(pickFallbackRecommendation(user.email));
      void refreshMusic(user.email).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not refresh Spotify listening data.');
      });
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not restore your account.');
    });
  }, [refreshMusic]);

  async function handleAuth() {
    setBusy(true);
    setError('');
    try {
      const user = register ? await signUp(email, password) : await signIn(email, password);
      setProfile(user);
      setTracks(fallbackTracks);
      setRecommendation(pickFallbackRecommendation(user.email));
      await refreshMusic(user.email);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSpotifyConnect() {
    setBusy(true);
    setError('');
    try {
      await connectSpotify();
      setConnected(true);
      await refreshMusic();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect Spotify.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePlay(track = recommendation) {
    if (!track) return;
    if (!connected) {
      setPlayback('not-connected');
      return;
    }
    const result = await playTrack(track);
    setPlayback(result);
  }

  async function handleSignOut() {
    try {
      await signOutAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign out.');
      return;
    }
    setProfile(null);
    setTracks([]);
    setRecommendation(null);
    setConnected(false);
    void clearSpotifyToken();
    publishWidget({ archetype: 'Your music personality', track: 'Connect Spotify', artist: 'Your next favorite', trackUri: '', action: '' });
    setError('');
  }

  const playbackMessage = {
    ready: 'Playback requested on your Spotify device.',
    'premium-required': 'Spotify Premium is required for remote playback. Your picks still work here.',
    'no-device': 'Open Spotify on a device, then try playback again.',
    'not-connected': 'Connect Spotify to use playback controls.',
    error: 'Spotify could not start playback. Check your account and active device.',
  }[playback];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.page, desktop && styles.desktopPage]}>
        <View style={[styles.header, desktop && styles.headerDesktop]}>
          <View style={styles.brandMark}><Text style={styles.brandIcon}>♪</Text></View>
          <View style={styles.brandCopy}><Text style={styles.brand}>SIDE A</Text><Text style={styles.tagline}>Your listening, understood.</Text></View>
          {profile && <Pressable onPress={() => void handleSignOut()}><Text style={styles.signOut}>Sign out</Text></Pressable>}
        </View>

        {!profile ? (
          <View style={[styles.authLayout, desktop && styles.authLayoutDesktop]}>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>A little more you in every playlist</Text>
              <Text style={styles.heroTitle}>Your sound has a story.</Text>
              <Text style={styles.body}>Meet your music personality and find the next song that feels like it already knows you.</Text>
              <View style={styles.pill}><View style={styles.dot} /><Text style={styles.pillText}>Private by design · Spotify stays yours</Text></View>
            </View>
            <View style={styles.authCard}>
              <Text style={styles.sectionEyebrow}>YOUR SPACE</Text>
              <Text style={styles.cardTitle}>{register ? 'Create your account' : 'Welcome back'}</Text>
              <Text style={styles.bodySmall}>Sign in first, then link Spotify whenever you’re ready.</Text>
              <TextInput style={styles.input} placeholder="Email address" placeholderTextColor="#7A8980" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email address" />
              <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#7A8980" secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Password" />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable style={styles.primaryButton} onPress={handleAuth} disabled={busy}>
                {busy ? <ActivityIndicator color="#0B100E" /> : <Text style={styles.primaryText}>{register ? 'Create account' : 'Sign in'}</Text>}
              </Pressable>
              <Pressable style={styles.switchButton} onPress={() => { setRegister(!register); setError(''); }}>
                <Text style={styles.switchText}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</Text>
              </Pressable>
              <Text style={styles.providerNote}>Account provider: {authMode === 'mock' ? 'local demo (no credentials needed)' : 'Supabase email & password'}</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.welcomeRow}>
              <View><Text style={styles.eyebrow}>YOUR LISTENING, IN A NEW LIGHT</Text><Text style={styles.heroTitle}>Hey, {profile.name}.</Text></View>
              <View style={styles.connectedPill}><View style={[styles.dot, connected && { backgroundColor: colors.green }]} /><Text style={styles.pillText}>{connected ? 'Spotify linked' : 'Spotify not linked'}</Text></View>
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <View style={[styles.dashboard, desktop && styles.dashboardDesktop]}>
              <View style={styles.mainColumn}>
                <View style={styles.personalityCard}>
                  <Text style={styles.sectionEyebrow}>YOUR MUSIC PERSONALITY</Text>
                  <Text style={[styles.archetype, { color: personality.accent }]}>{personality.archetype}</Text>
                  <Text style={styles.cardTitle}>{personality.title}</Text>
                  <Text style={styles.body}>{personality.description}</Text>
                  <View style={styles.orbit}><Text style={styles.orbitNote}>A soundtrack with a point of view</Text></View>
                </View>
                <View style={styles.recommendationCard}>
                  <Text style={styles.sectionEyebrow}>PICKED FOR YOUR NEXT LISTEN</Text>
                  <View style={styles.trackRow}>
                    {recommendation?.imageUrl ? <Image source={{ uri: recommendation.imageUrl }} style={styles.albumArt} /> : <View style={[styles.albumArt, styles.albumPlaceholder]}><Text style={styles.albumIcon}>♫</Text></View>}
                    <View style={styles.trackCopy}><Text style={styles.trackTitle}>{recommendation?.name ?? 'Your next favorite is waiting'}</Text><Text style={styles.bodySmall}>{recommendation?.artist ?? 'Link Spotify for a personal pick'}</Text></View>
                    <Pressable style={styles.playButton} onPress={() => void handlePlay()} accessibilityLabel="Play recommendation"><Text style={styles.playIcon}>▶</Text></Pressable>
                  </View>
                  <Text style={styles.playbackNote}>{playbackMessage}</Text>
                </View>
              </View>
              <View style={styles.sideColumn}>
                {desktop && <View style={styles.miniWidget}>
                  <Text style={styles.sectionEyebrow}>DESKTOP MINI PLAYER</Text>
                  <Text style={styles.widgetArchetype}>{personality.archetype}</Text>
                  <Text style={styles.widgetTrack}>{recommendation?.name ?? 'A song for your mood'}</Text>
                  <Text style={styles.bodySmall}>{recommendation?.artist ?? 'Recommendations work without Spotify'}</Text>
                  <View style={styles.widgetControls}>
                    <Pressable style={styles.widgetPlay} onPress={() => void handlePlay()}><Text style={styles.widgetPlayText}>▶</Text></Pressable>
                    <Text style={styles.widgetCaption}>Compact in-app widget · not always-on-top</Text>
                  </View>
                </View>}
                <View style={styles.connectCard}>
                  <Text style={styles.sectionEyebrow}>{connected ? 'YOUR LISTENING DATA' : 'MAKE IT PERSONAL'}</Text>
                  <Text style={styles.cardTitle}>{connected ? 'Refresh your picks' : 'Link your Spotify'}</Text>
                  <Text style={styles.bodySmall}>{connected ? 'Update your profile from the music you’ve been playing.' : 'We use your top tracks to shape your archetype and recommendations.'}</Text>
                  <Pressable style={[styles.primaryButton, styles.spotifyButton]} onPress={connected ? () => void refreshMusic().catch((e) => setError(e.message)) : handleSpotifyConnect} disabled={busy}>
                    {busy ? <ActivityIndicator color="#0B100E" /> : <Text style={styles.primaryText}>{connected ? 'Refresh listening data' : 'Connect Spotify'}</Text>}
                  </Pressable>
                  <Text style={styles.providerNote}>Spotify login opens securely using OAuth PKCE.</Text>
                </View>
                <View style={styles.dataCard}>
                  <Text style={styles.sectionEyebrow}>YOUR TOP TRACKS</Text>
                  {(tracks.length ? tracks.slice(0, 3) : fallbackTracks).map((track, index) => (
                    <View key={track.id} style={styles.listTrack}><Text style={styles.rank}>{`0${index + 1}`}</Text><View style={styles.trackCopy}><Text style={styles.listTitle} numberOfLines={1}>{track.name}</Text><Text style={styles.bodySmall} numberOfLines={1}>{track.artist}</Text></View></View>
                  ))}
                  {!connected && <Text style={styles.providerNote}>Sample picks until Spotify is linked.</Text>}
                </View>
              </View>
            </View>
          </>
        )}
        <Text style={styles.footer}>SIDE A · made for the way you listen</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 30, width: '100%', alignSelf: 'center', maxWidth: 1100, flexGrow: 1 },
  desktopPage: { paddingHorizontal: 44, paddingTop: 30 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 50 },
  headerDesktop: { marginBottom: 72 },
  brandMark: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  brandIcon: { color: colors.background, fontWeight: '900', fontSize: 25 },
  brandCopy: { flex: 1 },
  brand: { fontSize: 15, fontWeight: '900', letterSpacing: 2, color: colors.text },
  tagline: { color: colors.muted, fontSize: 11, marginTop: 2 },
  signOut: { color: colors.green, fontWeight: '700', padding: 10 },
  authLayout: { gap: 34, paddingBottom: 32 },
  authLayoutDesktop: { flexDirection: 'row', alignItems: 'center', gap: 75 },
  hero: { flex: 1, paddingVertical: 12 },
  eyebrow: { color: colors.green, fontWeight: '700', letterSpacing: 1.5, fontSize: 11, marginBottom: 12 },
  heroTitle: { color: colors.text, fontSize: 40, lineHeight: 47, fontWeight: '800', letterSpacing: -1.1, marginBottom: 12 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23, maxWidth: 480 },
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 25, borderRadius: 30, backgroundColor: '#14221A', paddingVertical: 10, paddingHorizontal: 14 },
  connectedPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 22 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#87938B' },
  pillText: { color: colors.muted, fontSize: 11 },
  authCard: { flex: 1, width: '100%', backgroundColor: colors.panel, borderRadius: 22, borderColor: colors.stroke, borderWidth: 1, padding: 23 },
  sectionEyebrow: { color: colors.muted, fontSize: 10, letterSpacing: 1.3, fontWeight: '700', marginBottom: 13 },
  cardTitle: { color: colors.text, fontSize: 21, fontWeight: '700', marginBottom: 8 },
  bodySmall: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  input: { marginTop: 14, borderWidth: 1, borderColor: colors.stroke, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, backgroundColor: '#101713', fontSize: 14 },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.green, marginTop: 18 },
  primaryText: { color: colors.background, fontSize: 14, fontWeight: '800' },
  switchButton: { alignItems: 'center', padding: 15 },
  switchText: { color: colors.green, fontSize: 12, fontWeight: '600' },
  providerNote: { color: '#75837A', fontSize: 10, lineHeight: 16, marginTop: 11 },
  error: { color: '#FF9B91', fontSize: 12, marginVertical: 8 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25, gap: 12 },
  dashboard: { gap: 18 },
  dashboardDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  mainColumn: { flex: 1.2, gap: 18 },
  sideColumn: { flex: 0.8, gap: 18 },
  personalityCard: { minHeight: 255, padding: 24, borderRadius: 22, backgroundColor: '#18251E', borderWidth: 1, borderColor: '#27372D', overflow: 'hidden' },
  archetype: { fontSize: 35, fontWeight: '800', letterSpacing: -1, marginTop: 21, marginBottom: 9 },
  orbit: { alignSelf: 'flex-end', borderWidth: 1, borderColor: '#3B5245', borderRadius: 30, paddingHorizontal: 14, paddingVertical: 8, marginTop: 18 },
  orbitNote: { color: '#B9CDC0', fontSize: 10 },
  recommendationCard: { padding: 21, borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.stroke },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  albumArt: { width: 53, height: 53, borderRadius: 10 },
  albumPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#34463B' },
  albumIcon: { color: colors.green, fontSize: 26 },
  trackCopy: { flex: 1 },
  trackTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  playButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.green },
  playIcon: { color: colors.background, fontSize: 13, marginLeft: 2 },
  playbackNote: { color: colors.muted, fontSize: 10, marginTop: 13 },
  connectCard: { padding: 19, borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.stroke },
  spotifyButton: { backgroundColor: '#1ED760' },
  dataCard: { padding: 19, borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.stroke },
  listTrack: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.stroke },
  rank: { color: colors.green, fontSize: 11, fontWeight: '800' },
  listTitle: { color: colors.text, fontSize: 12, fontWeight: '600', marginBottom: 3 },
  miniWidget: { padding: 18, borderRadius: 20, backgroundColor: '#202B25', borderWidth: 1, borderColor: '#344238' },
  widgetArchetype: { color: colors.green, fontSize: 18, fontWeight: '800', marginBottom: 7 },
  widgetTrack: { color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 3 },
  widgetControls: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15 },
  widgetPlay: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  widgetPlayText: { color: colors.background, fontSize: 11 },
  widgetCaption: { color: colors.muted, fontSize: 9, flex: 1 },
  footer: { color: '#56635B', textAlign: 'center', fontSize: 10, letterSpacing: 1, paddingTop: 38 },
});
