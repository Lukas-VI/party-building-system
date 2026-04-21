<script setup>
import { onMounted, ref } from 'vue';
import { fetchMessages } from '../api';

const loading = ref(false);
const messages = ref([]);

async function loadMessages() {
  loading.value = true;
  try {
    messages.value = await fetchMessages();
  } finally {
    loading.value = false;
  }
}

onMounted(loadMessages);
</script>

<template>
  <div class="list-stack">
    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">消息中心</div>
        <div class="section-card__desc">记录节点创建、审核结果、时间变更和关键提醒，后续可与服务号模板消息一一对应。</div>
      </div>
      <div class="section-card__bd">
        <div class="table-like" v-if="messages.length">
          <div class="panel-note" v-for="item in messages" :key="item.id">
            <div class="table-row__head">
              <div class="table-row__title">{{ item.title }}</div>
              <span class="tag-pair">{{ item.status === 'unread' ? '未读' : '已读' }}</span>
            </div>
            <div class="panel-note__text">{{ item.content }}</div>
            <div class="step-item__meta">{{ item.createdAt }} <span v-if="item.relatedStepCode">· {{ item.relatedStepCode }}</span></div>
          </div>
        </div>
        <div class="empty-state" v-else-if="!loading">暂无消息记录。</div>
        <van-skeleton v-else title :row="5" />
      </div>
    </section>
  </div>
</template>
