<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showFailToast, showSuccessToast } from 'vant';
import { fetchMobileWorkflow, markMessageRead, rescheduleMobileTask, reviewMobileTask, submitMobileTask, uploadMobileFile } from '../api';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const submitting = ref(false);
const workflow = ref(null);
const materialUploads = ref([]);
const form = reactive({
  summary: '',
  note: '',
  comment: '',
  scheduledAt: '',
  location: '',
  reason: '',
});
const businessForm = reactive({});

const workflowId = computed(() => route.params.workflowId || 'me');
const stepCode = computed(() => route.params.stepCode);
const currentTask = computed(() => (workflow.value?.steps || []).find((item) => item.stepCode === stepCode.value));
const canOperate = computed(() => Boolean(currentTask.value?.canSubmit || currentTask.value?.canReview || currentTask.value?.canReschedule));
const activeBusinessFields = computed(() => {
  const fields = currentTask.value?.businessFields || [];
  if (currentTask.value?.canSubmit && currentTask.value?.canReview) {
    return fields;
  }
  if (currentTask.value?.canSubmit) {
    return fields.filter((item) => !item.owner || item.owner === 'applicant' || item.owner === 'both');
  }
  if (currentTask.value?.canReview) {
    return fields.filter((item) => !item.owner || item.owner === 'reviewer' || item.owner === 'both');
  }
  return [];
});
const filledBusinessFields = computed(() => {
  const saved = currentTask.value?.formData?.businessFields || {};
  return (currentTask.value?.businessFields || [])
    .map((field) => ({ ...field, value: saved[field.key] || currentTask.value?.formData?.[field.key] || '' }))
    .filter((field) => field.value);
});

function displayTime(value) {
  return value || '未设置';
}

function syncFormFromTask(task) {
  form.summary = task?.formData?.summary || '';
  form.note = task?.formData?.note || '';
  form.comment = task?.reviewComment || '';
  form.scheduledAt = task?.formData?.meetingProposal?.scheduledAt || '';
  form.location = task?.formData?.meetingProposal?.location || '';
  form.reason = task?.formData?.meetingProposal?.reason || '';
  Object.keys(businessForm).forEach((key) => delete businessForm[key]);
  const savedFields = task?.formData?.businessFields || {};
  (task?.businessFields || []).forEach((field) => {
    businessForm[field.key] = savedFields[field.key] || task?.formData?.[field.key] || '';
  });
  materialUploads.value = [...(task?.attachments || [])];
}

watch(currentTask, (value) => syncFormFromTask(value), { immediate: true });

async function loadWorkflow() {
  loading.value = true;
  try {
    workflow.value = await fetchMobileWorkflow(workflowId.value);
    if (route.query.notificationId) {
      try {
        await markMessageRead(route.query.notificationId);
      } catch (error) {
        void error;
      }
    }
  } finally {
    loading.value = false;
  }
}

