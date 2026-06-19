import { Pressable } from '@/components/ui/soundPressable';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SetUsernameForm } from '@/components/auth/SetUsernameForm';
import { useAppTheme } from '@/context/ThemeContext';
import { useTranslation } from 'react-i18next';

export default function EditUsernameModal() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useAppTheme();

  const close = () => router.back();

  return (
    <View style={styles.overlay}>
      <Animated.View entering={FadeIn.duration(125)} exiting={FadeOut.duration(100)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={close} />
      </Animated.View>
      <SafeAreaView style={styles.centerWrap} edges={['top', 'bottom']} pointerEvents="box-none">
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.cardBorderColor }]}
        >
          <SetUsernameForm
            title={t('auth.editUsername')}
            subtitle={t('auth.editUsernameSubtitle')}
            onSuccess={close}
          />
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    width: '100%',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
});
