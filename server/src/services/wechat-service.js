const { first } = require('../db');

async function getWechatBindingByUserId(userId) {
  return first(
    `SELECT
        id,
        user_id AS userId,
        openid,
        unionid,
        nickname,
        avatar_url AS avatarUrl,
        status,
        bound_at AS boundAt,
        last_login_at AS lastLoginAt
     FROM wechat_bindings
     WHERE user_id = :userId AND status = 'active'`,
    { userId },
  );
}

module.exports = {
  getWechatBindingByUserId,
};
