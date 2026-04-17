const store = require('../../utils/demo-store');

Page({
  data: {
    user: null,
    step: null,
    summary: '',
    note: '',
    attachments: [],
  },

  onLoad(options) {
    const user = store.getCurrentUser();
    if (!user) {
      wx.redirectTo({ url: '/pages/login/index' });
      return;
    }
    const step = store.getStep(options.stepCode);
    this.setData({
      user,
      step,
      summary: step?.formData?.summary || '',
      note: step?.formData?.note || '',
      attachments: step?.attachments || [],
    });
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value });
  },

  chooseImage() {
    wx.chooseImage({
      count: 1,
      success: (result) => {
        this.setData({
          attachments: this.data.attachments.concat(result.tempFilePaths),
        });
      },
    });
  },

  saveAs(e) {
    const { status } = e.currentTarget.dataset;
    const updated = store.updateStep(this.data.step.stepCode, {
      status,
      formData: {
        summary: this.data.summary,
        note: this.data.note,
      },
      attachments: this.data.attachments,
      lastOperator: this.data.user.name,
      reviewComment: status === 'rejected' ? '补充后重新提交' : '演示状态更新',
    });
    wx.showToast({
      title: status === 'approved' ? '已通过' : status === 'rejected' ? '已退回' : '已提交',
      icon: 'success',
    });
    this.setData({ step: updated });
  },
});
