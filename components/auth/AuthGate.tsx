import { useCallback, useEffect, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useRouter, useRootNavigationState, useSegments } from 'expo-router';
import { AppSplashOverlay } from '@/components/AppSplashOverlay';
import { useAuth } from '@/context/AuthContext';
import { isAppIntroRequired } from '@/core/appIntro';
import { isRecommendationOnboardingRequired } from '@/core/recommendationPrefs';

SplashScreen.preventAutoHideAsync().catch(() => {});

function resolveAuthRoute(
  segments: string[],
  needsUsername: boolean,
  needsIntro: boolean,
  needsOnboarding: boolean,
  isGuest: boolean
): string | null {
  const seg0 = segments[0];
  if (!seg0) return null;

  const seg1 = segments.at(1);
  const inAuth = seg0 === '(auth)';
  const onPickUsername = seg1 === 'pick-username';
  const onLogin = seg1 === 'login';
  const onIntro = seg0 === 'welcome-intro';
  const onWelcome = seg0 === 'welcome-onboarding';

  if (inAuth && onLogin && isGuest) return null;

  if (needsUsername) {
    return inAuth && onPickUsername ? null : '/(auth)/pick-username';
  }

  if (needsIntro) {
    return onIntro ? null : '/welcome-intro';
  }

  if (onIntro) {
    return needsOnboarding ? '/welcome-onboarding' : '/(tabs)';
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
  if (normalized === 'welcome-intro') return segments[0] === 'welcome-intro';
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
  const [showSplash, setShowSplash] = useState(true);

  const hideSplash = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    setShowSplash(false);
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (!navState?.key || loading) return;

    const segs = segments as string[];
    if (!segs[0]) return;

    let cancelled = false;

    void (async () => {
      const [needsIntro, needsOnboarding] = await Promise.all([
        isAppIntroRequired(),
        isRecommendationOnboardingRequired(),
      ]);
      if (cancelled) return;

      const target = resolveAuthRoute(segs, needsUsername, needsIntro, needsOnboarding, isGuest);
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

  if (!showSplash) return null;
  return <AppSplashOverlay />;
}
