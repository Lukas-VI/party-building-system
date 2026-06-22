<script setup>
 import { onMounted, onUnmounted, ref } from 'vue';
 import { useRouter, useRoute } from 'vue-router';
import { showFailToast } from 'vant';
 import { showSuccessToast } from 'vant';
 import { completeWechatOauthLogin } from '../api';
 import { autoBindWechat } from '../api';
 import { isLoggedIn, setSession } from '../session';

const router = useRouter();
const route = useRoute();
const errorMessage = ref('');

 let watchTimer = 0;

 onMounted(async () => {
   const code = route.query.code;
  const state = route.query.state || '';

  if (!code) {
    showFailToast('微信授权已取消');
    router.replace('/login');
    return;
   }

   // 10 秒超时：如果 API 没返回，显示明确错误
   watchTimer = setTimeout(() => {
     if (!errorMessage.value) {
       errorMessage.value = "微信授权验证超时，请返回重试";
     }
   }, 10000);

   try {
     const result = await completeWechatOauthLogin({ code, state });
     clearTimeout(watchTimer);

     if (result.token) {
      setSession(result.token, result.user);
      router.replace('/workbench');
      return;
    }

    if (result.needBind) {
       // 已登录用户：直接自动绑定，不需要手动输入账密
       if (isLoggedIn.value) {
         try {
           await autoBindWechat({ openid: result.openid, unionid: result.unionid });
           showSuccessToast('微信绑定成功');
           router.replace('/workbench');
         } catch (error) {
           if (!error.toastShown) showFailToast(error.message || '自动绑定失败');
           setTimeout(() => router.replace('/login'), 2000);
         }
         return;
       }
       // 未登录用户：走原来的手动绑定流程
       const params = new URLSearchParams();
      params.set('openid', result.openid);
      if (result.unionid) params.set('unionid', result.unionid);
      router.replace(`/wechat-bind?${params.toString()}`);
       return;
     }

     // 意外响应
     errorMessage.value = result.message || '微信授权验证失败，请重试';
   } catch (error) {
     clearTimeout(watchTimer);
     errorMessage.value = error.message || '微信登录失败';
     showFailToast(errorMessage.value);
     setTimeout(() => router.replace('/login'), 2000);
   }
 });

 onUnmounted(() => clearTimeout(watchTimer));
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
