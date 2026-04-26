<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog } from 'vant';
import { DESKTOP_ADMIN_URL } from '../config';
import { fetchMobileProfile, fetchWechatBindStatus, startWechatOauth } from '../api';
import { clearSession, primaryRoleLabel, sessionState } from '../session';

const router = useRouter();
const loading = ref(false);
const oauthLoading = ref(false);
const profile = ref(null);
const binding = ref({ bound: false, binding: null });

const scopeText = computed(() => {
  const user = sessionState.user;
  if (!user) return '当前账号';
  return [user.orgName, user.branchName].filter(Boolean).join(' ') || '全校范围';
});

const quickEntries = computed(() => [
  {
    key: 'profile',
    title: '个人资料',
    desc: '查看并修改基础信息、本人经历与联系方式',
    action: () => router.push({ name: 'profile-edit' }),
  },
  {
    key: 'bind',
    title: '微信绑定',
    desc: binding.value.bound ? '已完成绑定，可重新发起网页授权' : '未绑定，可发起微信网页授权',
    action: beginWechatOauth,
  },
  {
    key: 'desktop',
    title: 'PC 后台',
    desc: '打开桌面端后台，处理台账、统计和复杂配置',
    action: () => {
      window.location.href = DESKTOP_ADMIN_URL;
    },
  },
  {
    key: 'logout',
    title: '退出登录',
    desc: '退出当前账号，返回登录页',
    danger: true,
    action: handleLogout,
  },
]);

async function loadProfileSummary() {
  loading.value = true;
  try {
    const [profileRes, bindRes] = await Promise.all([fetchMobileProfile(), fetchWechatBindStatus()]);
    profile.value = profileRes;
    binding.value = bindRes;
  } finally {
    loading.value = false;
  }
}

async function handleLogout() {
  await showConfirmDialog({
    title: '退出登录',
    message: '确认退出当前账号？',
  });
  clearSession();
  router.replace('/login');
}

async function beginWechatOauth() {
  oauthLoading.value = true;
  try {
    const result = await startWechatOauth('/wx-app/#/profile');
    window.location.href = result.authorizeUrl;
  } finally {
    oauthLoading.value = false;
  }
}

onMounted(loadProfileSummary);
</script>

<template>
  <div class="list-stack">
    <section class="profile-hero">
      <div class="profile-hero__badge">党务管理</div>
      <div class="profile-hero__card">
        <div class="profile-hero__avatar">{{ (sessionState.user?.name || '我').slice(0, 1) }}</div>
        <div class="profile-hero__content">
          <div class="profile-hero__name">{{ sessionState.user?.name || '当前账号' }}</div>
          <div class="profile-hero__line">{{ primaryRoleLabel(sessionState.user) }}</div>
          <div class="profile-hero__line">{{ scopeText }}</div>
        </div>
      </div>
    </section>

    <section class="section-card section-card--compact" v-if="profile">
      <div class="section-card__hd">
        <div class="section-card__title">我的信息</div>
      </div>
      <div class="section-card__bd">
        <div class="profile-summary-grid">
          <div class="profile-summary-item">
            <span class="profile-summary-item__label">账号</span>
            <span class="profile-summary-item__value">{{ profile.username || sessionState.user?.username }}</span>
          </div>
          <div class="profile-summary-item">
            <span class="profile-summary-item__label">阶段</span>
            <span class="profile-summary-item__value">{{ profile.currentStage || '当前流程阶段' }}</span>
          </div>
          <div class="profile-summary-item">
            <span class="profile-summary-item__label">电话</span>
            <span class="profile-summary-item__value">{{ profile.phone || '未填写' }}</span>
          </div>
          <div class="profile-summary-item">
            <span class="profile-summary-item__label">微信</span>
            <span class="profile-summary-item__value">{{ binding.bound ? '已绑定' : '未绑定' }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card section-card--compact">
      <div class="section-card__hd">
        <div class="section-card__title">我的</div>
      </div>
      <div class="section-card__bd section-card__bd--flush">
        <button
          v-for="item in quickEntries"
          :key="item.key"
          type="button"
          class="profile-link"
          :class="{ 'is-danger': item.danger }"
          @click="item.action"
        >
          <div>
            <div class="profile-link__title">{{ item.title }}</div>
            <div class="profile-link__desc">
              <template v-if="item.key === 'bind' && oauthLoading">正在跳转授权...</template>
              <template v-else>{{ item.desc }}</template>
            </div>
          </div>
          <span class="profile-link__arrow">›</span>
        </button>
      </div>
    </section>

    <section class="section-card" v-if="loading">
      <div class="section-card__bd">
        <van-skeleton title :row="4" />
      </div>
    </section>
  </div>
</template>
