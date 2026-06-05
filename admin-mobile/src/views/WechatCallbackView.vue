<template>
  <div class="wechat-callback-page">
    <van-loading color="#c62828" size="28px" />
    <p>{{ statusText }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showFailToast, showSuccessToast } from 'vant';
import { fetchCurrentUser } from '../api';
import { clearSession, setSession, setSessionToken } from '../session';

const route = useRoute();
const router = useRouter();
const statusText = ref('正在完成微信授权...');

function normalizeNext(value) {
  const next = String(value || '/workbench').trim();
  if (!next.startsWith('/') || next.startsWith('//') || next === '/login' || next === '/wechat/callback') {
    return '/workbench';
  }
  return next;
}

onMounted(async () => {
  const token = String(route.query.token || '');
  if (!token) {
    clearSession();
    showFailToast('微信授权失败，请重新登录');
    router.replace('/login');
    return;
  }

  try {
    setSessionToken(token);
    const user = await fetchCurrentUser();
    setSession(token, user);
    showSuccessToast('微信登录成功');
    router.replace(normalizeNext(route.query.next));
  } catch (error) {
    clearSession();
    statusText.value = '微信授权失败';
    router.replace('/login');
  }
});
</script>

<style scoped>
.wechat-callback-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #303133;
  background: #f7f8fa;
}

.wechat-callback-page p {
  margin: 0;
  font-size: 15px;
}
</style>
