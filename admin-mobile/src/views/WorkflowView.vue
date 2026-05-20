<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchMobileWorkflow } from '../api';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const workflow = ref(null);
const completedExpanded = ref(false);

const workflowId = computed(() => route.params.workflowId || 'me');
const currentTask = computed(() => workflow.value?.currentStep || null);
const completedSteps = computed(() => {
  const list = workflow.value?.completedSteps || [];
  return [...list].sort((a, b) => {
    const left = a.operatedAt || '';
    const right = b.operatedAt || '';
    return right.localeCompare(left);
  });
});
const allSteps = computed(() => workflow.value?.steps || []);
const upcomingSteps = computed(() => {
  const currentCode = currentTask.value?.stepCode;
  return allSteps.value.filter((step) => step.status !== 'approved' && step.stepCode !== currentCode);
});
const allCompleted = computed(() => allSteps.value.length > 0 && !currentTask.value && !upcomingSteps.value.length);

function displayTime(value) {
  return value || '未设置';
}

async function loadWorkflow() {
  loading.value = true;
  try {
    workflow.value = await fetchMobileWorkflow(workflowId.value);
  } finally {
    loading.value = false;
  }
}

function openStep(task) {
  router.push({
    name: 'workflow-step-detail',
    params: {
      workflowId: task.workflowId || workflowId.value,
      stepCode: task.stepCode,
    },
  });
}

onMounted(loadWorkflow);
</script>

