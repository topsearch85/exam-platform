const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const {
    signToken,
    createRegisterCaptcha,
    verifyRegisterCaptcha,
} = require("../lib/authUtil");
const { requireAuth } = require("../lib/authMiddleware");
const { generateResetToken, hashResetToken } = require("../lib/resetToken");
const { sendPasswordResetEmail, sendWelcomeEmail, isMailConfigured } = require("../lib/mail");

const router = express.Router();
const BCRYPT_ROUNDS = 10;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Số điện thoại: chỉ chữ số, 8–15 ký tự (VN và quốc tế rút gọn) */
const PHONE_RE = /^[0-9]{8,15}$/;
const AVATAR_KEYS = new Set(["default", ...Array.from({ length: 18 }, (_, i) => `avatar${i + 1}`)]);

function normalizeAvatar(v) {
    const s = v != null && String(v).trim() !== "" ? String(v).trim() : "default";
    return AVATAR_KEYS.has(s) ? s : "default";
}

/** Dữ liệu user trả về client (không có password) */
function publicUserFromRow(r) {
    if (!r) return null;
    return {
        id: r.id,
        username: r.username,
        email: r.email,
        displayName: r.display_name,
        avatar: normalizeAvatar(r.avatar),
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

router.get("/register-captcha", (req, res) => {
    try {
        const { token, prompt } = createRegisterCaptcha();
        res.json({ token, prompt: `${prompt} = ?` });
    } catch (err) {
        console.error("GET /auth/register-captcha:", err);
        res.status(500).json({ error: "Không tạo mã xác nhận" });
    }
});

router.post("/register", async (req, res) => {
    try {
        const {
            username,
            password,
            passwordConfirm,
            email,
            displayName,
            fullName,
            gender,
            parentPhone,
            address,
            gradeClass,
            termsAccepted,
            captchaToken,
            captchaAnswer,
            avatar: avatarBody,
        } = req.body;
        if (!username || !password || !email || !displayName) {
            return res.status(400).json({ error: "Thiếu thông tin bắt buộc (bước 1)" });
        }
        if (!fullName || !parentPhone || !gradeClass) {
            return res.status(400).json({ error: "Thiếu họ tên, số điện thoại phụ huynh hoặc khối lớp" });
        }
        if (!termsAccepted) {
            return res.status(400).json({ error: "Cần đồng ý điều khoản và quy định" });
        }
        if (!captchaToken || !verifyRegisterCaptcha(captchaToken, captchaAnswer)) {
            return res.status(400).json({ error: "Mã xác nhận không đúng hoặc đã hết hạn" });
        }
        const u = String(username).trim();
        const em = String(email).trim().toLowerCase();
        const dn = String(displayName).trim().slice(0, 120);
        const fn = String(fullName).trim().slice(0, 200);
        const gen = gender != null ? String(gender).trim().slice(0, 32) : "";
        const phoneDigits = String(parentPhone).replace(/\D/g, "");
        const addr = address != null ? String(address).trim().slice(0, 500) : "";
        const gcl = String(gradeClass).trim().slice(0, 120);
        if (!USERNAME_RE.test(u)) {
            return res.status(400).json({
                error: "Tên đăng nhập 3–64 ký tự, chỉ chữ, số và dấu gạch dưới",
            });
        }
        if (!EMAIL_RE.test(em)) {
            return res.status(400).json({ error: "Email không hợp lệ" });
        }
        if (dn.length < 1) {
            return res.status(400).json({ error: "Nhập tên hiển thị" });
        }
        if (fn.length < 1) {
            return res.status(400).json({ error: "Nhập họ và tên" });
        }
        if (!PHONE_RE.test(phoneDigits)) {
            return res.status(400).json({ error: "Số điện thoại phụ huynh 8–15 chữ số" });
        }
        if (gcl.length < 1) {
            return res.status(400).json({ error: "Chọn hoặc nhập khối - lớp" });
        }
        if (String(password).length < 8) {
            return res.status(400).json({ error: "Mật khẩu ít nhất 8 ký tự" });
        }
        if (password !== passwordConfirm) {
            return res.status(400).json({ error: "Mật khẩu nhập lại không khớp" });
        }

        const av = normalizeAvatar(avatarBody);
        const hash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
        let r;
        try {
            r = await db.queryAsync(
                `INSERT INTO users (username, email, password_hash, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, avatar)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [u, em, hash, dn, fn, gen || null, phoneDigits, addr || null, gcl, av]
            );
        } catch (e) {
            if (e.code === "ER_DUP_ENTRY") {
                return res.status(400).json({ error: "Tên đăng nhập hoặc email đã được dùng" });
            }
            if (/Unknown column.*avatar/i.test(String(e.message))) {
                return res.status(503).json({
                    error: "Cần cập nhật cơ sở dữ liệu",
                    detail: "Chạy: node backend/scripts/ensure_users_schema.js",
                });
            }
            if (/Unknown table|doesn't exist/i.test(String(e.message))) {
                return res.status(503).json({
                    error: "Chưa chạy migration",
                    detail: "Chạy backend/schema_users.sql trên MySQL",
                });
            }
            throw e;
        }
        const id = typeof r.insertId === "bigint" ? Number(r.insertId) : r.insertId;
        let inserted;
        try {
            inserted = await db.queryAsync(
                `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at, role, avatar FROM users WHERE id = ?`,
                [id]
            );
        } catch (e) {
            if (!/Unknown column/i.test(String(e.message))) throw e;
            try {
                inserted = await db.queryAsync(
                    `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at, role FROM users WHERE id = ?`,
                    [id]
                );
            } catch (e2) {
                if (!/Unknown column.*role/i.test(String(e2.message))) throw e2;
                inserted = await db.queryAsync(
                    `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at FROM users WHERE id = ?`,
                    [id]
                );
            }
        }
        const urow = inserted[0];
        const token = signToken(
            {
                sub: id,
                username: u,
                displayName: dn,
                role: urow.role === "admin" ? "admin" : "user",
            },
            false
        );

        let welcomeEmailSent = false;
        if (isMailConfigured()) {
            try {
                await sendWelcomeEmail(em, { username: u, displayName: dn });
                welcomeEmailSent = true;
            } catch (mailErr) {
                console.error("POST /auth/register welcome email:", mailErr);
            }
        } else if (process.env.NODE_ENV !== "production") {
            console.log("[dev] Chưa gửi email chào mừng (không cấu hình SMTP). Email đăng ký:", em);
        }

        res.status(201).json({
            token,
            user: publicUserFromRow(urow),
            welcomeEmailSent,
        });
    } catch (err) {
        console.error("POST /auth/register:", err);
        res.status(500).json({ error: "Không đăng ký được", detail: err.message });
    }
});

const RESET_GENERIC = {
    ok: true,
    message: "Nếu email đã đăng ký, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.",
};

router.post("/forgot-password", async (req, res) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ error: "Email không hợp lệ" });
        }
        let rows;
        try {
            rows = await db.queryAsync(`SELECT id FROM users WHERE email = ?`, [email]);
        } catch (e) {
            if (/Unknown table|doesn't exist/i.test(String(e.message))) {
                return res.status(503).json({
                    error: "Chưa chạy migration",
                    detail: "Chạy backend/schema_users.sql trên MySQL",
                });
            }
            throw e;
        }
        if (!rows.length) {
            return res.json(RESET_GENERIC);
        }
        const token = generateResetToken();
        const tokenHash = hashResetToken(token);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        try {
            await db.queryAsync(
                `UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ? WHERE id = ?`,
                [tokenHash, expiresAt, rows[0].id]
            );
        } catch (e) {
            if (/Unknown column/i.test(String(e.message))) {
                return res.status(503).json({
                    error: "Cần cập nhật cơ sở dữ liệu",
                    detail: "Chạy: node backend/scripts/ensure_users_schema.js",
                });
            }
            throw e;
        }
        const frontend = String(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
        const resetUrl = `${frontend}/dat-lai-mat-khau?token=${encodeURIComponent(token)}`;
        if (isMailConfigured()) {
            try {
                await sendPasswordResetEmail(email, resetUrl);
            } catch (err) {
                console.error("POST /auth/forgot-password mail:", err);
                return res.status(503).json({ error: "Không gửi được email. Thử lại sau." });
            }
            return res.json(RESET_GENERIC);
        }
        if (process.env.NODE_ENV !== "production") {
            console.log("[dev] Password reset link:", resetUrl);
            return res.json({ ...RESET_GENERIC, devResetUrl: resetUrl });
        }
        return res.status(503).json({ error: "Hệ thống email chưa được cấu hình." });
    } catch (err) {
        console.error("POST /auth/forgot-password:", err);
        res.status(500).json({ error: "Không xử lý được yêu cầu", detail: err.message });
    }
});

router.post("/reset-password", async (req, res) => {
    try {
        const { token, password, passwordConfirm } = req.body;
        if (!token || String(token).length < 16) {
            return res.status(400).json({ error: "Thiếu hoặc sai mã đặt lại mật khẩu" });
        }
        if (!password || String(password).length < 8) {
            return res.status(400).json({ error: "Mật khẩu ít nhất 8 ký tự" });
        }
        if (password !== passwordConfirm) {
            return res.status(400).json({ error: "Mật khẩu nhập lại không khớp" });
        }
        const tokenHash = hashResetToken(token);
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT id FROM users WHERE password_reset_token_hash = ? AND password_reset_expires_at > NOW()`,
                [tokenHash]
            );
        } catch (e) {
            if (/Unknown column/i.test(String(e.message))) {
                return res.status(503).json({
                    error: "Cần cập nhật cơ sở dữ liệu",
                    detail: "Chạy: node backend/scripts/ensure_users_schema.js",
                });
            }
            throw e;
        }
        if (!rows.length) {
            return res.status(400).json({ error: "Liên kết không hợp lệ hoặc đã hết hạn" });
        }
        const newHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
        await db.queryAsync(
            `UPDATE users SET password_hash = ?, password_reset_token_hash = NULL, password_reset_expires_at = NULL WHERE id = ?`,
            [newHash, rows[0].id]
        );
        res.json({ ok: true, message: "Đã đặt lại mật khẩu. Bạn có thể đăng nhập." });
    } catch (err) {
        console.error("POST /auth/reset-password:", err);
        res.status(500).json({ error: "Không đặt lại được mật khẩu", detail: err.message });
    }
});

router.post("/change-password", requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword, newPasswordConfirm } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Nhập mật khẩu hiện tại và mật khẩu mới" });
        }
        if (String(newPassword).length < 8) {
            return res.status(400).json({ error: "Mật khẩu mới ít nhất 8 ký tự" });
        }
        if (newPassword !== newPasswordConfirm) {
            return res.status(400).json({ error: "Mật khẩu mới nhập lại không khớp" });
        }
        let rows;
        try {
            rows = await db.queryAsync(`SELECT password_hash FROM users WHERE id = ?`, [req.userId]);
        } catch (e) {
            if (/Unknown table|doesn't exist/i.test(String(e.message))) {
                return res.status(503).json({ error: "Chưa chạy migration", detail: "Chạy backend/schema_users.sql" });
            }
            throw e;
        }
        if (!rows.length) {
            return res.status(401).json({ error: "Tài khoản không còn tồn tại" });
        }
        const ok = await bcrypt.compare(String(currentPassword), rows[0].password_hash);
        if (!ok) {
            return res.status(400).json({ error: "Mật khẩu hiện tại không đúng" });
        }
        const newHash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
        await db.queryAsync(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, req.userId]);
        res.json({ ok: true, message: "Đã đổi mật khẩu." });
    } catch (err) {
        console.error("POST /auth/change-password:", err);
        res.status(500).json({ error: "Không đổi được mật khẩu", detail: err.message });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { username, password, rememberMe } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Nhập tên đăng nhập và mật khẩu" });
        }
        const u = String(username).trim();
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT id, username, email, password_hash, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at, role, avatar
           FROM users WHERE username = ?`,
                [u]
            );
        } catch (e) {
            if (!/Unknown column/i.test(String(e.message))) throw e;
            try {
                rows = await db.queryAsync(
                    `SELECT id, username, email, password_hash, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at, role
           FROM users WHERE username = ?`,
                    [u]
                );
            } catch (e2) {
                if (!/Unknown column/i.test(String(e2.message))) throw e2;
                rows = await db.queryAsync(
                    `SELECT id, username, email, password_hash, display_name FROM users WHERE username = ?`,
                    [u]
                );
            }
        }
        if (!rows.length) {
            return res.status(401).json({ error: "Sai tên đăng nhập hoặc mật khẩu" });
        }
        const row = rows[0];
        const ok = await bcrypt.compare(String(password), row.password_hash);
        if (!ok) {
            return res.status(401).json({ error: "Sai tên đăng nhập hoặc mật khẩu" });
        }
        const token = signToken(
            {
                sub: row.id,
                username: row.username,
                displayName: row.display_name,
                role: row.role === "admin" ? "admin" : "user",
            },
            Boolean(rememberMe)
        );
        res.json({
            token,
            user: publicUserFromRow(row),
        });
    } catch (err) {
        console.error("POST /auth/login:", err);
        if (/Unknown table|doesn't exist/i.test(String(err.message))) {
            return res.status(503).json({
                error: "Chưa chạy migration",
                detail: "Chạy backend/schema_users.sql trên MySQL",
            });
        }
        res.status(500).json({ error: "Đăng nhập lỗi", detail: err.message });
    }
});

router.get("/me", requireAuth, async (req, res) => {
    try {
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at, role, avatar
       FROM users WHERE id = ?`,
                [req.userId]
            );
        } catch (e) {
            if (!/Unknown column/i.test(String(e.message))) throw e;
            try {
                rows = await db.queryAsync(
                    `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at, role
       FROM users WHERE id = ?`,
                    [req.userId]
                );
            } catch (e2) {
                if (!/Unknown column.*role/i.test(String(e2.message))) throw e2;
                rows = await db.queryAsync(
                    `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at
       FROM users WHERE id = ?`,
                    [req.userId]
                );
            }
        }
        if (!rows.length) {
            return res.status(401).json({ error: "Tài khoản không còn tồn tại" });
        }
        res.json({ user: publicUserFromRow(rows[0]) });
    } catch (err) {
        console.error("GET /auth/me:", err);
        if (/Unknown column/i.test(String(err.message))) {
            try {
                const rows = await db.queryAsync(
                    `SELECT id, username, email, display_name FROM users WHERE id = ?`,
                    [req.userId]
                );
                if (!rows.length) {
                    return res.status(401).json({ error: "Tài khoản không còn tồn tại" });
                }
                const r = rows[0];
                return res.json({
                    user: {
                        id: r.id,
                        username: r.username,
                        email: r.email,
                        displayName: r.display_name,
                        avatar: "default",
                        fullName: null,
                        gender: null,
                        parentPhone: null,
                        address: null,
                        gradeClass: null,
                        termsAccepted: false,
                        createdAt: null,
                        role: "user",
                    },
                });
            } catch (e2) {
                console.error("GET /auth/me fallback:", e2);
            }
        }
        res.status(500).json({ error: "Lỗi máy chủ" });
    }
});

