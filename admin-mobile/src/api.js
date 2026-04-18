import axios from 'axios';
import { showFailToast } from 'vant';
import { API_BASE } from './config';
import { clearSession, sessionState } from './session';

export const http = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
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
