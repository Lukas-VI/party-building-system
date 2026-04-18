const THEME_KEY = 'dj_theme_mode';
const DEFAULT_THEME = 'classic';

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
  return {
    themeMode: mode,
    themeClass: mode === 'propaganda' ? 'theme-propaganda' : 'theme-classic',
    themeLabel: mode === 'propaganda' ? '样式2' : '样式1',
  };
}

function applyTheme(page) {
  const state = buildThemeState();
  page.setData(state);
  return state;
}

function bindTheme(page) {
  applyTheme(page);
}

function unbindTheme() {}

module.exports = {
  getThemeMode,
  setThemeMode,
  toggleThemeMode,
  buildThemeState,
  applyTheme,
  bindTheme,
  unbindTheme,
};
