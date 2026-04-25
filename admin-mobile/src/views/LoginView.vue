<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showSuccessToast } from 'vant';
import { loginByPassword, startWechatOauth } from '../api';
import { isDesktopDevice, mobileToDesktopUrl, shouldSkipAutoRoute } from '../deviceRoute';
import { setSession } from '../session';

const router = useRouter();
const loading = ref(false);
const oauthLoading = ref(false);
const form = reactive({
  username: 'admin',
  password: '123456',
});

const accounts = [
  { username: '2023001', role: '申请人' },
  { username: 'zb001', role: '支部书记' },
  { username: 'zz001', role: '组织员' },
  { username: 'org001', role: '学院/组织部' },
  { username: 'admin', role: '管理员' },
];

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
  form.password = '123456';
}

onMounted(() => {
  if (shouldSkipAutoRoute()) return;
  if (!isDesktopDevice()) return;
  window.location.replace(mobileToDesktopUrl());
});
</script>

<template>
  <div class="login-shell">
    <section class="login-brand">
      <div class="login-brand__title">党员发展服务号工作台</div>
      <div class="login-brand__desc">
        该入口用于申请人、党支部书记、组织员、学院党委与组织部门协同办理发展党员流程。手机端聚焦待办、材料、通知和留痕，复杂台账与配置转至 PC 后台。
      </div>
    </section>

    <section class="section-card" style="margin-top: 14px;">
      <div class="section-card__hd">
        <div class="section-card__title">账号登录</div>
        <div class="section-card__desc">默认演示管理员账号为 admin / 123456，首次正式使用建议先完成微信绑定。</div>
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
          <span>首次使用服务号工作台？</span>
          <router-link to="/register">立即注册</router-link>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">演示账号</div>
        <div class="section-card__desc">点击填充账号。不同角色登录后，待办、消息、资料和流程任务会按权限自动切换。</div>
      </div>
      <div class="section-card__bd">
        <div class="login-demo-grid">
          <button v-for="item in accounts" :key="item.username" class="login-demo-item" type="button" @click="fillAccount(item.username)">
            <strong>{{ item.username }}</strong>
            <span>{{ item.role }}</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
