import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { AnimatedPressable } from './AnimatedPressable';
import { useProfileIcon } from '@/hooks/useProfileIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function TopProfileButton() {
  const { icon } = useProfileIcon();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { top: Math.max(insets.top, 20) }]}>
      <Link href={"/profile" as any} asChild>
        <AnimatedPressable>
          {({ pressed }) => (
            <View style={[styles.button, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={styles.iconText}>{icon}</Text>
            </View>
          )}
        </AnimatedPressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    zIndex: 100,
  },
  button: {
    borderRadius: 27,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: 54,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 30,
  },
});
