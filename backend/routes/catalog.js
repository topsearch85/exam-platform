const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/grades", async (req, res) => {
    try {
        const rows = await db.queryAsync(
            `SELECT id, name, sort_order FROM grades ORDER BY sort_order ASC, id ASC`
        );
        res.json({ grades: rows });
    } catch (err) {
        console.error("GET /catalog/grades:", err);
        res.status(500).json({ error: "Không tải được danh sách lớp", detail: err.message });
    }
});

/** Trang lớp: các khối + link (Bài tập 1, …) */
router.get("/grades/:gradeId/layout", async (req, res) => {
    try {
        const gradeId = Number(req.params.gradeId);
        const gRows = await db.queryAsync(`SELECT id, name FROM grades WHERE id = ?`, [gradeId]);
        if (!gRows.length) {
            return res.status(404).json({ error: "Không có lớp" });
        }
        const blocks = await db.queryAsync(
            `SELECT id, grade_id, title, sort_order FROM grade_blocks WHERE grade_id = ? ORDER BY sort_order, id`,
            [gradeId]
        );
        const blockIds = blocks.map((b) => b.id);
        let linksByBlock = {};
        if (blockIds.length) {
            let links;
            try {
                links = await db.queryAsync(
                    `SELECT id, grade_block_id, label, slug, short_description, long_description, sort_order, textbook_url
         FROM grade_block_links WHERE grade_block_id IN (?) ORDER BY sort_order, id`,
                    [blockIds]
                );
            } catch (e) {
                if (e.code === "ER_BAD_FIELD_ERROR") {
                    try {
                        links = await db.queryAsync(
                            `SELECT id, grade_block_id, label, slug, short_description, long_description, sort_order
         FROM grade_block_links WHERE grade_block_id IN (?) ORDER BY sort_order, id`,
                            [blockIds]
                        );
                    } catch (e2) {
                        if (e2.code === "ER_BAD_FIELD_ERROR") {
                            links = await db.queryAsync(
                                `SELECT id, grade_block_id, label, slug, short_description, sort_order
         FROM grade_block_links WHERE grade_block_id IN (?) ORDER BY sort_order, id`,
                                [blockIds]
                            );
                        } else {
                            throw e2;
                        }
                    }
                } else {
                    throw e;
                }
            }
            linksByBlock = links.reduce((acc, L) => {
                if (!acc[L.grade_block_id]) acc[L.grade_block_id] = [];
                acc[L.grade_block_id].push(L);
                return acc;
            }, {});
        }
        const outBlocks = blocks.map((b) => ({
            ...b,
            links: linksByBlock[b.id] || [],
        }));
        res.json({ grade: gRows[0], blocks: outBlocks });
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            return res.status(503).json({
                error: "Chưa chạy migration",
                detail: "Chạy schema_grade_layout.sql trên MySQL",
            });
        }
        console.error("GET /catalog/grades/:gradeId/layout:", err);
        res.status(500).json({ error: "Không tải được nội dung lớp", detail: err.message });
    }
});

