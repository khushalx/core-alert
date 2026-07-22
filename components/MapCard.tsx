import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/constants/theme';
import type { Coordinates } from '@/types';
import { formatCoordinates } from '@/utils/format';

type MapCardProps = {
  coordinates: Coordinates | null;
  incidentCoordinates?: Coordinates | null;
  height?: number;
  label?: string;
  path?: Coordinates[];
};

export function MapCard({ coordinates, incidentCoordinates, height = 180, label, path = [] }: MapCardProps) {
  const focus = coordinates ?? incidentCoordinates;
  if (!focus) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Ionicons name="map-outline" size={29} color={colors.textMuted} />
        <Text style={styles.placeholderTitle}>Map location unavailable</Text>
        <Text style={styles.placeholderText}>Coordinates will appear here when location is available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        accessibilityLabel="Incident location map"
        style={[styles.map, { height, pointerEvents: 'none' }]}
        initialRegion={{ ...focus, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
        region={{ ...focus, latitudeDelta: 0.012, longitudeDelta: 0.012 }}>
        {incidentCoordinates ? (
          <Marker coordinate={incidentCoordinates} title="Incident location" pinColor={colors.red} />
        ) : null}
        {path.length > 1 ? <Polyline coordinates={path} strokeColor={colors.navy} strokeWidth={4} /> : null}
        {coordinates ? <Marker coordinate={coordinates} title="Current position" pinColor={colors.navy} /> : null}
      </MapView>
      <View style={styles.caption}>
        <View style={styles.availableDot} />
        <View style={styles.captionText}>
          <Text style={styles.captionTitle}>{label ?? 'Location available'}</Text>
          <Text style={styles.coordinates}>{formatCoordinates(coordinates)}{path.length > 0 ? ` • ${path.length} points` : ''}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border },
  map: { width: '100%' },
  caption: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, padding: 13 },
  availableDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green, marginRight: 9 },
  captionText: { flex: 1 },
  captionTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  coordinates: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  placeholder: {
    borderRadius: radii.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  placeholderTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 8 },
  placeholderText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
});
