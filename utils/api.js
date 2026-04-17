const { currentConfig, isDemoMode } = require('./config');
const auth = require('./auth');
const demoStore = require('./demo-store');

function ensureDemoSeed() {
  if (isDemoMode) {
    demoStore.ensureSeed();
  }
}

function request({ url, method = 'GET', data, header = {} }) {
  ensureDemoSeed();
  if (isDemoMode) {
    return Promise.reject(new Error('当前为演示模式，未启用远程请求'));
  }
  const token = auth.getToken();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${currentConfig.apiBase}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...header,
      },
      success(response) {
        const payload = response.data || {};
        if (response.statusCode === 401) {
          auth.clearAuth();
          wx.redirectTo({ url: '/pages/login/index' });
          reject(new Error(payload.message || '登录状态已失效'));
          return;
        }
        if (response.statusCode >= 200 && response.statusCode < 300 && payload.code === 0) {
          resolve(payload.data);
          return;
        }
        reject(new Error(payload.message || '请求失败'));
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

function uploadFile(filePath) {
  ensureDemoSeed();
  if (isDemoMode) {
    const fileName = filePath.split('\\').pop().split('/').pop();
    return Promise.resolve({
      fileName,
      fileUrl: filePath,
      mimeType: 'image/jpeg',
      storageName: fileName,
    });
  }
  const token = auth.getToken();
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${currentConfig.apiBase}/files/upload`,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(response) {
        try {
          const payload = JSON.parse(response.data || '{}');
          if (response.statusCode >= 200 && response.statusCode < 300 && payload.code === 0) {
            resolve(payload.data);
            return;
          }
          reject(new Error(payload.message || '上传失败'));
        } catch (error) {
          reject(error);
        }
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

function login(payload) {
  ensureDemoSeed();
  if (isDemoMode) {
    const user = demoStore.loginLocal(payload.username, payload.password);
    if (!user) {
      return Promise.reject(new Error('账号或密码错误'));
    }
    return Promise.resolve({
      token: 'demo-token',
      user: {
        ...user,
        primaryRole: user.role,
        menus: ['dashboard', 'workflowDetail', 'applicants', 'reviews', 'analytics', 'exports'],
      },
    });
  }
  return request({ url: '/auth/login', method: 'POST', data: payload });
}

function register(payload) {
  ensureDemoSeed();
  if (isDemoMode) {
    demoStore.registerDraft(payload);
    return Promise.resolve(true);
  }
  return request({ url: '/auth/register', method: 'POST', data: payload });
}

function wechatLogin(payload) {
  ensureDemoSeed();
  if (isDemoMode) {
    return Promise.reject(new Error('演示模式不启用微信快捷登录'));
  }
  return request({ url: '/wechat/login', method: 'POST', data: payload });
}

function getWechatBindStatus() {
  ensureDemoSeed();
  if (isDemoMode) {
    return Promise.resolve({ bound: false, binding: null });
  }
  return request({ url: '/wechat/bind/status' });
}

function wechatBindStart(payload) {
  ensureDemoSeed();
  if (isDemoMode) {
    return Promise.reject(new Error('演示模式不启用微信绑定'));
  }
  return request({ url: '/wechat/bind/start', method: 'POST', data: payload });
}

function wechatBindConfirm(payload) {
  ensureDemoSeed();
  if (isDemoMode) {
    return Promise.reject(new Error('演示模式不启用微信绑定'));
  }
  return request({ url: '/wechat/bind/confirm', method: 'POST', data: payload });
}

function unbindWechat() {
  ensureDemoSeed();
  if (isDemoMode) {
    return Promise.resolve(true);
  }
  return request({ url: '/wechat/unbind', method: 'POST', data: {} });
}

function me() {
  ensureDemoSeed();
  if (isDemoMode) {
    const user = demoStore.getCurrentUser();
    if (!user) return Promise.reject(new Error('未登录'));
    return Promise.resolve({
      ...user,
      primaryRole: user.role,
      menus: ['dashboard', 'workflowDetail', 'applicants', 'reviews', 'analytics', 'exports'],
    });
  }
  return request({ url: '/auth/me' });
}

function getDashboard() {
  ensureDemoSeed();
  if (isDemoMode) {
    const user = demoStore.getCurrentUser();
    if (!user) return Promise.reject(new Error('未登录'));
    return Promise.resolve(demoStore.getDashboardData(user));
  }
  return request({ url: '/dashboard/me' });
}

function getMyWorkflow() {
  ensureDemoSeed();
  if (isDemoMode) {
    const user = demoStore.getCurrentUser();
    return Promise.resolve({
      instance: {
        applicantId: user?.id || 'u-applicant-001',
        currentStage: user?.currentStage || '入党积极分子',
      },
      steps: demoStore.getWorkflow(),
    });
  }
  return request({ url: '/workflows/me' });
}

function getWorkflow(applicantId) {
  ensureDemoSeed();
  if (isDemoMode) {
    return getMyWorkflow();
  }
  return request({ url: `/workflows/${applicantId}` });
}

function submitWorkflowStep(applicantId, stepCode, payload) {
  ensureDemoSeed();
  if (isDemoMode) {
    demoStore.updateStep(stepCode, {
      status: 'reviewing',
      formData: payload.formData || payload || {},
      reviewComment: payload.reviewComment || '',
      attachments: payload.formData?.attachments || [],
    });
    return Promise.resolve(true);
  }
  return request({
    url: `/workflows/${applicantId}/steps/${stepCode}/submit`,
    method: 'POST',
    data: payload,
  });
}

function reviewWorkflowStep(applicantId, stepCode, payload) {
  ensureDemoSeed();
  if (isDemoMode) {
    demoStore.updateStep(stepCode, {
      status: payload.status,
      reviewComment: payload.comment || '',
    });
    return Promise.resolve(true);
  }
  return request({
    url: `/workflows/${applicantId}/steps/${stepCode}/review`,
    method: 'POST',
    data: payload,
  });
}

function getMyProfile() {
  ensureDemoSeed();
  if (isDemoMode) {
    const user = demoStore.getCurrentUser();
    return Promise.resolve({
      ...demoStore.getProfile(),
      currentStage: user?.currentStage || '入党积极分子',
      orgName: user?.orgName || '文学院党委',
      branchName: user?.branchName || '文学院学生第一党支部',
      username: user?.username || '2023001',
    });
  }
  return request({ url: '/profile/me' });
}

function updateMyProfile(payload) {
  ensureDemoSeed();
  if (isDemoMode) {
    demoStore.saveProfile(payload);
    return Promise.resolve(true);
  }
  return request({ url: '/profile/me', method: 'PUT', data: payload });
}

module.exports = {
  request,
  uploadFile,
  login,
  register,
  wechatLogin,
  getWechatBindStatus,
  wechatBindStart,
  wechatBindConfirm,
  unbindWechat,
  me,
  getDashboard,
  getMyWorkflow,
  getWorkflow,
  submitWorkflowStep,
  reviewWorkflowStep,
  getMyProfile,
  updateMyProfile,
};
