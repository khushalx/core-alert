import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useAuth } from '@/store/AuthContext';

export default function ForgotPasswordScreen() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    if (!email.trim()) return setError('Enter your email address.');
    setLoading(true); setError(''); setMessage('');
    try {
      await sendPasswordReset(email);
      setMessage('Check your inbox for a password reset link.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The reset email could not be sent.');
    } finally { setLoading(false); }
  };
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>We’ll send a secure reset link to your account email.</Text>
          <Card style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={styles.input} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}
            <Button label="Send reset link" loading={loading} onPress={submit} />
            <Button label="Back to sign in" variant="ghost" onPress={() => router.back()} />
          </Card>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, content: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.text, fontSize: 27, fontWeight: '800' }, subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 18 },
  card: { gap: 13 }, label: { color: colors.text, fontSize: 13, fontWeight: '700' }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.small, backgroundColor: colors.white, color: colors.text, paddingHorizontal: 13 },
  error: { color: colors.redDark, fontSize: 12 }, success: { color: '#067647', backgroundColor: colors.greenSoft, borderRadius: 10, padding: 10, fontSize: 12 },
});
