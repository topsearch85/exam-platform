const express = require("express");
const db = require("../db");
const { requireAdminJwt } = require("../lib/authMiddleware");

const router = express.Router();

router.use(requireAdminJwt);

async function ensureDefaultSubjectForGrade(gradeId) {
    const rows = await db.queryAsync(`SELECT id FROM subjects WHERE grade_id = ? ORDER BY id LIMIT 1`, [gradeId]);
    if (rows.length) return rows[0].id;
    const r = await db.queryAsync(`INSERT INTO subjects (grade_id, name, sort_order) VALUES (?, ?, 0)`, [
        gradeId,
        "Ngân hàng câu hỏi",
    ]);
    return r.insertId;
}

async function resolveSubjectIdFromLessonId(lessonId) {
    const rows = await db.queryAsync(
        `SELECT gb.grade_id FROM catalog_lessons cl
     JOIN catalog_themes ct ON cl.catalog_theme_id = ct.id
     JOIN grade_block_links gbl ON ct.grade_block_link_id = gbl.id
     JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
     WHERE cl.id = ?`,
        [Number(lessonId)]
    );
    if (!rows.length) return null;
    return ensureDefaultSubjectForGrade(rows[0].grade_id);
}

/** URL tham chiếu SGK / tài liệu (tối đa 800 ký tự). */
function normTextbookUrl(v) {
    if (v === undefined) return undefined;
    if (v == null) return null;
    const s = String(v).trim();
    if (s === "") return null;
    return s.length > 800 ? s.slice(0, 800) : s;
}

