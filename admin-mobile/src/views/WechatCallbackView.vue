<script setup>
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showFailToast } from 'vant';
import { completeWechatOauthLogin } from '../api';
import { setSession } from '../session';

const router = useRouter();
const route = useRoute();
const errorMessage = ref('');

onMounted(async () => {
  const code = route.query.code;
  const state = route.query.state || '';

  if (!code) {
    showFailToast('微信授权已取消');
    router.replace('/login');
    return;
  }

  try {
    const result = await completeWechatOauthLogin({ code, state });

    if (result.token) {
      setSession(result.token, result.user);
      router.replace('/workbench');
      return;
    }

    if (result.needBind) {
      const params = new URLSearchParams();
      params.set('openid', result.openid);
      if (result.unionid) params.set('unionid', result.unionid);
      router.replace(`/wechat-bind?${params.toString()}`);
      return;
    }
  } catch (error) {
    errorMessage.value = error.message || '微信登录失败';
    showFailToast(errorMessage.value);
    setTimeout(() => router.replace('/login'), 2000);
  }
});
</script>

<template>
  <div class="login-shell">
    <section class="section-card" style="margin-top: 14px;">
      <div class="section-card__bd" style="text-align: center; padding: 40px 16px;">
        <van-loading v-if="!errorMessage" type="spinner" size="32px" />
        <p v-if="!errorMessage" style="margin-top: 16px; color: #999;">正在验证微信授权...</p>
        <p v-if="errorMessage" style="color: #ee0a24;">{{ errorMessage }}</p>
        <van-button v-if="errorMessage" type="danger" block round style="margin-top: 16px;" to="/login">
          返回登录
        </van-button>
      </div>
    </section>
  </div>
</template>
