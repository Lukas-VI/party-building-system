<script setup>
import { onMounted, ref } from 'vue';
import { showConfirmDialog, showSuccessToast } from 'vant';
import { approveRegistrationRequest, fetchRegistrationRequests, http } from '../api';
import { hasPermission, sessionState } from '../session';

const loading = ref(false);
const reviews = ref([]);
const registrationRequests = ref([]);

function displayTime(value) {
  return value || '未设置';
}

function cardClass(item) {
  return item.reviewClassName || `is-${item.status || 'reviewing'}`;
}

function cardIcon(item) {
  return item.reviewIcon || (item.status === 'approved' ? 'passed' : item.status === 'rejected' ? 'close' : item.status === 'locked' ? 'stop-circle-o' : 'clock-o');
}

function cardLabel(item) {
  return item.reviewLabel || item.statusText || '待审核';
}

async function loadReviews() {
  loading.value = true;
  try {
    const workflowRes = await http.get('/reviews/pending');
    const registrationRes = hasPermission(sessionState.user, 'approve_registration')
      ? await fetchRegistrationRequests('pending')
      : [];
    reviews.value = workflowRes;
    registrationRequests.value = registrationRes;
  } finally {
    loading.value = false;
  }
}

async function reviewItem(item, status) {
  await showConfirmDialog({
    title: status === 'approved' ? '确认通过' : '确认退回',
    message: `${item.applicantName} · ${item.stepName}`,
  });
  await http.post(`/workflows/${item.applicantId}/steps/${item.stepCode}/review`, {
    status,
    comment: status === 'approved' ? '移动端审核通过' : '移动端审核退回',
  });
  showSuccessToast(status === 'approved' ? '已通过' : '已退回');
  await loadReviews();
}

async function reviewRegistration(item, status) {
  await showConfirmDialog({
    title: status === 'approved' ? '确认通过注册' : '确认驳回注册',
    message: `${item.name} · ${item.employeeNo}`,
  });
  await approveRegistrationRequest({
    requestNo: item.requestNo,
    status,
  });
  showSuccessToast(status === 'approved' ? '注册已通过' : '注册已驳回');
  await loadReviews();
}

onMounted(loadReviews);
</script>

<template>
  <div class="list-stack">
    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">待办审核</div>
      </div>
      <div class="section-card__bd">
        <van-button type="danger" plain block round @click="loadReviews">刷新待办</van-button>
      </div>
    </section>

    <section class="section-card" v-if="loading">
      <div class="section-card__bd">
        <van-skeleton title :row="5" />
      </div>
    </section>

    <section class="section-card" v-else-if="hasPermission(sessionState.user, 'approve_registration')">
      <div class="section-card__hd">
        <div class="section-card__title">待审核注册</div>
      </div>
      <div class="section-card__bd" v-if="registrationRequests.length">
        <div class="table-like">
          <div class="workflow-card status-card is-reviewing" v-for="item in registrationRequests" :key="item.requestNo">
            <van-icon name="clock-o" class="status-card__mark" />
            <div class="status-card__content">
              <div class="status-card__main">
                <div class="step-order">注册审核</div>
                <div class="workflow-card__title">{{ item.name }}</div>
                <span class="status-chip is-reviewing">
                  <van-icon name="clock-o" class="status-chip__icon" size="12" />待审核
                </span>
              </div>
            </div>
            <div class="status-card__summary">{{ item.employeeNo }} · {{ item.orgName || '未配置单位' }} · {{ item.branchName || '未限定支部' }}</div>
            <div class="status-card__footer">
              <div class="step-time-row">
                <span>{{ displayTime(item.createdAt) }} 提交   {{ displayTime(item.reviewedAt) }} 审核</span>
              </div>
              <span class="due-pill">待审核</span>
            </div>
            <div class="section-actions">
              <van-button size="small" type="danger" @click="reviewRegistration(item, 'approved')">通过注册</van-button>
              <van-button size="small" plain type="danger" @click="reviewRegistration(item, 'rejected')">驳回注册</van-button>
            </div>
          </div>
        </div>
        <div class="formal-divider"></div>
      </div>
      <div class="empty-state" v-else>当前没有待审核注册申请。</div>
    </section>

    <section class="section-card" v-else>
      <div class="section-card__hd">
        <div class="section-card__title">待审核流程</div>
      </div>
      <div class="section-card__bd" v-if="reviews.length">
        <div class="table-like">
          <div class="workflow-card status-card" :class="cardClass(item)" v-for="item in reviews" :key="`${item.applicantId}-${item.stepCode}`">
            <van-icon :name="cardIcon(item)" class="status-card__mark" />
            <div class="status-card__content">
              <div class="status-card__main">
                <div class="step-order">{{ item.orderLabel || item.stepCode }}</div>
                <div class="workflow-card__title">{{ item.stepName }}</div>
                <span class="status-chip" :class="cardClass(item)">
                  <van-icon :name="cardIcon(item)" class="status-chip__icon" size="12" />{{ cardLabel(item) }}
                </span>
              </div>
            </div>
            <div class="status-card__summary">{{ item.applicantName }} · {{ item.orgName || '未配置单位' }} · {{ item.branchName || '未限定支部' }}</div>
            <div class="status-card__footer">
              <div class="step-time-row">
                <span>{{ displayTime(item.startAt) }} 开始   {{ displayTime(item.endAt || item.deadline) }} 截止</span>
              </div>
              <span class="due-pill" :class="{ 'is-overdue': item.isOverdue }">{{ item.remainingLabel || '待审核' }}</span>
            </div>
            <div class="workflow-card__body" v-if="item.summary">{{ item.summary }}</div>
            <div class="workflow-card__foot">
              <span v-if="item.uploadRequired">含材料事项</span>
            </div>
            <div class="section-actions">
              <van-button size="small" type="danger" @click="reviewItem(item, 'approved')">通过</van-button>
              <van-button size="small" plain type="danger" @click="reviewItem(item, 'rejected')">退回</van-button>
            </div>
          </div>
        </div>
      </div>
      <div class="empty-state" v-else>当前没有待审核流程节点。</div>
    </section>
  </div>
</template>
