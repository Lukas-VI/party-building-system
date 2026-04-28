<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchMobileWorkflow } from '../api';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const workflow = ref(null);

const workflowId = computed(() => route.params.workflowId || 'me');
const currentTask = computed(() => workflow.value?.currentStep || null);
const completedSteps = computed(() => workflow.value?.completedSteps || []);
const allSteps = computed(() => workflow.value?.steps || []);
const unfinishedSteps = computed(() => allSteps.value.filter((step) => step.status !== 'approved'));

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
        <button class="workflow-card status-card" :class="currentTask.reviewClassName" type="button" @click="openStep(currentTask)">
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
              <span>开始: {{ displayTime(currentTask.startAt) }} ~ 截止: {{ displayTime(currentTask.endAt || currentTask.deadline) }}</span>
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

    <!-- 步骤总览卡片 -->
    <section class="section-card">
      <!-- 卡片头部 -->
      <div class="section-card__hd">
        <!-- 卡片标题 -->
        <div class="section-card__title">未完成步骤</div>
        <!-- 注释掉的描述 -->
        <!-- <div class="section-card__desc">点击任一步骤进入详情页查看记录或办理事项。</div> -->
      </div>
      <!-- 卡片主体 -->
      <div class="section-card__bd">
        <!-- 未完成步骤列表 -->
        <div class="step-list" v-if="unfinishedSteps.length">
          <!-- 未完成步骤按钮 -->
          <button v-for="item in unfinishedSteps" :key="item.taskId" type="button" class="workflow-card status-card" :class="item.reviewClassName" @click="openStep(item)">
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
                <span>开始 {{ displayTime(item.startAt) }} ~ 截止 {{ displayTime(item.endAt || item.deadline) }}</span>
              </div>
              <span class="due-pill" :class="{ 'is-overdue': item.isOverdue }">{{ item.remainingLabel }}</span>
            </div>
            <div class="workflow-card__meta" v-if="item.uploadRequired">需提交材料，可点开查看或上传。</div>
          </button>
        </div>
        <!-- 分割线 -->
        <div class="formal-divider" v-if="completedSteps.length"></div>
        <!-- 已完成步骤标题 -->
        <div class="section-card__title section-card__title--sub" v-if="completedSteps.length">已完成步骤</div>
        <!-- 已完成步骤列表 -->
        <div class="step-list" v-if="completedSteps.length">
          <!-- 已完成步骤按钮 -->
          <button class="workflow-card status-card" :class="item.reviewClassName" v-for="item in completedSteps" :key="item.stepCode" type="button" @click="openStep(item)">
            <van-icon :name="item.reviewIcon" class="status-card__mark" />
            <div class="status-card__content">
              <div class="status-card__main">
                <div class="step-order">{{ item.orderLabel }}</div>
                <div class="workflow-card__title">{{ item.stepName }}</div>
                <div class="workflow-card__meta">{{ item.phase }} · {{ item.taskOwner }}</div>
                <span class="status-chip" :class="item.reviewClassName">
                  <van-icon :name="item.reviewIcon" class="status-chip__icon" size="12" />{{ item.reviewLabel }}
                </span>              </div>

            </div>
            <div class="status-card__footer">
              <div class="step-time-row">
                <span>开始 {{ displayTime(item.startAt) }} ~ 截止 {{ displayTime(item.endAt || item.deadline) }}</span>
              </div>
              <span class="due-pill">{{ item.remainingLabel }}</span>
            </div>
            <div class="workflow-card__meta">{{ item.operatedAt || '暂无时间记录' }} · {{ item.lastOperatorName || '系统记录' }}</div>
            <div class="workflow-card__meta">点击查看节点详情</div>
          </button>
        </div>
        <!-- 加载骨架屏 -->
        <van-skeleton v-if="loading" title :row="6" />
      </div>
    </section>
  </div>
</template>
