module.exports = {
  apps: [
    {
      name: 'party-building-server',
      script: './src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
