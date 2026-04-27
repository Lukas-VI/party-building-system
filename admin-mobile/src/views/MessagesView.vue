<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showSuccessToast } from 'vant';
import { fetchMessages, markMessageRead } from '../api';

const route = useRoute();
const router = useRouter();
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

async function markRead(item) {
  await markMessageRead(item.id);
  item.status = 'read';
  item.isUnread = false;
  showSuccessToast('已标记为已读');
}

async function openMessage(item) {
  if (item.status === 'unread') {
    await markRead(item);
  }
  if (item.targetRoute) {
    router.push(item.targetRoute);
  }
}

onMounted(async () => {
  await loadMessages();
  const messageId = route.query.notificationId || route.query.messageId;
  if (!messageId) return;
  const target = messages.value.find((item) => String(item.id) === String(messageId));
  if (target) await openMessage(target);
});
</script>

<template>
  <div class="list-stack">
    <section class="section-card">
      <div class="section-card__hd">
        <div class="section-card__title">消息中心</div>
      </div>
      <div class="section-card__bd">
        <div class="table-like" v-if="messages.length">
          <div class="panel-note" v-for="item in messages" :key="item.id">
            <div class="table-row__head">
              <div class="table-row__title">{{ item.title }}</div>
              <span class="tag-pair">{{ item.status === 'unread' ? '未读' : '已读' }}</span>
            </div>
            <div class="panel-note__text">{{ item.content }}</div>
            <div class="step-item__meta">{{ item.createdAt }} <span v-if="item.targetLabel">· {{ item.targetLabel }}</span></div>
            <div class="section-actions section-actions--compact">
              <van-button size="small" plain type="danger" :disabled="item.status !== 'unread'" @click="markRead(item)">标记已读</van-button>
              <van-button size="small" type="danger" :disabled="!item.targetRoute" @click="openMessage(item)">查看详情</van-button>
            </div>
          </div>
        </div>
        <div class="empty-state" v-else-if="!loading">暂无消息记录。</div>
        <van-skeleton v-else title :row="5" />
      </div>
    </section>
  </div>
</template>
