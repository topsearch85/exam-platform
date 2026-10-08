-- Phân cấp: Chủ đề (chu_de) → Bài luyện tập (luyen_tap là con).
-- Tùy chọn volume: "Tập 1", "Tập 2" để chia cột như sách giáo khoa.
-- Chạy sau schema_topic_kind.sql
-- mysql -u root exam_db < schema_topic_hierarchy.sql

ALTER TABLE topics ADD COLUMN parent_id INT NULL;
ALTER TABLE topics ADD COLUMN volume VARCHAR(64) NULL;
ALTER TABLE topics ADD CONSTRAINT fk_topics_parent FOREIGN KEY (parent_id) REFERENCES topics(id) ON DELETE CASCADE;
CREATE INDEX idx_topics_parent_kind ON topics (series_id, parent_id, kind);
