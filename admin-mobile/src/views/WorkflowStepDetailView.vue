<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { deleteMobileFile, fetchMobileWorkflow, markMessageRead, requestMobileTaskChange, resetMobileTaskStatus, rescheduleMobileTask, reviewMobileTask, submitMobileTask, uploadMobileFile } from '../api';
import { sessionState } from '../session';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const submitting = ref(false);
const workflow = ref(null);
const materialUploads = ref([]);
const operationSection = ref(null);
const previewFile = ref(null);
const pdfPreview = reactive({
  loading: false,
  error: '',
  pages: [],
});
const showRescheduleForm = ref(false);
let refreshTimer = null;
const form = reactive({
  summary: '',
  note: '',
  comment: '',
  scheduledAt: '',
  location: '',
  reason: '',
  changeReason: '',
});
const businessForm = reactive({});

const workflowId = computed(() => route.params.workflowId || 'me');
const stepCode = computed(() => route.params.stepCode);
const currentTask = computed(() => (workflow.value?.steps || []).find((item) => item.stepCode === stepCode.value));
const canSubmitTask = computed(() => Boolean(currentTask.value?.canSubmit));
const canReviewTask = computed(() => Boolean(currentTask.value?.canReview));
const approveButtonText = computed(() => (currentTask.value?.taskType === 'notice' ? '确认同意' : '确认通过'));
const rejectButtonText = computed(() => (currentTask.value?.taskType === 'notice' ? '确认不同意' : '不通过退回'));
const canRequestChange = computed(() => Boolean(
  currentTask.value
    && !canSubmitTask.value
    && !canReviewTask.value
    && workflow.value?.applicant?.userId === sessionState.user?.id,
));
const canOperate = computed(() => Boolean(canSubmitTask.value || canReviewTask.value || currentTask.value?.canReschedule));
const operationHint = computed(() => {
  if (!currentTask.value) return '';
  if (canOperate.value) return '';
  if (currentTask.value.status === 'approved') return '该节点已通过，当前仅可查看办理记录和已提交材料。';
  if (currentTask.value.status === 'reviewing') return '该节点已提交审核，请等待有权限的审核人员处理。';
  if (currentTask.value.status === 'locked') return '该节点尚未开放，请先完成前置流程。';
  return '当前账号或节点状态暂不支持办理操作。';
});
const activeBusinessFields = computed(() => {
  const fields = currentTask.value?.businessFields || [];
  if (canSubmitTask.value && canReviewTask.value) {
    return fields;
  }
  if (canSubmitTask.value) {
    return fields.filter((item) => !item.owner || item.owner === 'applicant' || item.owner === 'both');
  }
  if (canReviewTask.value) {
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

function inputTypeForField(field) {
  if (field.type === 'date') return 'date';
  if (field.type === 'datetime') return 'datetime-local';
  return field.type === 'textarea' ? 'textarea' : 'text';
}

function normalizeBusinessValue(field, value) {
  if (field.type === 'datetime') return String(value || '').replace('T', ' ');
  return value || '';
}

function isImageAttachment(item) {
  const value = `${item?.mimeType || ''} ${item?.fileName || ''}`.toLowerCase();
  return value.includes('image/') || /\.(png|jpe?g|gif|webp)$/i.test(value);
}

function isPdfAttachment(item) {
  const value = `${item?.mimeType || ''} ${item?.fileName || ''}`.toLowerCase();
  return value.includes('application/pdf') || /\.pdf$/i.test(value);
}

function resetPreviewState() {
  pdfPreview.loading = false;
  pdfPreview.error = '';
  pdfPreview.pages = [];
}

function closePreview() {
  previewFile.value = null;
  resetPreviewState();
}

async function renderPdfPreview(item) {
  pdfPreview.loading = true;
  pdfPreview.error = '';
  pdfPreview.pages = [];
  try {
    const loadingTask = pdfjsLib.getDocument({
      url: item.fileUrl,
      withCredentials: false,
    });
    const pdf = await loadingTask.promise;
    const pageCount = Math.min(pdf.numPages, 8);
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push({
        pageNumber,
        imageUrl: canvas.toDataURL('image/png'),
      });
    }
    pdfPreview.pages = pages;
    if (pdf.numPages > pageCount) {
      pdfPreview.error = `已预览前 ${pageCount} 页，完整文件请下载查看。`;
    }
  } catch (error) {
    pdfPreview.error = error.message || 'PDF 预览失败，请下载后查看。';
  } finally {
    pdfPreview.loading = false;
  }
}

async function previewAttachment(item) {
  if (previewFile.value?.fileUrl === item.fileUrl) {
    closePreview();
    return;
  }
  previewFile.value = item;
  resetPreviewState();
  if (isPdfAttachment(item)) {
    await renderPdfPreview(item);
  }
}

async function scrollToOperation() {
  await nextTick();
  operationSection.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function syncFormFromTask(task) {
  form.summary = task?.formData?.summary || '';
  form.note = task?.formData?.note || '';
  form.comment = task?.reviewComment || '';
  form.scheduledAt = task?.formData?.meetingProposal?.scheduledAt || '';
  form.location = task?.formData?.meetingProposal?.location || '';
  form.reason = task?.formData?.meetingProposal?.reason || '';
  form.changeReason = '';
  Object.keys(businessForm).forEach((key) => delete businessForm[key]);
  const savedFields = task?.formData?.businessFields || {};
  (task?.businessFields || []).forEach((field) => {
    const savedValue = savedFields[field.key] || task?.formData?.[field.key] || '';
    businessForm[field.key] = field.type === 'datetime' ? String(savedValue).replace(' ', 'T') : savedValue;
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
    showSuccessToast(status === 'approved' ? approveButtonText.value.replace(/^确认/, '已') : rejectButtonText.value.replace(/^确认/, '已'));
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
      scheduledAt: String(form.scheduledAt || '').replace('T', ' '),
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

async function deleteAttachment(item) {
  if (!item?.id) return;
  await showConfirmDialog({
    title: '删除材料',
    message: `确认删除“${item.fileName}”吗？删除后可重新上传。`,
  });
  await deleteMobileFile(item.id);
  materialUploads.value = materialUploads.value.filter((upload) => upload.id !== item.id);
  if (previewFile.value?.id === item.id) previewFile.value = null;
  showSuccessToast('材料已删除');
}

function attachmentsByTag(tag) {
  return materialUploads.value.filter((item) => item.materialTag === tag);
}

function materialAccept(material) {
  const accept = material?.accept || ['pdf'];
  const values = [];
  if (accept.includes('pdf')) values.push('.pdf', 'application/pdf');
  if (accept.includes('image')) values.push('.jpg', '.jpeg', '.png', 'image/jpeg', 'image/png');
  return values.join(',');
}

async function resetStatus(status) {
  if (!currentTask.value) return;
  submitting.value = true;
  try {
    await resetMobileTaskStatus(workflow.value.workflowId, currentTask.value.taskId, {
      status,
      comment: form.comment || '状态纠正',
    });
    showSuccessToast('节点状态已调整');
    await loadWorkflow();
  } finally {
    submitting.value = false;
  }
}

async function requestChange() {
  if (!currentTask.value) return;
  if (!String(form.changeReason || '').trim()) {
    showFailToast('请填写更改申请说明');
    return;
  }
  submitting.value = true;
  try {
    await requestMobileTaskChange(workflow.value.workflowId, currentTask.value.taskId, {
      reason: form.changeReason,
    });
    showSuccessToast('更改申请已发送');
    form.changeReason = '';
  } finally {
    submitting.value = false;
  }
}

function buildBusinessPayload() {
  return activeBusinessFields.value.reduce((payload, field) => {
    payload[field.key] = normalizeBusinessValue(field, businessForm[field.key]);
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

onMounted(() => {
  loadWorkflow();
  refreshTimer = window.setInterval(loadWorkflow, 15000);
});

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});
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
          <div class="workflow-card__foot">
            <span>{{ currentTask.taskTypeLabel }}</span>
            <span v-if="currentTask.uploadRequired">含材料事项</span>
            <button v-if="canOperate" class="text-link text-link--button" type="button" @click="scrollToOperation"></button>
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
              <div class="step-item__meta">{{ material.required ? '必交材料' : '可选材料' }} · {{ (material.accept || ['pdf']).includes('image') ? 'PDF/图片' : 'PDF' }}</div>
            </div>
            <span class="tag-pair">{{ material.tag }}</span>
          </div>
          <van-uploader
            v-if="canSubmitTask || canReviewTask"
            class="material-uploader"
            :accept="materialAccept(material)"
            :after-read="(file) => handleUpload(file, material)"
          >
            <van-button icon="plus" size="small" type="danger" plain>上传{{ material.label }}</van-button>
          </van-uploader>
          <div class="upload-list" v-if="attachmentsByTag(material.tag).length">
            <div class="upload-list__item" v-for="item in attachmentsByTag(material.tag)" :key="item.fileUrl">
              <span>{{ item.fileName }}</span>
              <button class="text-link text-link--button" type="button" @click="previewAttachment(item)">预览</button>
              <a class="text-link" :href="item.fileUrl" target="_blank" rel="noreferrer">下载</a>
              <button v-if="canSubmitTask || canReviewTask" class="text-link text-link--button text-link--danger" type="button" @click="deleteAttachment(item)">删除</button>
            </div>
          </div>
          <div class="pdf-preview-card" v-if="previewFile?.materialTag === material.tag">
            <div class="table-row__head">
              <div class="table-row__title">{{ previewFile.fileName }}</div>
              <button class="text-link text-link--button" type="button" @click="closePreview">收起</button>
            </div>
            <img v-if="isImageAttachment(previewFile)" class="file-preview-image" :src="previewFile.fileUrl" alt="材料预览" />
            <template v-else-if="isPdfAttachment(previewFile)">
              <div class="empty-state empty-state--compact" v-if="pdfPreview.loading">正在生成 PDF 预览...</div>
              <div class="pdf-preview-pages" v-if="pdfPreview.pages.length">
                <img
                  v-for="page in pdfPreview.pages"
                  :key="page.pageNumber"
                  class="file-preview-image"
                  :src="page.imageUrl"
                  :alt="`PDF 第 ${page.pageNumber} 页`"
                />
              </div>
              <div class="empty-state empty-state--compact" v-if="pdfPreview.error">{{ pdfPreview.error }}</div>
            </template>
            <div class="empty-state empty-state--compact" v-else>当前文件类型暂不支持在线预览，请下载后查看。</div>
            <div class="preview-actions">
              <a class="text-link" :href="previewFile.fileUrl" target="_blank" rel="noreferrer">下载原文件</a>
            </div>
          </div>
          <div class="empty-state empty-state--compact" v-if="!attachmentsByTag(material.tag).length">暂未提交该项材料。</div>
        </div>
      </div>
    </section>

    <section class="section-card" v-if="currentTask" ref="operationSection">
      <div class="section-card__hd">
        <div class="section-card__title">办理操作</div>
        <div class="section-card__desc">请确认内容无误后再提交，操作将写入流程日志。</div>
      </div>
      <div class="section-card__bd" v-if="canOperate">
        <div class="field-block" v-if="canSubmitTask">
          <div class="field-label">办理说明</div>
          <van-field v-model="form.summary" rows="3" autosize type="textarea" placeholder="请填写本步骤的提交说明或补充内容" />
        </div>
        <div class="field-block" v-if="canSubmitTask">
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
            :type="inputTypeForField(field)"
            :placeholder="field.placeholder || `请填写${field.label}`"
          />
        </div>

        <template v-if="currentTask.canReschedule">
          <div class="field-block">
            <button class="fold-toggle" type="button" @click="showRescheduleForm = !showRescheduleForm">
              {{ showRescheduleForm ? '收起改期申请' : '展开改期申请' }}
            </button>
          </div>
          <template v-if="showRescheduleForm">
            <div class="field-block">
              <div class="field-label">申请改期时间</div>
              <van-field v-model="form.scheduledAt" type="datetime-local" placeholder="请选择改期时间" />
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
        </template>

        <div class="field-block" v-if="canReviewTask">
          <div class="field-label">审核意见</div>
          <van-field v-model="form.comment" rows="2" autosize type="textarea" placeholder="请填写审核意见或退回原因" />
        </div>

        <div class="section-actions">
          <van-button v-if="canSubmitTask" type="danger" :loading="submitting" @click="submitTask">确认提交</van-button>
          <van-button v-if="canReviewTask" type="danger" plain :loading="submitting" @click="approveTask('approved')">{{ approveButtonText }}</van-button>
          <van-button v-if="canReviewTask" plain :loading="submitting" @click="approveTask('rejected')">{{ rejectButtonText }}</van-button>
          <van-button v-if="currentTask.canReschedule && showRescheduleForm" plain type="warning" :loading="submitting" @click="requestReschedule">提交改期申请</van-button>
        </div>
      </div>
      <div class="section-card__bd" v-else>
        <div class="empty-state empty-state--compact">{{ operationHint }}</div>
        <template v-if="canRequestChange">
          <div class="field-block">
            <div class="field-label">更改申请说明</div>
            <van-field v-model="form.changeReason" rows="2" autosize type="textarea" placeholder="请说明需要调整的原因，由有权限人员处理" />
          </div>
          <div class="section-actions">
            <van-button type="danger" plain :loading="submitting" @click="requestChange">提交更改申请</van-button>
          </div>
        </template>
      </div>
      <div class="section-card__bd" v-if="canReviewTask && ['approved', 'rejected'].includes(currentTask.status)">
        <div class="field-block">
          <div class="field-label">状态纠正</div>
          <div class="step-item__meta">用于处理误通过、误驳回等情况，操作会写入流程日志。</div>
        </div>
        <div class="section-actions">
          <van-button plain type="danger" :loading="submitting" @click="resetStatus('pending')">改为进行中</van-button>
          <van-button plain :loading="submitting" @click="resetStatus('reviewing')">改为待审核</van-button>
        </div>
      </div>
    </section>
  </div>
</template>
