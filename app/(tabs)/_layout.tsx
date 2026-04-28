import { Tabs, Link } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TabLayout() {
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
                    backgroundColor: 'rgba(0,0,0,0.3)', // Dark circle behind hamburger to ensure visibility
                    padding: 8,
                    borderRadius: 20,
                    opacity: pressed ? 0.7 : 1
                  }}>
                    <IconSymbol
                      name="line.3.horizontal"
                      size={20}
                      color="#FFFFFF"
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
                onPress={props.onPress}
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
