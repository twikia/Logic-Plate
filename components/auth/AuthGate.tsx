import { useCallback, useEffect, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useRouter, useRootNavigationState, useSegments } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { isRecommendationOnboardingRequired } from '@/core/recommendationPrefs';

SplashScreen.preventAutoHideAsync().catch(() => {});

function resolveAuthRoute(
  segments: string[],
  needsUsername: boolean,
  needsOnboarding: boolean,
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

  if (needsOnboarding) {
    return onWelcome ? null : '/welcome-onboarding';
  }

  if (onWelcome) {
    return '/(tabs)';
  }

  if (inAuth) {
    return '/(tabs)';
  }

  return null;
}

function routeMatchesTarget(segments: string[], target: string): boolean {
  const normalized = target.replace(/^\//, '');
  if (normalized === 'welcome-onboarding') return segments[0] === 'welcome-onboarding';
  if (normalized.startsWith('(tabs)')) return segments[0] === '(tabs)';
  if (normalized.startsWith('(auth)/pick-username')) {
    return segments[0] === '(auth)' && segments[1] === 'pick-username';
  }
  return false;
}

export function AuthGate() {
  const { loading, needsUsername, isGuest } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();
  const pendingTarget = useRef<string | null>(null);
  const splashHidden = useRef(false);

  const hideSplash = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (!navState?.key || loading) return;

    const segs = segments as string[];
    if (!segs[0]) return;

    let cancelled = false;

    void (async () => {
      const needsOnboarding = await isRecommendationOnboardingRequired();
      if (cancelled) return;

      const target = resolveAuthRoute(segs, needsUsername, needsOnboarding, isGuest);
      if (target) {
        if (routeMatchesTarget(segs, target)) {
          pendingTarget.current = null;
          hideSplash();
          return;
        }
        pendingTarget.current = target;
        router.replace(target as any);
        return;
      }

      pendingTarget.current = null;
      hideSplash();
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, needsUsername, isGuest, segments, router, navState?.key, hideSplash]);

  useEffect(() => {
    if (!navState?.key || loading || splashHidden.current) return;

    const segs = segments as string[];
    if (!segs[0]) return;

    const pending = pendingTarget.current;
    if (pending && routeMatchesTarget(segs, pending)) {
      pendingTarget.current = null;
      hideSplash();
    }
  }, [segments, loading, navState?.key, hideSplash]);

  useEffect(() => {
    if (loading) return;
    const timeout = setTimeout(() => hideSplash(), 3000);
    return () => clearTimeout(timeout);
  }, [loading, hideSplash]);

  return null;
}
