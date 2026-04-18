import { computed, reactive } from 'vue';

const TOKEN_KEY = 'dj_mobile_admin_token';
const USER_KEY = 'dj_mobile_admin_user';

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

export function roleTabs(user) {
  if (!user) return [];
  if (user.primaryRole === 'applicant') {
    return [
      { name: 'dashboard', label: '工作台', icon: 'wap-home-o' },
      { name: 'profile', label: '资料', icon: 'contact-o' },
    ];
  }
  return [
    { name: 'dashboard', label: '工作台', icon: 'wap-home-o' },
    { name: 'applicants', label: '台账', icon: 'friends-o' },
    { name: 'reviews', label: '审核', icon: 'todo-list-o' },
    { name: 'profile', label: '我的', icon: 'contact-o' },
  ];
}

export function roleActions(user) {
  if (!user) return [];
  if (user.primaryRole === 'applicant') {
    return [
      { title: '我的资料', desc: '维护个人基础信息与材料', route: '/profile' },
      { title: '桌面后台', desc: '打开桌面端正式后台', external: true },
    ];
  }
  return [
    { title: '申请人台账', desc: '查看权限范围内的人员与阶段', route: '/applicants' },
    { title: '待办审核', desc: '集中处理流程待审节点', route: '/reviews' },
    { title: '桌面后台', desc: '打开桌面端正式后台', external: true },
  ];
}
