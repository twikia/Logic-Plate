import { Pressable } from '@/components/ui/soundPressable';
import { StyleSheet, Text, View, ScrollView, Alert } from 'react-native';
import { Image } from 'expo-image';
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
import { clearRandomPickerState } from '../core/randomPickerState';
import { resetRecommendationPrefsToOnboarding } from '../core/recommendationPrefs';
import { clearResultCache } from '../core/resultCache';
import { clearLocationCache } from '../core/locationCache';
import { clearImageCache } from '../core/images';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';
import { hapticLight, hapticMedium, hapticSuccess } from '@/core/haptics';

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, profile, signOut, isGuest } = useAuth();
  const [isClosing, setIsClosing] = useState(false);
  const [isSelectingIcon, setIsSelectingIcon] = useState(false);
  const { icon, changeIcon, icons } = useProfileIcon();
  const { theme, themeName, setTheme } = useAppTheme();

  const greetingName =
    profile?.username ?? (isGuest ? 'Guest' : user?.email?.split('@')[0] ?? 'there');

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      router.back();
    }, 125);
  };

  return (
    <View style={[styles.overlayContainer, { backgroundColor: 'transparent' }]}>
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
              <View style={[styles.section, styles.profileHeaderSection]}>
                <AnimatedPressable onPress={() => { hapticLight(); setIsSelectingIcon(true); }} style={styles.profileIconWrapper}>
                  <View style={styles.avatarOuter}>
                    <View style={styles.profileIconContainer}>
                      <Text style={styles.profileIconEmoji}>{icon}</Text>
                    </View>
                    <View style={[styles.editBadge, { borderColor: theme.cardBackground, backgroundColor: theme.accent }]}>
                      <Ionicons name="pencil" size={14} color="#FFFFFF" />
                    </View>
                  </View>
                  <Text style={[styles.changeText, { color: theme.accent }]}>{t('profile.change')}</Text>
                  <Text style={[styles.greetingText, { color: theme.text }]}>{t('profile.greeting', { name: greetingName })}</Text>
                </AnimatedPressable>

                {user ? (
                  !isGuest ? (
                    <AnimatedPressable
                      style={[styles.button, styles.signOutButton, { backgroundColor: theme.buttonBackground }]}
                      onPress={() => { hapticMedium(); signOut(); }}
                    >
                      <Text style={[styles.buttonText, { color: theme.text }]}>{t('profile.signOut')}</Text>
                    </AnimatedPressable>
                  ) : null
                ) : (
                  <Text style={[styles.subtitle, styles.sessionError, { color: theme.subtext }]}>
                    {t('profile.sessionError')}
                  </Text>
                )}
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('profile.settingsSection')}</Text>
                <AnimatedPressable 
                  style={[styles.menuItem, { backgroundColor: theme.buttonBackground }]}
                  onPress={() => { hapticLight(); router.push('/recommendation-settings' as any); }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[styles.menuItemText, { color: theme.text }]}>{t('profile.recommendations')}</Text>
                    <Ionicons name="sparkles-outline" size={18} color={theme.accent} />
                  </View>
                </AnimatedPressable>
                <AnimatedPressable 
                  style={[styles.menuItem, { backgroundColor: theme.buttonBackground }]}
                  onPress={() => { hapticLight(); router.push('/general-settings'); }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[styles.menuItemText, { color: theme.text }]}>{t('profile.generalSettings')}</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.subtext} />
                  </View>
                </AnimatedPressable>
                <AnimatedPressable
                  style={[
                    styles.subscriptionMiniCard,
                    {
                      backgroundColor: `${theme.accent}1A`,
                      borderColor: theme.accent,
                      marginBottom: 10,
                      marginTop: 0,
                    },
                  ]}
                  onPress={() => { hapticLight(); router.push('/subscription'); }}
                >
                  <View style={styles.subInfo}>
                    <Ionicons name="star" size={20} color={theme.accent} />
                    <View style={{ marginLeft: 10 }}>
                      <Text style={[styles.subPlanText, { color: theme.text }]}>{t('profile.freeTier')}</Text>
                      <Text style={[styles.subStatusText, { color: theme.subtext }]}>{t('profile.standardFeatures')}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.upgradeLabel, { color: theme.accent }]}>{t('profile.upgrade')}</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.accent} style={{ marginLeft: 4 }} />
                  </View>
                </AnimatedPressable>
                <View style={[styles.menuItem, { paddingVertical: 12, backgroundColor: theme.buttonBackground }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={[styles.menuItemText, { color: theme.text }]}>{t('profile.themePreferences')}</Text>
                  </View>

                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={styles.themeSelector}
                  >
                    {Object.entries(Themes).map(([id, t2]: [string, any]) => (
                      <Pressable 
                        key={id}
                        onPress={() => { hapticLight(); setTheme(id); }}
                        style={[
                          styles.themeBtn, 
                          themeName === id && styles.themeBtnActive,
                          { borderColor: t2.accent }
                        ]}
                      >
                        <View style={[styles.themePreview, { backgroundColor: t2.gradient[0] }]}>
                          <LinearGradient 
                            colors={t2.gradient} 
                            style={StyleSheet.absoluteFill}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                          />
                        </View>
                        <Text style={[
                          styles.themeText, 
                          { color: theme.subtext },
                          themeName === id && { color: t2.accent, fontWeight: 'bold' }
                        ]}>
                          {t2.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('profile.developer')}</Text>
                <AnimatedPressable 
                  style={[styles.menuItem, { backgroundColor: theme.accent }]} 
                  onPress={() => runCacheTests()}
                >
                  <Text style={[styles.menuItemText, { color: theme.accentOnColor ?? '#FFFFFF' }]}>{t('profile.runAllTests')}</Text>
                </AnimatedPressable>

                <AnimatedPressable 
                  style={[styles.menuItem, { backgroundColor: '#C1E1C1', marginTop: 10 }]} 
                  onPress={async () => {
                    await Promise.all([
                      clearLocalCache(),
                      clearResultCache(),
                      clearLocationCache(),
                      clearImageCache(),
                      Image.clearMemoryCache(),
                      Image.clearDiskCache(),
                      clearRandomPickerState(),
                      resetRecommendationPrefsToOnboarding(),
                    ]);
                    hapticSuccess();
                    Alert.alert(t('profile.cachePurgedTitle'), t('profile.cachePurgedMsg'));
                    router.replace('/welcome-onboarding' as any);
                  }}
                >
                  <Text style={[styles.menuItemText, { color: '#2B422A' }]}>{t('profile.clearAllCaches')}</Text>
                </AnimatedPressable>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      )}

      {isSelectingIcon && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100, justifyContent: 'center', alignItems: 'center' }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} onPress={() => setIsSelectingIcon(false)} />
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} style={[styles.iconSelectionBox, { backgroundColor: theme.cardBackground }]}>

            <Text style={[styles.iconSelectionTitle, { color: theme.text }]}>{t('profile.chooseAvatar')}</Text>
            <View style={styles.iconGrid}>
              {icons.map((item) => (
                <AnimatedPressable 
                  key={item} 
                  style={[styles.iconOption, icon === item && styles.iconOptionSelected]}
                  onPress={async () => {
                    hapticLight();
                    await changeIcon(item);
                    setIsSelectingIcon(false);
                  }}
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
    backgroundColor: 'transparent',
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
  profileHeaderSection: {
    alignItems: 'center',
  },
  profileIconWrapper: {
    alignItems: 'center',
    width: '100%',
  },
  avatarOuter: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  profileIconEmoji: {
    fontSize: 48,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 10,
    textAlign: 'center',
  },
  signOutButton: {
    marginTop: 16,
    alignSelf: 'center',
  },
  sessionError: {
    marginTop: 16,
    textAlign: 'center',
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
  },
  subscriptionMiniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  subInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subPlanText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  subStatusText: {
    fontSize: 12,
    marginTop: 2,
  },
  upgradeLabel: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});
