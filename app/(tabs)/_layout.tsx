import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { HapticTab } from '@/components/haptic-tab';
import { useAppTheme } from '@/context/ThemeContext';


interface AnimatedTabIconProps {
  onPress?: () => void;
  isActive: boolean;
  iconOn: React.ComponentProps<typeof Ionicons>['name'];
  iconOff: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  dimColor: string;
  highlightBg: string;
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
          withTiming(1.0, { duration: 65, easing: Easing.inOut(Easing.quad) })
        );
      }}
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
    >
      <View style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: isActive ? highlightBg : 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
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

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [lastPress, setLastPress] = useState(0);
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();

  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: theme.cardBackground,
      borderTopWidth: 0,
      height: 52 + insets.bottom,
      paddingBottom: insets.bottom,
      paddingTop: 4,
    }),
    [theme.cardBackground, insets.bottom]
  );

  const isMap = pathname.startsWith('/map');
  const isSocial = pathname.startsWith('/social');

  return (
    <Tabs
      initialRouteName="(home)"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarButton: HapticTab,
        tabBarStyle,
      }}>

      <Tabs.Screen
        name="social"
        options={{
          tabBarButton: (props) => (
            <AnimatedTabIcon
              onPress={props.onPress as () => void}
              isActive={isSocial}
              iconOn="people"
              iconOff="people-outline"
              iconColor={theme.text}
              dimColor={theme.subtext}
              highlightBg={theme.accent}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="(home)"
        options={{
          tabBarButton: (props) => (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <AnimatedPressable
                onPress={() => {
                  const now = Date.now();
                  if (now - lastPress < 300) {
                    router.navigate('/(tabs)/(home)/');
                  } else {
                    (props.onPress as (() => void) | undefined)?.();
                  }
                  setLastPress(now);
                }}
                style={{
                  top: -12,
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: theme.accent,
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.22,
                  shadowRadius: 4,
                  elevation: 4,
                }}>
                <Ionicons size={28} name="home" color={theme.text} />
              </AnimatedPressable>
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="map"
        options={{
          tabBarButton: (props) => (
            <AnimatedTabIcon
              onPress={props.onPress as () => void}
              isActive={isMap}
              iconOn="map"
              iconOff="map-outline"
              iconColor={theme.text}
              dimColor={theme.subtext}
              highlightBg={theme.accent}
            />
          ),
        }}
      />

    </Tabs>
  );
}
