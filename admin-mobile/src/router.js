import { createRouter, createWebHashHistory } from 'vue-router';
import { isLoggedIn, roleTabs, sessionState } from './session';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/',
    component: () => import('./layout/MobileLayout.vue'),
    children: [
      { path: '', redirect: '/workbench' },
      { path: 'workbench', name: 'workbench', component: () => import('./views/WorkbenchView.vue'), meta: { title: '工作台' } },
      { path: 'workflow/:workflowId', name: 'workflow', component: () => import('./views/WorkflowView.vue'), meta: { title: '流程办理' } },
      { path: 'messages', name: 'messages', component: () => import('./views/MessagesView.vue'), meta: { title: '消息中心' } },
      { path: 'materials', name: 'materials', component: () => import('./views/MaterialsView.vue'), meta: { title: '材料维护' } },
      { path: 'profile', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { title: '我的资料' } },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory('/wx-app/'),
  routes,
});

router.beforeEach((to) => {
  if (to.path !== '/login' && !isLoggedIn.value) return '/login';
  if (to.path === '/login' && isLoggedIn.value) return '/workbench';
  if (isLoggedIn.value) {
    const tabs = roleTabs(sessionState.user);
    if (to.name === 'materials' && !tabs.some((item) => item.name === 'materials')) {
      return '/profile';
    }
  }
  return true;
});

router.afterEach((to) => {
  document.title = `${to.meta.title || '服务号工作台'} - 党员发展管理系统`;
});

export default router;
