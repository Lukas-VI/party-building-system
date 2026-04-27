import { computed, reactive } from 'vue';
import { DESKTOP_ADMIN_URL } from './config';

const TOKEN_KEY = 'dj_wx_app_token';
const USER_KEY = 'dj_wx_app_user';

function readUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export const sessionState = reactive({
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: readUser(),
});

export const isLoggedIn = computed(() => Boolean(sessionState.token && sessionState.user));

export function setSession(token, user) {
  sessionState.token = token;
  sessionState.user = user;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  sessionState.token = '';
  sessionState.user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isApplicant(user) {
  return user?.primaryRole === 'applicant';
}

export function hasPermission(user, permissionId) {
  return Boolean(user?.permissions?.some((item) => item.id === permissionId));
}

export function roleTabs(user) {
  return [
    { name: 'workbench', label: '首页', icon: 'wap-home-o' },
    { name: 'messages', label: '消息', icon: 'bell' },
    { name: 'profile', label: '我的', icon: 'contact-o' },
  ];
}

export function primaryRoleLabel(user) {
  return user?.roles?.[0]?.label || '系统角色';
}

export function workbenchActions(user) {
  if (isApplicant(user)) {
    return [
      { title: '我的流程', desc: '查看当前步骤、已完成步骤和后续要求', route: '/workflow/me' },
      { title: '我的资料', desc: '维护基础信息、本人经历和关键联系方式', route: '/profile/edit' },
    ];
  }
  const actions = [
    { title: '待办工作', desc: '集中处理待审核、待确认和待通知任务', route: '/workbench' },
    { title: '审核处理', desc: '查看流程审核任务，并在有权限时处理注册审核', route: '/reviews' },
    { title: '消息提醒', desc: '查看节点提醒、审核结果和改期通知', route: '/messages' },
  ];
  actions.push({ title: '桌面后台', desc: '进入 PC 端处理台账、统计和复杂配置', external: DESKTOP_ADMIN_URL });
  return actions;
}
