<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showSuccessToast } from 'vant';
import { fetchMobileWorkflow, rescheduleMobileTask, reviewMobileTask, submitMobileTask, uploadMobileFile } from '../api';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const submitting = ref(false);
const workflow = ref(null);
const collapseNames = ref([]);
const materialUploads = ref([]);
const form = reactive({
  summary: '',
  note: '',
  comment: '',
  scheduledAt: '',
  location: '',
  reason: '',
});

const workflowId = computed(() => route.params.workflowId || 'me');
const currentTask = computed(() => workflow.value?.currentStep || null);
const completedSteps = computed(() => workflow.value?.completedSteps || []);
const allSteps = computed(() => workflow.value?.steps || []);

function syncFormFromTask(task) {
  form.summary = task?.formData?.summary || '';
  form.note = task?.formData?.note || '';
  form.comment = task?.reviewComment || '';
  form.scheduledAt = task?.formData?.meetingProposal?.scheduledAt || '';
  form.location = task?.formData?.meetingProposal?.location || '';
  form.reason = task?.formData?.meetingProposal?.reason || '';
  materialUploads.value = [...(task?.attachments || [])];
}

watch(currentTask, (value) => syncFormFromTask(value), { immediate: true });

async function loadWorkflow() {
  loading.value = true;
  try {
    workflow.value = await fetchMobileWorkflow(workflowId.value);
  } finally {
    loading.value = false;
  }
}

async function submitTask() {
  if (!currentTask.value) return;
  submitting.value = true;
  try {
    await submitMobileTask(workflow.value.workflowId, currentTask.value.taskId, {
      formData: {
        summary: form.summary,
        note: form.note,
        attachments: materialUploads.value,
      },
    });
    showSuccessToast('提交成功');
    await loadWorkflow();
  } finally {
    submitting.value = false;
  }
}

async function approveTask(status) {
  if (!currentTask.value) return;
  submitting.value = true;
  try {
    await reviewMobileTask(workflow.value.workflowId, currentTask.value.taskId, {
      status,
      comment: form.comment,
    });
    showSuccessToast(status === 'approved' ? '已审核通过' : '已退回补充');
    await loadWorkflow();
  } finally {
    submitting.value = false;
  }
}

async function requestReschedule() {
  if (!currentTask.value) return;
  submitting.value = true;
  try {
    await rescheduleMobileTask(workflow.value.workflowId, currentTask.value.taskId, {
      scheduledAt: form.scheduledAt,
      location: form.location,
      reason: form.reason,
    });
    showSuccessToast('改期申请已提交');
    await loadWorkflow();
  } finally {
    submitting.value = false;
  }
}

async function handleUpload(fileWrapper) {
  const uploadSource = Array.isArray(fileWrapper) ? fileWrapper[0] : fileWrapper;
  const file = uploadSource.file || uploadSource;
  if (!currentTask.value) return;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('workflowId', workflow.value.workflowId);
  formData.append('stepCode', currentTask.value.stepCode);
  formData.append('materialTag', currentTask.value.materialSchema?.[0]?.tag || 'general');
  const result = await uploadMobileFile(formData);
  materialUploads.value.push(result);
  showSuccessToast('材料上传成功');
}

