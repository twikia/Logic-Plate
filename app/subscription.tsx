import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/context/ThemeContext';
import Animated, { FadeInUp, FadeInRight } from 'react-native-reanimated';

type BillingCycle = 'monthly' | 'yearly';

interface TierProps {
  name: string;
  price: string;
  features: string[];
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  isPopular?: boolean;
}

const Tiers: Record<string, TierProps> = {
  free: {
    name: 'Free',
    price: '$0',
    features: ['Basic Search', '5 AI Overviews/day', 'Standard Map View'],
    color: '#B59EAA',
    icon: 'leaf-outline',
  },
  minimal: {
    name: 'Minimal',
    price: '$4.99',
    features: ['Advanced Search', '25 AI Overviews/day', 'Theme Customization', 'No Ads'],
    color: '#8AAAE5',
    icon: 'sparkles-outline',
  },
  pro: {
    name: 'Pro',
    price: '$9.99',
    features: ['Unlimited Search', 'Unlimited AI Overviews', 'Custom Icons', 'Early Access Features', 'Priority Support'],
    color: '#F97352',
    icon: 'flash-outline',
    isPopular: true,
  },
  ultimate: {
    name: 'Ultimate',
    price: '$19.99',
    features: ['Everything in Pro', 'Personalized Dining AI', 'Multi-device Sync', 'Exclusive Themes', 'Private Beta Access'],
    color: '#FFD700',
    icon: 'diamond-outline',
  },
};

export default function SubscriptionScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  const handleCycleChange = (cycle: BillingCycle) => {
    setBillingCycle(cycle);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <LinearGradient colors={[theme.gradient[0], '#1A1A1A']} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.title}>Subscription</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.heroSection}>
            <Text style={[styles.heroTitle, { color: '#FFFFFF' }]}>Level Up Your Experience</Text>
            <Text style={[styles.heroSubtitle, { color: 'rgba(255,255,255,0.7)' }]}>Choose the plan that fits your appetite for discovery.</Text>
          </Animated.View>

          {/* Billing Toggle */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.billingToggleContainer}>
            <View style={[styles.billingToggle, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
              <Pressable 
                onPress={() => handleCycleChange('monthly')}
                style={[styles.cycleBtn, billingCycle === 'monthly' && { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.cycleText, billingCycle === 'monthly' && styles.cycleTextActive]}>Monthly</Text>
              </Pressable>
              <Pressable 
                onPress={() => handleCycleChange('yearly')}
                style={[styles.cycleBtn, billingCycle === 'yearly' && { backgroundColor: theme.accent }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.cycleText, billingCycle === 'yearly' && styles.cycleTextActive]}>Yearly</Text>
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountText}>-20%</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          </Animated.View>

          {/* Subscription Cards */}
          <View style={styles.tiersContainer}>
            {Object.entries(Tiers).map(([key, tier], index) => (
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
                    <Text style={styles.popularText}>MOST POPULAR</Text>
                  </View>
                )}
                <View style={styles.tierHeader}>
                  <View style={[styles.iconBox, { backgroundColor: `${tier.color}20` }]}>
                    <Ionicons name={tier.icon} size={24} color={tier.color} />
                  </View>
                  <View>
                    <Text style={[styles.tierName, { color: '#FFFFFF' }]}>{tier.name}</Text>
                    <View style={styles.priceRow}>
                      <Text style={[styles.tierPrice, { color: '#FFFFFF' }]}>
                        {billingCycle === 'yearly' 
                          ? `$${(parseFloat(tier.price.replace('$', '')) * 0.8).toFixed(2)}` 
                          : tier.price}
                      </Text>
                      <Text style={[styles.tierPeriod, { color: 'rgba(255,255,255,0.6)' }]}>
                        /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.featuresList}>
                  {tier.features.map((feature, fIndex) => (
                    <View key={fIndex} style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={18} color={tier.color} />
                      <Text style={[styles.featureText, { color: 'rgba(255,255,255,0.8)' }]}>{feature}</Text>
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
                      {key === 'free' ? 'Current Plan' : 'Select Plan'}
                    </Text>
                </AnimatedPressable>
              </Animated.View>
            ))}
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: 'rgba(255,255,255,0.5)' }]}>
              Secure payment via App Store. Cancel anytime in settings.
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
