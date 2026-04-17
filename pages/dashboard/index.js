const api = require('../../utils/api');
const auth = require('../../utils/auth');
const theme = require('../../utils/theme');

Page({
  data: {
    user: null,
    dashboard: null,
    shortcuts: [],
    themeMode: 'classic',
    themeClass: 'theme-classic',
    themeLabel: '样式1',
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
        shortcuts: this.buildShortcuts(freshUser),
      });
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  buildShortcuts(user) {
    const actions = [
      { title: '流程进度', desc: '查看 25 步流程与状态', url: '/pages/workflow/index' },
      { title: '个人信息', desc: '维护申请人基础资料', url: '/pages/profile/index' },
    ];
    if (user.primaryRole !== 'applicant') {
      actions.push({ title: 'PC 后台', desc: '查看统计、审核与导出', url: '' });
    }
    return actions;
  },

  goAction(e) {
    const { url } = e.currentTarget.dataset;
    if (!url) {
      wx.showModal({
        title: 'PC 后台',
        content: '请在浏览器打开 admin-web 项目，使用同一组演示账号登录后台。',
        showCancel: false,
      });
      return;
    }
    wx.navigateTo({ url });
  },

  logout() {
    auth.clearAuth();
    wx.redirectTo({ url: '/pages/login/index' });
  },
});
