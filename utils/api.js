const { currentConfig, isDemoMode } = require('./config');
const auth = require('./auth');
const demoStore = require('./demo-store');

const DEMO_MENUS = ['dashboard', 'workflowDetail', 'applicants', 'reviews', 'analytics', 'exports'];

function ensureDemoSeed() {
  if (isDemoMode) {
    demoStore.ensureSeed();
  }
}

function runWithMode(demoHandler, remoteHandler) {
  ensureDemoSeed();
  if (isDemoMode) {
    return Promise.resolve().then(demoHandler);
  }
  return remoteHandler();
}

function getDemoUserOrThrow() {
  const user = demoStore.getCurrentUser();
  if (!user) {
    throw new Error('未登录');
  }
  return user;
}

function buildDemoUser(user) {
  return {
    ...user,
    primaryRole: user.role,
    menus: DEMO_MENUS,
  };
}

function request({ url, method = 'GET', data, header = {} }) {
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
  return runWithMode(() => {
    const user = demoStore.loginLocal(payload.username, payload.password);
    if (!user) {
      throw new Error('账号或密码错误');
    }
    return {
      token: 'demo-token',
      user: buildDemoUser(user),
    };
  }, () => request({ url: '/auth/login', method: 'POST', data: payload }));
}

function register(payload) {
  return runWithMode(() => {
    demoStore.registerDraft(payload);
    return true;
  }, () => request({ url: '/auth/register', method: 'POST', data: payload }));
}

function wechatLogin(payload) {
  return runWithMode(
    () => Promise.reject(new Error('演示模式不启用微信快捷登录')),
    () => request({ url: '/wechat/login', method: 'POST', data: payload }),
  );
}

function getWechatBindStatus() {
  return runWithMode(
    () => ({ bound: false, binding: null }),
    () => request({ url: '/wechat/bind/status' }),
  );
}

function wechatBindStart(payload) {
  return runWithMode(
    () => Promise.reject(new Error('演示模式不启用微信绑定')),
    () => request({ url: '/wechat/bind/start', method: 'POST', data: payload }),
  );
}

function wechatBindConfirm(payload) {
  return runWithMode(
    () => Promise.reject(new Error('演示模式不启用微信绑定')),
    () => request({ url: '/wechat/bind/confirm', method: 'POST', data: payload }),
  );
}

function unbindWechat() {
  return runWithMode(
    () => true,
    () => request({ url: '/wechat/unbind', method: 'POST', data: {} }),
  );
}

function me() {
  return runWithMode(
    () => buildDemoUser(getDemoUserOrThrow()),
    () => request({ url: '/auth/me' }),
  );
}

function getDashboard() {
  return runWithMode(
    () => demoStore.getDashboardData(getDemoUserOrThrow()),
    () => request({ url: '/dashboard/me' }),
  );
}

function getMyWorkflow() {
  return runWithMode(() => {
    const user = getDemoUserOrThrow();
    return {
      instance: {
        applicantId: user.id,
        currentStage: user.currentStage || '入党积极分子',
      },
      steps: demoStore.getWorkflow(),
    };
  }, () => request({ url: '/workflows/me' }));
}

function getWorkflow(applicantId) {
  return runWithMode(
    () => getMyWorkflow(),
    () => request({ url: `/workflows/${applicantId}` }),
  );
}

function submitWorkflowStep(applicantId, stepCode, payload) {
  return runWithMode(() => {
    demoStore.updateStep(stepCode, {
      status: 'reviewing',
      formData: payload.formData || payload || {},
      reviewComment: payload.reviewComment || '',
      attachments: payload.formData?.attachments || [],
    });
    return true;
  }, () => request({
    url: `/workflows/${applicantId}/steps/${stepCode}/submit`,
    method: 'POST',
    data: payload,
  }));
}

function reviewWorkflowStep(applicantId, stepCode, payload) {
  return runWithMode(() => {
    demoStore.updateStep(stepCode, {
      status: payload.status,
      reviewComment: payload.comment || '',
    });
    return true;
  }, () => request({
    url: `/workflows/${applicantId}/steps/${stepCode}/review`,
    method: 'POST',
    data: payload,
  }));
}

function getMyProfile() {
  return runWithMode(() => {
    const user = getDemoUserOrThrow();
    return {
      ...demoStore.getProfile(),
      currentStage: user.currentStage || '入党积极分子',
      orgName: user.orgName || '文学院党委',
      branchName: user.branchName || '文学院学生第一党支部',
      username: user.username || '2023001',
    };
  }, () => request({ url: '/profile/me' }));
}

function updateMyProfile(payload) {
  return runWithMode(() => {
    demoStore.saveProfile(payload);
    return true;
  }, () => request({ url: '/profile/me', method: 'PUT', data: payload }));
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
