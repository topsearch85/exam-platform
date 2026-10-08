-- Xóa bảng / cột cũ (bộ sách, chủ đề cũ) SAU KHI đã chạy schema_grade_layout.sql và không cần dữ liệu cũ.
-- Kiểm tra kỹ trước khi chạy trên DB production.
-- An toàn khi chạy lại: FK có thể tên khác (fk_exam_papers_topic / exam_papers_ibfk_*) hoặc đã bị xóa.

SET @db = DATABASE();
SET FOREIGN_KEY_CHECKS = 0;

-- 1) Bỏ FK trên cột topic_id (tên thực tế lấy từ information_schema)
SET @fk = (
  SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_papers'
    AND COLUMN_NAME = 'topic_id' AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @sql = IF(
  @fk IS NOT NULL,
  CONCAT('ALTER TABLE exam_papers DROP FOREIGN KEY `', REPLACE(@fk, '`', '``'), '`'),
  'SELECT 1'
);
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

-- 2) Bỏ index còn lại trên topic_id (thường là idx_exam_papers_topic — không phải tên fk)
SET @idx = (
  SELECT INDEX_NAME FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_papers' AND COLUMN_NAME = 'topic_id'
    AND INDEX_NAME != 'PRIMARY'
  LIMIT 1
);
SET @sql = IF(
  @idx IS NOT NULL,
  CONCAT('ALTER TABLE exam_papers DROP INDEX `', REPLACE(@idx, '`', '``'), '`'),
  'SELECT 1'
);
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

-- Một số DB có thêm index thứ hai trên topic_id — lặp một lần
SET @idx = (
  SELECT INDEX_NAME FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_papers' AND COLUMN_NAME = 'topic_id'
    AND INDEX_NAME != 'PRIMARY'
  LIMIT 1
);
SET @sql = IF(
  @idx IS NOT NULL,
  CONCAT('ALTER TABLE exam_papers DROP INDEX `', REPLACE(@idx, '`', '``'), '`'),
  'SELECT 1'
);
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

-- 3) Xóa cột topic_id nếu còn
SET @c = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_papers' AND COLUMN_NAME = 'topic_id'
);
SET @sql = IF(@c > 0, 'ALTER TABLE exam_papers DROP COLUMN topic_id', 'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

DROP TABLE IF EXISTS topics;
DROP TABLE IF EXISTS subject_series;

SET FOREIGN_KEY_CHECKS = 1;
