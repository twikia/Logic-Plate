import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

const PROS_COLOR = '#4CD964';
const CONS_COLOR = '#FF6B6B';

export function splitAiOverviewSummarySegments(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  const parts = s.split(/(?=\b(?:Pros|Cons)\b)/i);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function LineColored({ line, baseStyle }: { line: string; baseStyle: StyleProp<TextStyle> }) {
  const m = line.match(/^(Pros|Cons)(\b[\s\S]*)$/i);
  if (!m) {
    return <Text style={baseStyle}>{line}</Text>;
  }
  const labelColor = m[1].toLowerCase() === 'pros' ? PROS_COLOR : CONS_COLOR;
  return (
    <Text style={baseStyle}>
      <Text style={{ color: labelColor }}>{m[1]}</Text>
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
  const lines = splitAiOverviewSummarySegments(text);
  if (lines.length === 0) {
    return <Text style={style}>{text}</Text>;
  }
  return (
    <Text style={style}>
      {lines.map((line, i) => (
        <Text key={i} style={style}>
          {i > 0 ? '\n' : ''}
          <LineColored line={line} baseStyle={style} />
        </Text>
      ))}
    </Text>
  );
}
