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
          <Text style={styles.title}>Privacy in Phase 3</Text>
          <Text style={styles.subtitle}>How connected safety data is stored and shared.</Text>
        </View>
        <PrivacyCard icon="location-outline" title="Foreground live location" badge="Assigned only" text="During an active SOS, throttled coordinates are stored in Supabase and readable only by the incident owner and assigned guardians. Background tracking is not implemented." />
        <PrivacyCard icon="cloud-outline" title="Protected cloud data" badge="Supabase RLS" text="Profiles, guardian links, incidents, acknowledgements, and push tokens are protected by authenticated Row Level Security policies." />
        <PrivacyCard icon="phone-portrait-outline" title="Local cache" badge="AsyncStorage" text="Preferences, cached incident state, and an offline location retry queue remain on this device for continuity during temporary network loss." />
        <PrivacyCard icon="notifications-outline" title="Guardian alerts" badge="Linked users" text="Only accepted linked guardians are assigned to an incident. Contact-only guardians are not shown as notified, and SMS is not connected." />
        <View style={styles.warning}>
          <Ionicons name="information-circle-outline" size={20} color="#B54708" />
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
        <View style={styles.icon}><Ionicons name={icon} size={22} color={colors.navy} /></View>
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
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8EEF4', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700', marginLeft: 11 },
  cardText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 13 },
  warning: { flexDirection: 'row', gap: 9, padding: 14, backgroundColor: colors.amberSoft, borderRadius: 14 },
  warningText: { flex: 1, color: '#B54708', fontSize: 12, lineHeight: 18 },
});
