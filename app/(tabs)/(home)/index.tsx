import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TopProfileButton } from '@/components/ui/TopProfileButton';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <LinearGradient
      colors={['#422046', '#FF9A6F']}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={styles.background}
    >
      <TopProfileButton />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.buttonContainer}>
          <View style={styles.titleContainer}>
            <Text style={[styles.emoji, { top: -25, left: 20, transform: [{ rotate: '-15deg' }] }]}>🍕</Text>
            <Text style={[styles.emoji, { top: 30, right: 10, transform: [{ rotate: '20deg' }] }]}>🍔</Text>
            <Text style={[styles.emoji, { bottom: -35, left: 60, transform: [{ rotate: '10deg' }] }]}>🥗</Text>
            <Text style={[styles.emoji, { top: -20, right: 50, transform: [{ rotate: '-10deg' }] }]}>🍣</Text>
            <Text style={styles.pageTitle}>Find your meal!</Text>
          </View>

          <Link href="/feeling" asChild>
            <AnimatedPressable style={styles.giantButton}>
              <IconSymbol name="heart.fill" size={32} color="#FF8C00" />
              <Text style={styles.buttonText}>Feeling</Text>
            </AnimatedPressable>
          </Link>

          <Link href="/health" asChild>
            <AnimatedPressable style={styles.giantButton}>
              <IconSymbol name="leaf.fill" size={32} color="#4CAF50" />
              <Text style={styles.buttonText}>Health</Text>
            </AnimatedPressable>
          </Link>

          <Link href="/random" asChild>
            <AnimatedPressable style={styles.giantButton}>
              <IconSymbol name="shuffle" size={32} color="#00D2FF" />
              <Text style={styles.buttonText}>Select</Text>
            </AnimatedPressable>
          </Link>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingTop: 50,
  },
  pageTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  titleContainer: {
    position: 'relative',
    marginBottom: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    position: 'absolute',
    fontSize: 28,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
    gap: 30,
  },
  giantButton: {
    width: '65%',
    backgroundColor: '#3D2B3D',
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    gap: 15,
  },
  buttonText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
