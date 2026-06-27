import React from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';
import { useLiveTranslation } from '@/core/liveTranslation';

type Props = TextProps & {
  text: string | undefined | null;
  style?: StyleProp<TextStyle>;
};

export function TranslatedText({ text, style, ...rest }: Props) {
  const translated = useLiveTranslation(text);
  return (
    <Text style={style} {...rest}>
      {translated}
    </Text>
  );
}
