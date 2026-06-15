import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';

import { useAppTheme } from '@/context/ThemeContext';

type Props = {
  onPress: () => void;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  disabled?: boolean;
  variant?: 'plain' | 'circle';
};

export function BackButton({
  onPress,
  color,
  size = 24,
  style,
  hitSlop = 12,
  disabled = false,
  variant = 'plain',
}: Props) {
  const { theme } = useAppTheme();
  const iconColor = disabled ? theme.subtext + '55' : (color ?? theme.text);

  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={[
        styles.btn,
        variant === 'circle' && {
          backgroundColor: theme.subtext + '22',
          borderWidth: 1,
          borderColor: theme.subtext + '33',
          borderRadius: 20,
        },
        style,
      ]}
    >
      <Ionicons name="chevron-back" size={size} color={iconColor} />
    </AnimatedPressable>
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
