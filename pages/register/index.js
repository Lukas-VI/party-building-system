const store = require('../../utils/demo-store');

Page({
  data: {
    form: {
      name: '',
      idNo: '',
      username: '',
      roleLabel: '入党申请人',
    },
  },

  onChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: e.detail.value,
    });
  },

  handleSubmit() {
    const { name, idNo, username } = this.data.form;
    if (!name || !idNo || !username) {
      wx.showToast({ title: '请完整填写注册信息', icon: 'none' });
      return;
    }
    store.registerDraft(this.data.form);
    wx.showToast({ title: '已提交待审核', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 500);
  },
});
