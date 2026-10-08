-- Mô tả dài cho từng link (Bài tập) — hiển thị trên trang /lop-…/link/…
-- Chạy sau schema_grade_layout.sql (idempotent)

SET @db = DATABASE();

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'grade_block_links' AND COLUMN_NAME = 'long_description');
SET @sql = IF(@c = 0,
  'ALTER TABLE grade_block_links ADD COLUMN long_description TEXT NULL',
  'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;
