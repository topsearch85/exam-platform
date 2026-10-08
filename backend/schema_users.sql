-- Người dùng + tiến độ làm đề theo tài khoản
-- mysql -u root exam_db < schema_users.sql
--
-- Nếu đăng ký báo «Unknown column 'username'»: bảng `users` đã tồn tại từ trước
-- nhưng thiếu cột — CREATE TABLE IF NOT EXISTS không sửa bảng cũ.
-- Chạy: node backend/scripts/ensure_users_schema.js

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  full_name VARCHAR(200) NULL,
  gender VARCHAR(32) NULL,
  parent_phone VARCHAR(32) NULL,
  address VARCHAR(500) NULL,
  grade_class VARCHAR(120) NULL,
  terms_accepted TINYINT(1) NOT NULL DEFAULT 0,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  avatar VARCHAR(32) NOT NULL DEFAULT 'default',
  password_reset_token_hash CHAR(64) NULL,
  password_reset_expires_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_users_username (username),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_exam_paper_progress (
  user_id INT NOT NULL,
  exam_paper_id INT NOT NULL,
  score INT NOT NULL,
  total INT NOT NULL,
  last_results_json LONGTEXT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, exam_paper_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_paper_id) REFERENCES exam_papers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quản trị JWT (/admin/users): UPDATE users SET role = 'admin' WHERE username = '...'; sau đó đăng nhập lại.
