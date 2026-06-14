import { Pressable } from '@/components/ui/soundPressable';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SetUsernameForm } from '@/components/auth/SetUsernameForm';
import { useAppTheme } from '@/context/ThemeContext';

export default function EditUsernameModal() {
  const router = useRouter();
  const { theme } = useAppTheme();

  const close = () => router.back();

  return (
    <View style={styles.overlay}>
      <Animated.View entering={FadeIn.duration(125)} exiting={FadeOut.duration(100)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={close} />
      </Animated.View>
      <SafeAreaView style={[styles.card, { backgroundColor: theme.cardBackground }]} edges={['top', 'bottom']}>
        <View style={styles.pad}>
          <SetUsernameForm
            title="Edit username"
            subtitle="Letters, numbers, and underscores only. Offensive names are blocked."
            onSuccess={close}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
  },
  pad: {
    padding: 24,
  },
});
