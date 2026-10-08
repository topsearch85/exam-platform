-- Chạy sau khi đã có bảng grades (schema_curriculum.sql)
-- mysql -u root exam_db < seed_grades.sql

INSERT INTO grades (name, sort_order) VALUES
  ('Lớp 1', 1),
  ('Lớp 2', 2),
  ('Lớp 3', 3),
  ('Lớp 4', 4),
  ('Lớp 5', 5),
  ('Lớp 6', 6),
  ('Lớp 7', 7),
  ('Lớp 8', 8),
  ('Lớp 9', 9),
  ('Lớp 10', 10),
  ('Lớp 11', 11),
  ('Lớp 12', 12)
ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order);
