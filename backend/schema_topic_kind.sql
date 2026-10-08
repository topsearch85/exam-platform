-- Chạy sau schema_series_topics.sql
-- Phân loại chủ đề: chu_de | luyen_tap | video | de_kiem_tra
-- mysql -u root exam_db < schema_topic_kind.sql

ALTER TABLE topics ADD COLUMN kind VARCHAR(32) NOT NULL DEFAULT 'chu_de';
CREATE INDEX idx_topics_kind ON topics (series_id, kind);

-- Gợi ý: gán chủ đề đang có đề thi vào loại «Đề kiểm tra» (chạy tay nếu cần)
-- UPDATE topics t
-- INNER JOIN exam_papers ep ON ep.topic_id = t.id
-- SET t.kind = 'de_kiem_tra';
