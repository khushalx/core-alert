import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoMark } from '@/components/LogoMark';
import { Button, Card } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useAuth } from '@/store/AuthContext';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Core Alert could not sign you in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.intro}><LogoMark size={54} /><Text style={styles.title}>Welcome back</Text><Text style={styles.subtitle}>Sign in to your Core Alert account.</Text></View>
          <Card style={styles.card}>
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Sign in" loading={loading} onPress={submit} />
            <Pressable accessibilityRole="button" onPress={() => router.push('/forgot-password')} style={styles.linkButton}><Text style={styles.link}>Forgot password?</Text></Pressable>
          </Card>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/sign-up')} style={styles.create}><Text style={styles.createText}>New to Core Alert? <Text style={styles.createStrong}>Create account</Text></Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.textMuted} style={styles.input} {...props} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: 16 },
  intro: { alignItems: 'center', marginBottom: 6 }, title: { color: colors.text, fontSize: 27, fontWeight: '800', marginTop: 16 }, subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 5 },
  card: { gap: 14 }, field: { gap: 7 }, label: { color: colors.text, fontSize: 13, fontWeight: '700' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.small, backgroundColor: colors.surfaceElevated, color: colors.text, paddingHorizontal: 13, fontSize: 14 },
  error: { color: colors.redDark, fontSize: 12, lineHeight: 18 }, linkButton: { alignItems: 'center', padding: 8 }, link: { color: colors.navy, fontWeight: '700', fontSize: 13 },
  create: { alignItems: 'center', padding: 12 }, createText: { color: colors.textSecondary, fontSize: 13 }, createStrong: { color: colors.navy, fontWeight: '800' },
});
