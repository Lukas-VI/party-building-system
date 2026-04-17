const api = require('../../utils/api');
const store = require('../../utils/demo-store');

Page({
  data: {
    username: '2023001',
    password: '123456',
    sampleAccounts: store.DEMO_ACCOUNTS.map((item) => ({
      username: item.username,
      roleLabel: item.roleLabel,
      name: item.name,
    })),
  },

  onLoad() {
    store.ensureSeed();
    const user = store.getCurrentUser();
    if (user) {
      wx.redirectTo({ url: '/pages/dashboard/index' });
    }
  },

  onUsernameChange(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordChange(e) {
    this.setData({ password: e.detail.value });
  },

  fillSample(e) {
    const { username } = e.currentTarget.dataset;
    this.setData({ username, password: '123456' });
  },

  async handleLogin() {
    try {
      wx.showLoading({ title: '登录中' });
      const result = await api.login({
        username: this.data.username,
        password: this.data.password,
      });
      const user = result.user || result.data?.user;
      if (user) wx.setStorageSync('dj_user', user);
      wx.hideLoading();
      wx.redirectTo({ url: '/pages/dashboard/index' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: error.message || '登录失败',
        icon: 'none',
      });
    }
  },

  goRegister() {
    wx.navigateTo({ url: '/pages/register/index' });
  },
});
