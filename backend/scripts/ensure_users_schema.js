/**
 * Đồng bộ bảng `users` và `user_exam_paper_progress` với backend/schema_users.sql
 * khi DB đã có bảng `users` cũ (thiếu cột) — CREATE TABLE IF NOT EXISTS sẽ không sửa.
 *
 * Chạy: node backend/scripts/ensure_users_schema.js
 */
const db = require("../db");

async function hasTable(name) {
    const rows = await db.queryAsync(
        `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [name]
    );
    return rows.length > 0;
}

async function hasColumn(table, column) {
    const rows = await db.queryAsync(
        `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return rows.length > 0;
}

async function hasIndex(table, indexName) {
    const rows = await db.queryAsync(
        `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, indexName]
    );
    return rows.length > 0;
}

async function main() {
    try {
        if (!(await hasTable("users"))) {
            console.log("Tạo bảng users + user_exam_paper_progress từ schema...");
            await db.queryAsync(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(64) NOT NULL,
          email VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          display_name VARCHAR(120) NOT NULL,
          full_name VARCHAR(200) NULL,
          gender VARCHAR(32) NULL,
          parent_phone VARCHAR(32) NULL,
          address VARCHAR(500) NULL,
          grade_class VARCHAR(120) NULL,
          terms_accepted TINYINT(1) NOT NULL DEFAULT 0,
          role VARCHAR(32) NOT NULL DEFAULT 'user',
          avatar VARCHAR(32) NOT NULL DEFAULT 'default',
          password_reset_token_hash CHAR(64) NULL,
          password_reset_expires_at DATETIME NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_users_username (username),
          UNIQUE KEY uk_users_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
            await db.queryAsync(`
        CREATE TABLE user_exam_paper_progress (
          user_id INT NOT NULL,
          exam_paper_id INT NOT NULL,
          score INT NOT NULL,
          total INT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, exam_paper_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (exam_paper_id) REFERENCES exam_papers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
            console.log("OK — đã tạo mới.");
            process.exit(0);
            return;
        }

        console.log("Bảng users đã tồn tại — bổ sung cột/index nếu thiếu...");

        if (!(await hasColumn("users", "username"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN username VARCHAR(64) NULL AFTER id"
            );
            await db.queryAsync(
                `UPDATE users SET username = CONCAT('user', id) WHERE username IS NULL OR TRIM(IFNULL(username,'')) = ''`
            );
            await db.queryAsync(
                "ALTER TABLE users MODIFY COLUMN username VARCHAR(64) NOT NULL"
            );
            console.log("+ username");
        }
        if (!(await hasColumn("users", "email"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT ''"
            );
            await db.queryAsync(
                `UPDATE users SET email = CONCAT('u', id, '@placeholder.local') WHERE email = '' OR email IS NULL`
            );
            console.log("+ email");
        }
        if (!(await hasColumn("users", "password_hash"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''"
            );
            console.log("+ password_hash (cần đặt lại mật khẩu nếu có dòng cũ)");
        }
        if (!(await hasColumn("users", "display_name"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN display_name VARCHAR(120) NOT NULL DEFAULT 'Thành viên'"
            );
            console.log("+ display_name");
        }
        if (!(await hasColumn("users", "created_at"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"
            );
            console.log("+ created_at");
        }
        if (!(await hasColumn("users", "full_name"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN full_name VARCHAR(200) NULL"
            );
            console.log("+ full_name");
        }
        if (!(await hasColumn("users", "gender"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN gender VARCHAR(32) NULL"
            );
            console.log("+ gender");
        }
        if (!(await hasColumn("users", "parent_phone"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN parent_phone VARCHAR(32) NULL"
            );
            console.log("+ parent_phone");
        }
        if (!(await hasColumn("users", "address"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN address VARCHAR(500) NULL"
            );
            console.log("+ address");
        }
        if (!(await hasColumn("users", "grade_class"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN grade_class VARCHAR(120) NULL"
            );
            console.log("+ grade_class");
        }
        if (!(await hasColumn("users", "terms_accepted"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN terms_accepted TINYINT(1) NOT NULL DEFAULT 0"
            );
            console.log("+ terms_accepted");
        }
        if (!(await hasColumn("users", "role"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'user'"
            );
            console.log("+ role");
        }
        if (!(await hasColumn("users", "avatar"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN avatar VARCHAR(32) NOT NULL DEFAULT 'default'"
            );
            console.log("+ avatar");
        }
        if (!(await hasColumn("users", "password_reset_token_hash"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN password_reset_token_hash CHAR(64) NULL"
            );
            console.log("+ password_reset_token_hash");
        }
        if (!(await hasColumn("users", "password_reset_expires_at"))) {
            await db.queryAsync(
                "ALTER TABLE users ADD COLUMN password_reset_expires_at DATETIME NULL"
            );
            console.log("+ password_reset_expires_at");
        }

        if (!(await hasIndex("users", "uk_users_username"))) {
            try {
                await db.queryAsync(
                    "ALTER TABLE users ADD UNIQUE KEY uk_users_username (username)"
                );
                console.log("+ UNIQUE uk_users_username");
            } catch (e) {
                console.warn("Không thêm UNIQUE username:", e.message);
            }
        }
        if (!(await hasIndex("users", "uk_users_email"))) {
            try {
                await db.queryAsync(
                    "ALTER TABLE users ADD UNIQUE KEY uk_users_email (email)"
                );
                console.log("+ UNIQUE uk_users_email");
            } catch (e) {
                console.warn("Không thêm UNIQUE email:", e.message);
            }
        }

        if (!(await hasTable("user_exam_paper_progress"))) {
            await db.queryAsync(`
        CREATE TABLE user_exam_paper_progress (
          user_id INT NOT NULL,
          exam_paper_id INT NOT NULL,
          score INT NOT NULL,
          total INT NOT NULL,
          last_results_json LONGTEXT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, exam_paper_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (exam_paper_id) REFERENCES exam_papers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
            console.log("+ user_exam_paper_progress");
        } else if (!(await hasColumn("user_exam_paper_progress", "last_results_json"))) {
            await db.queryAsync(
                "ALTER TABLE user_exam_paper_progress ADD COLUMN last_results_json LONGTEXT NULL AFTER total"
            );
            console.log("+ user_exam_paper_progress.last_results_json");
        }

        console.log("Xong. Thử đăng ký lại trên ứng dụng.");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main();
