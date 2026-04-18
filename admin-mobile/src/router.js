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
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { title: '工作台' } },
      { path: 'applicants', name: 'applicants', component: () => import('./views/ApplicantsView.vue'), meta: { title: '申请人台账' } },
      { path: 'applicants/:id', name: 'applicant-detail', component: () => import('./views/ApplicantDetailView.vue'), meta: { title: '流程详情' } },
      { path: 'reviews', name: 'reviews', component: () => import('./views/ReviewsView.vue'), meta: { title: '审核审批' } },
      { path: 'profile', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { title: '我的资料' } },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory('/m-admin/'),
  routes,
});

router.beforeEach((to) => {
  if (to.path !== '/login' && !isLoggedIn.value) return '/login';
  if (to.path === '/login' && isLoggedIn.value) return '/dashboard';
  if (isLoggedIn.value && ['applicants', 'reviews'].includes(String(to.name))) {
    const tabs = roleTabs(sessionState.user);
    if (!tabs.some((item) => item.name === to.name)) {
      return '/dashboard';
    }
  }
  return true;
});

router.afterEach((to) => {
  document.title = `${to.meta.title || '移动后台'} - 党员发展管理系统`;
});

export default router;
