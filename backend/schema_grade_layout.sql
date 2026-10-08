-- Cấu trúc mới: Lớp → khối (tiêu đề text) → link (Bài tập + slug) → chủ đề → bài → đề thi
-- Chạy sau schema_curriculum.sql (cần grades, subjects, exam_papers)
-- mysql -u root exam_db < schema_grade_layout.sql

CREATE TABLE IF NOT EXISTS grade_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grade_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE,
  INDEX idx_gb_grade (grade_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS grade_block_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grade_block_id INT NOT NULL,
  label VARCHAR(255) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  short_description TEXT NULL,
  long_description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (grade_block_id) REFERENCES grade_blocks(id) ON DELETE CASCADE,
  UNIQUE KEY uk_gbl_block_slug (grade_block_id, slug),
  INDEX idx_gbl_block (grade_block_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_themes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grade_block_link_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (grade_block_link_id) REFERENCES grade_block_links(id) ON DELETE CASCADE,
  INDEX idx_ct_link (grade_block_link_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_lessons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  catalog_theme_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (catalog_theme_id) REFERENCES catalog_themes(id) ON DELETE CASCADE,
  INDEX idx_cl_theme (catalog_theme_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gắn đề thi vào «bài» (lớp cuối của cây) — chạy lại an toàn: bỏ qua nếu đã có
SET @db = DATABASE();

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_papers' AND COLUMN_NAME = 'catalog_lesson_id');
SET @sql = IF(@c = 0,
  'ALTER TABLE exam_papers ADD COLUMN catalog_lesson_id INT NULL',
  'SELECT 1');
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SET @i = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_papers' AND INDEX_NAME = 'idx_ep_catalog_lesson');
SET @sql = IF(@i = 0,
  'CREATE INDEX idx_ep_catalog_lesson ON exam_papers (catalog_lesson_id)',
  'SELECT 1');
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

SET @f = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_papers' AND CONSTRAINT_NAME = 'fk_exam_papers_catalog_lesson');
SET @sql = IF(@f = 0,
  'ALTER TABLE exam_papers ADD CONSTRAINT fk_exam_papers_catalog_lesson FOREIGN KEY (catalog_lesson_id) REFERENCES catalog_lessons (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;
