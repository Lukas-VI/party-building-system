<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchMessages, markMessageRead } from '../api';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const messages = ref([]);
const showReadMessages = ref(false);
const unreadMessages = computed(() => messages.value.filter((item) => item.status === 'unread'));
const readMessages = computed(() => messages.value.filter((item) => item.status !== 'unread'));

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
          <button class="panel-note message-item" v-for="item in unreadMessages" :key="item.id" type="button" @click="openMessage(item)">
            <div class="table-row__head">
              <div class="table-row__title">{{ item.title }}</div>
              <span class="tag-pair">新消息</span>
            </div>
            <div class="panel-note__text">{{ item.content }}</div>
            <div class="step-item__meta">{{ item.createdAt }} <span v-if="item.targetLabel">· {{ item.targetLabel }}</span></div>
          </button>
          <button class="message-fold" v-if="readMessages.length" type="button" @click="showReadMessages = !showReadMessages">
            {{ showReadMessages ? '收起已读消息' : `展开已读消息（${readMessages.length}）` }}
          </button>
          <template v-if="showReadMessages">
            <button class="panel-note message-item is-read" v-for="item in readMessages" :key="item.id" type="button" @click="openMessage(item)">
              <div class="table-row__head">
                <div class="table-row__title">{{ item.title }}</div>
                <span class="tag-pair">已读</span>
              </div>
              <div class="panel-note__text">{{ item.content }}</div>
              <div class="step-item__meta">{{ item.createdAt }} <span v-if="item.targetLabel">· {{ item.targetLabel }}</span></div>
            </button>
          </template>
        </div>
        <div class="empty-state" v-else-if="!loading">暂无消息记录。</div>
        <van-skeleton v-else title :row="5" />
      </div>
    </section>
  </div>
</template>
