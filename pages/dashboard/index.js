const api = require('../../utils/api');
const auth = require('../../utils/auth');
const theme = require('../../utils/theme');
const roleConfig = require('../../utils/role-config');

Page({
  data: {
    user: null,
    dashboard: null,
    shortcuts: [],
    roleSummary: '',
    themeMode: 'classic',
    themeClass: 'theme-classic',
    themeLabel: '样式1',
  },

  onLoad() {
    theme.bindTheme(this);
  },

  async onShow() {
    theme.applyTheme(this);
    const user = auth.requireLogin();
    if (!user) {
      return;
    }
    try {
      wx.showLoading({ title: '加载中' });
      const [freshUser, dashboard] = await Promise.all([api.me(), api.getDashboard()]);
      auth.setUser(freshUser);
      this.setData({
        user: freshUser,
        dashboard,
        shortcuts: roleConfig.buildShortcuts(freshUser),
        roleSummary: roleConfig.dashboardIntro(freshUser),
      });
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  onUnload() {
    theme.unbindTheme(this);
  },

  goAction(e) {
    const { url } = e.currentTarget.dataset;
    wx.navigateTo({ url });
  },

  logout() {
    auth.clearAuth();
    wx.redirectTo({ url: '/pages/login/index' });
  },
});
