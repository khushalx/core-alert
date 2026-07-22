import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoMark } from '@/components/LogoMark';
import { Button, StatusBadge } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/store/AppContext';

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const { completeOnboarding, location, requestLocationPermission } = useApp();

  const finish = () => {
    completeOnboarding();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.progressRow}>
        {[0, 1, 2].map((item) => (
          <View key={item} style={[styles.progress, item <= step && styles.progressActive]} />
        ))}
      </View>

      {step === 0 ? (
        <View style={styles.content}>
          <View style={styles.heroMark}>
            <LogoMark size={82} />
          </View>
          <Text style={styles.brand}>CORE ALERT</Text>
          <Text style={styles.title}>Help without unlocking your phone.</Text>
          <Text style={styles.message}>
            A discreet safety companion designed to start an emergency response when reaching your screen is not possible.
          </Text>
          <View style={styles.promiseCard}>
            <Ionicons name="volume-low-outline" size={24} color={colors.navy} />
            <View style={styles.promiseCopy}>
              <Text style={styles.promiseTitle}>Five clicks between danger and help.</Text>
              <Text style={styles.promiseText}>The Android foreground shortcut is available in the development build.</Text>
            </View>
          </View>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="location" size={42} color={colors.navy} />
          </View>
          <StatusBadge label="FOREGROUND ACCESS ONLY" tone="info" />
          <Text style={styles.title}>Share where help is needed.</Text>
          <Text style={styles.message}>
            During an SOS, Core Alert uses your location to capture the incident point and show your movement to trusted guardians.
          </Text>
          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={19} color={colors.green} />
            <Text style={styles.privacyText}>Continuous background location is not implemented in Phase 3.</Text>
          </View>
          {location.permission === 'denied' ? (
            <Text style={styles.warning}>Permission was not granted. You can still finish setup and enable it later.</Text>
          ) : null}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="phone-portrait-outline" size={42} color={colors.navy} />
          </View>
          <Text style={styles.title}>A shortcut built for urgent moments.</Text>
          <View style={styles.steps}>
            <ShortcutStep number="1" icon="volume-low-outline" title="Press volume down five times" />
            <ShortcutStep number="2" icon="pulse-outline" title="Core Alert confirms activation" />
            <ShortcutStep number="3" icon="people-outline" title="Guardians receive your SOS and location" />
          </View>
          <View style={styles.comingSoon}>
            <Ionicons name="cloud-done-outline" size={18} color={colors.redDark} />
            <Text style={styles.comingSoonText}>Connected guardian alerts are ready</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.footer}>
        {step === 0 ? <Button label="Continue" onPress={() => setStep(1)} /> : null}
        {step === 1 ? (
          <>
            <Button
              label={location.permission === 'granted' ? 'Location allowed' : 'Allow location'}
              icon={location.permission === 'granted' ? 'checkmark-circle' : 'location-outline'}
              loading={location.loading}
              disabled={location.permission === 'granted'}
              onPress={requestLocationPermission}
            />
            <Pressable accessibilityRole="button" onPress={() => setStep(2)} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>{location.permission === 'granted' ? 'Continue' : 'Not now'}</Text>
            </Pressable>
          </>
        ) : null}
        {step === 2 ? <Button label="Finish setup" icon="shield-checkmark-outline" onPress={finish} /> : null}
      </View>
    </SafeAreaView>
  );
}

function ShortcutStep({
  number,
  icon,
  title,
}: {
  number: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
}) {
  return (
    <View style={styles.shortcutStep}>
      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View>
      <View style={styles.stepIcon}><Ionicons name={icon} size={20} color={colors.navy} /></View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  progressRow: { flexDirection: 'row', gap: 6, paddingTop: 12 },
  progress: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressActive: { backgroundColor: colors.navy },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xl },
  heroMark: { marginBottom: 22 },
  brand: { color: colors.redDark, fontSize: 11, fontWeight: '800', letterSpacing: 2.1, marginBottom: 12 },
  title: { maxWidth: 360, color: colors.text, fontSize: 31, lineHeight: 38, fontWeight: '800', textAlign: 'center' },
  message: { maxWidth: 380, color: colors.textSecondary, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 14 },
  promiseCard: {
    flexDirection: 'row',
    maxWidth: 400,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 16,
    marginTop: 28,
  },
  promiseCopy: { flex: 1, marginLeft: 12 },
  promiseTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  promiseText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  iconCircle: { width: 86, height: 86, borderRadius: 43, backgroundColor: '#E8EEF4', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24 },
  privacyText: { color: colors.textSecondary, fontSize: 12, flexShrink: 1 },
  warning: { color: '#B54708', backgroundColor: colors.amberSoft, borderRadius: 10, padding: 10, fontSize: 12, lineHeight: 17, marginTop: 16 },
  steps: { alignSelf: 'stretch', marginTop: 24, gap: 10 },
  shortcutStep: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, padding: 12 },
  stepNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  stepIcon: { width: 40, alignItems: 'center' },
  stepTitle: { color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 },
  comingSoon: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.redSoft, borderRadius: radii.pill, paddingHorizontal: 13, paddingVertical: 9, marginTop: 18 },
  comingSoonText: { color: colors.redDark, fontSize: 12, fontWeight: '700' },
  footer: { paddingBottom: 10, gap: 8 },
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  textButtonLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
});
