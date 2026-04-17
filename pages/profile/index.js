const api = require('../../utils/api');

Page({
  data: {
    profile: {},
  },

  async onShow() {
    try {
      wx.showLoading({ title: '加载中' });
      const profile = await api.getMyProfile();
      this.setData({ profile });
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`profile.${field}`]: e.detail.value,
    });
  },

  async saveProfile() {
    try {
      wx.showLoading({ title: '保存中' });
      await api.updateMyProfile(this.data.profile);
      wx.hideLoading();
      wx.showToast({ title: '资料已保存', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    }
  },
});
