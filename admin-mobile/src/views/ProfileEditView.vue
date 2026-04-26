<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { showSuccessToast } from 'vant';
import { fetchMobileProfile, saveMobileProfile } from '../api';
import { profileSchema } from '../role-schema';
import { sessionState } from '../session';

const loading = ref(false);
const saving = ref(false);
const profile = reactive({});

const sections = computed(() => profileSchema(profile.profileType || 'admin'));

async function loadProfile() {
  loading.value = true;
  try {
    const profileRes = await fetchMobileProfile();
    Object.keys(profile).forEach((key) => delete profile[key]);
    Object.assign(profile, profileRes);
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

onMounted(loadProfile);
</script>

<template>
  <div class="list-stack">
    <section class="section-card section-card--compact">
      <div class="section-card__hd">
        <div class="section-card__title">{{ sessionState.user?.name || '个人资料' }}</div>
        <div class="section-card__desc">请维护当前账号的基础信息、经历和联系方式。</div>
      </div>
      <div class="section-card__bd">
        <div class="section-actions">
          <van-button type="danger" block :loading="saving" @click="saveProfile">保存资料</van-button>
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
