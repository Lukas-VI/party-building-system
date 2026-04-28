const MVP_MAX_STEP_ORDER = 12;
const HIGH_PRIVILEGE_ROLES = new Set(['superAdmin', 'orgDept']);
const ALLOWED_REVIEW_STATUSES = new Set(['approved', 'rejected']);
const FILE_ACCEPT_RULES = {
  pdf: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
  },
  image: {
    extensions: ['.jpg', '.jpeg', '.png'],
    mimeTypes: ['image/jpeg', 'image/png'],
  },
};

module.exports = {
  MVP_MAX_STEP_ORDER,
  HIGH_PRIVILEGE_ROLES,
  ALLOWED_REVIEW_STATUSES,
  FILE_ACCEPT_RULES,
};
