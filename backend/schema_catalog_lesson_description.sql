-- Mô tả bài (catalog_lessons) — hiển thị trong danh sách bài trên catalog
SET @db = DATABASE();

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'catalog_lessons' AND COLUMN_NAME = 'description');
SET @sql = IF(@c = 0,
  'ALTER TABLE catalog_lessons ADD COLUMN description TEXT NULL',
  'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;
