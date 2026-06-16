import { Pressable } from '@/components/ui/soundPressable';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/context/ThemeContext';
import { NeonAmbientGlow } from '@/components/ui/NeonAmbientGlow';
import Animated, { FadeInUp, FadeInRight } from 'react-native-reanimated';

type BillingCycle = 'monthly' | 'yearly';

type TierKey = 'free' | 'minimal' | 'pro' | 'ultimate';

interface TierConfig {
  price: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  isPopular?: boolean;
  featureKeys: string[];
}

const TIER_CONFIG: Record<TierKey, TierConfig> = {
  free: {
    price: '$0',
    color: '#B59EAA',
    icon: 'leaf-outline',
    featureKeys: ['basicSearch', 'aiOverviews5', 'standardMap'],
  },
  minimal: {
    price: '$4.99',
    color: '#8AAAE5',
    icon: 'sparkles-outline',
    featureKeys: ['advancedSearch', 'aiOverviews25', 'themeCustomization', 'noAds'],
  },
  pro: {
    price: '$9.99',
    color: '#F97352',
    icon: 'flash-outline',
    isPopular: true,
    featureKeys: ['unlimitedSearch', 'unlimitedAi', 'customIcons', 'earlyAccess', 'prioritySupport'],
  },
  ultimate: {
    price: '$19.99',
    color: '#FFD700',
    icon: 'diamond-outline',
    featureKeys: ['everythingPro', 'personalizedAi', 'multiDevice', 'exclusiveThemes', 'privateBeta'],
  },
};

const TIER_ORDER: TierKey[] = ['free', 'minimal', 'pro', 'ultimate'];

export default function SubscriptionScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  const handleCycleChange = (cycle: BillingCycle) => {
    setBillingCycle(cycle);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <LinearGradient colors={[theme.gradient[0], '#1A1A1A']} style={styles.container}>
      <NeonAmbientGlow />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.title}>{t('subscription.title')}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.heroSection}>
            <Text style={[styles.heroTitle, { color: '#FFFFFF' }]}>{t('subscription.heroTitle')}</Text>
            <Text style={[styles.heroSubtitle, { color: 'rgba(255,255,255,0.7)' }]}>{t('subscription.heroSubtitle')}</Text>
          </Animated.View>

          {/* Billing Toggle */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.billingToggleContainer}>
            <View style={[styles.billingToggle, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
              <Pressable 
                onPress={() => handleCycleChange('monthly')}
                style={[styles.cycleBtn, billingCycle === 'monthly' && { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.cycleText, billingCycle === 'monthly' && styles.cycleTextActive]}>{t('subscription.monthly')}</Text>
              </Pressable>
              <Pressable 
                onPress={() => handleCycleChange('yearly')}
                style={[styles.cycleBtn, billingCycle === 'yearly' && { backgroundColor: theme.accent }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.cycleText, billingCycle === 'yearly' && styles.cycleTextActive]}>{t('subscription.yearly')}</Text>
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountText}>{t('subscription.discount')}</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          </Animated.View>

          {/* Subscription Cards */}
          <View style={styles.tiersContainer}>
            {TIER_ORDER.map((key, index) => {
              const tier = TIER_CONFIG[key];
              return (
              <Animated.View 
                key={key} 
                entering={FadeInRight.delay(300 + index * 100).duration(500)}
                style={[
                  styles.tierCard, 
                  { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.05)' },
                  tier.isPopular && { borderColor: tier.color, borderWidth: 1 }
                ]}
              >
                {tier.isPopular && (
                  <View style={[styles.popularBadge, { backgroundColor: tier.color }]}>
                    <Text style={styles.popularText}>{t('subscription.mostPopular')}</Text>
                  </View>
                )}
                <View style={styles.tierHeader}>
                  <View style={[styles.iconBox, { backgroundColor: `${tier.color}20` }]}>
                    <Ionicons name={tier.icon} size={24} color={tier.color} />
                  </View>
                  <View>
                    <Text style={[styles.tierName, { color: '#FFFFFF' }]}>{t(`subscription.tiers.${key}`)}</Text>
                    <View style={styles.priceRow}>
                      <Text style={[styles.tierPrice, { color: '#FFFFFF' }]}>
                        {billingCycle === 'yearly' 
                          ? `$${(parseFloat(tier.price.replace('$', '')) * 0.8).toFixed(2)}` 
                          : tier.price}
                      </Text>
                      <Text style={[styles.tierPeriod, { color: 'rgba(255,255,255,0.6)' }]}>
                        {billingCycle === 'yearly' ? t('subscription.perYear') : t('subscription.perMonth')}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.featuresList}>
                  {tier.featureKeys.map((featureKey) => (
                    <View key={featureKey} style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={18} color={tier.color} />
                      <Text style={[styles.featureText, { color: 'rgba(255,255,255,0.8)' }]}>{t(`subscription.features.${featureKey}`)}</Text>
                    </View>
                  ))}
                </View>

                <AnimatedPressable 
                  style={[
                    styles.subscribeBtn, 
                    { backgroundColor: tier.isPopular ? tier.color : 'rgba(255,255,255,0.1)' }
                  ]}
                  onPress={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)}
                >
                    <Text style={[
                      styles.subscribeBtnText, 
                      { color: tier.isPopular ? '#FFFFFF' : '#FFFFFF' }
                    ]}>
                      {key === 'free' ? t('subscription.currentPlan') : t('subscription.selectPlan')}
                    </Text>
                </AnimatedPressable>
              </Animated.View>
            );
            })}
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: 'rgba(255,255,255,0.5)' }]}>
              {t('subscription.footer')}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  billingToggleContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  billingToggle: {
    flexDirection: 'row',
    borderRadius: 15,
    padding: 4,
    width: 240,
  },
  cycleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cycleText: {
    color: '#B59EAA',
    fontSize: 14,
    fontWeight: '600',
  },
  cycleTextActive: {
    color: '#FFFFFF',
  },
  discountBadge: {
    backgroundColor: '#4CD964',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  discountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tiersContainer: {
    gap: 20,
  },
  tierCard: {
    borderRadius: 25,
    padding: 24,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderBottomLeftRadius: 15,
  },
  popularText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 20,
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierName: {
    fontSize: 18,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tierPrice: {
    fontSize: 24,
    fontWeight: '800',
  },
  tierPeriod: {
    fontSize: 14,
    marginLeft: 2,
  },
  featuresList: {
    gap: 12,
    marginBottom: 25,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
  },
  subscribeBtn: {
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
  },
  subscribeBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    marginTop: 40,
    marginBottom: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.7,
  }
});
