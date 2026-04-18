<script setup>
import guidance from '../../../shared/process-guidance.json';
</script>

<template>
  <section class="section-card">
    <div class="section-card__hd">
      <div class="section-card__title">{{ guidance.noticeTitle }}</div>
      <div class="section-card__desc">{{ guidance.noticeIntro }}</div>
    </div>
    <div class="section-card__bd">
      <div class="list-stack">
        <div class="panel-note" v-for="item in guidance.rules" :key="item">
          <div class="panel-note__text">{{ item }}</div>
        </div>
      </div>
      <div class="formal-divider"></div>
      <div class="list-stack">
        <div class="table-row" v-for="stage in guidance.stages" :key="stage.code">
          <div class="table-row__head">
            <div>
              <div class="table-row__title">{{ stage.title }} · {{ stage.subtitle }}</div>
              <div class="table-row__sub">{{ stage.stepRange }}</div>
            </div>
            <span class="tag-pair">流程示意</span>
          </div>
          <div class="table-row__sub">{{ stage.summary }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
