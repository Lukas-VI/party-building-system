const { currentConfig } = require('../../utils/config');
const theme = require('../../utils/theme');

Page({
  data: {
    src: '',
    invalidReason: '',
    pageTitle: 'PC 后台',
    themeClass: 'theme-classic theme-light',
  },

  onLoad(options = {}) {
    theme.bindTheme(this);
    this.setData({
      pageTitle: options.title ? decodeURIComponent(options.title) : 'PC 后台',
    });
    const adminWebUrl = currentConfig.adminWebUrl || '';
    let invalidReason = '';
    if (!adminWebUrl) {
      invalidReason = '当前环境尚未配置后台 HTTPS 地址，请先在 utils/config.js 中补充 adminWebUrl。';
    } else if (!/^https:\/\//i.test(adminWebUrl)) {
      invalidReason = '小程序 WebView 仅支持 HTTPS 后台地址，请完成反向代理和证书配置后再使用。';
    }
    this.setData({
      src: invalidReason ? '' : adminWebUrl,
      invalidReason,
    });
    if (invalidReason) {
      wx.showModal({
        title: 'PC 后台暂不可用',
        content: invalidReason,
        showCancel: false,
      });
    }
  },

  onUnload() {
    theme.unbindTheme(this);
  },
});
