import { SafeAreaView } from 'react-native-safe-area-context';
import {  StyleSheet, Text, View, Pressable  } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function HomeScreen() {
  return (
    <LinearGradient colors={['#5C255C', '#F9A06F']} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.pageTitle}>Find your meal!</Text>
        
        <View style={styles.buttonContainer}>
          <Link href="/feeling" asChild>
            <Pressable style={styles.giantButton}>
              <IconSymbol name="heart.fill" size={32} color="#FFFFFF" />
              <Text style={styles.buttonText}>Feeling</Text>
            </Pressable>
          </Link>
          
          <Link href="/health" asChild>
            <Pressable style={styles.giantButton}>
              <IconSymbol name="leaf.fill" size={32} color="#FFFFFF" />
              <Text style={styles.buttonText}>Health</Text>
            </Pressable>
          </Link>
          
          <Link href="/random" asChild>
            <Pressable style={styles.giantButton}>
              <IconSymbol name="shuffle" size={32} color="#FFFFFF" />
              <Text style={styles.buttonText}>Random</Text>
            </Pressable>
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
