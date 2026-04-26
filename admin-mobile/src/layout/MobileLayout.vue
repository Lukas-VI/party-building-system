<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isDesktopDevice, mobileToDesktopUrl, shouldSkipAutoRoute } from '../deviceRoute';
import { roleTabs, sessionState } from '../session';

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

const tabIcons = {
  workbench: {
    outline: 'M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-4.5v-5.2h-5V21H5a1 1 0 0 1-1-1v-9.4Z',
    solid: 'M12 3.3 21 10.8V20a2 2 0 0 1-2 2h-5.4v-5.7H10.4V22H5a2 2 0 0 1-2-2v-9.2L12 3.3Z',
  },
  materials: {
    outline: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h4L11 6.8h7.5A1.5 1.5 0 0 1 20 8.3v9.2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-11Z',
    solid: 'M4 6.2A2.2 2.2 0 0 1 6.2 4h3.4a2 2 0 0 1 1.5.7l1.1 1.3h5.6A2.2 2.2 0 0 1 20 8.2v9.6A2.2 2.2 0 0 1 17.8 20H6.2A2.2 2.2 0 0 1 4 17.8V6.2Z',
  },
  messages: {
    outline: 'M12 20.3c-.4 0-.8-.2-1.1-.5l-2.2-2.3H6.4A2.4 2.4 0 0 1 4 15.1V7.4A2.4 2.4 0 0 1 6.4 5h11.2A2.4 2.4 0 0 1 20 7.4v7.7a2.4 2.4 0 0 1-2.4 2.4h-2.3l-2.2 2.3c-.3.3-.7.5-1.1.5Z',
    solid: 'M6 4h12a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-3.1l-2.2 2.2a1 1 0 0 1-1.4 0l-2.2-2.2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  },
  profile: {
    outline: 'M12 12a3.7 3.7 0 1 0 0-7.4A3.7 3.7 0 0 0 12 12Zm0 1.8c-4 0-7.2 2.4-7.2 5.3 0 .5.4.9.9.9h12.6c.5 0 .9-.4.9-.9 0-2.9-3.2-5.3-7.2-5.3Z',
    solid: 'M12 3.8a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4Zm0 9.9c4.6 0 8.3 2.7 8.3 6 0 .7-.5 1.3-1.2 1.3H4.9c-.7 0-1.2-.6-1.2-1.3 0-3.3 3.7-6 8.3-6Z',
  },
};

onMounted(() => {
  if (shouldSkipAutoRoute()) return;
  if (!isDesktopDevice()) return;
  window.location.replace(mobileToDesktopUrl());
});
</script>

<template>
  <div class="page-shell">
    <header class="top-banner">
      <div class="top-banner__title">{{ headerTitle }}</div>
    </header>

    <main class="page-body">
      <router-view />
    </main>

    <van-tabbar v-model="active" route fixed placeholder active-color="#8f1515" inactive-color="#6e5547" :safe-area-inset-bottom="true">
      <van-tabbar-item v-for="tab in tabs" :key="tab.name" :name="tab.name" :to="{ name: tab.name }">
        <template #icon="{ active }">
          <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              :d="active ? tabIcons[tab.name]?.solid : tabIcons[tab.name]?.outline"
              :fill="active ? 'currentColor' : 'none'"
              stroke="currentColor"
              :stroke-width="active ? 0 : 1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </template>
        {{ tab.label }}
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>
