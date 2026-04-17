const api = require('../../utils/api');
const auth = require('../../utils/auth');
const theme = require('../../utils/theme');

Page({
  data: {
    user: null,
    step: null,
    summary: '',
    note: '',
    attachments: [],
    themeMode: 'classic',
    themeClass: 'theme-classic',
    themeLabel: '样式1',
  },

  async onLoad(options) {
    theme.applyTheme(this);
    const user = auth.requireLogin();
    if (!user) {
      return;
    }
    try {
      wx.showLoading({ title: '加载中' });
      const workflow = await api.getMyWorkflow();
      const step = (workflow.steps || []).find((item) => item.stepCode === options.stepCode);
      if (!step) {
        wx.hideLoading();
        wx.showToast({ title: '未找到流程步骤', icon: 'none' });
        return;
      }
      this.setData({
        user,
        applicantId: workflow.instance?.applicantId || user.id,
        step,
        summary: step?.formData?.summary || '',
        note: step?.formData?.note || '',
        attachments: step?.attachments || [],
      });
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [field]: e.detail.value });
  },

  chooseImage() {
    wx.chooseImage({
      count: 1,
      success: async (result) => {
        try {
          wx.showLoading({ title: '上传中' });
          const uploaded = await api.uploadFile(result.tempFilePaths[0]);
          this.setData({
            attachments: this.data.attachments.concat(uploaded),
          });
          wx.hideLoading();
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || '上传失败', icon: 'none' });
        }
      },
    });
  },

  async saveAs(e) {
    const { status } = e.currentTarget.dataset;
    try {
      wx.showLoading({ title: '提交中' });
      if (status === 'reviewing') {
        await api.submitWorkflowStep(this.data.applicantId, this.data.step.stepCode, {
          formData: {
            summary: this.data.summary,
            note: this.data.note,
            attachments: this.data.attachments,
          },
          reviewComment: '申请人提交更新',
        });
      } else {
        await api.reviewWorkflowStep(this.data.applicantId, this.data.step.stepCode, {
          status,
          comment: status === 'approved' ? '审核通过' : '补充后重新提交',
        });
      }
      const workflow = await api.getMyWorkflow();
      const updated = (workflow.steps || []).find((item) => item.stepCode === this.data.step.stepCode);
      this.setData({
        step: updated,
        attachments: updated?.attachments || this.data.attachments,
      });
      wx.hideLoading();
      wx.showToast({
        title: status === 'approved' ? '已通过' : status === 'rejected' ? '已退回' : '已提交',
        icon: 'success',
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    }
  },
});
