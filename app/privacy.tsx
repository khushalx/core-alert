import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title}>Privacy and data use</Text>
          <Text style={styles.subtitle}>How connected safety data is stored and shared.</Text>
        </View>
        <PrivacyCard icon="location-outline" title="Active-SOS location" badge="Assigned only" text="During an active SOS, throttled coordinates are stored in Supabase and readable only by the incident owner and assigned guardians. Optional Android background sharing requires separate consent and stops when the SOS ends. Android may stop it after force-close, restart, or battery restriction." />
        <PrivacyCard icon="videocam-outline" title="Emergency evidence" badge="Visible and private" text="SOS incidents may record video with microphone audio, or audio only when the camera is unavailable, after Android permission is granted. Android always shows camera or microphone indicators and a persistent notification with a Stop evidence action. Completed files stay temporarily in private app storage, upload to a private incident bucket, and are readable only by the protected user and assigned guardians." />
        <PrivacyCard icon="cloud-outline" title="Protected cloud data" badge="Supabase RLS" text="Profiles, guardian links, incidents, acknowledgements, and push tokens are protected by authenticated Row Level Security policies." />
        <PrivacyCard icon="phone-portrait-outline" title="Local cache" badge="AsyncStorage" text="Preferences, cached incident state, and an offline location retry queue remain on this device for continuity during temporary network loss." />
        <PrivacyCard icon="notifications-outline" title="Guardian alerts" badge="Confirmed status" text="Linked guardians may receive push alerts. Contact-only or unreachable linked guardians may receive SMS only when the secure server provider is configured. Core Alert shows provider-accepted, failed, or not-configured status instead of assuming delivery." />
        <View style={styles.warning}>
          <Ionicons name="information-circle-outline" size={20} color={colors.amber} />
          <Text style={styles.warningText}>Core Alert remains a hackathon prototype. Emergency services are not contacted automatically.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PrivacyCard({ icon, title, text, badge }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  text: string;
  badge: string;
}) {
  return (
    <Card>
      <View style={styles.cardHeader}>
        <View style={styles.icon}><Ionicons name={icon} size={22} color={colors.blueBright} /></View>
        <Text style={styles.cardTitle}>{title}</Text>
        <StatusBadge label={badge} tone="neutral" />
      </View>
      <Text style={styles.cardText}>{text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: 14, paddingBottom: 32 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700', marginLeft: 11 },
  cardText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 13 },
  warning: { flexDirection: 'row', gap: 9, padding: 14, backgroundColor: colors.amberSoft, borderRadius: 14 },
  warningText: { flex: 1, color: colors.amber, fontSize: 12, lineHeight: 18 },
});
