export const authMode = process.env.EXPO_PUBLIC_AUTH_MODE === 'supabase' ? 'supabase' : 'mock';
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const spotifyClientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '';
export const spotifyRedirectUri = process.env.EXPO_PUBLIC_SPOTIFY_REDIRECT_URI ?? '';
