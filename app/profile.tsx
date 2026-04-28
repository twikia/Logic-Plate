import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';

export default function ProfileScreen() {
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      router.back();
    }, 125); // Faster exit animation
  };

  return (
    <View style={styles.overlayContainer}>
      {!isClosing && (
        <Animated.View 
          style={[StyleSheet.absoluteFill, styles.backdrop]} 
          entering={FadeIn.duration(125)} 
          exiting={FadeOut.duration(100)}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
      )}
      
      {!isClosing && (
        <Animated.View 
          style={styles.drawerContainer}
          entering={SlideInRight.duration(125)}
          exiting={SlideOutRight.duration(100)}
        >
          <SafeAreaView style={styles.card} edges={['top', 'bottom']}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account</Text>
                <Text style={styles.subtitle}>You are currently a Guest.</Text>
                <TouchableOpacity style={styles.button}>
                  <Text style={styles.buttonText}>Login / Sign Up</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Settings</Text>
                <TouchableOpacity style={styles.menuItem}>
                  <Text style={styles.menuItemText}>Theme Preferences</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem}>
                  <Text style={styles.menuItemText}>Notification Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem}>
                  <Text style={styles.menuItemText}>Privacy & Security</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Developer</Text>
                <TouchableOpacity 
                  style={[styles.menuItem, { backgroundColor: '#F97352' }]} 
                  onPress={() => {
                    import('../tests/cacheTest').then(module => module.runCacheTests());
                  }}
                >
                  <Text style={styles.menuItemText}>Run Cache Test</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  drawerContainer: {
    width: '65%',
    height: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: -5, height: 0 },
    elevation: 20,
  },
  card: {
    flex: 1,
    backgroundColor: '#3D2B3D',
    borderTopLeftRadius: 35,
    borderBottomLeftRadius: 35,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 30,
  },
  section: {
    marginBottom: 40,
  },
  sectionTitle: {
    fontSize: 24, // increased to act as main header since pageTitle was removed
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#B59EAA',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#F97352',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  menuItem: {
    backgroundColor: '#5C255C',
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderRadius: 15,
    marginBottom: 10,
  },
  menuItemText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  }
});
