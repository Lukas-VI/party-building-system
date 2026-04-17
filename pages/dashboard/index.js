const store = require('../../utils/demo-store');

Page({
  data: {
    user: null,
    dashboard: null,
    shortcuts: [],
  },

  onShow() {
    const user = store.getCurrentUser();
    if (!user) {
      wx.redirectTo({ url: '/pages/login/index' });
      return;
    }
    this.setData({
      user,
      dashboard: store.getDashboardData(user),
      shortcuts: this.buildShortcuts(user),
    });
  },

  buildShortcuts(user) {
    const actions = [
      { title: '流程进度', desc: '查看 25 步流程与状态', url: '/pages/workflow/index' },
      { title: '个人信息', desc: '维护申请人基础资料', url: '/pages/profile/index' },
    ];
    if (user.role !== 'applicant') {
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
    store.logoutLocal();
    wx.redirectTo({ url: '/pages/login/index' });
  },
});
