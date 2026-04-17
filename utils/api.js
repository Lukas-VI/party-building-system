const store = require('./demo-store');

function request({ url, method = 'GET', data }) {
  const app = getApp ? getApp() : null;
  const apiBase = app && app.globalData ? app.globalData.apiBase : 'http://127.0.0.1:3000/api';
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBase}${url}`,
      method,
      data,
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
          return;
        }
        reject(new Error(response.data?.message || 'request failed'));
      },
      fail: reject,
    });
  });
}

function login(payload) {
  return request({
    url: '/auth/login',
    method: 'POST',
    data: payload,
  }).catch(() => {
    const user = store.loginLocal(payload.username, payload.password);
    if (!user) {
      throw new Error('账号或密码错误');
    }
    return { user, source: 'local-mock' };
  });
}

module.exports = {
  request,
  login,
};
