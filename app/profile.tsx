import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useProfileIcon } from '@/hooks/useProfileIcon';

export default function ProfileScreen() {
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);
  const [isSelectingIcon, setIsSelectingIcon] = useState(false);
  const { icon, changeIcon, icons } = useProfileIcon();

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      router.back();
    }, 125);
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
              <View style={[styles.section, { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }]}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.sectionTitle}>Account</Text>
                  <Text style={styles.subtitle}>You are currently a Guest.</Text>
                  <TouchableOpacity style={styles.button}>
                    <Text style={styles.buttonText}>Login / Sign Up</Text>
                  </TouchableOpacity>
                </View>
                
                <TouchableOpacity onPress={() => setIsSelectingIcon(true)} style={styles.profileIconWrapper}>
                  <View style={styles.profileIconContainer}>
                    <Text style={{ fontSize: 40 }}>{icon}</Text>
                  </View>
                  <View style={styles.editBadge}>
                    <Ionicons name="pencil" size={14} color="#FFFFFF" />
                  </View>
                  <Text style={styles.changeText}>Change</Text>
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

      {/* Icon Selection Modal */}
      {isSelectingIcon && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100, justifyContent: 'center', alignItems: 'center' }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} onPress={() => setIsSelectingIcon(false)} />
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} style={styles.iconSelectionBox}>
            <Text style={styles.iconSelectionTitle}>Choose an Avatar</Text>
            <View style={styles.iconGrid}>
              {icons.map((item) => (
                <TouchableOpacity 
                  key={item} 
                  style={[styles.iconOption, icon === item && styles.iconOptionSelected]}
                  onPress={() => { changeIcon(item); setIsSelectingIcon(false); }}
                >
                  <Text style={{ fontSize: 32 }}>{item}</Text>
                  {icon === item && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </View>
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
    fontSize: 24,
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
    alignSelf: 'flex-start',
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
  },
  profileIconWrapper: {
    alignItems: 'center',
  },
  profileIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  editBadge: {
    position: 'absolute',
    bottom: 20,
    right: -5,
    backgroundColor: '#F97352',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3D2B3D',
  },
  changeText: {
    color: '#F9A06F',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  iconSelectionBox: {
    backgroundColor: '#3D2B3D',
    borderRadius: 25,
    padding: 25,
    width: '80%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  iconSelectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 15,
  },
  iconOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconOptionSelected: {
    borderColor: '#4CD964',
    backgroundColor: 'rgba(76, 217, 100, 0.1)',
  },
  checkBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: '#4CD964',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3D2B3D',
  }
});
