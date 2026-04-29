import React, { createContext, useContext, useState, useEffect } from 'react';
import { Themes, ThemeColors } from '@/constants/Themes';
import { getTheme, setTheme as saveTheme } from '@/core/userSettings';

type ThemeContextType = {
  theme: ThemeColors;
  themeName: string;
  setTheme: (name: string) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {

  const [themeName, setThemeName] = useState<string>('sunset_blush');

  useEffect(() => {
    getTheme().then(setThemeName);
  }, []);

  const setTheme = async (name: string) => {
    setThemeName(name);
    await saveTheme(name);
  };

  const theme = Themes[themeName] || Themes.sunset_blush;

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
