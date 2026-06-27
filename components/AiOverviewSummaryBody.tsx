import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { useLiveTranslation } from '@/core/liveTranslation';

const PROS_COLOR = '#4CD964';
const CONS_COLOR = '#FF6B6B';

export function splitAiOverviewSummarySegments(raw: string): string[] {
  const s = raw?.trim() || '';
  if (!s) return [];
  const parts = s.split(/(?=\b(?:Pros|Cons)\b)/i);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function TranslatedLineColored({ line, baseStyle }: { line: string; baseStyle: StyleProp<TextStyle> }) {
  const translated = useLiveTranslation(line);
  const m = translated.match(/^([^\s:]+:?)([\s\S]*)$/);
  if (!m) {
    return <Text style={baseStyle}>{translated}</Text>;
  }
  const isPros = /^(pros?|ventajas|avantages)/i.test(m[1]);
  const isCons = /^(cons?|contras|desventajas|inconvénients)/i.test(m[1]);
  
  if (!isPros && !isCons) {
    return <Text style={baseStyle}>{translated}</Text>;
  }

  const labelColor = isPros ? PROS_COLOR : CONS_COLOR;
  return (
    <Text style={baseStyle}>
      <Text style={{ color: labelColor, fontWeight: '700' }}>{m[1]}</Text>
      <Text style={baseStyle}>{m[2]}</Text>
    </Text>
  );
}

export function AiOverviewSummaryBody({
  text,
  style,
}: {
  text: string;
  style: StyleProp<TextStyle>;
}) {
  const lines = splitAiOverviewSummarySegments(text || '');
  if (lines.length === 0) {
    const translatedFull = useLiveTranslation(text || '');
    return <Text style={style}>{translatedFull}</Text>;
  }
  return (
    <Text style={style}>
      {lines.map((line, i) => (
        <Text key={i} style={style}>
          {i > 0 ? '\n' : ''}
          <TranslatedLineColored line={line} baseStyle={style} />
        </Text>
      ))}
    </Text>
  );
}