/** Chi tiết link + cây chủ đề → bài */
router.get("/grade-links/:linkId/tree", async (req, res) => {
    try {
        const linkId = Number(req.params.linkId);
        let linkRows;
        try {
            linkRows = await db.queryAsync(
                `SELECT gbl.id, gbl.label, gbl.slug, gbl.short_description, gbl.long_description, gbl.sort_order, gbl.textbook_url,
              gb.id AS grade_block_id, gb.title AS block_title, gb.grade_id,
              g.name AS grade_name
       FROM grade_block_links gbl
       JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       JOIN grades g ON gb.grade_id = g.id
       WHERE gbl.id = ?`,
                [linkId]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                try {
                    linkRows = await db.queryAsync(
                        `SELECT gbl.id, gbl.label, gbl.slug, gbl.short_description, gbl.long_description, gbl.sort_order,
              gb.id AS grade_block_id, gb.title AS block_title, gb.grade_id,
              g.name AS grade_name
       FROM grade_block_links gbl
       JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       JOIN grades g ON gb.grade_id = g.id
       WHERE gbl.id = ?`,
                        [linkId]
                    );
                } catch (e2) {
                    if (e2.code === "ER_BAD_FIELD_ERROR") {
                        linkRows = await db.queryAsync(
                            `SELECT gbl.id, gbl.label, gbl.slug, gbl.short_description, gbl.sort_order,
              gb.id AS grade_block_id, gb.title AS block_title, gb.grade_id,
              g.name AS grade_name
       FROM grade_block_links gbl
       JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       JOIN grades g ON gb.grade_id = g.id
       WHERE gbl.id = ?`,
                            [linkId]
                        );
                    } else {
                        throw e2;
                    }
                }
            } else {
                throw e;
            }
        }
        if (!linkRows.length) {
            return res.status(404).json({ error: "Không tìm thấy liên kết" });
        }
        const base = linkRows[0];
        let themes;
        try {
            themes = await db.queryAsync(
                `SELECT id, grade_block_link_id, title, sort_order, textbook_url FROM catalog_themes WHERE grade_block_link_id = ? ORDER BY sort_order, id`,
                [linkId]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                themes = await db.queryAsync(
                    `SELECT id, grade_block_link_id, title, sort_order FROM catalog_themes WHERE grade_block_link_id = ? ORDER BY sort_order, id`,
                    [linkId]
                );
            } else {
                throw e;
            }
        }
        const themeIds = themes.map((t) => t.id);
        let lessonsByTheme = {};
        if (themeIds.length) {
            let lessons;
            try {
                lessons = await db.queryAsync(
                    `SELECT id, catalog_theme_id, title, description, sort_order, textbook_url FROM catalog_lessons WHERE catalog_theme_id IN (?) ORDER BY sort_order, id`,
                    [themeIds]
                );
            } catch (e) {
                if (e.code === "ER_BAD_FIELD_ERROR") {
                    try {
                        lessons = await db.queryAsync(
                            `SELECT id, catalog_theme_id, title, description, sort_order FROM catalog_lessons WHERE catalog_theme_id IN (?) ORDER BY sort_order, id`,
                            [themeIds]
                        );
                    } catch (e2) {
                        if (e2.code === "ER_BAD_FIELD_ERROR") {
                            lessons = await db.queryAsync(
                                `SELECT id, catalog_theme_id, title, sort_order FROM catalog_lessons WHERE catalog_theme_id IN (?) ORDER BY sort_order, id`,
                                [themeIds]
                            );
                        } else {
                            throw e2;
                        }
                    }
                } else {
                    throw e;
                }
            }
            lessonsByTheme = lessons.reduce((acc, L) => {
                if (!acc[L.catalog_theme_id]) acc[L.catalog_theme_id] = [];
                acc[L.catalog_theme_id].push(L);
                return acc;
            }, {});
        }
        const themesOut = themes.map((t) => ({
            ...t,
            lessons: lessonsByTheme[t.id] || [],
        }));
        res.json({ link: base, themes: themesOut });
    } catch (err) {
        console.error("GET /catalog/grade-links/:linkId/tree:", err);
        res.status(500).json({ error: "Không tải được cây chủ đề", detail: err.message });
    }
});

/** gradeId + catalog_lesson_id của đề — dùng để quay về trang danh sách đề (/lop-x/lesson/y) */
router.get("/exam-papers/:examPaperId/context", async (req, res) => {
    try {
        const examPaperId = Number(req.params.examPaperId);
        if (!Number.isFinite(examPaperId) || examPaperId <= 0) {
            return res.status(400).json({ error: "Sai examPaperId" });
        }
        const rows = await db.queryAsync(
            `SELECT gb.grade_id AS gradeId, cl.id AS lessonId
       FROM exam_papers ep
       LEFT JOIN catalog_lessons cl ON ep.catalog_lesson_id = cl.id
       LEFT JOIN catalog_themes ct ON cl.catalog_theme_id = ct.id
       LEFT JOIN grade_block_links gbl ON ct.grade_block_link_id = gbl.id
       LEFT JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       WHERE ep.id = ?`,
            [examPaperId]
        );
        if (!rows.length) {
            return res.status(404).json({ error: "Không tìm thấy đề" });
        }
        const row = rows[0];
        const gradeId = row.gradeId != null ? Number(row.gradeId) : null;
        const lessonId = row.lessonId != null ? Number(row.lessonId) : null;
        res.json({ gradeId, lessonId });
    } catch (err) {
        console.error("GET /catalog/exam-papers/:examPaperId/context:", err);
        res.status(500).json({ error: "Lỗi tra cứu", detail: err.message });
    }
});

