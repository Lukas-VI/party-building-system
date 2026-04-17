const { currentConfig } = require('./utils/config');

App({
  globalData: {
    apiBase: currentConfig.apiBase,
    appName: '中国共产党党员发展电子系统',
  },
});
