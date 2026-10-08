-- Chạy một lần trên MySQL (exam_db)
-- mysql -u root exam_db < schema.sql

CREATE TABLE IF NOT EXISTS exam_sessions (
  token CHAR(36) NOT NULL PRIMARY KEY,
  question_ids JSON NOT NULL,
  answers JSON NULL,
  time_left_sec INT NULL,
  current_index INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_token CHAR(36) NULL,
  display_name VARCHAR(120) NOT NULL,
  score INT NOT NULL,
  total INT NOT NULL,
  duration_sec INT DEFAULT 0,
  time_expired TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_leaderboard (score DESC, duration_sec ASC, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
