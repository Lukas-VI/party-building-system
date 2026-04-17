const ENV = 'dev';

const ENV_CONFIG = {
  dev: {
    apiBase: 'http://127.0.0.1:3000/api',
  },
  prod: {
    apiBase: 'https://api.your-domain.com/api',
  },
};

module.exports = {
  ENV,
  ENV_CONFIG,
  currentConfig: ENV_CONFIG[ENV],
};
