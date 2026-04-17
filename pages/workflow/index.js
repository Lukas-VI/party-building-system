const store = require('../../utils/demo-store');

Page({
  data: {
    user: null,
    workflow: [],
  },

  onShow() {
    const user = store.getCurrentUser();
    if (!user) {
      wx.redirectTo({ url: '/pages/login/index' });
      return;
    }
    this.setData({
      user,
      workflow: store.getWorkflow(),
    });
  },

  openStep(e) {
    const { code } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/step-detail/index?stepCode=${code}` });
  },
});