function openSpecificTask(task) {
  if (task.workflowId && task.workflowId !== workflowId.value) {
    router.push(`/workflow/${task.workflowId}`);
    return;
  }
  const panelName = `done-${task.stepCode}`;
  if (!collapseNames.value.includes(panelName)) {
    collapseNames.value = [...collapseNames.value, panelName];
  }
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
            <div class="section-card__desc">当前仅突出本人或当前权限范围内最需要处理的节点，已完成步骤折叠到下方。</div>
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
        <div class="task-hero task-hero--static">
          <div class="task-hero__top">
            <div>
              <div class="task-hero__title">{{ currentTask.stepName }}</div>
              <div class="task-hero__meta">{{ currentTask.taskOwner }} · {{ currentTask.currentStage }}</div>
            </div>
            <span class="status-chip" :class="`is-${currentTask.status}`">{{ currentTask.statusText }}</span>
          </div>
        </div>

        <div class="field-block" v-if="currentTask.canSubmit">
          <div class="field-label">办理说明</div>
          <van-field v-model="form.summary" rows="3" autosize type="textarea" placeholder="请填写本步骤的提交说明或补充内容" />
        </div>
        <div class="field-block" v-if="currentTask.canSubmit">
          <div class="field-label">补充备注</div>
          <van-field v-model="form.note" rows="2" autosize type="textarea" placeholder="可填写补充说明或材料目录" />
        </div>

        <template v-if="currentTask.canReschedule">
          <div class="field-block">
            <div class="field-label">申请改期时间</div>
            <van-field v-model="form.scheduledAt" placeholder="例如 2026-05-01 14:30" />
          </div>
          <div class="field-block">
            <div class="field-label">地点</div>
            <van-field v-model="form.location" placeholder="请输入谈话地点" />
          </div>
          <div class="field-block">
            <div class="field-label">改期原因</div>
            <van-field v-model="form.reason" rows="2" autosize type="textarea" placeholder="请说明时间冲突或改期原因" />
          </div>
        </template>

        <div class="field-block" v-if="currentTask.canReview">
          <div class="field-label">审核意见</div>
          <van-field v-model="form.comment" rows="2" autosize type="textarea" placeholder="请填写审核意见或退回原因" />
        </div>

        <div class="field-block" v-if="currentTask.materialSchema?.length">
          <div class="field-label">材料上传</div>
          <van-uploader :after-read="handleUpload" />
          <div class="upload-list" v-if="materialUploads.length">
            <div class="upload-list__item" v-for="item in materialUploads" :key="item.fileUrl">
              <span>{{ item.fileName }}</span>
              <span class="tag-pair">{{ item.materialTag || 'general' }}</span>
            </div>
          </div>
        </div>

        <div class="section-actions">
          <van-button v-if="currentTask.canSubmit" type="danger" :loading="submitting" @click="submitTask">提交当前节点</van-button>
          <van-button v-if="currentTask.canReview" type="danger" plain :loading="submitting" @click="approveTask('approved')">审核通过</van-button>
          <van-button v-if="currentTask.canReview" plain :loading="submitting" @click="approveTask('rejected')">退回补充</van-button>
          <van-button v-if="currentTask.canReschedule" plain type="warning" :loading="submitting" @click="requestReschedule">申请改期</van-button>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">步骤总览</div>
        <div class="section-card__desc">当前步骤和后续待办保留在前面，已完成步骤折叠展示。</div>
      </div>
      <div class="section-card__bd">
        <div class="step-list" v-if="allSteps.length">
          <button v-for="item in allSteps.filter((step) => step.status !== 'approved')" :key="item.taskId" type="button" class="step-item" @click="openSpecificTask(item)">
            <div class="step-item__head">
              <div>
                <div class="step-item__name">{{ item.stepName }}</div>
                <div class="step-item__meta">{{ item.phase }}</div>
              </div>
              <span class="status-chip" :class="`is-${item.status}`">{{ item.statusText }}</span>
            </div>
            <div class="step-item__meta">{{ item.summary }}</div>
          </button>
        </div>
        <van-collapse v-model="collapseNames" v-if="completedSteps.length">
          <van-collapse-item title="已完成步骤" name="completed">
            <div class="step-list">
              <div class="step-item" v-for="item in completedSteps" :key="item.stepCode">
                <div class="step-item__head">
                  <div>
                    <div class="step-item__name">{{ item.name }}</div>
                    <div class="step-item__meta">{{ item.phase }}</div>
                  </div>
                  <span class="status-chip is-approved">{{ item.statusText }}</span>
                </div>
                <div class="step-item__meta">{{ item.operatedAt || '暂无时间记录' }} · {{ item.lastOperatorName || '系统记录' }}</div>
              </div>
            </div>
          </van-collapse-item>
        </van-collapse>
        <van-skeleton v-if="loading" title :row="6" />
      </div>
    </section>
  </div>
</template>
