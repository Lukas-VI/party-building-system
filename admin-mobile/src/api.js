import axios from 'axios';
import { showFailToast } from 'vant';
import { API_BASE } from './config';
import { clearSession, sessionState } from './session';

export const http = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

http.interceptors.request.use((config) => {
  if (sessionState.token) {
    config.headers.Authorization = `Bearer ${sessionState.token}`;
  }
  return config;
});

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
    showFailToast(message);
    return Promise.reject(error);
  },
);

export function loginByPassword(form) {
  return http.post('/auth/login', form, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export function fetchWorkbench() {
  return http.get('/mobile/workbench');
}

export function fetchTodos() {
  return http.get('/mobile/todos');
}

export function fetchMessages() {
  return http.get('/mobile/messages');
}

export function fetchMobileProfile() {
  return http.get('/mobile/profile');
}

export function saveMobileProfile(payload) {
  return http.put('/mobile/profile', payload);
}

export function fetchMobileWorkflow(workflowId = 'me') {
  return http.get(`/mobile/workflows/${workflowId}`);
}

export function submitMobileTask(workflowId, taskId, payload) {
  return http.post(`/mobile/workflows/${workflowId}/tasks/${taskId}/submit`, payload);
}

export function reviewMobileTask(workflowId, taskId, payload) {
  return http.post(`/mobile/workflows/${workflowId}/tasks/${taskId}/review`, payload);
}

export function rescheduleMobileTask(workflowId, taskId, payload) {
  return http.post(`/mobile/workflows/${workflowId}/tasks/${taskId}/reschedule`, payload);
}

export function uploadMobileFile(formData) {
  return http.post('/mobile/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function fetchWechatBindStatus() {
  return http.get('/wechat/bind/status');
}

export function startWechatOauth(redirectPath = '/wx-app/') {
  return http.get('/wechat/oauth/start', {
    params: { redirectPath },
  });
}
