import axios from 'axios';
import { showFailToast } from 'vant';
import { API_BASE } from './config';
import { clearSession, sessionState } from './session';

/**
 * 服务号网页 App 统一 API 层。
 *
 * 当前不在页面组件里直接写 fetch / axios 请求，
 * 目的是把移动端入口、鉴权和接口演进都集中到这里管理。
 *
 * 关联文档：
 * - docs/maintenance-notes.md
 * - docs/project-overview.md
 */
export const http = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

/**
 * 所有移动端请求统一从这里注入 token。
 * 如果后续切换到服务号网页授权票据或双 token 机制，也应优先改这里。
 */
http.interceptors.request.use((config) => {
  if (sessionState.token) {
    config.headers.Authorization = `Bearer ${sessionState.token}`;
  }
  return config;
});

/**
 * 统一处理后端 `{ code, message, data }` 响应格式。
 * 页面层只消费 data，避免每个视图重复写状态判断和 401 处理。
 */
http.interceptors.response.use(
  (response) => {
    const payload = response.data;
    if (payload && typeof payload === 'object' && 'code' in payload) {
      if (payload.code !== 0) {
        return Promise.reject(new Error(payload.message || '请求失败'));
      }
      return payload.data;
    }
    return response.data;
  },
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message || '请求失败';
    if (status === 401) {
      clearSession();
      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login';
      }
    }
    const normalizedError = new Error(message);
    normalizedError.status = status;
    normalizedError.response = error.response;
    normalizedError.toastShown = true;
    showFailToast(message);
    return Promise.reject(normalizedError);
  },
);

// 认证与会话接口
export function loginByPassword(form) {
  return http.post('/auth/login', form, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export function registerAccount(form) {
  return http.post('/auth/register', form, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export function fetchPublicBootstrap() {
  return http.get('/public/bootstrap');
}

export function fetchRegistrationRequests(status = 'pending') {
  return http.get('/auth/registration-requests', {
    params: { status },
  });
}

export function approveRegistrationRequest(payload) {
  return http.post('/auth/approve-registration', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}

// 工作台、待办、消息三类首页数据
export function fetchWorkbench() {
  return http.get('/mobile/workbench');
}

export function fetchTodos() {
  return http.get('/mobile/todos');
}

export function fetchMessages() {
  return http.get('/mobile/messages');
}

export function fetchMessageDetail(messageId) {
  return http.get(`/mobile/messages/${messageId}`);
}

export function markMessageRead(messageId) {
  return http.post(`/mobile/messages/${messageId}/read`);
}

// 资料与流程接口
export function fetchMobileProfile() {
  return http.get('/mobile/profile');
}

export function saveMobileProfile(payload) {
  return http.put('/mobile/profile', payload);
}

export function fetchMobileWorkflow(workflowId = 'me') {
  return http.get(`/mobile/workflows/${workflowId}`);
}

// 任务类动作统一按 submit / review / reschedule 区分，便于后端继续细化 25 步
export function submitMobileTask(workflowId, taskId, payload) {
  return http.post(`/mobile/workflows/${workflowId}/tasks/${taskId}/submit`, payload);
}

export function reviewMobileTask(workflowId, taskId, payload) {
  return http.post(`/mobile/workflows/${workflowId}/tasks/${taskId}/review`, payload);
}

export function resetMobileTaskStatus(workflowId, taskId, payload) {
  return http.post(`/mobile/workflows/${workflowId}/tasks/${taskId}/status`, payload);
}

export function requestMobileTaskChange(workflowId, taskId, payload) {
  return http.post(`/mobile/workflows/${workflowId}/tasks/${taskId}/change-request`, payload);
}

export function rescheduleMobileTask(workflowId, taskId, payload) {
  return http.post(`/mobile/workflows/${workflowId}/tasks/${taskId}/reschedule`, payload);
}

export function uploadMobileFile(formData) {
  return http.post('/mobile/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

// 微信绑定与网页授权保持单独分组，避免和业务流程接口混杂
export function fetchWechatBindStatus() {
  return http.get('/wechat/bind/status');
}

export function startWechatOauth(redirectPath = '/wx-app/') {
  return http.get('/wechat/oauth/start', {
    params: { redirectPath },
  });
}
