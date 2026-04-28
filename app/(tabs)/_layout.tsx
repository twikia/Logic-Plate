import { Tabs, Link, useRouter, usePathname } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View, Image } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [lastPress, setLastPress] = useState(0);

  return (
    <Tabs
      screenOptions={{
        headerTransparent: true, // Let gradients show through
        headerTitle: '', // Titles are handled on the screens themselves
        tabBarShowLabel: false, // Cleaner look without text labels
        tabBarButton: HapticTab,
        // Global headerRight (only the profile hamburger now)
        headerRight: () => (
          <View style={{ marginRight: 20 }}>
            <Link href={"/profile" as any} asChild>
              <Pressable>
                {({ pressed }) => (
                  <View style={{
                    opacity: pressed ? 0.7 : 1,
                    borderRadius: 20,
                    overflow: 'hidden',
                    borderWidth: 2,
                    borderColor: 'rgba(255,255,255,0.5)',
                    backgroundColor: 'rgba(0,0,0,0.3)',
                  }}>
                    <Image 
                      source={{ uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop' }} 
                      style={{ width: 36, height: 36 }} 
                    />
                  </View>
                )}
              </Pressable>
            </Link>
          </View>
        ),
      }}>
      
      {/* Sunset Blush - Research */}
      <Tabs.Screen
        name="research"
        options={{
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#B59EAA',
          tabBarStyle: { backgroundColor: '#3D2B3D', borderTopWidth: 0 },
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              backgroundColor: focused ? '#F97352' : 'transparent',
              padding: 10,
              borderRadius: 15,
            }}>
              <IconSymbol size={24} name="magnifyingglass" color={color} />
            </View>
          ),
        }}
      />
      
      {/* Melon Fresh - Tracking */}
      <Tabs.Screen
        name="tracking"
        options={{
          tabBarActiveTintColor: '#2B422A',
          tabBarInactiveTintColor: '#8E837D',
          tabBarStyle: { backgroundColor: '#FDF8F5', borderTopWidth: 0 },
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              backgroundColor: focused ? '#C1E1C1' : 'transparent',
              padding: 10,
              borderRadius: 15,
            }}>
              <IconSymbol size={24} name="chart.bar.fill" color={color} />
            </View>
          ),
        }}
      />
      
      {/* Sunset Blush - Home (Floating Button) */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarActiveTintColor: '#FFFFFF',
          tabBarStyle: { backgroundColor: '#3D2B3D', borderTopWidth: 0 },
          tabBarButton: (props) => (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Pressable
                onPress={(e) => {
                  const now = Date.now();
                  const DOUBLE_CLICK_DELAY = 300;
                  const isHomeTab = pathname === '/' || pathname === '/index' || pathname.startsWith('/feeling') || pathname.startsWith('/health') || pathname.startsWith('/random');
                  
                  if (now - lastPress < DOUBLE_CLICK_DELAY) {
                    // Double click: push to root explicitly
                    router.push('/(tabs)/index');
                  } else {
                    // Single click: go to home tab preserving state, or do nothing if already on home tab
                    if (!isHomeTab) {
                      router.navigate('/(tabs)/index');
                    }
                  }
                  setLastPress(now);
                }}
                style={{
                  top: -20,
                  width: 65,
                  height: 65,
                  borderRadius: 35,
                  backgroundColor: '#F97352', // Sunset Blush accent
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 5,
                  elevation: 5,
                }}>
                <IconSymbol size={32} name="house.fill" color="#FFFFFF" />
              </Pressable>
            </View>
          ),
        }}
      />
      
      {/* Sunset Blush - Map */}
      <Tabs.Screen
        name="map"
        options={{
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#B59EAA',
          tabBarStyle: { backgroundColor: '#3D2B3D', borderTopWidth: 0 },
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              backgroundColor: focused ? '#F97352' : 'transparent',
              padding: 10,
              borderRadius: 15,
            }}>
              <IconSymbol size={24} name="map.fill" color={color} />
            </View>
          ),
        }}
      />
      
      {/* Melon Fresh - Social */}
      <Tabs.Screen
        name="social"
        options={{
          tabBarActiveTintColor: '#2B422A',
          tabBarInactiveTintColor: '#8E837D',
          tabBarStyle: { backgroundColor: '#FDF8F5', borderTopWidth: 0 },
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              backgroundColor: focused ? '#FF9F80' : 'transparent',
              padding: 10,
              borderRadius: 15,
            }}>
              <IconSymbol size={24} name="person.3.fill" color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
