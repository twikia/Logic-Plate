import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useRouter, useRootNavigationState, useSegments } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

export function AuthGate() {
  const { loading, needsUsername } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key || loading) return;

    const seg0 = segments[0];
    const inAuth = seg0 === '(auth)';
    const onPickUsername = segments[1] === 'pick-username';
    const onLogin = segments[1] === 'login';

    if (needsUsername && !(inAuth && onPickUsername)) {
      router.replace('/(auth)/pick-username' as any);
    } else if (!needsUsername && inAuth && !onLogin) {
      router.replace('/(tabs)' as any);
    }
  }, [loading, needsUsername, segments, router, navState?.key]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  return null;
}