async function submitTask() {
  if (!currentTask.value) return;
  const validationError = validateBusinessFields();
  if (validationError) {
    showFailToast(validationError);
    return;
  }
  const materialError = validateRequiredMaterials();
  if (materialError) {
    showFailToast(materialError);
    return;
  }
  submitting.value = true;
  try {
    await submitMobileTask(workflow.value.workflowId, currentTask.value.taskId, {
      formData: {
        summary: form.summary,
        note: form.note,
        businessFields: buildBusinessPayload(),
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
  const validationError = status === 'approved' ? validateBusinessFields() : '';
  if (validationError) {
    showFailToast(validationError);
    return;
  }
  const materialError = status === 'approved' ? validateRequiredMaterials() : '';
  if (materialError) {
    showFailToast(materialError);
    return;
  }
  submitting.value = true;
  try {
    await reviewMobileTask(workflow.value.workflowId, currentTask.value.taskId, {
      status,
      comment: form.comment,
      formData: {
        businessFields: buildBusinessPayload(),
      },
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

async function handleUpload(fileWrapper, material) {
  const uploadSource = Array.isArray(fileWrapper) ? fileWrapper[0] : fileWrapper;
  const file = uploadSource.file || uploadSource;
  if (!currentTask.value) return;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('workflowId', workflow.value.workflowId);
  formData.append('stepCode', currentTask.value.stepCode);
  formData.append('materialTag', material?.tag || currentTask.value.materialSchema?.[0]?.tag || 'general');
  const result = await uploadMobileFile(formData);
  materialUploads.value.push(result);
  showSuccessToast('材料上传成功');
}

function attachmentsByTag(tag) {
  return materialUploads.value.filter((item) => item.materialTag === tag);
}

function materialAccept(material) {
  const acceptMap = {
    pdf: '.pdf,application/pdf',
    image: '.jpg,.jpeg,.png,image/jpeg,image/png',
  };
  return (material?.accept || []).map((item) => acceptMap[item]).filter(Boolean).join(',');
}

function buildBusinessPayload() {
  return activeBusinessFields.value.reduce((payload, field) => {
    payload[field.key] = businessForm[field.key] || '';
    return payload;
  }, {});
}

function validateBusinessFields() {
  const missing = activeBusinessFields.value.find((field) => field.required && !String(businessForm[field.key] || '').trim());
  return missing ? `请填写${missing.label}` : '';
}

function validateRequiredMaterials() {
  const missing = (currentTask.value?.materialSchema || []).find((material) => material.required && !attachmentsByTag(material.tag).length);
  return missing ? `请上传${missing.label}` : '';
}

onMounted(loadWorkflow);
</script>

<template>
  <div class="list-stack">
    <section class="section-card">
      <div class="section-card__hd">
        <div class="page-toolbar">
          <div>
            <div class="section-card__title">节点详情</div>
            <div class="section-card__desc" v-if="workflow?.applicant">{{ workflow.applicant.name }} · {{ workflow.currentStage }}</div>
          </div>
          <van-button plain type="danger" size="small" @click="router.back()">返回</van-button>
        </div>
      </div>
      <div class="section-card__bd" v-if="currentTask">
        <div class="workflow-card workflow-card--static status-card" :class="currentTask.reviewClassName">
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
          <div class="status-card__footer">
            <div class="step-time-row">
              <span>{{ displayTime(currentTask.startAt) }} 开始   {{ displayTime(currentTask.endAt || currentTask.deadline) }} 截止</span>
            </div>
            <span class="due-pill" :class="{ 'is-overdue': currentTask.isOverdue }">{{ currentTask.remainingLabel }}</span>
          </div>
          <div class="status-card__summary">{{ currentTask.summary }}</div>
          <div class="workflow-card__body" v-if="currentTask.blessingText">{{ currentTask.blessingText }}</div>
          <div class="workflow-card__foot">
            <span v-if="currentTask.uploadRequired">含材料事项</span>
          </div>
        </div>
      </div>
      <div class="empty-state" v-else-if="!loading">未找到该流程节点。</div>
      <van-skeleton v-else title :row="6" />
    </section>

    <section class="section-card" v-if="currentTask">
      <div class="section-card__hd">
        <div class="section-card__title">办理记录</div>
      </div>
      <div class="section-card__bd">
          <div class="kv-grid">
            <div class="kv-item"><div class="kv-item__label">办理时间</div><div class="kv-item__value">{{ currentTask.operatedAt || '暂无记录' }}</div></div>
            <div class="kv-item"><div class="kv-item__label">确认时间</div><div class="kv-item__value">{{ currentTask.confirmedAt || '暂无记录' }}</div></div>
            <div class="kv-item" style="grid-column: 1 / -1;"><div class="kv-item__label">审核意见</div><div class="kv-item__value">{{ currentTask.reviewComment || '暂无意见' }}</div></div>
            <div class="kv-item" v-for="field in filledBusinessFields" :key="field.key">
              <div class="kv-item__label">{{ field.label }}</div>
              <div class="kv-item__value">{{ field.value }}</div>
            </div>
          </div>
      </div>
    </section>

    <section class="section-card" v-if="currentTask?.materialSchema?.length">
      <div class="section-card__hd">
        <div class="section-card__title">材料提交与查看</div>
        <div class="section-card__desc">材料按当前节点归集，已提交文件可预览或下载。</div>
      </div>
      <div class="section-card__bd">
        <div class="material-block" v-for="material in currentTask.materialSchema" :key="material.key">
          <div class="table-row__head">
            <div>
              <div class="table-row__title">{{ material.label }}</div>
              <div class="step-item__meta">{{ material.required ? '必交材料' : '可选材料' }} · {{ (material.accept || []).join('、') }}</div>
            </div>
            <span class="tag-pair">{{ material.tag }}</span>
          </div>
          <van-uploader v-if="currentTask.canSubmit || currentTask.canReview" :accept="materialAccept(material)" :after-read="(file) => handleUpload(file, material)" />
          <div class="upload-list" v-if="attachmentsByTag(material.tag).length">
            <div class="upload-list__item" v-for="item in attachmentsByTag(material.tag)" :key="item.fileUrl">
              <span>{{ item.fileName }}</span>
              <a class="text-link" :href="item.fileUrl" target="_blank" rel="noreferrer">预览/下载</a>
            </div>
          </div>
          <div class="empty-state empty-state--compact" v-else>暂未提交该项材料。</div>
        </div>
      </div>
    </section>

    <section class="section-card" v-if="currentTask && canOperate">
      <div class="section-card__hd">
        <div class="section-card__title">办理操作</div>
        <div class="section-card__desc">请确认内容无误后再提交，操作将写入流程日志。</div>
      </div>
      <div class="section-card__bd">
        <div class="field-block" v-if="currentTask.canSubmit">
          <div class="field-label">办理说明</div>
          <van-field v-model="form.summary" rows="3" autosize type="textarea" placeholder="请填写本步骤的提交说明或补充内容" />
        </div>
        <div class="field-block" v-if="currentTask.canSubmit">
          <div class="field-label">补充备注</div>
          <van-field v-model="form.note" rows="2" autosize type="textarea" placeholder="可填写补充说明或材料目录" />
        </div>

        <div class="field-block" v-for="field in activeBusinessFields" :key="field.key">
          <div class="field-label">{{ field.label }}<span v-if="field.required"> *</span></div>
          <van-radio-group
            v-if="field.type === 'select'"
            v-model="businessForm[field.key]"
            direction="vertical"
          >
            <van-radio v-for="option in field.options || []" :key="option" :name="option">{{ option }}</van-radio>
          </van-radio-group>
          <van-field
            v-else
            v-model="businessForm[field.key]"
            :rows="field.type === 'textarea' ? 3 : 1"
            :autosize="field.type === 'textarea'"
            :type="field.type === 'textarea' ? 'textarea' : 'text'"
            :placeholder="field.placeholder || (field.type === 'date' ? '例如 2026-05-01' : field.type === 'datetime' ? '例如 2026-05-01 14:30' : `请填写${field.label}`)"
          />
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

        <div class="section-actions">
          <van-button v-if="currentTask.canSubmit" type="danger" :loading="submitting" @click="submitTask">确认提交</van-button>
          <van-button v-if="currentTask.canReview" type="danger" plain :loading="submitting" @click="approveTask('approved')">确认通过</van-button>
          <van-button v-if="currentTask.canReview" plain :loading="submitting" @click="approveTask('rejected')">退回补充</van-button>
          <van-button v-if="currentTask.canReschedule" plain type="warning" :loading="submitting" @click="requestReschedule">提交改期申请</van-button>
        </div>
      </div>
    </section>
  </div>
</template>
