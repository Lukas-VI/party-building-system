<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { http } from '../api';

const router = useRouter();
const loading = ref(false);
const reviews = ref([]);

function displayTime(value) {
  return value || '未设置';
}

async function loadReviews() {
  loading.value = true;
  try {
    reviews.value = await http.get('/reviews/pending');
  } finally {
    loading.value = false;
  }
}

function openReview(item) {
  router.push(`/workflow/${item.applicantId}/steps/${item.stepCode}`);
}

onMounted(loadReviews);
</script>

<template>
  <div class="list-stack">
    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">流程审核</div>
      </div>
      <div class="section-card__bd">
        <van-button type="danger" plain block round @click="loadReviews">刷新流程待办</van-button>
      </div>
    </section>

    <section class="section-card" v-if="loading">
      <div class="section-card__bd">
        <van-skeleton title :row="5" />
      </div>
    </section>

    <section class="section-card" v-else>
      <div class="section-card__bd" v-if="reviews.length">
        <div class="table-like">
          <button class="workflow-card status-card is-reviewing" v-for="item in reviews" :key="`${item.applicantId}-${item.stepCode}`" type="button" @click="openReview(item)">
            <van-icon name="clock-o" class="status-card__mark" />
            <div class="status-card__content">
              <div class="status-card__main">
                <div class="step-order">{{ item.sortOrder ? `${item.sortOrder}.` : item.stepCode }}</div>
                <div>
                  <div class="workflow-card__title">{{ item.applicantName || 'Name' }}</div>
                  <div class="step-item__meta">{{ item.applicantUsername || '未登记学号' }}</div>
                </div>
                <span class="status-chip is-reviewing">
                  <van-icon name="clock-o" class="status-chip__icon" size="12" />待审核
                </span>
              </div>
            </div>
            <div class="status-card__summary">{{ item.stepName }}</div>
            <div class="status-card__footer">
              <div class="step-time-row">
                <span>{{ displayTime(item.deadline) }} 截止</span>
              </div>
              <span class="due-pill">{{ item.orgName || '未配置单位' }}</span>
            </div>
          </button>
        </div>
      </div>
      <div class="empty-state" v-else>当前没有待审核流程节点。</div>
    </section>
  </div>
</template>
