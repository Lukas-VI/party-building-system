const { currentConfig } = require('./utils/config');
const theme = require('./utils/theme');

App({
  globalData: {
    apiBase: currentConfig.apiBase,
    appName: '中国共产党党员发展电子系统',
    systemTheme: 'light',
  },

  onLaunch() {
    this.globalData.systemTheme = theme.getSystemColorScheme();
    if (typeof wx.onThemeChange === 'function') {
      wx.onThemeChange(({ theme: nextTheme }) => {
        this.globalData.systemTheme = nextTheme === 'dark' ? 'dark' : 'light';
      });
    }
  },
});
