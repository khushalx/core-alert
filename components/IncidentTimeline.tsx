import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

export function IncidentTimeline({ items, active = false }: { items: string[]; active?: boolean }) {
  return (
    <View accessibilityRole="list">
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.row}>
          <View style={styles.markerColumn}>
            <View style={[styles.dot, active && index === items.length - 1 && styles.dotActive]} />
            {index < items.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <Text style={styles.label}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', minHeight: 42 },
  markerColumn: { width: 24, alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.greenSoft,
  },
  dotActive: { backgroundColor: colors.red, borderColor: colors.redSoft },
  line: { width: 1, flex: 1, backgroundColor: colors.borderStrong, marginVertical: 3 },
  label: { color: colors.text, fontSize: 14, lineHeight: 19, paddingLeft: 8, paddingBottom: 18, flex: 1 },
});
