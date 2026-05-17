import React, { createContext, useContext, useState, useEffect } from 'react';
import { Themes } from './index';
import type { ThemeColors } from './types';
import { getTheme, setTheme as saveTheme } from '@/core/userSettings';

type ThemeContextType = {
  theme: ThemeColors;
  themeName: string;
  setTheme: (name: string) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<string>('neon_dark');

  useEffect(() => {
    getTheme().then(saved => {
      if (saved && Themes[saved]) {
        setThemeName(saved);
      }
    });
  }, []);

  const setTheme = async (name: string) => {
    setThemeName(name);
    await saveTheme(name);
  };

  const theme = Themes[themeName] ?? Themes.neon_dark;

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
}
