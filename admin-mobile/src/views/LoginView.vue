<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showSuccessToast } from 'vant';
import { loginByPassword } from '../api';
import { isDesktopDevice, mobileToDesktopUrl, shouldSkipAutoRoute } from '../deviceRoute';
import { setSession } from '../session';

const router = useRouter();
const loading = ref(false);
const form = reactive({
  username: 'admin',
  password: '123456',
});

const accounts = [
  { username: 'admin', role: '超级管理员' },
  { username: 'org001', role: '组织部人员' },
  { username: 'zz001', role: '组织员' },
  { username: 'zb001', role: '党支部书记' },
];

async function submit() {
  loading.value = true;
  try {
    const result = await loginByPassword(form);
    setSession(result.token, result.user);
    showSuccessToast('登录成功');
    router.replace('/dashboard');
  } finally {
    loading.value = false;
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
      <div class="login-brand__title">党员发展管理后台</div>
      <div class="login-brand__desc">
        面向微信手机端和移动浏览器的管理入口。使用高对比度、正式、清晰的手机界面，聚焦审核、台账、资料与流程查询。
      </div>
    </section>

    <section class="section-card" style="margin-top: 14px;">
      <div class="section-card__hd">
        <div class="section-card__title">账号登录</div>
        <div class="section-card__desc">开发演示环境默认管理员账号为 admin / 123456</div>
      </div>
      <div class="section-card__bd">
        <div class="field-block">
          <div class="field-label">账号</div>
          <van-field v-model="form.username" placeholder="请输入工号、学号或管理员账号" clearable />
        </div>
        <div class="field-block">
          <div class="field-label">密码</div>
          <van-field v-model="form.password" type="password" placeholder="请输入密码" clearable />
        </div>
        <div class="field-block">
          <van-button type="danger" block round :loading="loading" @click="submit">登录移动后台</van-button>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">样例账号</div>
        <div class="section-card__desc">点击即可填充账号，便于手机端联调与验收</div>
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
