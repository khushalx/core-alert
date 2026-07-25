import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  black: '#03050A',
  navy: '#2F6BFF',
  navySoft: '#163B7A',
  blue: '#2F6BFF',
  blueBright: '#4D82FF',
  blueSoft: '#0C1B38',
  red: '#F23D4F',
  redDark: '#FF5968',
  redSoft: '#2A1018',
  redGlow: 'rgba(242,61,79,0.28)',
  background: '#050811',
  backgroundSecondary: '#080D17',
  surface: '#0C1320',
  surfaceElevated: '#111B2B',
  surfacePressed: '#162235',
  white: '#FFFFFF',
  text: '#F7F9FC',
  textSecondary: '#A6B2C4',
  textMuted: '#66758A',
  green: '#31D487',
  greenSoft: '#0D2B22',
  amber: '#F6B84A',
  amberSoft: '#2B2111',
  border: '#1E2B3D',
  borderStrong: '#33445B',
  overlay: 'rgba(1, 4, 10, 0.82)',
} as const;

export const radii = {
  small: 10,
  medium: 16,
  large: 22,
  xlarge: 28,
  pill: 999,
} as const;

export const spacing = {
  xxs: 4,
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' } satisfies TextStyle,
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800' } satisfies TextStyle,
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' } satisfies TextStyle,
  body: { fontSize: 14, lineHeight: 21, fontWeight: '400' } satisfies TextStyle,
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700' } satisfies TextStyle,
  caption: { fontSize: 11, lineHeight: 16, fontWeight: '500' } satisfies TextStyle,
} as const;

export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 5,
  } satisfies ViewStyle,
  emergency: {
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 14,
  } satisfies ViewStyle,
} as const;

export const iconSizes = {
  small: 16,
  medium: 20,
  large: 24,
} as const;
