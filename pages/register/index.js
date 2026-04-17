const api = require('../../utils/api');
const theme = require('../../utils/theme');

Page({
  data: {
    form: {
      name: '',
      idNo: '',
      username: '',
      password: '',
      roleLabel: '入党申请人',
    },
    themeMode: 'classic',
    themeClass: 'theme-classic',
    themeLabel: '标准版',
  },

  onLoad() {
    theme.applyTheme(this);
  },

  onChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: e.detail.value,
    });
  },

  async handleSubmit() {
    const { name, idNo, username, password } = this.data.form;
    if (!name || !idNo || !username || !password) {
      wx.showToast({ title: '请完整填写注册信息', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '提交中' });
      await api.register({
        name,
        idNo,
        employeeNo: username,
        password,
      });
      wx.hideLoading();
      wx.showToast({ title: '已提交待审核', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    }
  },

  toggleTheme() {
    theme.toggleThemeMode();
    theme.applyTheme(this);
  },
});
