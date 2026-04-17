const store = require('../../utils/demo-store');

Page({
  data: {
    profile: {},
  },

  onShow() {
    this.setData({ profile: store.getProfile() });
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`profile.${field}`]: e.detail.value,
    });
  },

  saveProfile() {
    store.saveProfile(this.data.profile);
    wx.showToast({ title: '资料已保存', icon: 'success' });
  },
});
