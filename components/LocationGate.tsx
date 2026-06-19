import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLocation } from '@/core/locationCache';
import { useAppTheme } from '@/context/ThemeContext';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { hapticMedium } from '@/core/haptics';

export function LocationGate({ children }: { children: React.ReactNode }) {
  const { theme } = useAppTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const [hasInitialLocation, setHasInitialLocation] = useState<boolean | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkLocation = async () => {
    setIsChecking(true);
    // getLocation(false) will wait for any pending initial fetch triggered by initLocationCache
    const loc = await getLocation(false);
    
    if (loc) {
      setHasInitialLocation(true);
    } else {
      const perm = await Location.getForegroundPermissionsAsync();
      setPermissionStatus(perm.status);
      setHasInitialLocation(false);
    }
    setIsChecking(false);
  };

  useEffect(() => {
    // Only check if we haven't successfully got it yet.
    if (!hasInitialLocation) {
      void checkLocation();
    }
  }, [hasInitialLocation]);

  if (hasInitialLocation === null || (isChecking && hasInitialLocation === false)) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.cardBackground }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  // Once we get location once, we never lock the user again during this app session.
  if (hasInitialLocation === true) {
    return <>{children}</>;
  }

  // Locked State
  const isDenied = permissionStatus !== 'granted';

  return (
    <LinearGradient colors={[theme.gradient[0], theme.gradient[1] ?? theme.cardBackground]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Ionicons
            name={isDenied ? 'location-outline' : 'warning-outline'}
            size={80}
            color={theme.accent}
            style={styles.icon}
          />
          <Text style={[styles.title, { color: theme.text }]}>
            {isDenied ? t('map.locationRequiredTitle', 'Location Required') : t('map.gpsUnavailableTitle', 'GPS Unavailable')}
          </Text>
          <Text style={[styles.body, { color: theme.subtext }]}>
            {isDenied
              ? t('map.locationRequiredBody', 'Platebound needs your location to find the best restaurants around you. Please grant location permissions to continue.')
              : t('map.gpsUnavailableBody', 'We could not determine your current location. Please ensure your GPS is turned on and try again.')}
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <AnimatedPressable
            style={[styles.primaryButton, { backgroundColor: theme.accent }]}
            onPress={async () => {
              hapticMedium();
              if (isDenied) {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                  // Wait slightly to let the OS catch up before acquiring
                  await new Promise(r => setTimeout(r, 500));
                  void checkLocation();
                } else {
                  setPermissionStatus(status);
                }
              } else {
                // If it was just GPS unavailable, forcing a new check.
                // We use getLocation(true) to force a fresh GPS request and bypass cache
                setIsChecking(true);
                const loc = await getLocation(true);
                if (loc) {
                  setHasInitialLocation(true);
                } else {
                  const perm = await Location.getForegroundPermissionsAsync();
                  setPermissionStatus(perm.status);
                  setHasInitialLocation(false);
                }
                setIsChecking(false);
              }
            }}
          >
            <Text style={[styles.buttonText, { color: theme.accentOnColor ?? '#FFFFFF' }]}>
              {isDenied ? t('map.grantPermission', 'Grant Permission') : t('common.tryAgain', 'Try Again')}
            </Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={[styles.secondaryButton, { borderColor: theme.cardBorderColor, backgroundColor: theme.glassBackground }]}
            onPress={() => {
              hapticMedium();
              router.replace('/welcome-intro' as any);
            }}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
              {t('common.goBack', 'Go Back')}
            </Text>
          </AnimatedPressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 24,
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 34,
  },
  body: {
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
    maxWidth: 340,
  },
  buttonContainer: {
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
  },
});
