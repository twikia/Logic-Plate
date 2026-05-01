import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import type { Provider } from '@supabase/supabase-js';
import { supabase } from '@/core/supabaseClient';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri({
  scheme: 'restaurantapp',
  path: 'auth/callback',
});

function parseTokensFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  try {
    const parsed = new URL(url);
    const fragment = parsed.hash.replace(/^#/, '');
    const search = parsed.search.replace(/^\?/, '');
    const params = new URLSearchParams(fragment || search);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      return { access_token, refresh_token };
    }
    return null;
  } catch {
    return null;
  }
}

async function finishOAuthBrowserSession(
  result: WebBrowser.WebBrowserAuthSessionResult
): Promise<{ error: Error | null }> {
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    return { error: result.type === 'cancel' ? new Error('cancelled') : new Error('oauth_failed') };
  }
  const tokens = parseTokensFromUrl(result.url);
  if (!tokens) {
    return { error: new Error('no_tokens_in_redirect') };
  }
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  if (sessionError) return { error: sessionError };
  return { error: null };
}

export async function signInWithOAuthProvider(provider: Provider): Promise<{ error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { error };
    const authUrl = data.url;
    if (!authUrl) return { error: new Error('missing_oauth_url') };

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
    return finishOAuthBrowserSession(result);
  } catch (e) {
    return { error: e instanceof Error ? e : new Error('oauth_failed') };
  }
}

export async function linkOAuthProvider(provider: Provider): Promise<{ error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { error };
    const authUrl = data.url;
    if (!authUrl) return { error: new Error('missing_oauth_url') };

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
    return finishOAuthBrowserSession(result);
  } catch (e) {
    return { error: e instanceof Error ? e : new Error('oauth_failed') };
  }
}
