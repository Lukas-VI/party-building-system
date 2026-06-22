import { createRouter, createWebHashHistory } from 'vue-router';
import { isLoggedIn } from './session';

/**
 * 服务号网页 App 路由入口。
 *
 * 当前沿用稳定的 Vue Router + Hash History 方案，是为了：
 * - 适配微信内 H5 和简单反代部署
 * - 避免把业务路径规则散落到多个组件中
 *
 * 关联文档：
 * - docs/project-overview.md
 * - docs/maintenance-notes.md
 * - docs/electronic-dossier.md
 */
const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('./views/RegisterView.vue'),
    meta: { title: '首次注册' },
  },
  {
    path: '/wechat-callback',
    name: 'wechat-callback',
    component: () => import('./views/WechatCallbackView.vue'),
    meta: { title: '微信授权登录' },
  },
  {
    path: '/wechat-bind',
    name: 'wechat-bind',
    component: () => import('./views/WechatBindView.vue'),
    meta: { title: '绑定微信账号' },
  },
  {
    path: '/',
    component: () => import('./layout/MobileLayout.vue'),
    children: [
      { path: '', redirect: '/workbench' },
      { path: 'workbench', name: 'workbench', component: () => import('./views/WorkbenchView.vue'), meta: { title: '工作台' } },
      { path: 'workflow/:workflowId', name: 'workflow', component: () => import('./views/WorkflowView.vue'), meta: { title: '流程办理' } },
      { path: 'workflow/:workflowId/steps/:stepCode', name: 'workflow-step-detail', component: () => import('./views/WorkflowStepDetailView.vue'), meta: { title: '节点详情' } },
      { path: 'applicants', name: 'applicants', component: () => import('./views/ApplicantsView.vue'), meta: { title: '申请人台账' } },
      { path: 'applicants/:id', name: 'applicant-detail', component: () => import('./views/ApplicantDetailView.vue'), meta: { title: '申请人详情' } },
      { path: 'reviews', name: 'reviews', component: () => import('./views/ReviewsView.vue'), meta: { title: '注册审核' } },
      { path: 'workflow-reviews', name: 'workflow-reviews', component: () => import('./views/WorkflowReviewsView.vue'), meta: { title: '流程审核' } },
      { path: 'messages', name: 'messages', component: () => import('./views/MessagesView.vue'), meta: { title: '消息中心' } },
      { path: 'profile', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { title: '我的' } },
      { path: 'profile/edit', name: 'profile-edit', component: () => import('./views/ProfileEditView.vue'), meta: { title: '个人资料' } },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(import.meta.env.VITE_MOBILE_PATH || '/wx-app/'),
  routes,
});

/**
 * 这里集中做登录态和角色入口校验。
 * 角色差异优先通过路由守卫和统一 tabs 控制，不要在每个页面里重复拦截。
 */
router.beforeEach((to) => {
   // 微信 OAuth 回调：参数可能在 window.location.search（哈希之前），需转发到 hash 路由
   const urlParams = new URLSearchParams(window.location.search);
   const oauthCode = urlParams.get('code');
   const oauthState = urlParams.get('state');
    if (oauthCode && to.path !== '/wechat-callback' && to.path !== '/wechat-bind' && to.path !== '/login') {
     const params = new URLSearchParams();
     params.set('code', oauthCode);
     if (oauthState) params.set('state', oauthState);
      // 清理 search 中的 code/state，用 history.replaceState 避免重复触发
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
      return { path: '/wechat-callback', query: { code: oauthCode, state: oauthState } };
   }

  const publicPages = ['/login', '/register', '/wechat-callback', '/wechat-bind'];
  if (!publicPages.includes(to.path) && !isLoggedIn.value) return '/login';
   // 微信 OAuth 回调中有 code 参数时允许访问（即使已登录）
    // 微信 OAuth 绑定流程也允许已登录用户访问
    if (publicPages.includes(to.path) && isLoggedIn.value && to.path !== '/wechat-callback' && to.path !== '/wechat-bind') return '/workbench';
  return true;
});

// 文档标题在路由层统一设置，避免各页面重复维护相同站点名。
router.afterEach((to) => {
  document.title = `${to.meta.title || '服务号工作台'} - 党员发展管理系统`;
});

export default router;
