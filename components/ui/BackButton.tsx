import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { useAppTheme } from '@/context/ThemeContext';

type Props = {
  onPress: () => void;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
};

export function BackButton({ onPress, color, size = 24, style, hitSlop = 12 }: Props) {
  const { theme } = useAppTheme();

  return (
    <Pressable onPress={onPress} hitSlop={hitSlop} style={[styles.btn, style]}>
      <Ionicons name="chevron-back" size={size} color={color ?? theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
});
