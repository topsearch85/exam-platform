/**
 * Tạo hoặc cập nhật tài khoản quản trị đầu tiên (mặc định admin / admin123).
 * Chạy: node backend/scripts/createFirstAdmin.js
 *
 * Đổi mật khẩu ngay sau khi đưa lên môi trường thật.
 */
const bcrypt = require("bcryptjs");
const db = require("../db");

const USERNAME = process.env.ADMIN_BOOTSTRAP_USER || "admin";
const PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || "admin123";
const EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL || "admin@localhost.local";
const BCRYPT_ROUNDS = 10;

async function main() {
    const hash = await bcrypt.hash(String(PASSWORD), BCRYPT_ROUNDS);
    const displayName = "Quản trị";
    const fullName = "Quản trị hệ thống";
    const phone = "0900000000";
    const gradeClass = "—";

    try {
        const existing = await db.queryAsync(`SELECT id FROM users WHERE username = ?`, [USERNAME]);
        if (existing.length) {
            try {
                await db.queryAsync(
                    `UPDATE users SET password_hash = ?, role = 'admin', email = ?, display_name = ?, terms_accepted = 1 WHERE username = ?`,
                    [hash, EMAIL, displayName, USERNAME]
                );
            } catch (e) {
                if (!/Unknown column.*role/i.test(String(e.message))) throw e;
                await db.queryAsync(
                    `UPDATE users SET password_hash = ?, email = ?, display_name = ?, terms_accepted = 1 WHERE username = ?`,
                    [hash, EMAIL, displayName, USERNAME]
                );
                await db.queryAsync(`UPDATE users SET role = 'admin' WHERE username = ?`, [USERNAME]).catch(() => {});
            }
            console.log(`Đã cập nhật tài khoản "${USERNAME}" (mật khẩu đã đặt lại, role admin).`);
            process.exit(0);
            return;
        }

        try {
            await db.queryAsync(
                `INSERT INTO users (username, email, password_hash, display_name, full_name, parent_phone, address, grade_class, terms_accepted, role)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1, 'admin')`,
                [USERNAME, EMAIL, hash, displayName, fullName, phone, gradeClass]
            );
        } catch (e) {
            if (!/Unknown column.*role/i.test(String(e.message))) throw e;
            await db.queryAsync(
                `INSERT INTO users (username, email, password_hash, display_name, full_name, parent_phone, address, grade_class, terms_accepted)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1)`,
                [USERNAME, EMAIL, hash, displayName, fullName, phone, gradeClass]
            );
            await db.queryAsync(`UPDATE users SET role = 'admin' WHERE username = ?`, [USERNAME]).catch(() => {});
        }
        console.log(`Đã tạo tài khoản "${USERNAME}" / mật khẩu (mặc định trong script).`);
        console.log(`Đăng nhập khu điều hành tại /admin (phiên quản trị riêng).`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main();
