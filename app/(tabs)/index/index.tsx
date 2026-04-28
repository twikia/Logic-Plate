import { SafeAreaView } from 'react-native-safe-area-context';
import {  StyleSheet, Text, View, Pressable  } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function HomeScreen() {
  return (
    <LinearGradient colors={['#5C255C', '#F9A06F']} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.pageTitle}>Find an awesome meal!</Text>
        
        <View style={styles.buttonContainer}>
          <Link href="/feeling" asChild>
            <Pressable style={styles.giantButton}>
              <IconSymbol name="heart.fill" size={48} color="#FFFFFF" />
              <Text style={styles.buttonText}>Choose by Feeling</Text>
            </Pressable>
          </Link>
          
          <Link href="/health" asChild>
            <Pressable style={styles.giantButton}>
              <IconSymbol name="leaf.fill" size={48} color="#FFFFFF" />
              <Text style={styles.buttonText}>Choose by Health</Text>
            </Pressable>
          </Link>
          
          <Link href="/random" asChild>
            <Pressable style={styles.giantButton}>
              <IconSymbol name="shuffle" size={48} color="#FFFFFF" />
              <Text style={styles.buttonText}>Choose by Random</Text>
            </Pressable>
          </Link>

          <Pressable style={[styles.giantButton, { backgroundColor: '#F97352' }]} onPress={() => {
            import('../../../tests/cacheTest').then(module => module.runCacheTests());
          }}>
            <IconSymbol name="chevron.left.forwardslash.chevron.right" size={48} color="#FFFFFF" />
            <Text style={styles.buttonText}>Run Cache Test</Text>
          </Pressable>
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
    paddingTop: 50, // Space for transparent header
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  buttonContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 20,
  },
  giantButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)', // Glassmorphism look
    borderRadius: 35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    gap: 15,
  },
  buttonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
