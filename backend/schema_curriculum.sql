-- Chạy sau schema.sql: mysql -u root exam_db < schema_curriculum.sql
-- Cấu trúc: Lớp → Môn → Đề thi → câu hỏi theo đề (sau schema_questions_per_paper.sql: questions.exam_paper_id)

CREATE TABLE IF NOT EXISTS grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_grade_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grade_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE,
  INDEX idx_subj_grade (grade_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_papers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  duration_sec INT NOT NULL DEFAULT 5400,
  question_count INT NOT NULL DEFAULT 50,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  INDEX idx_paper_subject (subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gắn câu hỏi vào môn (ngân hàng theo môn)
ALTER TABLE questions ADD COLUMN subject_id INT NULL;
CREATE INDEX idx_questions_subject ON questions(subject_id);
ALTER TABLE questions ADD CONSTRAINT fk_questions_subject
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL;

-- Phiên thi biết đang làm đề nào
ALTER TABLE exam_sessions ADD COLUMN exam_paper_id INT NULL;
CREATE INDEX idx_session_paper ON exam_sessions(exam_paper_id);

-- Seed 12 lớp: chạy file seed_grades.sql
-- Gán câu theo đề + xếp hạng theo đề: chạy schema_paper_questions.sql (sau khi có bảng questions, exam_papers)
-- Bộ sách → chủ đề → đề: chạy schema_series_topics.sql
-- Phân loại chủ đề (môn/luyện tập/video/đề kiểm tra): chạy schema_topic_kind.sql
