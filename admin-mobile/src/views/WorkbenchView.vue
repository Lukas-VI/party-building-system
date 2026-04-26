<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchWorkbench } from '../api';
import { sessionState, workbenchActions } from '../session';

const router = useRouter();
const loading = ref(false);
const workbench = ref(null);

const actions = computed(() => workbenchActions(sessionState.user));
const previewMessages = computed(() => workbench.value?.messages || []);
const todoItems = computed(() => workbench.value?.todos || []);
const nextTask = computed(() => workbench.value?.nextTask || null);
async function loadData() {
  loading.value = true;
  try {
    workbench.value = await fetchWorkbench();
  } finally {
    loading.value = false;
  }
}

function openAction(item) {
  if (item.external) {
    window.location.href = item.external;
    return;
  }
  router.push(item.route);
}

function openTask(task) {
  router.push(`/workflow/${task.workflowId}`);
}

onMounted(loadData);
</script>

<template>
  <div class="list-stack">
    <section class="section-card" v-if="workbench?.currentUser">
      <div class="section-card__hd">
        <div class="section-card__title">{{ workbench.currentUser.name }}</div>
        <div class="section-card__desc">{{ workbench.currentUser.roleLabel }} · {{ workbench.currentUser.scopeLabel }}</div>
      </div>
      <div class="section-card__bd">
        <div class="metric-grid" v-if="workbench.metrics?.length">
          <div class="metric-item" v-for="item in workbench.metrics" :key="item.label">
            <div class="metric-item__label">{{ item.label }}</div>
            <div class="metric-item__value">{{ item.value }}</div>
            <div class="metric-item__desc">{{ item.desc }}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card" v-if="nextTask">
      <div class="section-card__hd">
        <div class="section-card__title">下一项重点任务</div>
        <div class="section-card__desc">首页只突出当前最需要处理的节点，其余待办下移。</div>
      </div>
      <div class="section-card__bd">
        <button type="button" class="task-hero" @click="openTask(nextTask)">
          <div class="task-hero__top">
            <div>
              <div class="task-hero__title">{{ nextTask.stepName }}</div>
              <div class="task-hero__meta">{{ nextTask.phase }} · {{ nextTask.taskOwner }}</div>
            </div>
            <span class="status-chip" :class="`is-${nextTask.status}`">{{ nextTask.statusText }}</span>
          </div>
          <div class="task-hero__body">{{ nextTask.summary }}</div>
          <div class="task-hero__foot">
            <span>{{ nextTask.applicantName || '本人流程' }}</span>
            <span>{{ nextTask.currentStage }}</span>
          </div>
        </button>
      </div>
    </section>

    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">快捷入口</div>
        <div class="section-card__desc">申请人仅保留资料、流程和材料入口；审核者可直接进入待办与流程查询。</div>
      </div>
      <div class="section-card__bd">
        <div class="mini-grid">
          <button v-for="item in actions" :key="item.title" class="quick-action" type="button" @click="openAction(item)">
            <div class="quick-action__title">{{ item.title }}</div>
            <div class="quick-action__desc">{{ item.desc }}</div>
          </button>
        </div>
      </div>
    </section>
    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">待办事项</div>
        <div class="section-card__desc">已完成节点不再挤在首屏，待办优先展示，便于在微信内快速处理。</div>
      </div>
      <div class="section-card__bd">
        <div class="table-like" v-if="todoItems.length">
          <button v-for="item in todoItems" :key="`${item.workflowId}-${item.taskId}`" type="button" class="table-row" @click="openTask(item)">
            <div class="table-row__head">
              <div class="table-row__title">{{ item.stepName }}</div>
              <span class="status-chip" :class="`is-${item.status}`">{{ item.statusText }}</span>
            </div>
            <div class="table-row__sub">{{ item.applicantName || '本人流程' }} · {{ item.summary }}</div>
          </button>
        </div>
        <div class="empty-state" v-else-if="!loading">当前没有待办事项。</div>
        <van-skeleton v-else title :row="5" />
      </div>
    </section>

    <section class="section-card" v-if="workbench?.process">
      <div class="section-card__hd">
        <div class="section-card__title">流程概览</div>
        <div class="section-card__desc">已完成步骤折叠至流程页，本处只保留阶段、进度和当前节点。</div>
      </div>
      <div class="section-card__bd">
        <div class="kv-grid">
          <div class="kv-item">
            <div class="kv-item__label">当前阶段</div>
            <div class="kv-item__value">{{ workbench.process.currentStage }}</div>
          </div>
          <div class="kv-item">
            <div class="kv-item__label">已完成步骤</div>
            <div class="kv-item__value">{{ workbench.process.completedCount }} / {{ workbench.process.totalCount }}</div>
          </div>
          <div class="kv-item" style="grid-column: 1 / -1;" v-if="workbench.process.currentStep">
            <div class="kv-item__label">当前节点</div>
            <div class="kv-item__value">{{ workbench.process.currentStep.stepName }}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">消息提醒</div>
        <div class="section-card__desc">系统会围绕节点创建、审核结果、改期确认和关键时间提醒推送消息。</div>
      </div>
      <div class="section-card__bd">
        <div class="table-like" v-if="previewMessages.length">
          <div class="panel-note" v-for="item in previewMessages" :key="item.id">
            <div class="table-row__head">
              <div class="table-row__title">{{ item.title }}</div>
              <span class="tag-pair">{{ item.status === 'unread' ? '未读' : '已读' }}</span>
            </div>
            <div class="panel-note__text">{{ item.content }}</div>
            <div class="step-item__meta">{{ item.createdAt }}</div>
          </div>
        </div>
        <div class="empty-state" v-else-if="!loading">暂无消息提醒。</div>
        <van-skeleton v-else title :row="3" />
      </div>
    </section>

    <section class="section-card" v-if="workbench?.recentLogs?.length">
      <div class="section-card__hd">
        <div class="section-card__title">最近操作</div>
        <div class="section-card__desc">所有关键修改均留痕，不允许无痕改时间或材料状态。</div>
      </div>
      <div class="section-card__bd">
        <div class="table-like">
          <div class="panel-note" v-for="item in workbench.recentLogs" :key="`${item.action}-${item.createdAt}`">
            <div class="table-row__title">{{ item.action }}</div>
            <div class="step-item__meta">{{ item.createdAt }} · {{ item.targetType }} / {{ item.targetId }}</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
