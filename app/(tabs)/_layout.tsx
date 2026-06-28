import { HapticTab } from '@/components/haptic-tab';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState, useEffect } from 'react';
import { View } from 'react-native';
import { Pressable } from '@/components/ui/soundPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  withRepeat,
  interpolateColor,
} from 'react-native-reanimated';

import { endHostSession } from '@/core/groupSessionState';
import { requestHomeTitleReroll } from '@/core/homeTitle';
import { requestRandomPickerReset } from '@/core/randomPickerState';
import { useAppTheme } from '@/context/ThemeContext';
import { LocationGate } from '@/components/LocationGate';

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);


interface AnimatedTabIconProps {
  onPress?: () => void;
  isActive: boolean;
  iconOn: React.ComponentProps<typeof Ionicons>['name'];
  iconOff: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  dimColor: string;
  highlightBg: string;
  neonSide?: boolean;
}

function AnimatedTabIcon({
  onPress,
  isActive,
  iconOn,
  iconOff,
  iconColor,
  dimColor,
  highlightBg,
  neonSide,
}: AnimatedTabIconProps) {
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
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor:
            neonSide && isActive
              ? 'rgba(0,255,255,0.12)'
              : neonSide
                ? 'transparent'
                : isActive
                  ? highlightBg
                  : 'transparent',
          borderWidth: neonSide && isActive ? 1 : 0,
          borderColor: neonSide && isActive ? 'rgba(0,255,255,0.55)' : 'transparent',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
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
      backgroundColor: theme.neonColors
        ? '#000000'
        : (theme.tabBarBackground ?? theme.cardBackground),
      borderTopWidth: 0,
      height: 52 + insets.bottom,
      paddingBottom: insets.bottom,
      paddingTop: 4,
    }),
    [theme.cardBackground, theme.neonColors, theme.tabBarBackground, insets.bottom]
  );

  const isMap = pathname.startsWith('/map');
  const isGroups = pathname.startsWith('/groups');
  const isOnRandomPicker = /\/random$/.test(pathname);
  const neon = Boolean(theme.neonColors);
  const neonColors = theme.neonColors;

  // Rotation animation for the home bubble neon outline (counter-clockwise)
  const homeRotate = useSharedValue(0);
  useEffect(() => {
    if (neon) {
      homeRotate.value = withRepeat(
        withTiming(-360, { duration: 8000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      homeRotate.value = 0;
    }
  }, [neon, homeRotate]);

  const homeSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${homeRotate.value}deg` }],
  }));

  // Color pulse animation for the non-neon home bubble background
  const colorPulse = useSharedValue(0);
  useEffect(() => {
    if (!neon) {
      colorPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      colorPulse.value = 0;
    }
  }, [neon, colorPulse]);

  const animatedHomeBgStyle = useAnimatedStyle(() => {
    const startColor = theme.tabHomeBackground ?? theme.accent;
    const endColor = theme.accent;
    const backgroundColor = interpolateColor(
      colorPulse.value,
      [0, 1],
      [startColor, endColor]
    );
    return { backgroundColor };
  });

  const animatedHomeIconStyle = useAnimatedStyle(() => {
    const startIconColor = theme.text;
    const endIconColor = theme.accentOnColor ?? '#FFFFFF';
    const color = interpolateColor(
      colorPulse.value,
      [0, 1],
      [startIconColor, endIconColor]
    );
    return { color };
  });

  return (
    <LocationGate>
      <Tabs
        initialRouteName="(home)"
        backBehavior="history"
        screenOptions={{
          sceneStyle: { backgroundColor: '#000000' },
          headerShown: false,
          tabBarShowLabel: false,
          tabBarButton: HapticTab,
          tabBarStyle,
        }}>

      <Tabs.Screen
        name="groups"
        options={{
          tabBarButton: (props) => (
            <AnimatedTabIcon
              onPress={() => {
                if (isGroups) {
                  void (async () => {
                    await endHostSession();
                    router.replace('/groups');
                  })();
                } else {
                  (props.onPress as (() => void) | undefined)?.();
                }
              }}
              isActive={isGroups}
              iconOn="people"
              iconOff="people-outline"
              iconColor={neon ? '#FFFFFF' : theme.text}
              dimColor={neon ? 'rgba(255,255,255,0.42)' : theme.subtext}
              highlightBg={theme.accent}
              neonSide={neon}
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
                  const isDoubleTap = now - lastPress < 300;
                  const safeDismissOrReplace = (fallback?: () => void) => {
                    if (typeof router.canDismiss === 'function' && router.canDismiss()) {
                      try {
                        router.dismissAll();
                        return;
                      } catch {
                        // ignore error
                      }
                    }
                    if (fallback) {
                      fallback();
                    } else {
                      router.replace('/(tabs)/(home)');
                    }
                  };

                  if (isDoubleTap) {
                    requestHomeTitleReroll();
                    requestRandomPickerReset();
                    if (isMap || isGroups) {
                      router.replace('/(tabs)/(home)');
                    } else {
                      safeDismissOrReplace();
                    }
                  } else if (isOnRandomPicker && !isMap && !isGroups) {
                    requestRandomPickerReset();
                    safeDismissOrReplace();
                  } else if (isMap || isGroups) {
                    // Resume active screen in (home) stack (e.g. filter screen) instead of wiping stack
                    (props.onPress as (() => void) | undefined)?.();
                  } else {
                    safeDismissOrReplace(() => {
                      (props.onPress as (() => void) | undefined)?.();
                    });
                  }
                  setLastPress(now);
                }}
                style={{
                  top: -12,
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: neon ? '#00FFFF' : '#000',
                  shadowOffset: { width: 0, height: neon ? 0 : 2 },
                  shadowOpacity: neon ? 0.88 : 0.22,
                  shadowRadius: neon ? 14 : 4,
                  elevation: neon ? 12 : 4,
                }}
              >
                {neon && neonColors ? (
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      overflow: 'hidden',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Animated.View
                      style={[
                        {
                          position: 'absolute',
                          width: 80,
                          height: 80,
                          left: -12,
                          top: -12,
                        },
                        homeSpinStyle,
                      ]}
                    >
                      <LinearGradient
                        colors={neonColors}
                        style={{ flex: 1 }}
                        start={{ x: 0, y: 1 }}
                        end={{ x: 1, y: 0 }}
                      />
                    </Animated.View>
                    <View
                      style={{
                        position: 'absolute',
                        top: 2.5,
                        left: 2.5,
                        right: 2.5,
                        bottom: 2.5,
                        borderRadius: 25.5,
                        backgroundColor: '#000000',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons size={28} name="home" color="#FFFFFF" />
                    </View>
                  </View>
                ) : (
                  <Animated.View
                    style={[
                      {
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        justifyContent: 'center',
                        alignItems: 'center',
                      },
                      animatedHomeBgStyle,
                    ]}
                  >
                    <AnimatedIonicons size={28} name="home" style={animatedHomeIconStyle} />
                  </Animated.View>
                )}
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
              iconColor={neon ? '#FFFFFF' : theme.text}
              dimColor={neon ? 'rgba(255,255,255,0.42)' : theme.subtext}
              highlightBg={theme.accent}
              neonSide={neon}
            />
          ),
        }}
      />

    </Tabs>
    </LocationGate>
  );
}
