-- Lưu chi tiết lần làm gần nhất (để «Xem bài đã làm» trên danh sách đề)
-- mysql -u root exam_db < schema_user_progress_last_results.sql

SET @db = DATABASE();

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_exam_paper_progress' AND COLUMN_NAME = 'last_results_json');
SET @sql = IF(@c = 0,
  'ALTER TABLE user_exam_paper_progress ADD COLUMN last_results_json LONGTEXT NULL AFTER total',
  'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;
