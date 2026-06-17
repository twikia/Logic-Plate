import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useAuth } from '@/context/AuthContext';

type Props = {
  title: string;
  subtitle?: string;
  onSuccess?: () => void;
};

export function SetUsernameForm({ title, subtitle, onSuccess }: Props) {
  const { t } = useTranslation();
  const { setUsernameViaEdge } = useAuth();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const result = await setUsernameViaEdge(username.trim());
      if (!result.ok) {
        const map: Record<string, string> = {
          profanity: t('auth.errors.profanity'),
          taken: t('auth.errors.taken'),
          invalid_username: t('auth.errors.invalidUsername'),
          network: t('auth.errors.network'),
        };
        setMessage(map[result.code] || t('auth.errors.network'));
        return;
      }
      onSuccess?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <TextInput
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={30}
        placeholder={t('auth.username')}
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={styles.input}
        editable={!busy}
      />
      <Text style={styles.hint}>{t('auth.usernameHint')}</Text>
      {message ? <Text style={styles.error}>{message}</Text> : null}
      <AnimatedPressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{t('common.save')}</Text>
        )}
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 20,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 16,
  },
  error: {
    fontSize: 13,
    color: '#ffb4b4',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#F97352',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
