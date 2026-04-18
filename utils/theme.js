const THEME_KEY = 'dj_theme_mode';
const DEFAULT_THEME = 'classic';
const DEFAULT_COLOR_SCHEME = 'light';

function normalizeColorScheme(theme) {
  return theme === 'dark' ? 'dark' : DEFAULT_COLOR_SCHEME;
}

function getSystemColorScheme() {
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app?.globalData?.systemTheme) {
      return normalizeColorScheme(app.globalData.systemTheme);
    }
    return normalizeColorScheme(wx.getSystemInfoSync().theme);
  } catch (error) {
    return DEFAULT_COLOR_SCHEME;
  }
}

function getThemeMode() {
  try {
    return wx.getStorageSync(THEME_KEY) || DEFAULT_THEME;
  } catch (error) {
    return DEFAULT_THEME;
  }
}

function setThemeMode(mode) {
  const nextMode = mode === 'propaganda' ? 'propaganda' : 'classic';
  wx.setStorageSync(THEME_KEY, nextMode);
  return nextMode;
}

function toggleThemeMode() {
  return setThemeMode(getThemeMode() === 'propaganda' ? 'classic' : 'propaganda');
}

function buildThemeState() {
  const mode = getThemeMode();
  const colorScheme = getSystemColorScheme();
  const modeClass = mode === 'propaganda' ? 'theme-propaganda' : 'theme-classic';
  const colorSchemeClass = colorScheme === 'dark' ? 'theme-dark' : 'theme-light';
  return {
    themeMode: mode,
    themeClass: `${modeClass} ${colorSchemeClass}`,
    themeLabel: mode === 'propaganda' ? '样式2' : '样式1',
    colorScheme,
    colorSchemeLabel: colorScheme === 'dark' ? '暗色' : '亮色',
    isDarkMode: colorScheme === 'dark',
  };
}

function applyTheme(page) {
  const state = buildThemeState();
  page.setData(state);
  return state;
}

function bindTheme(page) {
  applyTheme(page);
  if (typeof wx.onThemeChange !== 'function' || page.__themeChangeHandler) {
    return;
  }
  const handler = ({ theme }) => {
    try {
      const app = typeof getApp === 'function' ? getApp() : null;
      if (app?.globalData) {
        app.globalData.systemTheme = normalizeColorScheme(theme);
      }
    } catch (error) {
      // ignore
    }
    applyTheme(page);
  };
  page.__themeChangeHandler = handler;
  wx.onThemeChange(handler);
}

function unbindTheme(page) {
  if (typeof wx.offThemeChange === 'function' && page.__themeChangeHandler) {
    wx.offThemeChange(page.__themeChangeHandler);
  }
  delete page.__themeChangeHandler;
}

module.exports = {
  getThemeMode,
  setThemeMode,
  toggleThemeMode,
  getSystemColorScheme,
  buildThemeState,
  applyTheme,
  bindTheme,
  unbindTheme,
};
