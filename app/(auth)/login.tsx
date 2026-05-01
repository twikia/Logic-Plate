import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Provider } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { supabase } from '@/core/supabaseClient';
import { linkOAuthProvider, signInWithOAuthProvider } from '@/core/auth/oauth';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { setUsernameViaEdge, refreshProfile, isGuest } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runPasswordSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    await refreshProfile();
    router.back();
  };

  const onEmailAuth = async () => {
    setMessage(null);
    if (mode === 'signup') {
      const u = username.trim();
      if (!isGuest && u.length < 2) {
        setMessage('Choose a username (2+ characters).');
        return;
      }
      if (isGuest && u.length > 0 && u.length < 2) {
        setMessage('Username must be at least 2 characters or leave blank.');
        return;
      }
    }
    if (mode === 'signin' && isGuest) {
      Alert.alert(
        'Sign in to an existing account?',
        'You will leave this guest profile on the server under its current user ID. To keep progress on this device, use Sign up to attach email and password to your guest profile instead.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            runPasswordSignIn().finally(() => setBusy(false));
          },
        },
        ]
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (isGuest) {
          const { error } = await supabase.auth.updateUser({
            email: email.trim(),
            password,
          });
          if (error) {
            setMessage(error.message);
            return;
          }
          const u = username.trim();
          if (u.length >= 2) {
            const res = await setUsernameViaEdge(u);
            if (!res.ok) {
              const map: Record<string, string> = {
                profanity: 'Username not allowed.',
                taken: 'Username taken.',
                invalid_username: 'Check username format.',
                network: 'Could not save username.',
              };
              setMessage(map[res.code] || 'Could not save username.');
              return;
            }
          }
        } else {
          const { error } = await supabase.auth.signUp({ email: email.trim(), password });
          if (error) {
            setMessage(error.message);
            return;
          }
          const res = await setUsernameViaEdge(username.trim());
          if (!res.ok) {
            const map: Record<string, string> = {
              profanity: 'Username not allowed.',
              taken: 'Username taken.',
              invalid_username: 'Check username format.',
              network: 'Could not save username.',
            };
            setMessage(map[res.code] || 'Account created; set username on the next screen.');
            return;
          }
        }
        await refreshProfile();
        router.back();
      } else {
        await runPasswordSignIn();
      }
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (label: string, provider: Provider) => {
    setMessage(null);
    setOauthBusy(label);
    try {
      const { error } = isGuest
        ? await linkOAuthProvider(provider)
        : await signInWithOAuthProvider(provider);
      if (error && error.message !== 'cancelled') {
        setMessage(error.message);
      } else if (!error) {
        await refreshProfile();
        router.back();
      }
    } finally {
      setOauthBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.brand}>Platebound</Text>
          {isGuest ? (
            <Text style={styles.guestBanner}>
              Guest profile — add email or a social account to keep this same user ID across devices.
              OAuth links to this profile so your data stays put.
            </Text>
          ) : null}
          <Text style={styles.headline}>
            {mode === 'signin'
              ? 'Welcome back'
              : isGuest
                ? 'Save this profile'
                : 'Create an account'}
          </Text>

          <View style={styles.toggleRow}>
            <AnimatedPressable
              style={[styles.toggleBtn, mode === 'signin' && styles.toggleBtnOn]}
              onPress={() => setMode('signin')}
            >
              <Text style={[styles.toggleText, mode === 'signin' && styles.toggleTextOn]}>
                Sign in
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.toggleBtn, mode === 'signup' && styles.toggleBtnOn]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextOn]}>
                Sign up
              </Text>
            </AnimatedPressable>
          </View>

          {mode === 'signup' ? (
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={isGuest ? 'Username (optional)' : 'Username'}
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={styles.input}
              editable={!busy}
            />
          ) : null}

          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            editable={!busy}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            secureTextEntry
            editable={!busy}
          />

          {message ? <Text style={styles.error}>{message}</Text> : null}

          <AnimatedPressable
            style={[styles.primary, busy && styles.primaryDisabled]}
            onPress={onEmailAuth}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>
                {mode === 'signin' ? 'Sign in' : 'Sign up'}
              </Text>
            )}
          </AnimatedPressable>

          <Text style={styles.divider}>or continue with</Text>

          <View style={styles.socialGrid}>
            <AnimatedPressable
              style={styles.socialBtn}
              disabled={!!oauthBusy}
              onPress={() => oauth('google', 'google')}
            >
              {oauthBusy === 'google' ? (
                <ActivityIndicator />
              ) : (
                <Ionicons name="logo-google" size={22} color="#fff" />
              )}
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.socialBtn}
              disabled={!!oauthBusy}
              onPress={() => oauth('apple', 'apple')}
            >
              {oauthBusy === 'apple' ? (
                <ActivityIndicator />
              ) : (
                <Ionicons name="logo-apple" size={22} color="#fff" />
              )}
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.socialBtn}
              disabled={!!oauthBusy}
              onPress={() => oauth('github', 'github')}
            >
              {oauthBusy === 'github' ? (
                <ActivityIndicator />
              ) : (
                <Ionicons name="logo-github" size={22} color="#fff" />
              )}
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.socialBtn}
              disabled={!!oauthBusy}
              onPress={() => oauth('discord', 'discord')}
            >
              {oauthBusy === 'discord' ? (
                <ActivityIndicator />
              ) : (
                <Ionicons name="logo-discord" size={22} color="#fff" />
              )}
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.socialBtn}
              disabled={!!oauthBusy}
              onPress={() => oauth('facebook', 'facebook')}
            >
              {oauthBusy === 'facebook' ? (
                <ActivityIndicator />
              ) : (
                <Ionicons name="logo-facebook" size={22} color="#fff" />
              )}
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.socialBtn}
              disabled={!!oauthBusy}
              onPress={() => oauth('twitter', 'twitter')}
            >
              {oauthBusy === 'twitter' ? (
                <ActivityIndicator />
              ) : (
                <Ionicons name="logo-twitter" size={22} color="#fff" />
              )}
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.socialBtn}
              disabled={!!oauthBusy}
              onPress={() => oauth('azure', 'azure')}
            >
              {oauthBusy === 'azure' ? (
                <ActivityIndicator />
              ) : (
                <Ionicons name="logo-microsoft" size={22} color="#fff" />
              )}
            </AnimatedPressable>
          </View>

          <Text style={styles.footerNote}>
            Passwords are verified by Supabase Auth and are never stored in app-readable tables.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#2a1f2e',
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  brand: {
    marginTop: 12,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  guestBanner: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.65)',
  },
  headline: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  toggleBtnOn: {
    backgroundColor: 'rgba(249,115,82,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,82,0.5)',
  },
  toggleText: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
  },
  toggleTextOn: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginBottom: 12,
  },
  error: {
    color: '#ffb4b4',
    marginBottom: 12,
    fontSize: 14,
  },
  primary: {
    backgroundColor: '#F97352',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryDisabled: {
    opacity: 0.65,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  divider: {
    textAlign: 'center',
    marginTop: 22,
    marginBottom: 14,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
  },
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  socialBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  footerNote: {
    marginTop: 28,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
});
