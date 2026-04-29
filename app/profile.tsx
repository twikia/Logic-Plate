import { StyleSheet, Text, View, ScrollView, Pressable, Alert } from 'react-native';
import { useAppTheme } from '@/context/ThemeContext';
import { Themes } from '@/constants/Themes';

import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useProfileIcon } from '@/hooks/useProfileIcon';
import { runCacheTests } from '../tests/cacheTest';
import { clearLocalCache } from '../core/cacheManager';
import { clearResultCache } from '../core/resultCache';
import { clearLocationCache } from '../core/locationCache';

export default function ProfileScreen() {
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);
  const [isSelectingIcon, setIsSelectingIcon] = useState(false);
  const { icon, changeIcon, icons } = useProfileIcon();
  const { theme, themeName, setTheme } = useAppTheme();



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
          <SafeAreaView style={[styles.card, { backgroundColor: theme.cardBackground }]} edges={['top', 'bottom']}>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={[styles.section, { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }]}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Account</Text>
                  <Text style={[styles.subtitle, { color: theme.subtext }]}>You are currently a Guest.</Text>
                  <AnimatedPressable style={[styles.button, { backgroundColor: theme.accent }]}>

                    <Text style={styles.buttonText}>Login / Sign Up</Text>
                  </AnimatedPressable>
                </View>
                
                <AnimatedPressable onPress={() => setIsSelectingIcon(true)} style={styles.profileIconWrapper}>
                  <View style={styles.profileIconContainer}>
                    <Text style={{ fontSize: 40 }}>{icon}</Text>
                  </View>
                  <View style={styles.editBadge}>
                    <Ionicons name="pencil" size={14} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.changeText, { color: theme.accent }]}>Change</Text>
                </AnimatedPressable>

              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Settings</Text>
                <AnimatedPressable 
                  style={[styles.menuItem, { backgroundColor: theme.buttonBackground }]}
                  onPress={() => router.push('/general-settings')}
                >

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.menuItemText}>General Settings</Text>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
                  </View>
                </AnimatedPressable>
                <View style={[styles.menuItem, { paddingVertical: 12, backgroundColor: theme.buttonBackground }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={[styles.menuItemText, { color: theme.text }]}>Theme Preferences</Text>
                  </View>

                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={styles.themeSelector}
                  >
                    {Object.entries(Themes).map(([id, t]: [string, any]) => (
                      <Pressable 
                        key={id}
                        onPress={() => setTheme(id)}
                        style={[
                          styles.themeBtn, 
                          themeName === id && styles.themeBtnActive,
                          { borderColor: t.accent }
                        ]}
                      >
                        <View style={[styles.themePreview, { backgroundColor: t.gradient[0] }]}>
                          <LinearGradient 
                            colors={t.gradient} 
                            style={StyleSheet.absoluteFill}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                          />
                        </View>
                        <Text style={[
                          styles.themeText, 
                          themeName === id && { color: t.accent, fontWeight: 'bold' }
                        ]}>
                          {t.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                </View>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Developer</Text>
                <AnimatedPressable 
                  style={[styles.menuItem, { backgroundColor: theme.accent }]} 
                  onPress={() => runCacheTests()}
                >
                  <Text style={[styles.menuItemText, { color: theme.text }]}>Run All Tests</Text>
                </AnimatedPressable>

                <AnimatedPressable 
                  style={[styles.menuItem, { backgroundColor: '#C1E1C1', marginTop: 10 }]} 
                  onPress={async () => {
                    await Promise.all([
                      clearLocalCache(),
                      clearResultCache(),
                      clearLocationCache()
                    ]);
                    Alert.alert('System Purged', 'All local caches (H3 cells, Results, and Location) have been wiped.');
                  }}
                >
                  <Text style={[styles.menuItemText, { color: '#2B422A' }]}>Clear All Caches</Text>
                </AnimatedPressable>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      )}

      {/* Icon Selection Modal */}
      {isSelectingIcon && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100, justifyContent: 'center', alignItems: 'center' }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} onPress={() => setIsSelectingIcon(false)} />
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} style={[styles.iconSelectionBox, { backgroundColor: theme.cardBackground }]}>

            <Text style={styles.iconSelectionTitle}>Choose an Avatar</Text>
            <View style={styles.iconGrid}>
              {icons.map((item) => (
                <AnimatedPressable 
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
                </AnimatedPressable>
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
  themePreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
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
  themeSelector: {
    flexDirection: 'row',
    paddingVertical: 5,
  },

  themeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#5C255C',
    marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  themeBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },

  themeText: {
    color: '#B59EAA',
    fontSize: 11,
    fontWeight: '600',
  },
  themeTextActive: {
    color: '#F97352',
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
