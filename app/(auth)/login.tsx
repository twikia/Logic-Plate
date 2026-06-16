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
import { useTranslation } from 'react-i18next';

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading: authLoading, setUsernameViaEdge, refreshProfile, isGuest } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onContinueAsGuest = async () => {
    setMessage(null);
    setGuestBusy(true);
    try {
      if (isGuest) {
        router.replace('/(tabs)' as any);
        return;
      }
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setMessage(error.message);
        return;
      }
      router.replace('/(tabs)' as any);
    } finally {
      setGuestBusy(false);
    }
  };

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
  };

  const onEmailAuth = async () => {
    setMessage(null);
    if (mode === 'signup') {
      const u = username.trim();
      if (!isGuest && u.length < 2) {
        setMessage(t('auth.errors.chooseUsername'));
        return;
      }
      if (isGuest && u.length > 0 && u.length < 2) {
        setMessage(t('auth.errors.usernameMin'));
        return;
      }
    }
    if (mode === 'signin' && isGuest) {
      Alert.alert(
        t('auth.guestSignInAlert.title'),
        t('auth.guestSignInAlert.message'),
        [
          { text: t('auth.guestSignInAlert.cancel'), style: 'cancel' },
          {
          text: t('auth.guestSignInAlert.continue'),
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
                profanity: t('auth.errors.profanity'),
                taken: t('auth.errors.taken'),
                invalid_username: t('auth.errors.invalidUsername'),
                network: t('auth.errors.network'),
              };
              setMessage(map[res.code] || t('auth.errors.network'));
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
              profanity: t('auth.errors.profanity'),
              taken: t('auth.errors.taken'),
              invalid_username: t('auth.errors.invalidUsername'),
              network: t('auth.errors.network'),
            };
            setMessage(map[res.code] || t('auth.errors.accountCreated'));
            return;
          }
        }
        await refreshProfile();
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
          <Text style={styles.brand}>{t('auth.brand')}</Text>
          <Text style={styles.headline}>
            {mode === 'signin'
              ? t('auth.welcomeBack')
              : isGuest
                ? t('auth.saveProfile')
                : t('auth.createAccount')}
          </Text>

          <View style={styles.toggleRow}>
            <AnimatedPressable
              style={[styles.toggleBtn, mode === 'signin' && styles.toggleBtnOn]}
              onPress={() => setMode('signin')}
            >
              <Text style={[styles.toggleText, mode === 'signin' && styles.toggleTextOn]}>
                {t('auth.signIn')}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.toggleBtn, mode === 'signup' && styles.toggleBtnOn]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextOn]}>
                {t('auth.signUp')}
              </Text>
            </AnimatedPressable>
          </View>

          {mode === 'signup' ? (
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={isGuest ? t('auth.usernameOptional') : t('auth.username')}
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
            placeholder={t('auth.email')}
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            editable={!busy}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.password')}
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
                {mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
              </Text>
            )}
          </AnimatedPressable>

          <Text style={styles.divider}>{t('auth.or')}</Text>

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

          {!authLoading && !user ? (
            <AnimatedPressable
              style={[styles.secondaryCta, styles.tailCta, (guestBusy || busy) && styles.primaryDisabled]}
              onPress={onContinueAsGuest}
              disabled={guestBusy || busy}
            >
              {guestBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.secondaryCtaText}>{t('auth.continueGuest')}</Text>
              )}
            </AnimatedPressable>
          ) : null}
          {isGuest ? (
            <AnimatedPressable
              style={[styles.secondaryCta, styles.tailCta]}
              onPress={() => router.replace('/(tabs)' as any)}
            >
              <Text style={styles.secondaryCtaText}>{t('auth.backToApp')}</Text>
            </AnimatedPressable>
          ) : null}
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
  secondaryCta: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  secondaryCtaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  tailCta: {
    marginTop: 22,
  },
  headline: {
    marginTop: 20,
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
});
