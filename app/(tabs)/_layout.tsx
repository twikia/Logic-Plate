import { Tabs, Link, useRouter, usePathname } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { HapticTab } from '@/components/haptic-tab';
import { useProfileIcon } from '@/hooks/useProfileIcon';

// ─── Animated Tab Icon ──────────────────────────────────────────────────────
// Self-contained: owns its own animation AND its own highlight based on isActive.
// Never touches accessibilityState — that was the source of the broken highlights.
interface AnimatedTabIconProps {
  onPress?: () => void;
  isActive: boolean;
  iconOn: React.ComponentProps<typeof Ionicons>['name'];
  iconOff: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;          // active icon colour
  dimColor: string;           // inactive icon colour
  highlightBg: string;        // active circle bg colour
}

function AnimatedTabIcon({ onPress, isActive, iconOn, iconOff, iconColor, dimColor, highlightBg }: AnimatedTabIconProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.82, { duration: 55, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        scale.value = withSequence(
          withTiming(1.05, { duration: 50, easing: Easing.out(Easing.quad) }),
          withTiming(1.0,  { duration: 65, easing: Easing.inOut(Easing.quad) })
        );
      }}
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
    >
      {/* Static highlight circle — size defines the layout, colour owned here */}
      <View style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: isActive ? highlightBg : 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        {/* Only the icon bounces */}
        <Animated.View style={animStyle}>
          <Ionicons
            size={24}
            name={isActive ? iconOn : iconOff}
            color={isActive ? iconColor : dimColor}
          />
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ─── Tab Layout ──────────────────────────────────────────────────────────────
export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [lastPress, setLastPress] = useState(0);
  const { icon } = useProfileIcon();

  // Derive active tab from pathname — guaranteed accurate
  const isResearch  = pathname.startsWith('/research');
  const isTracking  = pathname.startsWith('/tracking');
  const isMap       = pathname.startsWith('/map');
  const isSocial    = pathname.startsWith('/social');
  // everything else (/, /feeling, /health, /random) belongs to home

  return (
    <Tabs
      initialRouteName="(home)"
      screenOptions={{
        headerTransparent: true,
        headerTitle: '',
        tabBarShowLabel: false,
        tabBarButton: HapticTab,
        headerRight: () => (
          <View style={{ marginRight: 20 }}>
            <Link href={"/profile" as any} asChild>
              <AnimatedPressable>
                {({ pressed }) => (
                  <View style={{
                    opacity: pressed ? 0.7 : 1,
                    borderRadius: 27,
                    overflow: 'hidden',
                    borderWidth: 2,
                    borderColor: 'rgba(255,255,255,0.5)',
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    width: 54,
                    height: 54,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: 30 }}>{icon}</Text>
                  </View>
                )}
              </AnimatedPressable>
            </Link>
          </View>
        ),
      }}>

      {/* Research */}
      <Tabs.Screen
        name="research"
        options={{
          tabBarStyle: { backgroundColor: '#3D2B3D', borderTopWidth: 0, height: 85, paddingBottom: 20 },
          tabBarButton: (props) => (
            <AnimatedTabIcon
              onPress={props.onPress as () => void}
              isActive={isResearch}
              iconOn="search"
              iconOff="search-outline"
              iconColor="#FFFFFF"
              dimColor="#B59EAA"
              highlightBg="#F97352"
            />
          ),
        }}
      />

      {/* Tracking */}
      <Tabs.Screen
        name="tracking"
        options={{
          tabBarStyle: { backgroundColor: '#FDF8F5', borderTopWidth: 0, height: 85, paddingBottom: 20 },
          tabBarButton: (props) => (
            <AnimatedTabIcon
              onPress={props.onPress as () => void}
              isActive={isTracking}
              iconOn="stats-chart"
              iconOff="stats-chart-outline"
              iconColor="#2B422A"
              dimColor="#8E837D"
              highlightBg="#C1E1C1"
            />
          ),
        }}
      />

      {/* Home (Floating Button) */}
      <Tabs.Screen
        name="(home)"
        options={{
          tabBarStyle: { backgroundColor: '#3D2B3D', borderTopWidth: 0, height: 85, paddingBottom: 20 },
          tabBarButton: () => (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <AnimatedPressable
                onPress={() => {
                  const now = Date.now();
                  const isHomeTab = pathname === '/' || pathname.startsWith('/feeling') || pathname.startsWith('/health') || pathname.startsWith('/random');
                  if (now - lastPress < 300) {
                    router.push('/');
                  } else {
                    if (!isHomeTab) router.navigate('/');
                  }
                  setLastPress(now);
                }}
                style={{
                  top: -25,
                  width: 75,
                  height: 75,
                  borderRadius: 40,
                  backgroundColor: '#F97352',
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 5,
                  elevation: 5,
                }}>
                <Ionicons size={36} name="home" color="#FFFFFF" />
              </AnimatedPressable>
            </View>
          ),
        }}
      />

      {/* Map */}
      <Tabs.Screen
        name="map"
        options={{
          tabBarStyle: { backgroundColor: '#3D2B3D', borderTopWidth: 0, height: 85, paddingBottom: 20 },
          tabBarButton: (props) => (
            <AnimatedTabIcon
              onPress={props.onPress as () => void}
              isActive={isMap}
              iconOn="map"
              iconOff="map-outline"
              iconColor="#FFFFFF"
              dimColor="#B59EAA"
              highlightBg="#F97352"
            />
          ),
        }}
      />

      {/* Social */}
      <Tabs.Screen
        name="social"
        options={{
          tabBarStyle: { backgroundColor: '#FDF8F5', borderTopWidth: 0, height: 85, paddingBottom: 20 },
          tabBarButton: (props) => (
            <AnimatedTabIcon
              onPress={props.onPress as () => void}
              isActive={isSocial}
              iconOn="people"
              iconOff="people-outline"
              iconColor="#2B422A"
              dimColor="#8E837D"
              highlightBg="#FF9F80"
            />
          ),
        }}
      />
    </Tabs>
  );
}
