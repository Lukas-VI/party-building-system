<script setup>
import { computed, onMounted, ref } from 'vue';
import { showSuccessToast } from 'vant';
import { fetchMobileWorkflow, uploadMobileFile } from '../api';

const loading = ref(false);
const workflow = ref(null);

const materialSteps = computed(() =>
  (workflow.value?.steps || []).filter((item) => Array.isArray(item.materialSchema) && item.materialSchema.length > 0),
);

function displayTime(value) {
  return value || '未设置';
}

function cardClass(step) {
  return step.reviewClassName || `is-${step.status || 'pending'}`;
}

function cardIcon(step) {
  return step.reviewIcon || (step.status === 'approved' ? 'passed' : step.status === 'rejected' ? 'close' : step.status === 'locked' ? 'stop-circle-o' : 'clock-o');
}

function cardLabel(step) {
  return step.reviewLabel || step.statusText || '待处理';
}

async function loadWorkflow() {
  loading.value = true;
  try {
    workflow.value = await fetchMobileWorkflow('me');
  } finally {
    loading.value = false;
  }
}

function uploadHandler(step, material) {
  return async (fileWrapper) => {
    const uploadSource = Array.isArray(fileWrapper) ? fileWrapper[0] : fileWrapper;
    const file = uploadSource.file || uploadSource;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('workflowId', workflow.value.workflowId);
    formData.append('stepCode', step.stepCode);
    formData.append('materialTag', material.tag);
    await uploadMobileFile(formData);
    showSuccessToast(`${material.label}上传成功`);
    await loadWorkflow();
  };
}

onMounted(loadWorkflow);
</script>

<template>
  <div class="list-stack">
    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">材料维护</div>
      </div>
      <div class="section-card__bd">
        <div class="table-like" v-if="materialSteps.length">
          <div class="workflow-card status-card" :class="cardClass(step)" v-for="step in materialSteps" :key="step.stepCode">
            <van-icon :name="cardIcon(step)" class="status-card__mark" />
            <div class="status-card__content">
              <div class="status-card__main">
                <div class="step-order">{{ step.orderLabel || step.stepCode }}</div>
                <div class="workflow-card__title">{{ step.stepName }}</div>
                <span class="status-chip" :class="cardClass(step)">
                  <van-icon :name="cardIcon(step)" class="status-chip__icon" size="12" />{{ cardLabel(step) }}
                </span>
              </div>
            </div>
            <div class="status-card__summary">{{ step.summary }}</div>
            <div class="status-card__footer">
              <div class="step-time-row">
                <span>{{ displayTime(step.startAt) }} 开始   {{ displayTime(step.endAt || step.deadline) }} 截止</span>
              </div>
              <span class="due-pill" :class="{ 'is-overdue': step.isOverdue }">{{ step.remainingLabel || '材料节点' }}</span>
            </div>
            <div class="material-block" v-for="material in step.materialSchema" :key="material.key">
              <div class="field-label">{{ material.label }}</div>
              <van-uploader :after-read="uploadHandler(step, material)" />
              <div class="upload-list" v-if="step.attachments?.length">
                <div class="upload-list__item" v-for="item in step.attachments.filter((attachment) => attachment.materialTag === material.tag)" :key="item.id">
                  <span>{{ item.fileName }}</span>
                  <span class="tag-pair">{{ item.materialTag }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="empty-state" v-else-if="!loading">当前没有需要独立维护的材料节点。</div>
        <van-skeleton v-else title :row="5" />
      </div>
    </section>
  </div>
</template>
