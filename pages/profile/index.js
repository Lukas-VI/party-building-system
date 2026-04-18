const api = require('../../utils/api');
const auth = require('../../utils/auth');
const theme = require('../../utils/theme');
const roleConfig = require('../../utils/role-config');

Page({
  data: {
    user: null,
    profile: {},
    profileLayout: { sections: [] },
    renderSections: [],
    wechatStatus: {
      bound: false,
      binding: null,
    },
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
      const [profile, wechatStatus] = await Promise.all([api.getMyProfile(), api.getWechatBindStatus()]);
      const profileLayout = roleConfig.profileLayout(user);
      this.setData({
        user,
        profile,
        wechatStatus,
        profileLayout,
        renderSections: this.buildRenderSections(profileLayout, profile),
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

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    if (!field) return;
    const profile = {
      ...this.data.profile,
      [field]: e.detail.value,
    };
    this.setData({
      profile,
      renderSections: this.buildRenderSections(this.data.profileLayout, profile),
    });
  },

  buildRenderSections(profileLayout, profile) {
    return (profileLayout.sections || []).map((section) => ({
      ...section,
      fields: (section.fields || []).map((field) => ({
        ...field,
        value: profile[field.key] || '',
      })),
    }));
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

  async bindWechat() {
    try {
      wx.showLoading({ title: '绑定中' });
      const loginResult = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject,
        });
      });
      const bindStart = await api.wechatBindStart({ code: loginResult.code });
      await api.wechatBindConfirm({
        bindToken: bindStart.bindToken,
        nickname: '',
        avatarUrl: '',
      });
      const wechatStatus = await api.getWechatBindStatus();
      this.setData({ wechatStatus });
      wx.hideLoading();
      wx.showToast({ title: '微信账号已绑定', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '绑定失败', icon: 'none' });
    }
  },

  async unbindWechat() {
    try {
      wx.showLoading({ title: '解绑中' });
      await api.unbindWechat();
      const wechatStatus = await api.getWechatBindStatus();
      this.setData({ wechatStatus });
      wx.hideLoading();
      wx.showToast({ title: '已解除绑定', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '解绑失败', icon: 'none' });
    }
  },

  toggleTheme() {
    theme.toggleThemeMode();
    theme.applyTheme(this);
  },
});
