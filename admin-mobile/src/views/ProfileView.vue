<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { showSuccessToast } from 'vant';
import { fetchMobileProfile, fetchWechatBindStatus, saveMobileProfile, startWechatOauth } from '../api';
import { profileSchema } from '../role-schema';
import { sessionState } from '../session';

const loading = ref(false);
const saving = ref(false);
const oauthLoading = ref(false);
const binding = ref({ bound: false, binding: null });
const profile = reactive({});

const sections = computed(() => profileSchema(profile.profileType || 'admin'));

async function loadProfile() {
  loading.value = true;
  try {
    const [profileRes, bindRes] = await Promise.all([fetchMobileProfile(), fetchWechatBindStatus()]);
    Object.assign(profile, profileRes);
    binding.value = bindRes;
  } finally {
    loading.value = false;
  }
}

async function saveProfile() {
  saving.value = true;
  try {
    await saveMobileProfile(profile);
    showSuccessToast('资料已保存');
  } finally {
    saving.value = false;
  }
}

async function beginWechatOauth() {
  oauthLoading.value = true;
  try {
    const result = await startWechatOauth('/wx-app/#/profile');
    window.location.href = result.authorizeUrl;
  } finally {
    oauthLoading.value = false;
  }
}

onMounted(loadProfile);
</script>

<template>
  <div class="list-stack">
    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">{{ sessionState.user?.name || '当前账号' }}</div>
        <div class="section-card__desc">{{ sessionState.user?.roles?.[0]?.label || '系统角色' }} · {{ profile.scopeLabel || sessionState.user?.orgName || '系统范围' }}</div>
      </div>
      <div class="section-card__bd">
        <div class="section-actions">
          <van-button type="danger" size="small" :loading="saving" @click="saveProfile">保存资料</van-button>
          <van-button plain type="danger" size="small" :loading="oauthLoading" @click="beginWechatOauth">
            {{ binding.bound ? '重新发起微信授权' : '发起微信授权' }}
          </van-button>
        </div>
        <div class="panel-note" style="margin-top: 12px;">
          <div class="table-row__head">
            <div class="table-row__title">微信绑定状态</div>
            <span class="tag-pair">{{ binding.bound ? '已绑定' : '未绑定' }}</span>
          </div>
          <div class="panel-note__text">
            {{ binding.bound ? `当前已绑定微信标识：${binding.binding?.openid || '已绑定'}` : '完成账号登录后，可通过微信网页授权入口建立绑定，用于服务号通知跳转。' }}
          </div>
        </div>
      </div>
    </section>

    <section class="section-card" v-if="loading">
      <div class="section-card__bd">
        <van-skeleton title :row="6" />
      </div>
    </section>

    <section class="section-card" v-for="section in sections" :key="section.title" v-else>
      <div class="section-card__hd">
        <div class="section-card__title">{{ section.title }}</div>
      </div>
      <div class="section-card__bd">
        <div class="field-block" v-for="field in section.fields" :key="field.key">
          <div class="field-label">{{ field.label }}</div>
          <van-field
            v-if="field.type === 'textarea'"
            v-model="profile[field.key]"
            rows="3"
            autosize
            type="textarea"
            :placeholder="`请填写${field.label}`"
          />
          <van-field
            v-else
            v-model="profile[field.key]"
            :readonly="field.type === 'readonly'"
            :placeholder="field.type === 'readonly' ? '' : `请填写${field.label}`"
          />
        </div>
      </div>
    </section>
  </div>
</template>
