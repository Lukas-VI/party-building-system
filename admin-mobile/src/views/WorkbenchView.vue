<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchWorkbench, markMessageRead } from '../api';
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
  if (item.action === 'open-first-todo') {
    if (todoItems.value.length) {
      openTask(todoItems.value[0]);
      return;
    }
    router.push({ name: 'reviews' });
    return;
  }
  if (item.routeName) {
    router.push({ name: item.routeName, params: item.routeParams || {}, query: item.routeQuery || {} });
    return;
  }
  if (item.route) {
    router.push(item.route).catch(() => {
      window.location.hash = `#${item.route}`;
    });
  }
}

function openTask(task) {
  if (task.stepCode) {
    router.push({
      name: 'workflow-step-detail',
      params: {
        workflowId: task.workflowId,
        stepCode: task.stepCode,
      },
    });
    return;
  }
  router.push(`/workflow/${task.workflowId}`);
}

function openMetric(item) {
  if (!item.route) return;
  router.push(item.route);
}

async function openMessage(item) {
  if (item.status === 'unread') {
    await markMessageRead(item.id);
  }
  if (item.targetRoute) {
    router.push(item.targetRoute);
  } else {
    await loadData();
  }
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
          <button class="metric-item metric-item--button" v-for="item in workbench.metrics" :key="item.label" type="button" @click="openMetric(item)">
            <div class="metric-item__label">{{ item.label }}</div>
            <div class="metric-item__value">{{ item.value }}</div>
            <div class="metric-item__desc">{{ item.desc }}</div>
          </button>
        </div>
      </div>
    </section>

    <section class="section-card" v-if="nextTask">
      <div class="section-card__hd">
        <div class="section-card__title">下一项重点任务</div>
      </div>
      <div class="section-card__bd">
        <button type="button" class="workflow-card status-card" :class="nextTask.reviewClassName || `is-${nextTask.status}`" @click="openTask(nextTask)">
          <van-icon :name="nextTask.reviewIcon || 'clock-o'" class="status-card__mark" />
          <div class="status-card__content">
            <div class="status-card__main">
              <div class="step-order">{{ nextTask.orderLabel || '下一步' }}</div>
              <div class="workflow-card__title">{{ nextTask.stepName }}</div>
              <div class="workflow-card__meta">{{ nextTask.phase }} · {{ nextTask.taskOwner }}</div>
            </div>
            <span class="status-chip" :class="nextTask.reviewClassName || `is-${nextTask.status}`">
              <van-icon :name="nextTask.reviewIcon || 'clock-o'" class="status-chip__icon" size="12" />{{ nextTask.reviewLabel || nextTask.statusText }}
            </span>
          </div>
          <div class="status-card__summary">{{ nextTask.summary }}</div>
          <div class="workflow-card__foot">
            <span>{{ nextTask.applicantName || '本人流程' }}</span>
            <span>{{ nextTask.currentStage }}</span>
          </div>
        </button>
      </div>
    </section>

    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">快捷入口</div>
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
      </div>
      <div class="section-card__bd">
        <div class="table-like" v-if="previewMessages.length">
          <button class="panel-note panel-note--button" v-for="item in previewMessages" :key="item.id" type="button" @click="openMessage(item)">
            <div class="table-row__head">
              <div class="table-row__title">{{ item.title }}</div>
              <span class="tag-pair">{{ item.status === 'unread' ? '未读' : '已读' }}</span>
            </div>
            <div class="panel-note__text">{{ item.content }}</div>
            <div class="step-item__meta">{{ item.createdAt }} <span v-if="item.targetLabel">· {{ item.targetLabel }}</span></div>
          </button>
        </div>
        <div class="empty-state" v-else-if="!loading">暂无消息提醒。</div>
        <van-skeleton v-else title :row="3" />
      </div>
    </section>

    <section class="section-card" v-if="workbench?.recentLogs?.length">
      <div class="section-card__hd">
        <div class="section-card__title">最近操作</div>
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
