<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { http } from '../api';

const route = useRoute();
const router = useRouter();
const detail = ref(null);
const workflow = ref(null);
const loading = ref(false);

const stepRows = computed(() => workflow.value?.steps || []);

function statusClass(status) {
  return {
    reviewing: 'is-reviewing',
    approved: 'is-approved',
    rejected: 'is-rejected',
    terminated: 'is-terminated',
    pending: 'is-pending',
    locked: 'is-locked',
  }[status] || 'is-pending';
}

async function loadDetail() {
  loading.value = true;
  try {
    const [detailRes, workflowRes] = await Promise.all([
      http.get(`/applicants/${route.params.id}`),
      http.get(`/workflows/${route.params.id}`),
    ]);
    detail.value = detailRes;
    workflow.value = workflowRes;
  } finally {
    loading.value = false;
  }
}

onMounted(loadDetail);
</script>

<template>
  <div class="list-stack">
    <section class="section-card">
      <div class="section-card__hd">
        <div class="page-toolbar">
          <div>
            <div class="section-card__title">流程详情</div>
          </div>
          <van-button size="small" plain type="danger" @click="router.back()">返回</van-button>
        </div>
      </div>
      <div class="section-card__bd" v-if="detail">
        <div class="kv-grid">
          <div class="kv-item"><div class="kv-item__label">姓名</div><div class="kv-item__value">{{ detail.name }}</div></div>
          <div class="kv-item"><div class="kv-item__label">学号/工号</div><div class="kv-item__value">{{ detail.username }}</div></div>
          <div class="kv-item"><div class="kv-item__label">单位</div><div class="kv-item__value">{{ detail.orgName }}</div></div>
          <div class="kv-item"><div class="kv-item__label">支部</div><div class="kv-item__value">{{ detail.branchName }}</div></div>
          <div class="kv-item"><div class="kv-item__label">当前阶段</div><div class="kv-item__value">{{ detail.currentStage }}</div></div>
          <div class="kv-item"><div class="kv-item__label">联系电话</div><div class="kv-item__value">{{ detail.phone || '未填写' }}</div></div>
        </div>
      </div>
      <div class="section-card__bd" v-else-if="loading">
        <van-skeleton title :row="4" />
      </div>
    </section>

    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">二十五步流程</div>
      </div>
      <div class="section-card__bd">
        <div class="step-list" v-if="stepRows.length">
          <div class="step-item" v-for="item in stepRows" :key="item.stepCode">
            <div class="step-item__head">
              <div>
                <div class="step-item__name">{{ item.sortOrder }}. {{ item.name }}</div>
                <div class="step-item__meta">{{ item.phase }}</div>
              </div>
              <span class="status-chip" :class="statusClass(item.status)">{{ item.statusText }}</span>
            </div>
            <div class="step-item__meta">办理时间：{{ item.operatedAt || '暂无记录' }}</div>
            <div class="step-item__meta">办理人：{{ item.lastOperatorName || '待办理' }}</div>
            <div class="step-item__meta" v-if="item.reviewComment">审核意见：{{ item.reviewComment }}</div>
          </div>
        </div>
        <div class="empty-state" v-else-if="!loading">当前暂无流程记录。</div>
        <van-skeleton v-else title :row="6" />
      </div>
    </section>
  </div>
</template>
