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
  <div class="list-stack">
    <section class="section-card">
      <div class="section-card__hd">
        <div class="page-toolbar">
          <div>
            <div class="section-card__title">流程办理</div>
          </div>
          <van-button plain type="danger" size="small" @click="router.back()">返回</van-button>
        </div>
      </div>
      <div class="section-card__bd" v-if="workflow?.applicant">
        <div class="kv-grid">
          <div class="kv-item"><div class="kv-item__label">姓名</div><div class="kv-item__value">{{ workflow.applicant.name }}</div></div>
          <div class="kv-item"><div class="kv-item__label">账号</div><div class="kv-item__value">{{ workflow.applicant.username }}</div></div>
          <div class="kv-item"><div class="kv-item__label">当前阶段</div><div class="kv-item__value">{{ workflow.currentStage }}</div></div>
          <div class="kv-item"><div class="kv-item__label">联系电话</div><div class="kv-item__value">{{ workflow.applicant.phone || '未填写' }}</div></div>
        </div>
      </div>
    </section>

    <section class="section-card" v-if="currentTask">
      <div class="section-card__hd">
        <div class="section-card__title">当前节点</div>
        <div class="section-card__desc">{{ currentTask.phase }} · {{ currentTask.summary }}</div>
      </div>
      <div class="section-card__bd">
        <button class="task-hero" type="button" @click="openStep(currentTask)">
          <div class="task-hero__top">
            <div>
              <div class="task-hero__title">{{ currentTask.stepName }}</div>
              <div class="task-hero__meta">{{ currentTask.taskOwner }} · {{ currentTask.currentStage }}</div>
            </div>
            <span class="status-chip" :class="`is-${currentTask.status}`">{{ currentTask.statusText }}</span>
          </div>
          <div class="task-hero__body" v-if="currentTask.blessingText">{{ currentTask.blessingText }}</div>
          <div class="task-hero__foot">
            <span>点击查看详情</span>
            <span v-if="currentTask.uploadRequired">含材料事项</span>
          </div>
        </button>
      </div>
    </section>

    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">步骤总览</div>
        <div class="section-card__desc">点击任一步骤进入详情页查看记录或办理事项。</div>
      </div>
      <div class="section-card__bd">
        <div class="step-list" v-if="allSteps.length">
          <button v-for="item in allSteps.filter((step) => step.status !== 'approved')" :key="item.taskId" type="button" class="step-item" @click="openStep(item)">
            <div class="step-item__head">
              <div>
                <div class="step-item__name">{{ item.stepName }}</div>
                <div class="step-item__meta">{{ item.phase }}</div>
              </div>
              <span class="status-chip" :class="`is-${item.status}`">{{ item.statusText }}</span>
            </div>
            <div class="step-item__meta">{{ item.summary }}</div>
            <div class="step-item__meta" v-if="item.uploadRequired">需提交材料，可点开查看或上传。</div>
          </button>
        </div>
        <div class="formal-divider" v-if="completedSteps.length"></div>
        <div class="section-card__title section-card__title--sub" v-if="completedSteps.length">已完成步骤</div>
        <div class="step-list" v-if="completedSteps.length">
          <button class="step-item" v-for="item in completedSteps" :key="item.stepCode" type="button" @click="openStep(item)">
            <div class="step-item__head">
              <div>
                <div class="step-item__name">{{ item.stepName }}</div>
                <div class="step-item__meta">{{ item.phase }}</div>
              </div>
              <span class="status-chip is-approved">{{ item.statusText }}</span>
            </div>
            <div class="step-item__meta">{{ item.operatedAt || '暂无时间记录' }} · {{ item.lastOperatorName || '系统记录' }}</div>
            <div class="step-item__meta">点击查看节点详情</div>
          </button>
        </div>
        <van-skeleton v-if="loading" title :row="6" />
      </div>
    </section>
  </div>
</template>
