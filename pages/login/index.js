const api = require('../../utils/api');
const auth = require('../../utils/auth');
const theme = require('../../utils/theme');

Page({
  data: {
    username: '2023001',
    password: '123456',
    themeMode: 'classic',
    themeClass: 'theme-classic',
    themeLabel: '标准版',
    sampleAccounts: [
      { username: '2023001', roleLabel: '入党申请人', name: '张明远' },
      { username: 'zz001', roleLabel: '组织员', name: '王组织' },
      { username: 'zb001', roleLabel: '党支部书记', name: '李支书' },
      { username: 'org001', roleLabel: '校党委组织部人员', name: '周部长' },
      { username: 'admin', roleLabel: '超级管理员', name: '系统管理员' },
    ],
  },

  onLoad() {
    theme.applyTheme(this);
    const user = auth.getUser();
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

  toggleTheme() {
    theme.toggleThemeMode();
    theme.applyTheme(this);
  },

  async handleLogin() {
    try {
      wx.showLoading({ title: '登录中' });
      const result = await api.login({
        username: this.data.username,
        password: this.data.password,
      });
      auth.setToken(result.token);
      auth.setUser(result.user);
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

  async handleWechatLogin() {
    try {
      wx.showLoading({ title: '微信登录中' });
      const loginResult = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject,
        });
      });
      const result = await api.wechatLogin({ code: loginResult.code });
      auth.setToken(result.token);
      auth.setUser(result.user);
      wx.hideLoading();
      wx.redirectTo({ url: '/pages/dashboard/index' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: error.message || '微信快捷登录失败',
        icon: 'none',
      });
    }
  },

  goRegister() {
    wx.navigateTo({ url: '/pages/register/index' });
  },
});