router.patch("/me", requireAuth, async (req, res) => {
    try {
        const { avatar: avatarBody } = req.body;
        if (avatarBody === undefined || avatarBody === null) {
            return res.status(400).json({ error: "Thiếu avatar" });
        }
        const av = normalizeAvatar(avatarBody);
        try {
            await db.queryAsync(`UPDATE users SET avatar = ? WHERE id = ?`, [av, req.userId]);
        } catch (e) {
            if (/Unknown column.*avatar/i.test(String(e.message))) {
                return res.status(503).json({
                    error: "Cần cập nhật cơ sở dữ liệu",
                    detail: "Chạy: node backend/scripts/ensure_users_schema.js",
                });
            }
            throw e;
        }
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at, role, avatar FROM users WHERE id = ?`,
                [req.userId]
            );
        } catch (e) {
            if (!/Unknown column/i.test(String(e.message))) throw e;
            try {
                rows = await db.queryAsync(
                    `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at, role FROM users WHERE id = ?`,
                    [req.userId]
                );
            } catch (e2) {
                if (!/Unknown column.*role/i.test(String(e2.message))) throw e2;
                rows = await db.queryAsync(
                    `SELECT id, username, email, display_name, full_name, gender, parent_phone, address, grade_class, terms_accepted, created_at FROM users WHERE id = ?`,
                    [req.userId]
                );
            }
        }
        if (!rows.length) {
            return res.status(401).json({ error: "Tài khoản không còn tồn tại" });
        }
        res.json({ user: publicUserFromRow(rows[0]) });
    } catch (err) {
        console.error("PATCH /auth/me:", err);
        res.status(500).json({ error: "Không cập nhật được", detail: err.message });
    }
});

/** Tiến độ đã làm đề theo user, theo bài học (lesson catalog) */
router.get("/exam-progress", requireAuth, async (req, res) => {
    try {
        const lessonId = Number(req.query.lessonId);
        if (!Number.isFinite(lessonId) || lessonId <= 0) {
            return res.status(400).json({ error: "Thiếu lessonId hợp lệ" });
        }
        const papers = await db.queryAsync(
            `SELECT id FROM exam_papers WHERE catalog_lesson_id = ?`,
            [lessonId]
        );
        const ids = papers.map((p) => p.id);
        if (ids.length === 0) {
            return res.json({ progress: {} });
        }
        let progRows;
        try {
            progRows = await db.queryAsync(
                `SELECT exam_paper_id, score, total, last_results_json, updated_at FROM user_exam_paper_progress
         WHERE user_id = ? AND exam_paper_id IN (?)`,
                [req.userId, ids]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                progRows = await db.queryAsync(
                    `SELECT exam_paper_id, score, total, updated_at FROM user_exam_paper_progress
         WHERE user_id = ? AND exam_paper_id IN (?)`,
                    [req.userId, ids]
                );
            } else if (/doesn't exist|Unknown table/i.test(String(e.message))) {
                return res.json({ progress: {} });
            } else {
                throw e;
            }
        }
        const progress = {};
        progRows.forEach((r) => {
            let lastReview = null;
            const raw = r.last_results_json;
            if (raw != null && String(raw).trim() !== "") {
                try {
                    lastReview = JSON.parse(String(raw));
                } catch {
                    lastReview = null;
                }
            }
            progress[r.exam_paper_id] = {
                score: r.score,
                total: r.total,
                updatedAt: r.updated_at != null ? r.updated_at : null,
                lastReview,
            };
        });
        res.json({ progress });
    } catch (err) {
        console.error("GET /auth/exam-progress:", err);
        res.status(500).json({ error: "Không tải được tiến độ" });
    }
});

/** Danh sách tất cả đề đã làm (lần gần nhất / bài đã lưu) — dùng trang hồ sơ */
router.get("/my-exam-history", requireAuth, async (req, res) => {
    try {
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT uep.exam_paper_id, uep.score, uep.total, uep.last_results_json, uep.updated_at,
              ep.title AS exam_title,
              ep.catalog_lesson_id,
              cl.title AS lesson_title,
              ct.title AS theme_title,
              gbl.label AS link_label,
              gbl.slug AS link_slug,
              gb.grade_id,
              g.name AS grade_name
       FROM user_exam_paper_progress uep
       INNER JOIN exam_papers ep ON ep.id = uep.exam_paper_id
       LEFT JOIN catalog_lessons cl ON ep.catalog_lesson_id = cl.id
       LEFT JOIN catalog_themes ct ON cl.catalog_theme_id = ct.id
       LEFT JOIN grade_block_links gbl ON ct.grade_block_link_id = gbl.id
       LEFT JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       LEFT JOIN grades g ON gb.grade_id = g.id
       WHERE uep.user_id = ?
       ORDER BY uep.updated_at DESC`,
                [req.userId]
            );
        } catch (e) {
            if (/doesn't exist|Unknown table/i.test(String(e.message))) {
                return res.json({ items: [] });
            }
            if (e.code === "ER_BAD_FIELD_ERROR") {
                rows = await db.queryAsync(
                    `SELECT uep.exam_paper_id, uep.score, uep.total, uep.last_results_json, uep.updated_at,
              ep.title AS exam_title,
              ep.catalog_lesson_id
       FROM user_exam_paper_progress uep
       INNER JOIN exam_papers ep ON ep.id = uep.exam_paper_id
       WHERE uep.user_id = ?
       ORDER BY uep.updated_at DESC`,
                    [req.userId]
                );
            } else {
                throw e;
            }
        }

        const items = rows.map((r) => {
            let lastReview = null;
            const raw = r.last_results_json;
            if (raw != null && String(raw).trim() !== "") {
                try {
                    lastReview = JSON.parse(String(raw));
                } catch {
                    lastReview = null;
                }
            }
            return {
                examPaperId: Number(r.exam_paper_id),
                title: r.exam_title || `Đề #${r.exam_paper_id}`,
                score: Number(r.score),
                total: Number(r.total),
                updatedAt: r.updated_at != null ? r.updated_at : null,
                lastReview,
                gradeId: r.grade_id != null ? Number(r.grade_id) : null,
                gradeName: r.grade_name || null,
                lessonId: r.catalog_lesson_id != null ? Number(r.catalog_lesson_id) : null,
                lessonTitle: r.lesson_title || null,
                themeTitle: r.theme_title || null,
                linkLabel: r.link_label || null,
                linkSlug: r.link_slug || null,
            };
        });

        res.json({ items });
    } catch (err) {
        console.error("GET /auth/my-exam-history:", err);
        res.status(500).json({ error: "Không tải được danh sách bài đã làm" });
    }
});

module.exports = router;
