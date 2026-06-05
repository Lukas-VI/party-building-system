<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showFailToast, showSuccessToast } from 'vant';
import { fetchPublicBootstrap, loginByPassword, startWechatOauth } from '../api';
import { isDesktopDevice, mobileToDesktopUrl, shouldSkipAutoRoute } from '../deviceRoute';
import { setSession } from '../session';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const oauthLoading = ref(false);
const bootstrap = ref({ loginHints: [], defaultPasswordHint: '' });
const form = reactive({
  username: '',
  password: '',
});

const inWechat = computed(() => /micromessenger/i.test(window.navigator.userAgent || ''));

async function submit() {
  loading.value = true;
  try {
    const result = await loginByPassword(form);
    setSession(result.token, result.user);
    showSuccessToast('登录成功');
    router.replace('/workbench');
  } finally {
    loading.value = false;
  }
}

async function startWechatLogin() {
  oauthLoading.value = true;
  try {
    const result = await startWechatOauth('/wx-app/');
    window.location.href = result.authorizeUrl;
  } finally {
    oauthLoading.value = false;
  }
}

function fillAccount(username) {
  form.username = username;
}

async function loadBootstrap() {
  bootstrap.value = await fetchPublicBootstrap();
}

function showWechatOauthMessage() {
  const status = String(route.query.wechat || '');
  const messages = {
    unbound: '当前微信尚未绑定系统账号，请先用账号密码登录后到“我的”页面绑定微信',
    inactive: '绑定账号未启用，请联系管理员',
    failed: '微信授权失败，请重试',
    'missing-code': '微信授权缺少 code，请重试',
    'missing-openid': '微信授权未返回 openid，请重试',
  };
  if (messages[status]) showFailToast(messages[status]);
}

onMounted(() => {
  loadBootstrap();
  showWechatOauthMessage();
  if (shouldSkipAutoRoute()) return;
  if (!isDesktopDevice()) return;
  window.location.replace(mobileToDesktopUrl());
});
</script>

<template>
  <div class="login-shell">
    <section class="login-brand">
      <div class="login-brand__title">党员发展服务号工作台</div>
    </section>

    <section class="section-card" style="margin-top: 14px;">
      <div class="section-card__hd">
        <div class="section-card__title">账号登录</div>
        <div class="section-card__desc">请输入账号和密码。</div>
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
          <van-button type="danger" block round :loading="loading" @click="submit">登录工作台</van-button>
          <van-button v-if="inWechat" plain type="danger" block round :loading="oauthLoading" @click="startWechatLogin">微信授权入口</van-button>
        </div>
        <div class="auth-switch">
          <span>首次使用？</span>
          <router-link to="/register">立即注册</router-link>
        </div>
        <div v-if="bootstrap.defaultPasswordHint" class="section-card__desc" style="padding-top: 8px;">
          {{ bootstrap.defaultPasswordHint }}
        </div>
      </div>
    </section>

    <section v-if="bootstrap.loginHints?.length" class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">快速填充账号</div>
        <div class="section-card__desc">点击可快速填充账号。</div>
      </div>
      <div class="section-card__bd">
        <div class="login-demo-grid">
          <button v-for="item in bootstrap.loginHints" :key="item.username" class="login-demo-item" type="button" @click="fillAccount(item.username)">
            <strong>{{ item.username }}</strong>
            <span>{{ item.roleLabel }}</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
