-- Chạy sau schema_curriculum.sql (cần bảng exam_papers, questions)
-- mysql -u root exam_db < schema_paper_questions.sql

-- Bảng xếp hạng theo từng đề thi
ALTER TABLE exam_attempts ADD COLUMN exam_paper_id INT NULL;
CREATE INDEX idx_exam_attempts_paper ON exam_attempts(exam_paper_id);
ALTER TABLE exam_attempts ADD CONSTRAINT fk_exam_attempts_paper
  FOREIGN KEY (exam_paper_id) REFERENCES exam_papers(id) ON DELETE SET NULL;

-- Gán câu hỏi vào đề (nếu đề có ít nhất 1 câu gán → chỉ random trong danh sách này; không thì random theo môn như cũ)
CREATE TABLE IF NOT EXISTS exam_paper_questions (
  exam_paper_id INT NOT NULL,
  question_id INT NOT NULL,
  PRIMARY KEY (exam_paper_id, question_id),
  FOREIGN KEY (exam_paper_id) REFERENCES exam_papers(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  INDEX idx_epq_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
