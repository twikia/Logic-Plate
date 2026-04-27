import { Tabs, Link } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const themeTint = Colors[colorScheme ?? 'light'].tint;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#F97352', // Sunset Blush accent
        tabBarStyle: {
          backgroundColor: '#3D2B3D', // Sunset Blush surface
          borderTopWidth: 0,
        },
        headerStyle: {
          backgroundColor: '#3D2B3D',
        },
        headerTintColor: '#FFFFFF',
        tabBarButton: HapticTab,
        // Global headerRight for ALL 5 tabs
        headerRight: () => (
          <View style={{ flexDirection: 'row', marginRight: 15, gap: 20 }}>
            <Link href={"/profile" as any} asChild>
              <Pressable>
                {({ pressed }) => (
                  <IconSymbol
                    name="person.crop.circle"
                    size={25}
                    color="#FFFFFF"
                    style={{ opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
            <Link href={"/settings" as any} asChild>
              <Pressable>
                {({ pressed }) => (
                  <IconSymbol
                    name="line.3.horizontal"
                    size={25}
                    color="#FFFFFF"
                    style={{ opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          </View>
        ),
      }}>
      <Tabs.Screen
        name="research"
        options={{
          title: 'Research',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="magnifyingglass" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: 'Tracking',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={34} name="house.fill" color={color} />,
          // Making the center icon larger and distinctive
          tabBarLabelStyle: { fontWeight: 'bold' }
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.3.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
