const { first } = require('../db');
const { errorWithStatus } = require('../lib/utils');

function ageFromIdNo(idNo) {
  if (!/^\d{17}[\dXx]$/.test(idNo || '')) return null;
  const year = Number(idNo.slice(6, 10));
  const month = Number(idNo.slice(10, 12));
  const day = Number(idNo.slice(12, 14));
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(birthDate.getTime())) return null;
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day
  ) {
    return null;
  }
  const nowDate = new Date();
  let age = nowDate.getFullYear() - year;
  const monthGap = nowDate.getMonth() + 1 - month;
  if (monthGap < 0 || (monthGap === 0 && nowDate.getDate() < day)) age -= 1;
  return age;
}

async function ensureAdultApplicant(applicantId) {
  const request = await first(
    `SELECT id_no AS idNo
     FROM registration_requests
     WHERE user_id = :userId
     ORDER BY id DESC
     LIMIT 1`,
    { userId: applicantId },
  );
  const age = ageFromIdNo(request?.idNo || '');
  if (age !== null && age < 18) {
    throw errorWithStatus('未满18周岁，不能提交入党申请', 400);
  }
}

module.exports = {
  ageFromIdNo,
  ensureAdultApplicant,
};
