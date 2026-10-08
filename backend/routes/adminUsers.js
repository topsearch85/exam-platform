/**
 * Quản lý user — chỉ JWT role === admin (Bearer), không dùng x-admin-key.
 */
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAdminJwt } = require("../lib/authMiddleware");

const router = express.Router();
router.use(requireAdminJwt);

const USERNAME_RE = /^[a-zA-Z0-9_]{3,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9]{8,15}$/;
const BCRYPT_ROUNDS = 10;

function getInsertId(result) {
    if (result == null) return null;
    if (Array.isArray(result) && result.length > 0) {
        return getInsertId(result[0]);
    }
    const raw = result.insertId ?? result.insert_id;
    if (raw === undefined || raw === null) return null;
    return typeof raw === "bigint" ? Number(raw) : Number(raw);
}

function mapUserRow(r) {
    if (!r) return null;
    return {
        id: r.id,
        username: r.username,
        email: r.email,
        displayName: r.display_name,
        fullName: r.full_name,
        gender: r.gender,
        parentPhone: r.parent_phone,
        address: r.address,
        gradeClass: r.grade_class,
        termsAccepted: Boolean(r.terms_accepted),
        createdAt: r.created_at,
        role: r.role === "admin" ? "admin" : "user",
    };
}

router.get("/", async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;
        const q = req.query.q != null ? String(req.query.q).trim() : "";
        let where = "1=1";
        const params = [];
        if (q) {
            where +=
                " AND (username LIKE ? OR email LIKE ? OR display_name LIKE ? OR IFNULL(full_name,'') LIKE ?)";
            const like = `%${q}%`;
            params.push(like, like, like, like);
        }
        let countRows;
        let rows;
        try {
            countRows = await db.queryAsync(`SELECT COUNT(*) AS c FROM users WHERE ${where}`, params);
            rows = await db.queryAsync(
                `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at, role
       FROM users WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );
        } catch (e) {
            if (!/Unknown column.*role/i.test(String(e.message))) throw e;
            countRows = await db.queryAsync(`SELECT COUNT(*) AS c FROM users WHERE ${where}`, params);
            rows = await db.queryAsync(
                `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at
       FROM users WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );
        }
        const total = countRows[0].c;
        res.json({
            users: rows.map(mapUserRow),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
        });
    } catch (err) {
        console.error("adminUsers GET /:", err);
        if (/doesn't exist|Unknown table/i.test(String(err.message))) {
            return res.status(503).json({
                error: "Chưa có bảng users",
                detail: "Chạy backend/schema_users.sql hoặc ensure_users_schema.js",
            });
        }
        res.status(500).json({ error: "Không tải được danh sách", detail: err.message });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: "ID không hợp lệ" });
        }
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at, role
       FROM users WHERE id = ?`,
                [id]
            );
        } catch (e) {
            if (!/Unknown column.*role/i.test(String(e.message))) throw e;
            rows = await db.queryAsync(
                `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at
       FROM users WHERE id = ?`,
                [id]
            );
        }
        if (!rows.length) {
            return res.status(404).json({ error: "Không tìm thấy user" });
        }
        res.json({ user: mapUserRow(rows[0]) });
    } catch (err) {
        console.error("adminUsers GET /:id:", err);
        res.status(500).json({ error: "Lỗi DB" });
    }
});

router.post("/", async (req, res) => {
    try {
        const {
            username,
            password,
            email,
            displayName,
            fullName,
            gender,
            parentPhone,
            address,
            gradeClass,
            termsAccepted,
            role: roleBody,
        } = req.body;
        if (!username || !password || !email || !displayName) {
            return res.status(400).json({ error: "Thiếu username, password, email hoặc displayName" });
        }
        let roleDb = "user";
        if (roleBody === "admin") {
            roleDb = "admin";
        } else if (roleBody === "user" || roleBody == null || roleBody === "") {
            roleDb = "user";
        } else {
            return res.status(400).json({ error: "role chỉ nhận user hoặc admin" });
        }
        const u = String(username).trim();
        const em = String(email).trim().toLowerCase();
        const dn = String(displayName).trim().slice(0, 120);
        if (!USERNAME_RE.test(u)) {
            return res.status(400).json({ error: "Tên đăng nhập 3–64 ký tự, chỉ chữ, số và dấu gạch dưới" });
        }
        if (!EMAIL_RE.test(em)) {
            return res.status(400).json({ error: "Email không hợp lệ" });
        }
        if (String(password).length < 8) {
            return res.status(400).json({ error: "Mật khẩu ít nhất 8 ký tự" });
        }
        const fn = fullName != null ? String(fullName).trim().slice(0, 200) : "";
        const gen = gender != null ? String(gender).trim().slice(0, 32) : "";
        const phoneDigits = parentPhone != null ? String(parentPhone).replace(/\D/g, "") : "";
        if (phoneDigits && !PHONE_RE.test(phoneDigits)) {
            return res.status(400).json({ error: "Số điện thoại phụ huynh 8–15 chữ số (hoặc để trống)" });
        }
        const addr = address != null ? String(address).trim().slice(0, 500) : "";
        const gcl = gradeClass != null ? String(gradeClass).trim().slice(0, 120) : "";
        const terms = termsAccepted === false ? 0 : 1;
        const hash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
        let r;
        try {
            r = await db.queryAsync(
                `INSERT INTO users (username, email, password_hash, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [u, em, hash, dn, fn || null, gen || null, phoneDigits || null, addr || null, gcl || null, terms, roleDb]
            );
        } catch (e) {
            if (e.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ error: "Tên đăng nhập hoặc email đã tồn tại" });
            }
            if (/Unknown column|ER_BAD_FIELD/i.test(String(e.message)) && /role/i.test(String(e.message))) {
                r = await db.queryAsync(
                    `INSERT INTO users (username, email, password_hash, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [u, em, hash, dn, fn || null, gen || null, phoneDigits || null, addr || null, gcl || null, terms]
                );
            } else {
                throw e;
            }
        }
        const insertId = getInsertId(r);
        res.status(201).json({ ok: true, id: insertId });
    } catch (err) {
        console.error("adminUsers POST /:", err);
        res.status(500).json({ error: "Không tạo được user", detail: err.message });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: "ID không hợp lệ" });
        }
        const body = req.body;
        if (body.role !== undefined) {
            const nr = body.role === "admin" ? "admin" : body.role === "user" ? "user" : null;
            if (nr == null) {
                return res.status(400).json({ error: "role chỉ nhận user hoặc admin" });
            }
            if (id === req.userId && nr === "user") {
                return res.status(403).json({ error: "Không thể bỏ quyền quản trị của chính bạn từ đây" });
            }
        }
        const updates = [];
        const vals = [];
        if (body.username !== undefined) {
            const u = String(body.username).trim();
            if (!USERNAME_RE.test(u)) {
                return res.status(400).json({ error: "Tên đăng nhập không hợp lệ" });
            }
            updates.push("username = ?");
            vals.push(u);
        }
        if (body.email !== undefined) {
            const em = String(body.email).trim().toLowerCase();
            if (!EMAIL_RE.test(em)) {
                return res.status(400).json({ error: "Email không hợp lệ" });
            }
            updates.push("email = ?");
            vals.push(em);
        }
        if (body.password !== undefined && String(body.password).length > 0) {
            if (String(body.password).length < 8) {
                return res.status(400).json({ error: "Mật khẩu ít nhất 8 ký tự" });
            }
            const hash = await bcrypt.hash(String(body.password), BCRYPT_ROUNDS);
            updates.push("password_hash = ?");
            vals.push(hash);
        }
        if (body.displayName !== undefined) {
            const dn = String(body.displayName).trim().slice(0, 120);
            if (!dn) {
                return res.status(400).json({ error: "Tên hiển thị không được rỗng" });
            }
            updates.push("display_name = ?");
            vals.push(dn);
        }
        if (body.fullName !== undefined) {
            updates.push("full_name = ?");
            vals.push(String(body.fullName).trim().slice(0, 200) || null);
        }
        if (body.gender !== undefined) {
            updates.push("gender = ?");
            vals.push(String(body.gender).trim().slice(0, 32) || null);
        }
        if (body.parentPhone !== undefined) {
            const phoneDigits = String(body.parentPhone).replace(/\D/g, "");
            if (phoneDigits && !PHONE_RE.test(phoneDigits)) {
                return res.status(400).json({ error: "Số điện thoại phụ huynh 8–15 chữ số" });
            }
            updates.push("parent_phone = ?");
            vals.push(phoneDigits || null);
        }
        if (body.address !== undefined) {
            updates.push("address = ?");
            vals.push(String(body.address).trim().slice(0, 500) || null);
        }
        if (body.gradeClass !== undefined) {
            updates.push("grade_class = ?");
            vals.push(String(body.gradeClass).trim().slice(0, 120) || null);
        }
        if (body.termsAccepted !== undefined) {
            updates.push("terms_accepted = ?");
            vals.push(body.termsAccepted ? 1 : 0);
        }
        if (body.role !== undefined) {
            const nr = body.role === "admin" ? "admin" : "user";
            updates.push("role = ?");
            vals.push(nr);
        }
        if (updates.length === 0) {
            return res.status(400).json({ error: "Không có dữ liệu cập nhật" });
        }
        vals.push(id);
        try {
            await db.queryAsync(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, vals);
        } catch (e) {
            if (e.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ error: "Trùng tên đăng nhập hoặc email" });
            }
            if (/Unknown column.*role/i.test(String(e.message)) && body.role !== undefined) {
                return res.status(503).json({
                    error: "Cột role chưa có",
                    detail: "Chạy backend/scripts/ensure_users_schema.js",
                });
            }
            throw e;
        }
        res.json({ ok: true });
    } catch (err) {
        console.error("adminUsers PUT /:id:", err);
        res.status(500).json({ error: "Không cập nhật được", detail: err.message });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: "ID không hợp lệ" });
        }
        if (id === req.userId) {
            return res.status(403).json({ error: "Không thể xóa chính tài khoản đang đăng nhập" });
        }
        const r = await db.queryAsync(`DELETE FROM users WHERE id = ?`, [id]);
        const affected = r.affectedRows ?? 0;
        if (!affected) {
            return res.status(404).json({ error: "Không tìm thấy user" });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error("adminUsers DELETE /:id:", err);
        res.status(500).json({ error: "Không xóa được" });
    }
});

module.exports = router;
