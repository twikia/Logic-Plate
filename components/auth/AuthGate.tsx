import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useRouter, useRootNavigationState, useSegments } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getRecommendationPrefs } from '@/core/recommendationPrefs';

SplashScreen.preventAutoHideAsync().catch(() => {});

function resolveAuthRoute(
  segments: string[],
  needsUsername: boolean,
  onboardingComplete: boolean,
  isGuest: boolean
): string | null {
  const seg0 = segments[0];
  if (!seg0) return null;

  const seg1 = segments.at(1);
  const inAuth = seg0 === '(auth)';
  const onPickUsername = seg1 === 'pick-username';
  const onLogin = seg1 === 'login';
  const onWelcome = seg0 === 'welcome-onboarding';

  if (inAuth && onLogin && isGuest) return null;

  if (needsUsername) {
    return inAuth && onPickUsername ? null : '/(auth)/pick-username';
  }

  if (!onboardingComplete) {
    return onWelcome ? null : '/welcome-onboarding';
  }

  if (inAuth) {
    return '/(tabs)';
  }

  return null;
}

export function AuthGate() {
  const { loading, needsUsername, isGuest } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key || loading) return;

    let cancelled = false;

    void (async () => {
      const prefs = await getRecommendationPrefs();
      if (cancelled) return;

      const target = resolveAuthRoute(
        segments as string[],
        needsUsername,
        !!prefs.onboardingComplete,
        isGuest
      );
      if (target) {
        router.replace(target as any);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, needsUsername, isGuest, segments, router, navState?.key]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  return null;
}
