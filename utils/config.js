const MODE = 'demo';
const ENV = 'dev';

const ENV_CONFIG = {
  demo: {
    apiBase: '',
    modeLabel: '演示模式',
  },
  dev: {
    apiBase: 'http://192.168.31.135/api',
    modeLabel: '开发联调模式',
  },
  prod: {
    apiBase: 'https://api.your-domain.com/api',
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
