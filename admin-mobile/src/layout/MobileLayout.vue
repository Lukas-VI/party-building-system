<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog } from 'vant';
import { DESKTOP_ADMIN_URL } from '../config';
import { isDesktopDevice, mobileToDesktopUrl, shouldSkipAutoRoute } from '../deviceRoute';
import { clearSession, primaryRoleLabel, roleTabs, sessionState } from '../session';

const route = useRoute();
const router = useRouter();

const tabs = computed(() => roleTabs(sessionState.user));
const active = computed({
  get() {
    return tabs.value.some((item) => item.name === route.name) ? route.name : 'workbench';
  },
  set(value) {
    if (value === 'materials' && sessionState.user?.primaryRole !== 'applicant') {
      router.push({ name: 'profile' });
      return;
    }
    router.push({ name: value });
  },
});

const headerTitle = computed(() => route.meta.title || '党员发展工作台');

async function handleLogout() {
  await showConfirmDialog({
    title: '退出登录',
    message: '确认退出当前账号？',
  });
  clearSession();
  router.replace('/login');
}

function openDesktop() {
  window.location.href = DESKTOP_ADMIN_URL;
}

onMounted(() => {
  if (shouldSkipAutoRoute()) return;
  if (!isDesktopDevice()) return;
  window.location.replace(mobileToDesktopUrl());
});
</script>

<template>
  <div class="page-shell">
    <header class="top-banner">
      <div class="top-banner__eyebrow">微信服务号内优先使用</div>
      <div class="top-banner__title">{{ headerTitle }}</div>
      <div class="top-banner__subtitle">申请人、支部审核者与组织管理人员共用的轻量工作台</div>
      <div class="top-banner__meta" v-if="sessionState.user">
        <span class="top-banner__chip">{{ primaryRoleLabel(sessionState.user) }}</span>
        <span class="top-banner__chip">{{ sessionState.user.orgName || '全校范围' }}</span>
        <span class="top-banner__chip" v-if="sessionState.user.branchName">{{ sessionState.user.branchName }}</span>
        <button type="button" class="top-banner__chip" @click="openDesktop">PC 后台</button>
        <button type="button" class="top-banner__chip" @click="handleLogout">退出</button>
      </div>
    </header>

    <main class="page-body">
      <router-view />
    </main>

    <van-tabbar v-model="active" route fixed placeholder active-color="#8f1515" inactive-color="#6e5547" :safe-area-inset-bottom="true">
      <van-tabbar-item v-for="tab in tabs" :key="tab.name" :name="tab.name" :icon="tab.icon" :to="{ name: tab.name }">
        {{ tab.label }}
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>