/** Đề thi theo bài (catalog_lesson) */
router.get("/lessons/:lessonId/exam-papers", async (req, res) => {
    try {
        const lessonId = Number(req.params.lessonId);
        const rows = await db.queryAsync(
            `SELECT ep.id, ep.title, ep.description, ep.duration_sec, ep.question_count, ep.is_active, ep.sort_order
       FROM exam_papers ep
       WHERE ep.catalog_lesson_id = ? AND ep.is_active = 1
       ORDER BY ep.sort_order ASC, ep.id DESC`,
            [lessonId]
        );
        res.json({ examPapers: rows });
    } catch (err) {
        console.error("GET /catalog/lessons/:lessonId/exam-papers:", err);
        res.status(500).json({ error: "Không tải được đề", detail: err.message });
    }
});

router.get("/lessons/:lessonId", async (req, res) => {
    try {
        const lessonId = Number(req.params.lessonId);
        let rows;
        try {
            rows = await db.queryAsync(
                `SELECT cl.id, cl.title, cl.description, cl.sort_order, cl.textbook_url,
              ct.id AS theme_id, ct.title AS theme_title,
              gbl.id AS link_id, gbl.label AS link_label, gbl.slug,
              gb.grade_id, g.name AS grade_name
       FROM catalog_lessons cl
       JOIN catalog_themes ct ON cl.catalog_theme_id = ct.id
       JOIN grade_block_links gbl ON ct.grade_block_link_id = gbl.id
       JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       JOIN grades g ON gb.grade_id = g.id
       WHERE cl.id = ?`,
                [lessonId]
            );
        } catch (e) {
            if (e.code === "ER_BAD_FIELD_ERROR") {
                try {
                    rows = await db.queryAsync(
                        `SELECT cl.id, cl.title, cl.description, cl.sort_order,
              ct.id AS theme_id, ct.title AS theme_title,
              gbl.id AS link_id, gbl.label AS link_label, gbl.slug,
              gb.grade_id, g.name AS grade_name
       FROM catalog_lessons cl
       JOIN catalog_themes ct ON cl.catalog_theme_id = ct.id
       JOIN grade_block_links gbl ON ct.grade_block_link_id = gbl.id
       JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       JOIN grades g ON gb.grade_id = g.id
       WHERE cl.id = ?`,
                        [lessonId]
                    );
                } catch (e2) {
                    if (e2.code === "ER_BAD_FIELD_ERROR") {
                        rows = await db.queryAsync(
                            `SELECT cl.id, cl.title, cl.sort_order,
              ct.id AS theme_id, ct.title AS theme_title,
              gbl.id AS link_id, gbl.label AS link_label, gbl.slug,
              gb.grade_id, g.name AS grade_name
       FROM catalog_lessons cl
       JOIN catalog_themes ct ON cl.catalog_theme_id = ct.id
       JOIN grade_block_links gbl ON ct.grade_block_link_id = gbl.id
       JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       JOIN grades g ON gb.grade_id = g.id
       WHERE cl.id = ?`,
                            [lessonId]
                        );
                    } else {
                        throw e2;
                    }
                }
            } else {
                throw e;
            }
        }
        if (!rows.length) {
            return res.status(404).json({ error: "Không tìm thấy bài" });
        }
        res.json({ lesson: rows[0] });
    } catch (err) {
        console.error("GET /catalog/lessons/:lessonId:", err);
        res.status(500).json({ error: "Lỗi tải bài", detail: err.message });
    }
});

/** Tìm link theo grade + slug (URL /lop-1/linkSlug) */
router.get("/grades/:gradeId/links-by-slug/:slug", async (req, res) => {
    try {
        const gradeId = Number(req.params.gradeId);
        const slug = String(req.params.slug || "")
            .trim()
            .toLowerCase();
        const rows = await db.queryAsync(
            `SELECT gbl.id FROM grade_block_links gbl
       JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
       WHERE gb.grade_id = ? AND gbl.slug = ?`,
            [gradeId, slug]
        );
        if (!rows.length) {
            return res.status(404).json({ error: "Không tìm thấy" });
        }
        res.json({ linkId: rows[0].id });
    } catch (err) {
        console.error("GET /catalog/grades/.../links-by-slug:", err);
        res.status(500).json({ error: "Lỗi tra cứu", detail: err.message });
    }
});

module.exports = router;
