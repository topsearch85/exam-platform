-- Tuỳ chọn: tiêu đề & đường dẫn catalog (ghi đè auto). Chạy sau schema_series_topics.sql
-- mysql -u root exam_db < schema_series_urls.sql

ALTER TABLE subject_series ADD COLUMN title_mon VARCHAR(320) NULL;
ALTER TABLE subject_series ADD COLUMN url_path_mon VARCHAR(220) NULL;
ALTER TABLE subject_series ADD COLUMN url_path_luyen_tap VARCHAR(220) NULL;
ALTER TABLE subject_series ADD COLUMN url_path_video VARCHAR(220) NULL;
ALTER TABLE subject_series ADD COLUMN url_path_de_kiem_tra VARCHAR(220) NULL;
