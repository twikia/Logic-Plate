import { Tabs, Link, useRouter, usePathname } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { useProfileIcon } from '@/hooks/useProfileIcon';

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [lastPress, setLastPress] = useState(0);
  const { icon } = useProfileIcon();

  return (
    <Tabs
      initialRouteName="index"
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
          tabBarStyle: { backgroundColor: '#3D2B3D', borderTopWidth: 0, height: 85, paddingBottom: 20 },
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              backgroundColor: focused ? '#F97352' : 'transparent',
              width: 44,
              height: 44,
              borderRadius: 22,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Ionicons size={24} name={focused ? 'search' : 'search-outline'} color={color} />
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
          tabBarStyle: { backgroundColor: '#FDF8F5', borderTopWidth: 0, height: 85, paddingBottom: 20 },
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              backgroundColor: focused ? '#C1E1C1' : 'transparent',
              width: 44,
              height: 44,
              borderRadius: 22,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Ionicons size={24} name={focused ? 'stats-chart' : 'stats-chart-outline'} color={color} />
            </View>
          ),
        }}
      />
      
      {/* Sunset Blush - Home (Floating Button) */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarActiveTintColor: '#FFFFFF',
          tabBarStyle: { backgroundColor: '#3D2B3D', borderTopWidth: 0, height: 85, paddingBottom: 20 },
          tabBarButton: (props) => (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Pressable
                onPress={(e) => {
                  const now = Date.now();
                  const DOUBLE_CLICK_DELAY = 300;
                  const isHomeTab = pathname === '/' || pathname === '/index' || pathname.startsWith('/feeling') || pathname.startsWith('/health') || pathname.startsWith('/random');
                  
                  if (now - lastPress < DOUBLE_CLICK_DELAY) {
                    // Double click: push to root explicitly
                    router.push('/');
                  } else {
                    // Single click: go to home tab preserving state, or do nothing if already on home tab
                    if (!isHomeTab) {
                      router.navigate('/');
                    }
                  }
                  setLastPress(now);
                }}
                style={{
                  top: -25,
                  width: 75,
                  height: 75,
                  borderRadius: 40,
                  backgroundColor: '#F97352', // Sunset Blush accent
                  justifyContent: 'center',
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 5,
                  elevation: 5,
                }}>
                <Ionicons size={36} name="home" color="#FFFFFF" />
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
          tabBarStyle: { backgroundColor: '#3D2B3D', borderTopWidth: 0, height: 85, paddingBottom: 20 },
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              backgroundColor: focused ? '#F97352' : 'transparent',
              width: 44,
              height: 44,
              borderRadius: 22,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Ionicons size={24} name={focused ? 'map' : 'map-outline'} color={color} />
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
          tabBarStyle: { backgroundColor: '#FDF8F5', borderTopWidth: 0, height: 85, paddingBottom: 20 },
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              backgroundColor: focused ? '#FF9F80' : 'transparent',
              width: 44,
              height: 44,
              borderRadius: 22,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Ionicons size={24} name={focused ? 'people' : 'people-outline'} color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
