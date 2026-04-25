<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showFailToast, showSuccessToast } from 'vant';
import { registerAccount } from '../api';

const router = useRouter();
const loading = ref(false);
const form = reactive({
  name: '',
  idNo: '',
  employeeNo: '',
  password: '',
  confirmPassword: '',
});

function ageFromIdNo(idNo) {
  if (!/^\d{17}[\dXx]$/.test(idNo || '')) return null;
  const birth = `${idNo.slice(6, 10)}-${idNo.slice(10, 12)}-${idNo.slice(12, 14)}`;
  const birthDate = new Date(`${birth}T00:00:00+08:00`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const nowDate = new Date();
  let age = nowDate.getFullYear() - birthDate.getFullYear();
  const monthGap = nowDate.getMonth() - birthDate.getMonth();
  if (monthGap < 0 || (monthGap === 0 && nowDate.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

function validate() {
  if (!form.name.trim()) return '请输入姓名';
  if (!form.employeeNo.trim()) return '请输入学号或工号';
  if (!form.idNo.trim()) return '请输入身份证号';
  if (!/^\d{17}[\dXx]$/.test(form.idNo.trim())) return '请输入18位有效身份证号';
  const age = ageFromIdNo(form.idNo.trim());
  if (age === null) return '身份证号格式不正确';
  if (age < 18) return '未满18周岁，不能提交入党申请';
  if (!form.password) return '请设置登录密码';
  if (form.password.length < 8) return '密码至少 8 位';
  if (form.password !== form.confirmPassword) return '两次输入的密码不一致';
  return '';
}

async function submit() {
  const message = validate();
  if (message) {
    showFailToast(message);
    return;
  }
  loading.value = true;
  try {
    await registerAccount({
      name: form.name.trim(),
      idNo: form.idNo.trim(),
      employeeNo: form.employeeNo.trim(),
      password: form.password,
    });
    showSuccessToast('注册信息已提交');
    router.replace('/login');
  } catch (error) {
    showFailToast(error.message || '注册提交失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-shell">
    <section class="login-brand">
      <div class="login-brand__title">首次注册</div>
      <div class="login-brand__desc">
        使用学校预置的学号或工号提交注册信息，审核通过后即可登录服务号工作台办理流程、维护资料和查看通知。
      </div>
    </section>

    <section class="section-card" style="margin-top: 14px;">
      <div class="section-card__hd">
        <div class="section-card__title">身份核验</div>
        <div class="section-card__desc">请填写与后台人员库一致的信息。提交后由管理员审核。</div>
      </div>
      <div class="section-card__bd">
        <div class="field-block">
          <div class="field-label">姓名</div>
          <van-field v-model="form.name" placeholder="请输入真实姓名" clearable />
        </div>
        <div class="field-block">
          <div class="field-label">学号 / 工号</div>
          <van-field v-model="form.employeeNo" placeholder="请输入学号或工号" clearable />
        </div>
        <div class="field-block">
          <div class="field-label">身份证号</div>
          <van-field v-model="form.idNo" placeholder="请输入身份证号" clearable />
        </div>
        <div class="field-block">
          <div class="field-label">登录密码</div>
          <van-field v-model="form.password" type="password" placeholder="请设置至少 8 位密码" clearable />
        </div>
        <div class="field-block">
          <div class="field-label">确认密码</div>
          <van-field v-model="form.confirmPassword" type="password" placeholder="请再次输入密码" clearable />
        </div>
        <div class="field-block dual-actions">
          <van-button type="danger" block round :loading="loading" @click="submit">提交注册</van-button>
          <van-button plain type="danger" block round to="/login">返回登录</van-button>
        </div>
        <div class="section-card__desc" style="padding-top: 8px;">
          注册时会校验姓名、学工号和身份证号格式；未满 18 周岁不能提交入党申请。
        </div>
      </div>
    </section>
  </div>
</template>
