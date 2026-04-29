export interface ThemeColors {
  name: string;
  gradient: [string, string, ...string[]];
  cardBackground: string;
  accent: string;
  text: string;
  subtext: string;
  tint: string;
  buttonBackground: string;
  glassBackground: string;
}

export const Themes: Record<string, ThemeColors> = {
  sunset_blush: {
    name: 'Sunset Blush',
    gradient: ['#422046', '#FF9A6F'],
    cardBackground: '#3D2B3D',
    accent: '#F97352',
    text: '#FFFFFF',
    subtext: '#B59EAA',
    tint: '#FF9A6F',
    buttonBackground: '#5C255C',
    glassBackground: 'rgba(255, 255, 255, 0.15)',
  },
  melon_fresh: {
    name: 'Melon Fresh',
    gradient: ['#FFB399', '#A8E6CF'],
    cardBackground: '#FDF8F5',
    accent: '#FF9F80',
    text: '#2B422A',
    subtext: '#8E837D',
    tint: '#2B422A',
    buttonBackground: '#C1E1C1',
    glassBackground: 'rgba(255, 255, 255, 0.4)',
  },
  zest_appeal: {
    name: 'Zest Appeal',
    gradient: ['#558B2F', '#1B3022'],
    cardBackground: '#2E4215',
    accent: '#C5E031',
    text: '#FFFFFF',
    subtext: '#A5D6A7',
    tint: '#C5E031',
    buttonBackground: '#3B5F14',
    glassBackground: 'rgba(255, 255, 255, 0.1)',
  },
  cosmic_dust: {
    name: 'Cosmic Dust',
    gradient: ['#1A1A2E', '#0F0C29'],
    cardBackground: '#252545',
    accent: '#FF4D00',
    text: '#FFFFFF',
    subtext: '#9B9B9B',
    tint: '#FF4D00',
    buttonBackground: '#302B63',
    glassBackground: 'rgba(255, 255, 255, 0.08)',
  },
};

