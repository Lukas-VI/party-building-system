<script setup>
import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showFailToast, showSuccessToast } from 'vant';
import { bindWechatOauth } from '../api';
import { setSession } from '../session';

const router = useRouter();
const route = useRoute();
const loading = ref(false);

const openid = route.query.openid || '';
const unionid = route.query.unionid || '';
const nickname = route.query.nickname || '';
const avatar = route.query.avatar || '';

const form = reactive({
  username: '',
  password: '',
});

if (!openid) {
  showFailToast('缺少微信授权信息，请重新登录');
  router.replace('/login');
}

async function submit() {
  if (!form.username.trim()) {
    showFailToast('请输入账号');
    return;
  }
  if (!form.password) {
    showFailToast('请输入密码');
    return;
  }

  loading.value = true;
  try {
    const result = await bindWechatOauth({
      openid,
      unionid,
      nickname,
      avatar,
      username: form.username.trim(),
      password: form.password,
    });
    setSession(result.token, result.user);
    showSuccessToast('微信绑定成功');
    router.replace('/workbench');
  } catch (error) {
    if (!error.toastShown) {
      showFailToast(error.message || '绑定失败');
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-shell">
    <section class="login-brand">
      <div class="login-brand__title">绑定微信账号</div>
    </section>

    <section class="section-card" style="margin-top: 14px;">
      <div class="section-card__hd">
        <div class="section-card__title">账号验证</div>
        <div class="section-card__desc">
          您的微信尚未绑定系统账号，请输入已有账号和密码完成绑定。
        </div>
      </div>
      <div class="section-card__bd">
        <div class="field-block">
          <div class="field-label">账号</div>
          <van-field v-model="form.username" placeholder="请输入学号、工号或管理员账号" clearable />
        </div>
        <div class="field-block">
          <div class="field-label">密码</div>
          <van-field v-model="form.password" type="password" placeholder="请输入密码" clearable />
        </div>
        <div class="field-block dual-actions">
          <van-button type="danger" block round :loading="loading" @click="submit">
            绑定并登录
          </van-button>
          <van-button plain type="danger" block round to="/login">
            返回登录
          </van-button>
        </div>
      </div>
    </section>
  </div>
</template>
