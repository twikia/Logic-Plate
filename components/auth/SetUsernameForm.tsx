import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useAuth } from '@/context/AuthContext';

const USERNAME_HINT = '2–30 characters: letters, numbers, underscore.';

type Props = {
  title: string;
  subtitle?: string;
  onSuccess?: () => void;
};

export function SetUsernameForm({ title, subtitle, onSuccess }: Props) {
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
          profanity: 'That username is not allowed.',
          taken: 'That username is already taken.',
          invalid_username: USERNAME_HINT,
          network: 'Could not reach the server. Try again.',
        };
        setMessage(map[result.code] || 'Something went wrong.');
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
        placeholder="Username"
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={styles.input}
        editable={!busy}
      />
      <Text style={styles.hint}>{USERNAME_HINT}</Text>
      {message ? <Text style={styles.error}>{message}</Text> : null}
      <AnimatedPressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
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
