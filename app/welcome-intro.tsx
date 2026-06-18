import { useAppTheme } from '@/context/ThemeContext';
import { markAppIntroSeen } from '@/core/appIntro';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { hapticMedium } from '@/core/haptics';

export default function WelcomeIntroScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { t } = useTranslation();

  const start = async () => {
    hapticMedium();
    await markAppIntroSeen();
    router.replace('/welcome-onboarding' as any);
  };

  return (
    <LinearGradient colors={[theme.gradient[0], theme.gradient[1] ?? theme.cardBackground]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Image
            source={require('@/assets/images/splash-icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.title, { color: theme.text }]}>{t('intro.title')}</Text>
          <Text style={[styles.body, { color: theme.subtext }]}>{t('intro.body')}</Text>
        </View>
        <AnimatedPressable
          style={[styles.button, { backgroundColor: theme.accent }]}
          onPress={start}
        >
          <Text style={[styles.buttonText, { color: theme.accentOnColor ?? '#FFFFFF' }]}>
            {t('intro.start')}
          </Text>
        </AnimatedPressable>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  logo: {
    width: 120,
    height: 120,
    marginBottom: 32,
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
  button: {
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
  },
});
