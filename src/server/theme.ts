import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';

const roleNames = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground', 'surface', 'onSurface',
  'surfaceVariant', 'onSurfaceVariant', 'outline', 'outlineVariant',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary', 'shadow', 'scrim',
] as const;

type SchemeRecord = Record<string, number>;

function cssName(name: string) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function schemeToTokens(scheme: SchemeRecord) {
  return Object.fromEntries(
    roleNames.map((role) => [`--md-sys-color-${cssName(role)}`, hexFromArgb(scheme[role])]),
  );
}

export function createThemeTokens(seedColor: string) {
  const theme = themeFromSourceColor(argbFromHex(seedColor));
  return {
    light: schemeToTokens(theme.schemes.light.toJSON()),
    dark: schemeToTokens(theme.schemes.dark.toJSON()),
  };
}
