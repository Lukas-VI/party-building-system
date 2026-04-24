CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(64) PRIMARY KEY,
  label VARCHAR(128) NOT NULL,
  scope_level VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(64) PRIMARY KEY,
  label VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  role_id VARCHAR(64) NOT NULL,
  permission_id VARCHAR(64) NOT NULL,
  UNIQUE KEY uk_role_permission (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS org_units (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  org_id VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  org_id VARCHAR(64) NULL,
  branch_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL,
  role_id VARCHAR(64) NOT NULL,
  UNIQUE KEY uk_user_role (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS registration_requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  request_no VARCHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  id_no VARCHAR(32) NOT NULL,
  employee_no VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL,
  reviewed_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS applicant_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  current_stage VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NULL,
  education VARCHAR(64) NULL,
  degree VARCHAR(64) NULL,
  unit_name VARCHAR(255) NULL,
  occupation VARCHAR(255) NULL,
  profile_json LONGTEXT NULL,
  updated_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  profile_type VARCHAR(32) NOT NULL,
  profile_json LONGTEXT NULL,
  updated_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id VARCHAR(64) PRIMARY KEY,
  applicant_id VARCHAR(64) NOT NULL UNIQUE,
  current_stage VARCHAR(64) NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_step_definitions (
  step_code VARCHAR(32) PRIMARY KEY,
  sort_order INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  phase VARCHAR(64) NOT NULL,
  allowed_roles_json LONGTEXT NOT NULL,
  form_schema_json LONGTEXT NOT NULL,
  actor_type VARCHAR(32) NULL,
  responsible_roles_json LONGTEXT NULL,
  requires_applicant_action TINYINT(1) NOT NULL DEFAULT 0,
  requires_reviewer_action TINYINT(1) NOT NULL DEFAULT 0,
  notification_template VARCHAR(255) NULL,
  material_schema_json LONGTEXT NULL,
  time_rule_json LONGTEXT NULL,
  start_at DATE NULL,
  end_at DATE NULL
);

CREATE TABLE IF NOT EXISTS workflow_step_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  instance_id VARCHAR(64) NOT NULL,
  step_code VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  form_data_json LONGTEXT NULL,
  review_comment TEXT NULL,
  last_operator_id VARCHAR(64) NULL,
  operated_at DATETIME NULL,
  deadline DATE NULL,
  task_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  confirmed_at DATETIME NULL,
  reschedule_count INT NOT NULL DEFAULT 0,
  reschedule_history_json LONGTEXT NULL,
  UNIQUE KEY uk_instance_step (instance_id, step_code)
);

CREATE TABLE IF NOT EXISTS attachments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  step_record_id BIGINT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128) NULL,
  material_tag VARCHAR(64) NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  operator_id VARCHAR(64) NOT NULL,
  detail_json LONGTEXT NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS wechat_bindings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL,
  openid VARCHAR(128) NOT NULL,
  unionid VARCHAR(128) NULL,
  session_key_encrypted LONGTEXT NOT NULL,
  nickname VARCHAR(255) NULL,
  avatar_url VARCHAR(512) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  bound_at DATETIME NOT NULL,
  last_login_at DATETIME NULL,
  UNIQUE KEY uk_wechat_user (user_id),
  UNIQUE KEY uk_wechat_openid (openid)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  related_step_code VARCHAR(32) NULL,
  related_target_type VARCHAR(64) NULL,
  related_target_id VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'unread',
  created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_receipts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  notification_id BIGINT NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'sent',
  clicked_at DATETIME NULL,
  processed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_notification_receipt (notification_id, user_id)
);
