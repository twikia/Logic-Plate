import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';

import { AuthGate } from '@/components/auth/AuthGate';
import { initDistanceUnit, getLanguage } from '@/core/userSettings';
import { initLocationCache } from '@/core/locationCache';
import { bootstrapLanguage } from '@/core/translationLoader';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { initAudio, registerUiSound } from '@/core/audioService';
import i18n from '@/i18n';

// ─── Audio registration ───────────────────────────────────────────────────────
// After adding your audio files to assets/audio/, uncomment these lines.
// See assets/audio/README.md for file sources and naming conventions.
//
const clickSound = require('@/assets/audio/ui/denielcz-immersivecontrol-button-click-sound-463065.mp3');
registerUiSound('tap', clickSound);
registerUiSound('select', clickSound);
registerUiSound('success', require('@/assets/audio/ui/juniorsoundays-ui-sound-70-527837.mp3'));
registerUiSound('error', require('@/assets/audio/ui/miraclei-sample_deny_error04_kofi_by_miraclei-360158.mp3'));

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    initLocationCache();
    void initDistanceUnit();
    void initAudio();
    getLanguage().then((saved) => {
      void bootstrapLanguage(saved);
    });
  }, []);

  useEffect(() => {
    async function checkUpdate() {
      if (!__DEV__ && Updates.isEnabled) {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          }
        } catch {
          // Standalone builds should keep running on the embedded bundle.
        }
      }
    }
    checkUpdate();
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
    <SafeAreaProvider>
      <AuthProvider>
        <AppThemeProvider>
          <ThemeProvider value={{
            ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
            colors: {
              ...(colorScheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
              background: '#000000',
            }
          }}>
            <AuthGate />
            <Stack screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              animationDuration: 95,
              detachInactiveScreens: false,
              contentStyle: { backgroundColor: colorScheme === 'dark' ? '#000000' : '#f0e8d6' },
            }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="welcome-onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen
                name="profile"
                options={{
                  presentation: 'transparentModal',
                  animation: 'none',
                  headerShown: false,
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen name="edit-username" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen name="general-settings" options={{ animation: 'slide_from_bottom', contentStyle: { backgroundColor: colorScheme === 'dark' ? '#000000' : '#f0e8d6' } }} />
              <Stack.Screen name="recommendation-settings" options={{ animation: 'slide_from_bottom', contentStyle: { backgroundColor: colorScheme === 'dark' ? '#000000' : '#f0e8d6' } }} />
              <Stack.Screen name="subscription" options={{ animation: 'slide_from_bottom', contentStyle: { backgroundColor: colorScheme === 'dark' ? '#000000' : '#f0e8d6' } }} />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </AppThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
    </I18nextProvider>
  );
}
