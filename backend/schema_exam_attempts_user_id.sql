-- Gắn lượt thi với user (để BXH / lưu trữ chỉ giữ kết quả tốt nhất mỗi đề)
-- mysql -u root exam_db < schema_exam_attempts_user_id.sql

SET @db = DATABASE();

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_attempts' AND COLUMN_NAME = 'user_id');
SET @sql = IF(@c = 0,
  'ALTER TABLE exam_attempts ADD COLUMN user_id INT NULL AFTER display_name',
  'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @i = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_attempts' AND INDEX_NAME = 'idx_exam_attempts_user_paper');
SET @sql = IF(@i = 0,
  'CREATE INDEX idx_exam_attempts_user_paper ON exam_attempts (user_id, exam_paper_id)',
  'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @f = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_attempts' AND CONSTRAINT_NAME = 'fk_exam_attempts_user');
SET @sql = IF(@f = 0,
  'ALTER TABLE exam_attempts ADD CONSTRAINT fk_exam_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;
