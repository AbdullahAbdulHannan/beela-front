// Centralized color palette for the Voxa app
// Update colors here to change them across the entire app.

export const Colors = {
  // Core brand colors
  primary: '#4668FF',
  danger: '#FF6B6B',

  // Backgrounds and surfaces
  background: '#FFFFFF',
  backgroundStatus: '#000',
  surface: '#F7F8FA',
  surfaceAlt: '#F0F2F5',
  badge: '#E9ECEF',
  border: '#E5E7EB',
  divider: '#D1D5DB',

  // Text colors
  text: '#000000',
  textMuted: '#6B7280',
  btnText:'#FFFFFF',
  textSubtle: '#9CA3AF',
  errorText: '#ff6b6b',
  linkText: '#4668FF',
  // Icon colors
  iconMuted: '#6B7280',

  // Utility
  black: '#000000',
  white: '#FFFFFF',
} as const;

export type ColorKey = keyof typeof Colors;
