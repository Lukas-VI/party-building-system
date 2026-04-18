<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showSuccessToast } from 'vant';
import { http } from '../api';
import NoticePanel from '../components/NoticePanel.vue';
import { DESKTOP_ADMIN_URL } from '../config';
import { roleActions, sessionState } from '../session';

const router = useRouter();
const loading = ref(false);
const dashboard = ref(null);
const orgStats = ref([]);
const branchStats = ref([]);

const actions = computed(() => roleActions(sessionState.user));

async function loadData() {
  loading.value = true;
  try {
    const [dashboardRes, orgRes, branchRes] = await Promise.all([
      http.get('/dashboard/me'),
      http.get('/stats/by-org'),
      http.get('/stats/by-branch'),
    ]);
    dashboard.value = dashboardRes;
    orgStats.value = orgRes;
    branchStats.value = branchRes;
  } finally {
    loading.value = false;
  }
}

function handleAction(item) {
  if (item.external) {
    window.location.href = DESKTOP_ADMIN_URL;
    return;
  }
  router.push(item.route);
}

function openDesktopForExport() {
  window.open(DESKTOP_ADMIN_URL, '_blank', 'noopener');
  showSuccessToast('已打开桌面后台，可继续执行导出与复杂配置。');
}

onMounted(loadData);
</script>

<template>
  <div class="list-stack">
    <section class="section-card" v-if="dashboard">
      <div class="section-card__hd">
        <div class="section-card__title">{{ dashboard.welcome }}</div>
        <div class="section-card__desc">当前数据范围：{{ dashboard.scopeLabel }}，请按规范及时处理待办事项。</div>
      </div>
      <div class="section-card__bd">
        <div class="metric-grid">
          <div class="metric-item" v-for="item in dashboard.metrics" :key="item.label">
            <div class="metric-item__label">{{ item.label }}</div>
            <div class="metric-item__value">{{ item.value }}</div>
            <div class="metric-item__desc">{{ item.desc }}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">快捷入口</div>
        <div class="section-card__desc">移动端只保留高频操作，复杂导出与配置继续放在桌面端</div>
      </div>
      <div class="section-card__bd">
        <div class="mini-grid">
          <button v-for="item in actions" :key="item.title" class="quick-action" type="button" @click="handleAction(item)">
            <div class="quick-action__title">{{ item.title }}</div>
            <div class="quick-action__desc">{{ item.desc }}</div>
          </button>
        </div>
      </div>
    </section>

    <NoticePanel />

    <section class="section-card" v-if="dashboard?.stageDistribution?.length">
      <div class="section-card__hd">
        <div class="section-card__title">阶段分布</div>
        <div class="section-card__desc">当前权限范围内申请人的阶段概况</div>
      </div>
      <div class="section-card__bd">
        <div class="table-like">
          <div class="table-row" v-for="item in dashboard.stageDistribution" :key="item.stage">
            <div class="table-row__head">
              <div class="table-row__title">{{ item.stage }}</div>
              <span class="tag-pair">{{ item.count }} 人</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card" v-if="orgStats.length">
      <div class="section-card__hd">
        <div class="page-toolbar">
          <div>
            <div class="section-card__title">单位统计</div>
            <div class="section-card__desc">移动端只展示重点统计，完整台账和导出请转桌面端</div>
          </div>
          <van-button size="small" type="danger" plain @click="openDesktopForExport">转桌面端</van-button>
        </div>
      </div>
      <div class="section-card__bd">
        <div class="table-like">
          <div class="table-row" v-for="item in orgStats" :key="item.orgName">
            <div class="table-row__head">
              <div class="table-row__title">{{ item.orgName }}</div>
              <span class="tag-pair">{{ item.applicants }} 人</span>
            </div>
            <div class="kv-grid">
              <div class="kv-item">
                <div class="kv-item__label">入门阶段</div>
                <div class="kv-item__value">{{ item.pending }}</div>
              </div>
              <div class="kv-item">
                <div class="kv-item__label">重点审核</div>
                <div class="kv-item__value">{{ item.reviewing }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card" v-if="branchStats.length">
      <div class="section-card__hd">
        <div class="section-card__title">支部概览</div>
        <div class="section-card__desc">用于手机端快速判断支部活跃流程规模</div>
      </div>
      <div class="section-card__bd">
        <div class="table-like">
          <div class="table-row" v-for="item in branchStats" :key="item.branchName">
            <div class="table-row__head">
              <div class="table-row__title">{{ item.branchName }}</div>
              <span class="tag-pair">{{ item.applicants }} 人</span>
            </div>
            <div class="table-row__sub">当前处于办理中的流程人数：{{ item.activeSteps }}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="section-card" v-if="loading">
      <div class="section-card__bd">
        <van-skeleton title :row="6" />
      </div>
    </section>
  </div>
</template>
