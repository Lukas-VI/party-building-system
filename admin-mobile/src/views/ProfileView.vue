<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { showSuccessToast } from 'vant';
import { http } from '../api';
import { DESKTOP_ADMIN_URL } from '../config';
import { profileSchema } from '../role-schema';
import { sessionState } from '../session';

const loading = ref(false);
const saving = ref(false);
const profile = reactive({});

const sections = computed(() => profileSchema(profile.profileType || 'admin'));

async function loadProfile() {
  loading.value = true;
  try {
    Object.assign(profile, await http.get('/profile/me'));
  } finally {
    loading.value = false;
  }
}

async function saveProfile() {
  saving.value = true;
  try {
    await http.put('/profile/me', profile);
    showSuccessToast('资料已保存');
  } finally {
    saving.value = false;
  }
}

function openDesktop() {
  window.location.href = DESKTOP_ADMIN_URL;
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
          <van-button plain type="danger" size="small" @click="openDesktop">打开桌面后台</van-button>
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
            :readonly="field.type === 'readonly'"
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
