<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog } from 'vant';
import { DESKTOP_ADMIN_URL } from '../config';
import { clearSession, roleTabs, sessionState } from '../session';

const route = useRoute();
const router = useRouter();

const tabs = computed(() => roleTabs(sessionState.user));
const active = computed({
  get() {
    return tabs.value.some((item) => item.name === route.name) ? route.name : 'dashboard';
  },
  set(value) {
    router.push({ name: value });
  },
});

const headerTitle = computed(() => route.meta.title || '党员发展管理后台');

async function handleLogout() {
  await showConfirmDialog({
    title: '退出登录',
    message: '确认退出当前移动后台账号？',
  });
  clearSession();
  router.replace('/login');
}

function openDesktop() {
  window.location.href = DESKTOP_ADMIN_URL;
}
</script>

<template>
  <div class="page-shell">
    <header class="top-banner">
      <div class="top-banner__title">{{ headerTitle }}</div>
      <div class="top-banner__subtitle">发展党员全过程纪实管理 · 移动端办理入口</div>
      <div class="top-banner__meta" v-if="sessionState.user">
        <span class="top-banner__chip">{{ sessionState.user.roles?.[0]?.label || '系统角色' }}</span>
        <span class="top-banner__chip">{{ sessionState.user.orgName || '全校数据范围' }}</span>
        <span class="top-banner__chip">{{ sessionState.user.branchName || '未限定支部' }}</span>
        <button type="button" class="top-banner__chip" @click="openDesktop">桌面端</button>
        <button type="button" class="top-banner__chip" @click="handleLogout">退出登录</button>
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
