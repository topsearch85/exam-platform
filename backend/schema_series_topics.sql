-- Chạy sau schema_curriculum.sql (và đã có exam_papers)
-- Cấu trúc: Môn (subjects) → Bộ sách (subject_series) → Chủ đề (topics) → Đề thi (exam_papers)
-- mysql -u root exam_db < schema_series_topics.sql

CREATE TABLE IF NOT EXISTS subject_series (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  INDEX idx_series_subject (subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS topics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  series_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (series_id) REFERENCES subject_series(id) ON DELETE CASCADE,
  INDEX idx_topic_series (series_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gắn đề vào chủ đề (NULL = đề gắn trực tiếp môn, chỉ khi môn chưa có bộ sách)
ALTER TABLE exam_papers ADD COLUMN topic_id INT NULL;
CREATE INDEX idx_exam_papers_topic ON exam_papers(topic_id);
ALTER TABLE exam_papers ADD CONSTRAINT fk_exam_papers_topic
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL;

-- Dữ liệu cũ: tạo bộ «Mặc định» + chủ đề «Tổng hợp» cho mỗi môn đang có đề, rồi gán topic_id
INSERT INTO subject_series (subject_id, name, sort_order)
SELECT DISTINCT ep.subject_id, 'Mặc định', 0
FROM exam_papers ep
WHERE NOT EXISTS (
  SELECT 1 FROM subject_series ss WHERE ss.subject_id = ep.subject_id
);

INSERT INTO topics (series_id, name, sort_order)
SELECT ss.id, 'Tổng hợp', 0
FROM subject_series ss
WHERE ss.name = 'Mặc định'
  AND NOT EXISTS (SELECT 1 FROM topics t WHERE t.series_id = ss.id);

UPDATE exam_papers ep
INNER JOIN subject_series ss ON ss.subject_id = ep.subject_id AND ss.name = 'Mặc định'
INNER JOIN topics t ON t.series_id = ss.id AND t.name = 'Tổng hợp'
SET ep.topic_id = t.id
WHERE ep.topic_id IS NULL;
