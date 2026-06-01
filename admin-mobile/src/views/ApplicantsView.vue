<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { http } from '../api';

const router = useRouter();
const loading = ref(false);
const applicants = ref([]);
const keyword = ref('');
const stage = ref('全部阶段');
const developmentStatus = ref('全部状态');
const stageOptions = ['全部阶段', '入党申请人', '入党积极分子', '发展对象', '预备党员', '正式党员'];
const statusOptions = ['全部状态', '发展中', '已完成'];

async function loadApplicants() {
  loading.value = true;
  try {
    const params = {};
    if (keyword.value) params.keyword = keyword.value;
    if (stage.value && stage.value !== '全部阶段') params.stage = stage.value;
    if (developmentStatus.value && developmentStatus.value !== '全部状态') params.developmentStatus = developmentStatus.value;
    applicants.value = await http.get('/applicants', { params });
  } finally {
    loading.value = false;
  }
}

function openDetail(item) {
  router.push(`/applicants/${item.id}`);
}

onMounted(loadApplicants);
</script>

<template>
  <div class="list-stack">
    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">申请人台账</div>
      </div>
      <div class="section-card__bd">
        <van-search v-model="keyword" placeholder="姓名 / 学号 / 单位关键字" shape="round" @search="loadApplicants" />
        <div class="field-block">
          <div class="field-label">阶段筛选</div>
          <van-radio-group v-model="stage" direction="horizontal">
            <van-radio v-for="item in stageOptions" :key="item" :name="item">{{ item }}</van-radio>
          </van-radio-group>
        </div>
        <div class="field-block">
          <div class="field-label">状态筛选</div>
          <van-radio-group v-model="developmentStatus" direction="horizontal">
            <van-radio v-for="item in statusOptions" :key="item" :name="item">{{ item }}</van-radio>
          </van-radio-group>
        </div>
        <van-button type="danger" block round @click="loadApplicants">查询</van-button>
      </div>
    </section>

    <section class="section-card" v-if="loading">
      <div class="section-card__bd">
        <van-skeleton title :row="5" />
      </div>
    </section>

    <section class="section-card" v-else>
      <div class="section-card__bd" v-if="applicants.length">
        <div class="table-like">
          <button v-for="item in applicants" :key="item.id" class="table-row" type="button" @click="openDetail(item)">
            <div class="table-row__head">
              <div>
                <div class="table-row__title">{{ item.name }} · {{ item.username }}</div>
                <div class="table-row__sub">{{ item.orgName || '未配置单位' }} · {{ item.branchName || '未限定支部' }}</div>
              </div>
              <span class="status-chip is-pending">{{ item.developmentStatus }}</span>
            </div>
            <div class="kv-grid">
              <div class="kv-item">
                <div class="kv-item__label">年级</div>
                <div class="kv-item__value">{{ item.grade || '未登记' }}</div>
              </div>
              <div class="kv-item">
                <div class="kv-item__label">当前节点</div>
                <div class="kv-item__value">{{ item.currentStepLabel || '流程已完成' }}</div>
              </div>
            </div>
          </button>
        </div>
      </div>
      <div class="empty-state" v-else>当前筛选条件下暂无申请人记录。</div>
    </section>
  </div>
</template>
