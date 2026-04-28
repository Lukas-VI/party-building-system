const baseStep = {
  orderLabel: '第1步',
  stepName: '递交入党申请书',
  phase: '申请入党',
  taskOwner: '申请人',
  currentStage: '入党申请人',
  summary: '按要求提交申请书，并等待党组织审核。',
  startAt: '2026-04-20',
  endAt: '2026-05-20',
  remainingLabel: '剩余23天',
  isOverdue: false,
  uploadRequired: true,
};

const states = [
  {
    ...baseStep,
    reviewIcon: 'clock-o',
    reviewLabel: '待处理',
    reviewClassName: 'is-pending',
  },
  {
    ...baseStep,
    orderLabel: '第2步',
    stepName: '党组织派人谈话',
    reviewIcon: 'stop-circle-o',
    reviewLabel: '未开放',
    reviewClassName: 'is-not-started',
    uploadRequired: false,
  },
  {
    ...baseStep,
    orderLabel: '第3步',
    stepName: '确定入党积极分子',
    reviewIcon: 'passed',
    reviewLabel: '已通过',
    reviewClassName: 'is-approved',
    blessingText: '该节点已完成，请继续关注后续流程通知。',
  },
  {
    ...baseStep,
    orderLabel: '第4步',
    stepName: '材料审核',
    reviewIcon: 'close',
    reviewLabel: '未通过',
    reviewClassName: 'is-rejected',
    summary: '材料审核未通过，请根据审核意见补充后重新提交。',
    remainingLabel: '已超期2天',
    isOverdue: true,
  },
];

function cardTemplate() {
  return `
    <button type="button" class="workflow-card status-card" :class="item.reviewClassName">
      <van-icon :name="item.reviewIcon" class="status-card__mark" />
      <div class="status-card__content">
        <div class="status-card__main">
          <div class="step-order">{{ item.orderLabel }}</div>
          <div class="workflow-card__title">{{ item.stepName }}</div>
          <div class="workflow-card__meta">{{ item.phase }} · {{ item.taskOwner }}</div>
        </div>
        <span class="status-chip" :class="item.reviewClassName">
          <van-icon :name="item.reviewIcon" class="status-chip__icon" size="12" />{{ item.reviewLabel }}
        </span>
      </div>
      <div class="status-card__summary">{{ item.summary }}</div>
      <div class="status-card__footer">
        <div class="step-time-row">
          <span>开始 {{ item.startAt }}</span>
          <span>截止 {{ item.endAt }}</span>
        </div>
        <span class="due-pill" :class="{ 'is-overdue': item.isOverdue }">{{ item.remainingLabel }}</span>
      </div>
      <div class="workflow-card__meta" v-if="item.uploadRequired">需提交材料，可点开查看或上传。</div>
      <div class="workflow-card__body" v-if="item.blessingText">{{ item.blessingText }}</div>
    </button>
  `;
}

export default {
  title: 'Mobile/Workflow Cards',
};

export const AllStates = {
  render: () => ({
    data: () => ({ states }),
    template: `
      <div class="list-stack story-card-list">
        <div v-for="item in states" :key="item.orderLabel">
          ${cardTemplate()}
        </div>
      </div>
    `,
  }),
};

export const WorkflowCard = {
  render: () => ({
    data: () => ({ item: states[0] }),
    template: cardTemplate(),
  }),
};