/** --- Grades --- */
router.get("/grades", async (req, res) => {
    try {
        const rows = await db.queryAsync(
            `SELECT g.id, g.name, g.sort_order,
              (SELECT COUNT(*) FROM grade_blocks gb WHERE gb.grade_id = g.id) AS block_count
       FROM grades g ORDER BY g.sort_order, g.id`
        );
        res.json({ grades: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi DB", detail: err.message });
    }
});

router.post("/grades", async (req, res) => {
    try {
        const { name, sortOrder } = req.body;
        if (!name || typeof name !== "string") {
            return res.status(400).json({ error: "Thiếu tên lớp" });
        }
        const r = await db.queryAsync(`INSERT INTO grades (name, sort_order) VALUES (?, ?)`, [
            name.trim(),
            Number(sortOrder) || 0,
        ]);
        const gid = r.insertId;
        await ensureDefaultSubjectForGrade(gid);
        res.status(201).json({ id: gid });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không tạo được", detail: err.message });
    }
});

router.put("/grades/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { name, sortOrder } = req.body;
        await db.queryAsync(`UPDATE grades SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ?`, [
            name != null ? String(name).trim() : null,
            sortOrder != null ? Number(sortOrder) : null,
            id,
        ]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không cập nhật", detail: err.message });
    }
});

router.delete("/grades/:id", async (req, res) => {
    try {
        await db.queryAsync(`DELETE FROM grades WHERE id = ?`, [Number(req.params.id)]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không xóa được", detail: err.message });
    }
});

/** --- Khối hiển thị trên trang lớp (tiêu đề text) --- */
router.get("/grades/:gradeId/blocks", async (req, res) => {
    try {
        const gradeId = Number(req.params.gradeId);
        const rows = await db.queryAsync(
            `SELECT id, grade_id, title, sort_order FROM grade_blocks WHERE grade_id = ? ORDER BY sort_order, id`,
            [gradeId]
        );
        res.json({ blocks: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi DB", detail: err.message });
    }
});

router.post("/grades/:gradeId/blocks", async (req, res) => {
    try {
        const gradeId = Number(req.params.gradeId);
        const { title, sortOrder } = req.body;
        if (!title || typeof title !== "string") {
            return res.status(400).json({ error: "Thiếu tiêu đề khối" });
        }
        const r = await db.queryAsync(
            `INSERT INTO grade_blocks (grade_id, title, sort_order) VALUES (?, ?, ?)`,
            [gradeId, title.trim(), Number(sortOrder) || 0]
        );
        res.status(201).json({ id: r.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không tạo được", detail: err.message });
    }
});

router.put("/blocks/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { title, sortOrder } = req.body;
        await db.queryAsync(
            `UPDATE grade_blocks SET title = COALESCE(?, title), sort_order = COALESCE(?, sort_order) WHERE id = ?`,
            [title != null ? String(title).trim() : null, sortOrder != null ? Number(sortOrder) : null, id]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không cập nhật", detail: err.message });
    }
});

router.delete("/blocks/:id", async (req, res) => {
    try {
        await db.queryAsync(`DELETE FROM grade_blocks WHERE id = ?`, [Number(req.params.id)]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không xóa được", detail: err.message });
    }
});

/** --- Link (Bài tập 1, …) --- */
router.get("/blocks/:blockId/links", async (req, res) => {
    try {
        const blockId = Number(req.params.blockId);
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT id, grade_block_id, label, slug, short_description, long_description, sort_order, textbook_url
       FROM grade_block_links WHERE grade_block_id = ? ORDER BY sort_order, id`,
                [blockId]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                rows = await db.queryAsync(
                    `SELECT id, grade_block_id, label, slug, short_description, long_description, sort_order
       FROM grade_block_links WHERE grade_block_id = ? ORDER BY sort_order, id`,
                    [blockId]
                );
            } else {
                throw e;
            }
        }
        res.json({ links: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi DB", detail: err.message });
    }
});

router.post("/blocks/:blockId/links", async (req, res) => {
    try {
        const blockId = Number(req.params.blockId);
        const { label, slug, shortDescription, longDescription, sortOrder, textbookUrl } = req.body;
        if (!label || !slug) {
            return res.status(400).json({ error: "Thiếu label hoặc slug" });
        }
        const s = String(slug)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-")
            .replace(/^-|-$/g, "");
        if (!s) {
            return res.status(400).json({ error: "Slug không hợp lệ" });
        }
        const shortDesc = shortDescription != null ? String(shortDescription) : null;
        const longDesc = longDescription != null && String(longDescription).trim() !== "" ? String(longDescription) : null;
        const tbUrl = normTextbookUrl(textbookUrl);
        let r;
        try {
            r = await db.queryAsync(
                `INSERT INTO grade_block_links (grade_block_id, label, slug, short_description, long_description, sort_order, textbook_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [blockId, label.trim(), s, shortDesc, longDesc, Number(sortOrder) || 0, tbUrl]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                r = await db.queryAsync(
                    `INSERT INTO grade_block_links (grade_block_id, label, slug, short_description, long_description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
                    [blockId, label.trim(), s, shortDesc, longDesc, Number(sortOrder) || 0]
                );
            } else {
                throw e;
            }
        }
        res.status(201).json({ id: r.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không tạo được", detail: err.message });
    }
});

router.put("/links/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { label, slug, shortDescription, longDescription, sortOrder, textbookUrl } = req.body;
        const cur = await db.queryAsync(`SELECT * FROM grade_block_links WHERE id = ?`, [id]);
        if (!cur.length) {
            return res.status(404).json({ error: "Không tìm thấy" });
        }
        const c = cur[0];
        const newLabel = label != null ? String(label).trim() : c.label;
        let newSlug = c.slug;
        if (slug != null) {
            newSlug = String(slug)
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, "-")
                .replace(/^-|-$/g, "");
        }
        const newDesc =
            shortDescription !== undefined
                ? shortDescription == null || shortDescription === ""
                    ? null
                    : String(shortDescription)
                : c.short_description;
        const newLongDesc =
            longDescription !== undefined
                ? longDescription == null || String(longDescription).trim() === ""
                    ? null
                    : String(longDescription)
                : c.long_description;
        const newOrder = sortOrder != null ? Number(sortOrder) : c.sort_order;
        const newTb =
            textbookUrl !== undefined ? normTextbookUrl(textbookUrl) : c.textbook_url != null ? c.textbook_url : null;
        try {
            await db.queryAsync(
                `UPDATE grade_block_links SET label = ?, slug = ?, short_description = ?, long_description = ?, sort_order = ?, textbook_url = ? WHERE id = ?`,
                [newLabel, newSlug, newDesc, newLongDesc, newOrder, newTb, id]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                await db.queryAsync(
                    `UPDATE grade_block_links SET label = ?, slug = ?, short_description = ?, sort_order = ? WHERE id = ?`,
                    [newLabel, newSlug, newDesc, newOrder, id]
                );
            } else {
                throw e;
            }
        }
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không cập nhật", detail: err.message });
    }
});

router.delete("/links/:id", async (req, res) => {
    try {
        await db.queryAsync(`DELETE FROM grade_block_links WHERE id = ?`, [Number(req.params.id)]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không xóa được", detail: err.message });
    }
});

/** --- Chủ đề --- */
router.get("/links/:linkId/themes", async (req, res) => {
    try {
        const linkId = Number(req.params.linkId);
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT id, grade_block_link_id, title, sort_order, textbook_url FROM catalog_themes WHERE grade_block_link_id = ? ORDER BY sort_order, id`,
                [linkId]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                rows = await db.queryAsync(
                    `SELECT id, grade_block_link_id, title, sort_order FROM catalog_themes WHERE grade_block_link_id = ? ORDER BY sort_order, id`,
                    [linkId]
                );
            } else {
                throw e;
            }
        }
        res.json({ themes: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi DB", detail: err.message });
    }
});

router.post("/links/:linkId/themes", async (req, res) => {
    try {
        const linkId = Number(req.params.linkId);
        const { title, sortOrder, textbookUrl } = req.body;
        if (!title) {
            return res.status(400).json({ error: "Thiếu tiêu đề chủ đề" });
        }
        const tbUrl = normTextbookUrl(textbookUrl);
        let r;
        try {
            r = await db.queryAsync(
                `INSERT INTO catalog_themes (grade_block_link_id, title, sort_order, textbook_url) VALUES (?, ?, ?, ?)`,
                [linkId, String(title).trim(), Number(sortOrder) || 0, tbUrl]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                r = await db.queryAsync(
                    `INSERT INTO catalog_themes (grade_block_link_id, title, sort_order) VALUES (?, ?, ?)`,
                    [linkId, String(title).trim(), Number(sortOrder) || 0]
                );
            } else {
                throw e;
            }
        }
        res.status(201).json({ id: r.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không tạo được", detail: err.message });
    }
});

router.put("/themes/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { title, sortOrder, textbookUrl } = req.body;
        const cur = await db.queryAsync(`SELECT * FROM catalog_themes WHERE id = ?`, [id]);
        if (!cur.length) {
            return res.status(404).json({ error: "Không tìm thấy" });
        }
        const c = cur[0];
        const newTb =
            textbookUrl !== undefined ? normTextbookUrl(textbookUrl) : c.textbook_url != null ? c.textbook_url : null;
        try {
            await db.queryAsync(
                `UPDATE catalog_themes SET title = COALESCE(?, title), sort_order = COALESCE(?, sort_order), textbook_url = ? WHERE id = ?`,
                [title != null ? String(title).trim() : null, sortOrder != null ? Number(sortOrder) : null, newTb, id]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                await db.queryAsync(
                    `UPDATE catalog_themes SET title = COALESCE(?, title), sort_order = COALESCE(?, sort_order) WHERE id = ?`,
                    [title != null ? String(title).trim() : null, sortOrder != null ? Number(sortOrder) : null, id]
                );
            } else {
                throw e;
            }
        }
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không cập nhật", detail: err.message });
    }
});

router.delete("/themes/:id", async (req, res) => {
    try {
        await db.queryAsync(`DELETE FROM catalog_themes WHERE id = ?`, [Number(req.params.id)]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không xóa được", detail: err.message });
    }
});

/** --- Bài (dưới chủ đề) --- */
router.get("/themes/:themeId/lessons", async (req, res) => {
    try {
        const themeId = Number(req.params.themeId);
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT id, catalog_theme_id, title, description, sort_order, textbook_url FROM catalog_lessons WHERE catalog_theme_id = ? ORDER BY sort_order, id`,
                [themeId]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                try {
                    rows = await db.queryAsync(
                        `SELECT id, catalog_theme_id, title, description, sort_order FROM catalog_lessons WHERE catalog_theme_id = ? ORDER BY sort_order, id`,
                        [themeId]
                    );
                } catch (e2) {
                    if (e2.code === "ER_BAD_FIELD_ERROR") {
                        rows = await db.queryAsync(
                            `SELECT id, catalog_theme_id, title, sort_order FROM catalog_lessons WHERE catalog_theme_id = ? ORDER BY sort_order, id`,
                            [themeId]
                        );
                    } else {
                        throw e2;
                    }
                }
            } else {
                throw e;
            }
        }
        res.json({ lessons: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi DB", detail: err.message });
    }
});

router.post("/themes/:themeId/lessons", async (req, res) => {
    try {
        const themeId = Number(req.params.themeId);
        const { title, description, sortOrder, textbookUrl } = req.body;
        if (!title) {
            return res.status(400).json({ error: "Thiếu tên bài" });
        }
        const desc =
            description != null && String(description).trim() !== "" ? String(description).trim() : null;
        const tbUrl = normTextbookUrl(textbookUrl);
        let r;
        try {
            r = await db.queryAsync(
                `INSERT INTO catalog_lessons (catalog_theme_id, title, description, sort_order, textbook_url) VALUES (?, ?, ?, ?, ?)`,
                [themeId, String(title).trim(), desc, Number(sortOrder) || 0, tbUrl]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                try {
                    r = await db.queryAsync(
                        `INSERT INTO catalog_lessons (catalog_theme_id, title, description, sort_order) VALUES (?, ?, ?, ?)`,
                        [themeId, String(title).trim(), desc, Number(sortOrder) || 0]
                    );
                } catch (e2) {
                    if (e2.code === "ER_BAD_FIELD_ERROR") {
                        r = await db.queryAsync(
                            `INSERT INTO catalog_lessons (catalog_theme_id, title, sort_order) VALUES (?, ?, ?)`,
                            [themeId, String(title).trim(), Number(sortOrder) || 0]
                        );
                    } else {
                        throw e2;
                    }
                }
            } else {
                throw e;
            }
        }
        res.status(201).json({ id: r.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không tạo được", detail: err.message });
    }
});

router.put("/lessons/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { title, description, sortOrder, textbookUrl } = req.body;
        const cur = await db.queryAsync(`SELECT * FROM catalog_lessons WHERE id = ?`, [id]);
        if (!cur.length) {
            return res.status(404).json({ error: "Không tìm thấy" });
        }
        const c = cur[0];
        const desc =
            description !== undefined
                ? description == null || String(description).trim() === ""
                    ? null
                    : String(description).trim()
                : undefined;
        const newTb =
            textbookUrl !== undefined ? normTextbookUrl(textbookUrl) : c.textbook_url != null ? c.textbook_url : null;
        try {
            if (desc !== undefined) {
                await db.queryAsync(
                    `UPDATE catalog_lessons SET title = COALESCE(?, title), description = ?, sort_order = COALESCE(?, sort_order), textbook_url = ? WHERE id = ?`,
                    [
                        title != null ? String(title).trim() : null,
                        desc,
                        sortOrder != null ? Number(sortOrder) : null,
                        newTb,
                        id,
                    ]
                );
            } else {
                await db.queryAsync(
                    `UPDATE catalog_lessons SET title = COALESCE(?, title), sort_order = COALESCE(?, sort_order), textbook_url = ? WHERE id = ?`,
                    [title != null ? String(title).trim() : null, sortOrder != null ? Number(sortOrder) : null, newTb, id]
                );
            }
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                try {
                    if (desc !== undefined) {
                        await db.queryAsync(
                            `UPDATE catalog_lessons SET title = COALESCE(?, title), description = ?, sort_order = COALESCE(?, sort_order) WHERE id = ?`,
                            [title != null ? String(title).trim() : null, desc, sortOrder != null ? Number(sortOrder) : null, id]
                        );
                    } else {
                        await db.queryAsync(
                            `UPDATE catalog_lessons SET title = COALESCE(?, title), sort_order = COALESCE(?, sort_order) WHERE id = ?`,
                            [title != null ? String(title).trim() : null, sortOrder != null ? Number(sortOrder) : null, id]
                        );
                    }
                } catch (e2) {
                    throw e2;
                }
            } else {
                throw e;
            }
        }
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không cập nhật", detail: err.message });
    }
});

router.delete("/lessons/:id", async (req, res) => {
    try {
        await db.queryAsync(`DELETE FROM catalog_lessons WHERE id = ?`, [Number(req.params.id)]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không xóa được", detail: err.message });
    }
});

/** --- Môn (ngân hàng câu) theo lớp — dùng khi gắn đề --- */
router.get("/subjects", async (req, res) => {
    try {
        const gradeId = req.query.gradeId != null ? Number(req.query.gradeId) : null;
        let sql = `SELECT s.id, s.grade_id, s.name, s.sort_order, g.name AS grade_name
             FROM subjects s JOIN grades g ON s.grade_id = g.id`;
        const params = [];
        if (gradeId) {
            sql += ` WHERE s.grade_id = ?`;
            params.push(gradeId);
        }
        sql += ` ORDER BY g.sort_order, s.sort_order, s.id`;
        const rows = await db.queryAsync(sql, params);
        res.json({ subjects: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi DB", detail: err.message });
    }
});

/** Danh sách phẳng các «bài» để gắn đề (dropdown) */
router.get("/grades/:gradeId/lessons-flat", async (req, res) => {
    try {
        const gradeId = Number(req.params.gradeId);
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT cl.id, cl.title, cl.description,
              ct.title AS theme_title,
              gbl.label AS link_label, gbl.slug AS link_slug
       FROM catalog_lessons cl
       JOIN catalog_themes ct ON cl.catalog_theme_id = ct.id
       JOIN grade_block_links gbl ON ct.grade_block_link_id = gbl.id
       JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       WHERE gb.grade_id = ?
       ORDER BY gb.sort_order, gbl.sort_order, ct.sort_order, cl.sort_order, cl.id`,
                [gradeId]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                rows = await db.queryAsync(
                    `SELECT cl.id, cl.title,
              ct.title AS theme_title,
              gbl.label AS link_label, gbl.slug AS link_slug
       FROM catalog_lessons cl
       JOIN catalog_themes ct ON cl.catalog_theme_id = ct.id
       JOIN grade_block_links gbl ON ct.grade_block_link_id = gbl.id
       JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       WHERE gb.grade_id = ?
       ORDER BY gb.sort_order, gbl.sort_order, ct.sort_order, cl.sort_order, cl.id`,
                    [gradeId]
                );
            } else {
                throw e;
            }
        }
        res.json({ lessons: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi DB", detail: err.message });
    }
});

/** --- Đề thi --- */
router.get("/exam-papers", async (req, res) => {
    try {
        const gradeId = req.query.gradeId != null ? Number(req.query.gradeId) : null;
        const lessonId = req.query.catalogLessonId != null ? Number(req.query.catalogLessonId) : null;
        if (lessonId && Number.isFinite(lessonId)) {
            const rows = await db.queryAsync(
                `SELECT ep.id, ep.subject_id, ep.catalog_lesson_id, ep.title, ep.description, ep.duration_sec, ep.question_count, ep.is_active, ep.sort_order, ep.answer_code_prefix
           FROM exam_papers ep WHERE ep.catalog_lesson_id = ? ORDER BY ep.sort_order, ep.id DESC`,
                [lessonId]
            );
            return res.json({ examPapers: rows });
        }
        if (gradeId && Number.isFinite(gradeId)) {
            const rows = await db.queryAsync(
                `SELECT ep.id, ep.subject_id, ep.catalog_lesson_id, ep.title, ep.description, ep.duration_sec, ep.question_count, ep.is_active, ep.sort_order, ep.answer_code_prefix
           FROM exam_papers ep
           JOIN subjects s ON ep.subject_id = s.id
           WHERE s.grade_id = ? ORDER BY ep.sort_order, ep.id DESC`,
                [gradeId]
            );
            return res.json({ examPapers: rows });
        }
        const rows = await db.queryAsync(
            `SELECT ep.id, ep.subject_id, ep.catalog_lesson_id, ep.title, ep.description, ep.duration_sec, ep.question_count, ep.is_active, ep.sort_order, ep.answer_code_prefix
       FROM exam_papers ep ORDER BY ep.id DESC LIMIT 500`
        );
        res.json({ examPapers: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi DB", detail: err.message });
    }
});

router.post("/exam-papers", async (req, res) => {
    try {
        const {
            catalogLessonId,
            title,
            description,
            durationSec,
            questionCount,
            sortOrder,
            isActive,
            answerCodePrefix,
        } = req.body;
        if (!title) {
            return res.status(400).json({ error: "Thiếu tiêu đề đề" });
        }
        let subjectId = null;
        let lessonId = null;
        if (catalogLessonId != null && catalogLessonId !== "") {
            lessonId = Number(catalogLessonId);
            subjectId = await resolveSubjectIdFromLessonId(lessonId);
            if (!subjectId) {
                return res.status(400).json({ error: "Không xác định được lớp cho bài này" });
            }
        } else if (req.body.subjectId) {
            subjectId = Number(req.body.subjectId);
        } else {
            return res.status(400).json({ error: "Thiếu catalogLessonId hoặc subjectId" });
        }
        const prefix =
            answerCodePrefix != null && String(answerCodePrefix).trim() !== ""
                ? String(answerCodePrefix).trim().slice(0, 32)
                : "VDL";
        const vals = [
            subjectId,
            lessonId,
            String(title).trim(),
            description || null,
            Number(durationSec) > 0 ? Number(durationSec) : 5400,
            Number(questionCount) > 0 ? Number(questionCount) : 50,
            Number(sortOrder) || 0,
            isActive === false ? 0 : 1,
            prefix,
        ];
        let r;
        try {
            r = await db.queryAsync(
                `INSERT INTO exam_papers (subject_id, catalog_lesson_id, title, description, duration_sec, question_count, sort_order, is_active, answer_code_prefix)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                vals
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                if (/answer_code_prefix/i.test(String(e.message))) {
                    r = await db.queryAsync(
                        `INSERT INTO exam_papers (subject_id, catalog_lesson_id, title, description, duration_sec, question_count, sort_order, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        vals.slice(0, -1)
                    );
                } else {
                    r = await db.queryAsync(
                        `INSERT INTO exam_papers (subject_id, topic_id, catalog_lesson_id, title, description, duration_sec, question_count, sort_order, is_active)
               VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
                        vals.slice(0, -1)
                    );
                }
            } else {
                throw e;
            }
        }
        res.status(201).json({ id: r.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không tạo được đề", detail: err.message });
    }
});

router.put("/exam-papers/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const {
            title,
            description,
            durationSec,
            questionCount,
            sortOrder,
            isActive,
            catalogLessonId,
            answerCodePrefix,
        } = req.body;
        if (catalogLessonId !== undefined) {
            let lessonId = null;
            let subjectId = null;
            if (catalogLessonId != null && catalogLessonId !== "") {
                lessonId = Number(catalogLessonId);
                subjectId = await resolveSubjectIdFromLessonId(lessonId);
                if (!subjectId) {
                    return res.status(400).json({ error: "Không xác định được lớp" });
                }
            } else {
                const cur = await db.queryAsync(`SELECT subject_id FROM exam_papers WHERE id = ?`, [id]);
                if (!cur.length) {
                    return res.status(404).json({ error: "Không tìm thấy đề" });
                }
                subjectId = cur[0].subject_id;
            }
            await db.queryAsync(`UPDATE exam_papers SET catalog_lesson_id = ?, subject_id = ? WHERE id = ?`, [
                lessonId,
                subjectId,
                id,
            ]);
        }
        if (answerCodePrefix !== undefined) {
            const prefix =
                answerCodePrefix != null && String(answerCodePrefix).trim() !== ""
                    ? String(answerCodePrefix).trim().slice(0, 32)
                    : "VDL";
            try {
                await db.queryAsync(`UPDATE exam_papers SET answer_code_prefix = ? WHERE id = ?`, [prefix, id]);
            } catch (e) {
                if (!/Unknown column.*answer_code_prefix/i.test(String(e.message))) throw e;
            }
        }

        await db.queryAsync(
            `UPDATE exam_papers SET
        title = COALESCE(?, title),
        description = ?,
        duration_sec = COALESCE(?, duration_sec),
        question_count = COALESCE(?, question_count),
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
            [
                title != null ? String(title).trim() : null,
                description,
                durationSec != null ? Number(durationSec) : null,
                questionCount != null ? Number(questionCount) : null,
                sortOrder != null ? Number(sortOrder) : null,
                isActive != null ? (isActive ? 1 : 0) : null,
                id,
            ]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không cập nhật", detail: err.message });
    }
});

router.delete("/exam-papers/:id", async (req, res) => {
    try {
        await db.queryAsync(`DELETE FROM exam_papers WHERE id = ?`, [Number(req.params.id)]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Không xóa được", detail: err.message });
    }
});

router.get("/subjects/:subjectId/topics-flat", async (req, res) => {
    try {
        res.json({ topics: [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
