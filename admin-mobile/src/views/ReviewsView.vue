<script setup>
import { onMounted, ref } from 'vue';
import { showConfirmDialog, showSuccessToast } from 'vant';
import { approveRegistrationRequest, fetchRegistrationRequests, http } from '../api';
import { hasPermission, sessionState } from '../session';

const loading = ref(false);
const reviews = ref([]);
const registrationRequests = ref([]);

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
        <div class="section-card__desc">移动端保留通过与退回等高频操作，复杂批量办理建议转桌面端</div>
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
        <div class="section-card__desc">先完成首次注册审核，再进入后续流程办理。</div>
      </div>
      <div class="section-card__bd" v-if="registrationRequests.length">
        <div class="table-like">
          <div class="table-row" v-for="item in registrationRequests" :key="item.requestNo">
            <div class="table-row__head">
              <div>
                <div class="table-row__title">{{ item.name }}</div>
                <div class="table-row__sub">{{ item.employeeNo }} · {{ item.orgName || '未配置单位' }}</div>
              </div>
              <span class="status-chip is-reviewing">待审核</span>
            </div>
            <div class="kv-grid">
              <div class="kv-item">
                <div class="kv-item__label">支部</div>
                <div class="kv-item__value">{{ item.branchName || '未限定支部' }}</div>
              </div>
              <div class="kv-item">
                <div class="kv-item__label">申请时间</div>
                <div class="kv-item__value">{{ item.createdAt }}</div>
              </div>
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
        <div class="section-card__desc">当前角色权限范围内需要处理的流程节点。</div>
      </div>
      <div class="section-card__bd" v-if="reviews.length">
        <div class="table-like">
          <div class="table-row" v-for="item in reviews" :key="`${item.applicantId}-${item.stepCode}`">
            <div class="table-row__head">
              <div>
                <div class="table-row__title">{{ item.stepName }}</div>
                <div class="table-row__sub">{{ item.applicantName }} · {{ item.orgName || '未配置单位' }}</div>
              </div>
              <span class="status-chip is-reviewing">待审核</span>
            </div>
            <div class="kv-grid">
              <div class="kv-item">
                <div class="kv-item__label">支部</div>
                <div class="kv-item__value">{{ item.branchName || '未限定支部' }}</div>
              </div>
              <div class="kv-item">
                <div class="kv-item__label">截止时间</div>
                <div class="kv-item__value">{{ item.deadline || '未配置' }}</div>
              </div>
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
