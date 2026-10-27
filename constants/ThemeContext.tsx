import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppTheme = 'dark' | 'light';

// Sophisticated serif font family for elegant titles and hero metrics
export const SERIF_FONT = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Times New Roman", serif',
});

export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSecondary: string;
  border: string;
  borderLight: string;
  text: string;
  textMuted: string;
  textSecondary: string;
  primary: string;
  primaryBg: string;
  cardBg: string;
  card: string;
  tint: string;
  tabBarBg: string;
  tabBarBorder: string;
}

const darkColors: ThemeColors = {
  isDark: true,
  background: '#09090b',
  surface: '#141417',
  surfaceElevated: '#1c1c20',
  surfaceSecondary: '#1c1c20',
  border: '#242429',
  borderLight: '#323238',
  text: '#fafafa',
  textMuted: '#71717a',
  textSecondary: '#a1a1aa',
  primary: '#a3e635',
  primaryBg: 'rgba(163, 230, 53, 0.12)',
  cardBg: 'rgba(20, 20, 23, 0.96)',
  card: '#141417',
  tint: '#a3e635',
  tabBarBg: '#0e0e11',
  tabBarBorder: '#1f1f24',
};

const lightColors: ThemeColors = {
  isDark: false,
  background: '#f8f8fa',
  surface: '#ffffff',
  surfaceElevated: '#f1f1f4',
  surfaceSecondary: '#f4f4f7',
  border: '#e8e8ed',
  borderLight: '#f1f1f5',
  text: '#111111',
  textMuted: '#71717a',
  textSecondary: '#4b5563',
  primary: '#65a30d',
  primaryBg: 'rgba(101, 163, 13, 0.14)',
  cardBg: 'rgba(255, 255, 255, 0.98)',
  card: '#ffffff',
  tint: '#65a30d',
  tabBarBg: '#ffffff',
  tabBarBorder: '#f0f0f3',
};

const THEME_PALETTES: Record<AppTheme, ThemeColors> = {
  dark: darkColors,
  light: lightColors,
};

interface ThemeContextType {
  theme: AppTheme;
  isDark: boolean;
  colors: ThemeColors;
  showsBuildings: boolean;
  setTheme: (t: AppTheme) => void;
  toggleTheme: () => void;
  setShowsBuildings: (val: boolean) => void;
}

const THEME_STORAGE_KEY = '@footprint_app_theme';
const BUILDINGS_STORAGE_KEY = '@footprint_shows_buildings';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  isDark: true,
  colors: darkColors,
  showsBuildings: true,
  setTheme: () => {},
  toggleTheme: () => {},
  setShowsBuildings: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>('dark');
  const [showsBuildings, setShowsBuildingsState] = useState<boolean>(true);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
      } else {
        // Fallback default
        setThemeState('dark');
      }
    });
    AsyncStorage.getItem(BUILDINGS_STORAGE_KEY).then((stored) => {
      if (stored !== null) {
        setShowsBuildingsState(stored === 'true');
      }
    });
  }, []);

  const setTheme = (newTheme: AppTheme) => {
    setThemeState(newTheme);
    AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme).catch(() => {});
  };

  const setShowsBuildings = (val: boolean) => {
    setShowsBuildingsState(val);
    AsyncStorage.setItem(BUILDINGS_STORAGE_KEY, val ? 'true' : 'false').catch(() => {});
  };

  const toggleTheme = () => {
    const next: AppTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  const activeColors = THEME_PALETTES[theme] || darkColors;
  const isDark = activeColors.isDark;

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        colors: activeColors,
        showsBuildings,
        setTheme,
        toggleTheme,
        setShowsBuildings,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
