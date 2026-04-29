import { SafeAreaView } from 'react-native-safe-area-context';
import {  StyleSheet, Text, View  } from "react-native";
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TopProfileButton } from '@/components/ui/TopProfileButton';

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
          <Text style={styles.pageTitle}>Find your meal!</Text>
          <Link href="/feeling" asChild>
            <AnimatedPressable style={styles.giantButton}>
              <IconSymbol name="heart.fill" size={32} color="#FFFFFF" />
              <Text style={styles.buttonText}>Feeling</Text>
            </AnimatedPressable>
          </Link>
          
          <Link href="/health" asChild>
            <AnimatedPressable style={styles.giantButton}>
              <IconSymbol name="leaf.fill" size={32} color="#FFFFFF" />
              <Text style={styles.buttonText}>Health</Text>
            </AnimatedPressable>
          </Link>
          
          <Link href="/random" asChild>
            <AnimatedPressable style={styles.giantButton}>
              <IconSymbol name="shuffle" size={32} color="#FFFFFF" />
              <Text style={styles.buttonText}>Random</Text>
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
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
    gap: 25,
  },
  giantButton: {
    width: '55%',
    backgroundColor: '#3D2B3D',
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    gap: 15,
  },
  buttonText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
