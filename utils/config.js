const MODE = 'demo';
const ENV = 'dev';

const ENV_CONFIG = {
  demo: {
    apiBase: '',
    modeLabel: '演示模式',
  },
  dev: {
    apiBase: 'https://havensky.cn/DJ_api',
    modeLabel: '开发联调模式',
  },
  prod: {
    apiBase: 'https://havensky.cn/DJ_api',
    modeLabel: '生产模式',
  },
};

module.exports = {
  MODE,
  ENV,
  ENV_CONFIG,
  currentConfig: ENV_CONFIG[MODE === 'demo' ? 'demo' : ENV],
  isDemoMode: MODE === 'demo',
};
