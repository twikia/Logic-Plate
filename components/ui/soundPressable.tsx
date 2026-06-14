import React from 'react';
import {
  Pressable as RNPressable,
  TouchableOpacity as RNTouchableOpacity,
  View,
  type PressableProps,
  type TouchableOpacityProps,
} from 'react-native';
import { playTap } from '@/core/audioService';

type SoundPressProps = {
  silent?: boolean;
};

function wrapPressHandler<T extends (...args: never[]) => void>(
  onPress: T | null | undefined,
  silent?: boolean
): T | undefined {
  if (!onPress) return undefined;
  return ((...args: Parameters<T>) => {
    if (!silent) playTap();
    onPress(...args);
  }) as T;
}

export const Pressable = React.forwardRef<View, PressableProps & SoundPressProps>(
  ({ onPress, silent, ...props }, ref) => (
    <RNPressable {...props} ref={ref} onPress={wrapPressHandler(onPress, silent)} />
  )
);
Pressable.displayName = 'SoundPressable';

export const TouchableOpacity = React.forwardRef<View, TouchableOpacityProps & SoundPressProps>(
  ({ onPress, silent, ...props }, ref) => (
    <RNTouchableOpacity {...props} ref={ref} onPress={wrapPressHandler(onPress, silent)} />
  )
);
TouchableOpacity.displayName = 'SoundTouchableOpacity';
