import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useRouter, useRootNavigationState, useSegments } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getRecommendationPrefs } from '@/core/recommendationPrefs';

SplashScreen.preventAutoHideAsync().catch(() => {});

export function AuthGate() {
  const { loading, needsUsername } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    void getRecommendationPrefs().then(p => {
      setOnboardingComplete(!!p.onboardingComplete);
      setPrefsReady(true);
    });
  }, [loading, segments]);

  useEffect(() => {
    if (!navState?.key || loading || !prefsReady) return;

    const seg0 = segments[0];
    if (!seg0) return;

    const inAuth = seg0 === '(auth)';
    const seg1 = segments.at(1);
    const onPickUsername = seg1 === 'pick-username';
    const onLogin = seg1 === 'login';
    const onWelcome = seg0 === 'welcome-onboarding';

    if (needsUsername && !(inAuth && onPickUsername)) {
      router.replace('/(auth)/pick-username' as any);
    } else if (!needsUsername && inAuth && !onLogin) {
      if (!onboardingComplete) {
        router.replace('/welcome-onboarding' as any);
      } else {
        router.replace('/(tabs)' as any);
      }
    } else if (!needsUsername && !inAuth && !onboardingComplete && !onWelcome) {
      router.replace('/welcome-onboarding' as any);
    }
  }, [loading, needsUsername, segments, router, navState?.key, prefsReady, onboardingComplete]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  return null;
}
