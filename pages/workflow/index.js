const api = require('../../utils/api');
const auth = require('../../utils/auth');
const theme = require('../../utils/theme');

Page({
  data: {
    user: null,
    workflow: [],
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
      const workflowData = await api.getMyWorkflow();
      const steps = (workflowData.steps || []).map((item, index) => ({
        ...item,
        index: index + 1,
        isDone: item.status === 'approved',
      }));
      this.setData({ user, workflow: steps });
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  openStep(e) {
    const { code } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/step-detail/index?stepCode=${code}` });
  },
});
