import { HapticTab } from '@/components/haptic-tab';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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

import { endHostSession } from '@/core/groupSessionState';
import { requestHomeTitleReroll } from '@/core/homeTitle';
import { requestRandomPickerReset } from '@/core/randomPickerState';
import { useAppTheme } from '@/context/ThemeContext';


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
      backgroundColor: theme.neonColors ? '#000000' : theme.cardBackground,
      borderTopWidth: 0,
      height: 52 + insets.bottom,
      paddingBottom: insets.bottom,
      paddingTop: 4,
    }),
    [theme.cardBackground, theme.neonColors, insets.bottom]
  );

  const isMap = pathname.startsWith('/map');
  const isGroups = pathname.startsWith('/groups');
  const isOnRandomPicker = /\/random$/.test(pathname);
  const neon = Boolean(theme.neonColors);
  const neonColors = theme.neonColors;

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
                  if (isDoubleTap) {
                    requestHomeTitleReroll();
                    requestRandomPickerReset();
                    router.navigate('/(tabs)/(home)');
                  } else if (isOnRandomPicker && !isMap && !isGroups) {
                    requestRandomPickerReset();
                    router.navigate('/(tabs)/(home)');
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
                  <LinearGradient
                    colors={neonColors}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      padding: 2.5,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 25.5,
                        backgroundColor: '#000000',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons size={28} name="home" color="#FFFFFF" />
                    </View>
                  </LinearGradient>
                ) : (
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: theme.accent,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons size={28} name="home" color={theme.text} />
                  </View>
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
  );
}
