-- Câu hỏi thuộc từng đề thi (không còn ngân hàng chung qua subject + gán tay).
-- Chạy sau schema_paper_questions.sql (đã có bảng exam_papers, questions, exam_paper_questions).
-- Sau đó chạy: node scripts/migrate_epq_to_exam_paper.js  (tùy chọn: chuyển dữ liệu epq → exam_paper_id rồi xóa epq)

SET @db = DATABASE();

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'questions' AND COLUMN_NAME = 'exam_paper_id');
SET @sql = IF(@c = 0,
  'ALTER TABLE questions ADD COLUMN exam_paper_id INT NULL',
  'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'questions' AND COLUMN_NAME = 'sort_order');
SET @sql = IF(@c = 0,
  'ALTER TABLE questions ADD COLUMN sort_order INT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @i = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'questions' AND INDEX_NAME = 'idx_questions_exam_paper');
SET @sql = IF(@i = 0,
  'CREATE INDEX idx_questions_exam_paper ON questions (exam_paper_id)',
  'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @f = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'questions' AND CONSTRAINT_NAME = 'fk_questions_exam_paper');
SET @sql = IF(@f = 0,
  'ALTER TABLE questions ADD CONSTRAINT fk_questions_exam_paper FOREIGN KEY (exam_paper_id) REFERENCES exam_papers (id) ON DELETE CASCADE',
  'SELECT 1');
PREPARE _s FROM @sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;