<template>
  <!-- 主容器，使用列表堆叠布局 -->
  <div class="list-stack">
    <!-- 流程信息卡片 -->
    <section class="section-card">
      <!-- 卡片头部 -->
      <div class="section-card__hd">
        <!-- 页面工具栏 -->
        <div class="page-toolbar">
          <!-- 标题容器 -->
          <div>
            <!-- 卡片标题 -->
            <div class="section-card__title">流程办理</div>
          </div>
          <!-- 返回按钮 -->
          <van-button plain type="danger" size="small" @click="router.back()">返回</van-button>
        </div>
      </div>
      <!-- 申请人信息网格 -->
      <div class="section-card__bd" v-if="workflow?.applicant">
        <!-- 键值对网格 -->
        <div class="kv-grid">
          <!-- 姓名项 -->
          <div class="kv-item"><div class="kv-item__label">姓名</div><div class="kv-item__value">{{ workflow.applicant.name }}</div></div>
          <!-- 账号项 -->
          <div class="kv-item"><div class="kv-item__label">账号</div><div class="kv-item__value">{{ workflow.applicant.username }}</div></div>
          <!-- 当前阶段项 -->
          <div class="kv-item"><div class="kv-item__label">当前阶段</div><div class="kv-item__value">{{ workflow.currentStage }}</div></div>
          <!-- 联系电话项 -->
          <div class="kv-item"><div class="kv-item__label">联系电话</div><div class="kv-item__value">{{ workflow.applicant.phone || '未填写' }}</div></div>
        </div>
      </div>
    </section>

    <!-- 当前任务卡片 -->
    <section class="section-card" v-if="currentTask">
      <!-- 卡片头部 -->
      <div class="section-card__hd">
        <!-- 卡片标题 -->
        <div class="section-card__title">当前节点</div>
        <!-- 卡片描述 -->
        <div class="section-card__desc">{{ currentTask.phase }} · {{ currentTask.summary }}</div>
      </div>
      <!-- 卡片主体 -->
      <div class="section-card__bd">
        <button class="workflow-card status-card is-current" :class="currentTask.reviewClassName" type="button" @click="openStep(currentTask)">
          <van-icon :name="currentTask.reviewIcon" class="status-card__mark" />
          <div class="status-card__content">
            <div class="status-card__main">
              <div class="step-order">{{ currentTask.orderLabel }}</div>
              <div class="workflow-card__title">{{ currentTask.stepName }}</div>
            <span class="status-chip" :class="currentTask.reviewClassName">
              <van-icon :name="currentTask.reviewIcon" class="status-chip__icon" size="12" />{{ currentTask.reviewLabel }}
            </span>
            </div>
          </div>
          <div class="status-card__summary" v-if="currentTask.summary">{{ currentTask.summary }}</div>
          <div class="status-card__footer">
            <div class="step-time-row">
              <span>{{ displayTime(currentTask.startAt) }} 开始   {{ displayTime(currentTask.endAt || currentTask.deadline) }} 截止</span>
            </div>
            <span class="due-pill" :class="{ 'is-overdue': currentTask.isOverdue }">{{ currentTask.remainingLabel }}</span>

          </div>
          <div class="workflow-card__body" v-if="currentTask.blessingText">{{ currentTask.blessingText }}</div>
          <div class="workflow-card__foot">
            <span v-if="currentTask.uploadRequired">含材料事项</span>
          </div>
        </button>
      </div>
    </section>

    <!-- 全部完成提示 -->
    <section class="section-card" v-if="allCompleted">
      <div class="section-card__hd">
        <div class="section-card__title">流程已全部完成</div>
        <div class="section-card__desc">所有节点已办理完毕，请关注后续党组织通知。</div>
      </div>
    </section>

    <!-- 步骤总览卡片 -->
    <section class="section-card">
      <!-- 卡片头部 -->
      <div class="section-card__hd">
        <!-- 卡片标题 -->
        <div class="section-card__title">后续步骤</div>
      </div>
      <!-- 卡片主体 -->
      <div class="section-card__bd">
        <!-- 后续步骤列表 -->
        <div class="step-list" v-if="upcomingSteps.length">
          <!-- 后续步骤按钮 -->
          <button v-for="item in upcomingSteps" :key="item.taskId" type="button" class="workflow-card status-card" :class="item.reviewClassName" @click="openStep(item)">
            <van-icon :name="item.reviewIcon" class="status-card__mark" />
            <div class="status-card__content">
            <div class="status-card__main">
              <div class="step-order">{{ item.orderLabel }}</div>
              <div class="workflow-card__title">{{ item.stepName }}</div>
              <span class="status-chip" :class="item.reviewClassName">
                <van-icon :name="item.reviewIcon" class="status-chip__icon" size="12" />{{ item.reviewLabel }}
              </span>
              </div>

            </div>
            <div class="status-card__summary">{{ item.summary }}</div>
            <div class="status-card__footer">
              <div class="step-time-row">
                <span>{{ displayTime(item.startAt) }} 开始   {{ displayTime(item.endAt || item.deadline) }} 截止</span>
              </div>
              <span class="due-pill" :class="{ 'is-overdue': item.isOverdue }">{{ item.remainingLabel }}</span>

            </div>
            <div class="workflow-card__body" v-if="item.blessingText">{{ item.blessingText }}</div>
            <div class="workflow-card__foot">
              <span v-if="item.uploadRequired">含材料事项</span>
            </div>
          </button>
        </div>
        <div v-else-if="!loading && !allCompleted" class="empty-state">暂无后续未办理节点。</div>
        <!-- 分割线 -->
        <div class="formal-divider" v-if="completedSteps.length"></div>
        <!-- 已完成步骤折叠头 -->
        <button
          v-if="completedSteps.length"
          type="button"
          class="completed-toggle"
          @click="completedExpanded = !completedExpanded"
        >
          <span>已办理（{{ completedSteps.length }}）</span>
          <van-icon :name="completedExpanded ? 'arrow-up' : 'arrow-down'" />
        </button>
        <!-- 已完成步骤列表 -->
        <div class="step-list" v-if="completedSteps.length && completedExpanded">
          <!-- 已完成步骤按钮，按办理时间倒序 -->
          <button class="workflow-card status-card" :class="item.reviewClassName" v-for="item in completedSteps" :key="item.stepCode" type="button" @click="openStep(item)">
            <van-icon :name="item.reviewIcon" class="status-card__mark" />
            <div class="status-card__content">
            <div class="status-card__main">
              <div class="step-order">{{ item.orderLabel }}</div>
              <div class="workflow-card__title">{{ item.stepName }}</div>
              <span class="status-chip" :class="item.reviewClassName">
                <van-icon :name="item.reviewIcon" class="status-chip__icon" size="12" />{{ item.reviewLabel }}
              </span>
            </div>
            </div>
            <div class="status-card__summary" v-if="item.summary">{{ item.summary }}</div>
            <div class="status-card__footer">
              <div class="step-time-row">
                <span>{{ displayTime(item.startAt) }} 开始   {{ displayTime(item.endAt || item.deadline) }} 截止</span>
              </div>
              <span class="due-pill">{{ item.remainingLabel }}</span>

            </div>
            <div class="workflow-card__body" v-if="item.blessingText">{{ item.blessingText }}</div>
            <div class="workflow-card__foot">
              <span v-if="item.uploadRequired">含材料事项</span>
            </div>
          </button>
        </div>
        <!-- 加载骨架屏 -->
        <van-skeleton v-if="loading" title :row="6" />
      </div>
    </section>
  </div>
</template>
