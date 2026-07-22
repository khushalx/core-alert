import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { SettingRow } from '@/components/SettingRow';
import { AppHeader, Button, Card, Screen, StatusBadge } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useHardwareTrigger } from '@/hooks/useHardwareTrigger';
import { hardwareTriggerService } from '@/services/hardwareTriggerService';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import { useConnected } from '@/store/ConnectedContext';
import { hardwareStatusLabel, hardwareStatusTone } from '@/utils/hardwareTrigger';

export default function SettingsScreen() {
  const {
    state,
    location,
    setCountdownDuration,
    setHapticsEnabled,
    setHardwareShortcutEnabled,
    setHardwareHapticsEnabled,
    setDemoModeEnabled,
    startSosTest,
    resetDemoData,
    removeLocalDemoData,
    showToast,
  } = useApp();
  const { user, profile, signOut } = useAuth();
  const {
    incomingRequests,
    peopleIProtect,
    notificationPermission,
    pushTokenState,
    pushMessage,
    profileMigrationAvailable,
    hasLocalDemoGuardians,
    importLocalProfile,
    dismissLocalProfileImport,
    registerPush,
  } = useConnected();
  const hardware = useHardwareTrigger();
  const [shortcutVisible, setShortcutVisible] = useState(false);
  const [countdownVisible, setCountdownVisible] = useState(false);
  const [resetVisible, setResetVisible] = useState(false);
  const [signOutVisible, setSignOutVisible] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);

  const runTest = async () => {
    const started = await startSosTest();
    if (!started) showToast('An SOS test is already running');
  };

  return (
    <Screen>
      <AppHeader title="Settings" subtitle="Safety preferences" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {profileMigrationAvailable ? (
          <Card style={styles.migrationCard}>
            <View style={styles.migrationCopy}><Text style={styles.migrationTitle}>Import your local emergency profile?</Text><Text style={styles.migrationText}>Move existing phone and medical details into your protected Supabase profile. You’ll only be asked once.</Text></View>
            <Button label="Import profile" variant="secondary" onPress={() => void importLocalProfile()} />
            <Button label="Not now" variant="ghost" onPress={() => void dismissLocalProfileImport()} />
          </Card>
        ) : null}

        <SettingsSection title="Account">
          <SettingRow icon="person-circle-outline" title="Profile" subtitle={profile?.full_name ?? 'Cloud profile'} onPress={() => router.push('/emergency-profile')} />
          <SettingRow icon="mail-outline" title="Email" subtitle={user?.email ?? 'Signed-in account'} />
          <SettingRow icon="log-out-outline" title="Sign out" subtitle="Keep local safety preferences on this device" onPress={() => setSignOutVisible(true)} />
        </SettingsSection>

        <SettingsSection title="Emergency activation">
          <SettingRow
            icon="volume-low-outline"
            title="Volume-down shortcut"
            subtitle="Press volume down five times to begin an SOS."
            trailing={<StatusBadge label={hardwareStatusLabel(hardware.status)} tone={hardwareStatusTone(hardware.status)} />}
            onPress={() => setShortcutVisible(true)}
          />
          <SettingRow
            icon="timer-outline"
            title="Countdown"
            subtitle={`${state.preferences.countdownDuration} seconds before activation`}
            trailing={<View style={styles.valuePill}><Text style={styles.valueText}>{state.preferences.countdownDuration}s</Text></View>}
            onPress={() => setCountdownVisible(true)}
          />
          <SettingRow
            icon="phone-portrait-outline"
            title="Haptic confirmation"
            subtitle="Feedback during important SOS moments"
            trailing={<Switch value={state.preferences.hapticsEnabled} onValueChange={setHapticsEnabled} trackColor={{ false: colors.borderStrong, true: colors.navy }} thumbColor={colors.white} />}
          />
          <SettingRow
            icon="flask-outline"
            title="Demo mode"
            subtitle="Create real cloud incidents with clear demo labels"
            trailing={<Switch value={state.preferences.demoModeEnabled} onValueChange={setDemoModeEnabled} trackColor={{ false: colors.borderStrong, true: colors.navy }} thumbColor={colors.white} />}
          />
          <Button label="Run SOS test" variant="secondary" icon="flask-outline" onPress={runTest} style={styles.sectionButton} />
        </SettingsSection>

        <SettingsSection title="Guardian account">
          <SettingRow icon="key-outline" title="Enter invite code" subtitle="Link as a guardian for another user" onPress={() => router.push('/enter-invite-code')} />
          <SettingRow icon="mail-unread-outline" title="Pending requests" subtitle={`${incomingRequests.length} waiting`} trailing={<StatusBadge label={`${incomingRequests.length}`} tone={incomingRequests.length ? 'warning' : 'neutral'} />} onPress={() => router.push('/guardian-requests')} />
          <SettingRow icon="shield-outline" title="People I protect" subtitle={`${peopleIProtect.length} linked account${peopleIProtect.length === 1 ? '' : 's'}`} onPress={() => router.push('/people-i-protect')} />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <SettingRow icon="notifications-outline" title="Permission" subtitle={notificationPermission === 'granted' ? 'Allowed on this device' : notificationPermission === 'denied' ? 'Permission denied' : 'Not configured'} trailing={<StatusBadge label={notificationPermission} tone={notificationPermission === 'granted' ? 'success' : 'warning'} />} onPress={() => { setNotificationLoading(true); void registerPush().catch((error) => showToast(error instanceof Error ? error.message : 'Notifications could not be configured.')).finally(() => setNotificationLoading(false)); }} />
          <SettingRow icon="cloud-done-outline" title="Push-token status" subtitle={notificationLoading ? 'Registering…' : pushMessage} trailing={<StatusBadge label={pushTokenState === 'registered' ? 'Ready' : pushTokenState === 'error' ? 'Error' : 'Not ready'} tone={pushTokenState === 'registered' ? 'success' : 'warning'} />} />
          <SettingRow icon="settings-outline" title="Notification settings" subtitle="Open Core Alert system settings" onPress={() => Linking.openSettings()} />
        </SettingsSection>

        <SettingsSection title="Your safety setup">
          <SettingRow icon="location-outline" title="Location" subtitle={location.permission === 'granted' ? 'Foreground location available' : 'Permission needs attention'} trailing={<StatusBadge label={location.permission === 'granted' ? 'Ready' : 'Review'} tone={location.permission === 'granted' ? 'success' : 'warning'} />} onPress={() => router.push('/location-details')} />
          <SettingRow icon="medkit-outline" title="Emergency profile" subtitle={profile?.phone || profile?.blood_group ? 'Cloud profile details added' : 'Add contact and medical details'} onPress={() => router.push('/emergency-profile')} />
          <SettingRow icon="shield-outline" title="Privacy and location" subtitle="What this prototype stores and shares" onPress={() => router.push('/privacy')} />
          <SettingRow icon="settings-outline" title="Device permissions" subtitle="Open Core Alert in device settings" onPress={() => Linking.openSettings()} />
        </SettingsSection>

        <SettingsSection title="Core Alert">
          <SettingRow icon="information-circle-outline" title="About" subtitle="Version 1.0.0 • Phase 3" onPress={() => Alert.alert('About Core Alert', 'Connected guardian alerts and foreground live location sharing.\n\nPhase 3 hackathon prototype.')} />
          <SettingRow icon="warning-outline" title="Safety and limitations" subtitle="Foreground location, no police dispatch, no SMS" onPress={() => Alert.alert('Current limitations', 'Continuous background protection is still under development.\n\nThe volume shortcut only works under the currently supported foreground conditions.\n\nPolice are not contacted automatically. SMS is not connected. Core Alert remains a hackathon prototype.')} />
          <SettingRow icon="document-text-outline" title="Prototype terms" subtitle="Safety and emergency-service disclaimer" onPress={() => Alert.alert('Prototype terms', 'Core Alert is a demonstration and is not a replacement for official emergency services.')} />
          <SettingRow icon="refresh-outline" title="Reset demo data" subtitle="Restore guardians, profile, and test history" onPress={() => setResetVisible(true)} />
          {hasLocalDemoGuardians ? <SettingRow icon="trash-bin-outline" title="Remove local demo contacts" subtitle="Mock guardians are never uploaded to Supabase" onPress={removeLocalDemoData} /> : null}
        </SettingsSection>

        <View style={styles.disclaimer}><Ionicons name="warning-outline" size={18} color="#B54708" /><Text style={styles.disclaimerText}>Prototype only — use official emergency services in real danger.</Text></View>
      </ScrollView>

      <BottomSheet visible={shortcutVisible} title="Volume-down shortcut" onClose={() => setShortcutVisible(false)}>
        <View style={styles.shortcutToggle}>
          <View style={styles.shortcutToggleCopy}>
            <Text style={styles.shortcutToggleTitle}>Enable shortcut</Text>
            <Text style={styles.shortcutToggleText}>{Platform.OS === 'ios' ? 'Android prototype only' : 'Listen while Core Alert is in the foreground'}</Text>
          </View>
          <Switch
            disabled={Platform.OS !== 'android'}
            value={Platform.OS === 'android' && state.preferences.hardwareShortcutEnabled}
            onValueChange={setHardwareShortcutEnabled}
            trackColor={{ false: colors.borderStrong, true: colors.navy }}
            thumbColor={colors.white}
          />
        </View>
        <View style={styles.detailList}>
          <DetailRow label="Status" value={hardwareStatusLabel(hardware.status)} />
          <DetailRow label="Trigger window" value={`${hardwareTriggerService.windowMs / 1000} seconds`} />
          <DetailRow label="Compatibility" value={Platform.OS === 'android' ? 'Android development build' : 'Android prototype only'} />
        </View>
        <View style={styles.hapticRow}>
          <View><Text style={styles.shortcutToggleTitle}>Shortcut haptics</Text><Text style={styles.shortcutToggleText}>Subtle feedback during the sequence</Text></View>
          <Switch value={state.preferences.hardwareHapticsEnabled} onValueChange={setHardwareHapticsEnabled} trackColor={{ false: colors.borderStrong, true: colors.navy }} thumbColor={colors.white} />
        </View>
        <View style={styles.foregroundNote}><Ionicons name="information-circle-outline" size={18} color={colors.navy} /><Text style={styles.foregroundText}>Foreground only. It will not work after force-close, process termination, suspension, or while the app is inactive.</Text></View>
        <Button label="Test one button input" variant="secondary" icon="volume-low-outline" onPress={() => hardwareTriggerService.emitSimulatedPress()} style={styles.sheetAction} />
        <Button label="Open diagnostics" variant="ghost" icon="pulse-outline" onPress={() => { setShortcutVisible(false); router.push('/hardware-diagnostics'); }} />
      </BottomSheet>

      <BottomSheet visible={countdownVisible} title="Choose countdown" onClose={() => setCountdownVisible(false)}>
        <Text style={styles.sheetText}>Choose how long the safe demonstration waits before becoming active.</Text>
        <View style={styles.countdownOptions}>
          {([5, 10, 15] as const).map((duration) => {
            const selected = state.preferences.countdownDuration === duration;
            return (
              <Pressable key={duration} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setCountdownDuration(duration); setCountdownVisible(false); }} style={({ pressed }) => [styles.countdownOption, selected && styles.countdownOptionSelected, pressed && styles.pressed]}>
                <Text style={[styles.countdownValue, selected && styles.countdownValueSelected]}>{duration}</Text>
                <Text style={[styles.countdownUnit, selected && styles.countdownValueSelected]}>seconds</Text>
                {selected ? <Ionicons name="checkmark-circle" size={19} color={colors.white} /> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      <ConfirmationModal visible={resetVisible} title="Reset all demo data?" message="Guardians, profile details, preferences, and local test history will return to their starting state." confirmLabel="Reset data" destructive onCancel={() => setResetVisible(false)} onConfirm={async () => { setResetVisible(false); await resetDemoData(); }} />
      <ConfirmationModal visible={signOutVisible} title="Sign out of Core Alert?" message="Cloud incidents and guardian links remain in your account. Local safety preferences stay on this device." confirmLabel="Sign out" onCancel={() => setSignOutVisible(false)} onConfirm={() => { setSignOutVisible(false); void signOut().then(() => router.replace('/welcome')).catch((error) => showToast(error instanceof Error ? error.message : 'Could not sign out.')); }} />
    </Screen>
  );
}

function SettingsSection({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <View><Text style={styles.sectionTitle}>{title.toUpperCase()}</Text><Card style={styles.sectionCard}>{children}</Card></View>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 34, gap: 20 },
  sectionTitle: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 9 },
  sectionCard: { paddingTop: 0, paddingBottom: 12 },
  sectionButton: { marginTop: 12 },
  valuePill: { minWidth: 42, height: 30, paddingHorizontal: 8, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EEF4' },
  valueText: { color: colors.navy, fontSize: 12, fontWeight: '800' },
  disclaimer: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.amberSoft, borderRadius: radii.medium, padding: 13 },
  disclaimerText: { color: '#B54708', fontSize: 11, lineHeight: 16, fontWeight: '600', flex: 1 },
  shortcutToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  shortcutToggleCopy: { flex: 1 },
  shortcutToggleTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  shortcutToggleText: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  detailList: { gap: 10, marginTop: 18 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.textSecondary, fontSize: 12 },
  detailValue: { color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  hapticRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 },
  foregroundNote: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#EEF4F8', borderRadius: 12, marginTop: 16 },
  foregroundText: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, flex: 1 },
  sheetAction: { marginTop: 16 },
  sheetText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  countdownOptions: { flexDirection: 'row', gap: 9, paddingBottom: 14 },
  countdownOption: { flex: 1, minHeight: 94, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  countdownOptionSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  countdownValue: { color: colors.text, fontSize: 24, fontWeight: '800' },
  countdownUnit: { color: colors.textSecondary, fontSize: 10, marginTop: 1, marginBottom: 5 },
  countdownValueSelected: { color: colors.white },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  migrationCard: { borderColor: '#B2CCFF', gap: 8 }, migrationCopy: { marginBottom: 4 }, migrationTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, migrationText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
});
