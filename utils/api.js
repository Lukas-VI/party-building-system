const { currentConfig } = require('./config');
const auth = require('./auth');

function request({ url, method = 'GET', data, header = {} }) {
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
  return request({ url: '/auth/login', method: 'POST', data: payload });
}

function register(payload) {
  return request({ url: '/auth/register', method: 'POST', data: payload });
}

function me() {
  return request({ url: '/auth/me' });
}

function getDashboard() {
  return request({ url: '/dashboard/me' });
}

function getMyWorkflow() {
  return request({ url: '/workflows/me' });
}

function getWorkflow(applicantId) {
  return request({ url: `/workflows/${applicantId}` });
}

function submitWorkflowStep(applicantId, stepCode, payload) {
  return request({
    url: `/workflows/${applicantId}/steps/${stepCode}/submit`,
    method: 'POST',
    data: payload,
  });
}

function reviewWorkflowStep(applicantId, stepCode, payload) {
  return request({
    url: `/workflows/${applicantId}/steps/${stepCode}/review`,
    method: 'POST',
    data: payload,
  });
}

function getMyProfile() {
  return request({ url: '/profile/me' });
}

function updateMyProfile(payload) {
  return request({ url: '/profile/me', method: 'PUT', data: payload });
}

module.exports = {
  request,
  uploadFile,
  login,
  register,
  me,
  getDashboard,
  getMyWorkflow,
  getWorkflow,
  submitWorkflowStep,
  reviewWorkflowStep,
  getMyProfile,
  updateMyProfile,
};
