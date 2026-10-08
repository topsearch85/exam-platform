const express = require("express");
const db = require("../db");
const { requireAdminJwt } = require("../lib/authMiddleware");
const { upload } = require("../lib/uploadConfig");

const router = express.Router();

function normalizeMediaPayload(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const cleaned = raw
        .slice(0, 10)
        .map((m) => ({
            url: String(m.url || "").trim(),
            name: String(m.name || "").slice(0, 255),
            mime: String(m.mime || "").slice(0, 160),
        }))
        .filter((m) => m.url.startsWith("/api/uploads/"));
    return cleaned.length ? JSON.stringify(cleaned) : null;
}

function parseMediaColumn(val) {
    if (val == null || val === "") return [];
    try {
        const p = typeof val === "string" ? JSON.parse(val) : val;
        return Array.isArray(p) ? p : [];
    } catch {
        return [];
    }
}

function normAnswerHint(v) {
    if (v === undefined) return undefined;
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
}

/** mysql2 trả insertId là number hoặc BigInt tùy phiên bản / MySQL. */
function getInsertId(result) {
    if (result == null) return null;
    if (Array.isArray(result) && result.length > 0) {
        return getInsertId(result[0]);
    }
    const raw = result.insertId ?? result.insert_id;
    if (raw === undefined || raw === null) return null;
    return typeof raw === "bigint" ? Number(raw) : Number(raw);
}

/** Kiểm tra backend có mount đúng /api/admin (không cần đăng nhập). */
router.get("/health", (req, res) => {
    res.json({ ok: true, path: "/api/admin/health" });
});

/** Câu hỏi / API admin: chỉ JWT role admin (Bearer). */
router.use(requireAdminJwt);

/** Legacy: gán câu vào đề qua exam_paper_questions (DB chưa có exam_paper_id). */
async function syncQuestionExamPapers(questionId, subjectId, examPaperIds) {
    if (!Array.isArray(examPaperIds)) return;
    try {
        await db.queryAsync(`DELETE FROM exam_paper_questions WHERE question_id = ?`, [questionId]);
    } catch (e) {
        if (!/doesn't exist|Unknown table/i.test(String(e.message))) throw e;
        return;
    }
    if (!subjectId || examPaperIds.length === 0) return;
    const ids = [
        ...new Set(
            examPaperIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
        ),
    ];
    for (const pid of ids) {
        const rows = await db.queryAsync(`SELECT subject_id FROM exam_papers WHERE id = ?`, [pid]);
        if (rows.length === 0 || Number(rows[0].subject_id) !== Number(subjectId)) {
            throw new Error(`Đề #${pid} không thuộc môn đã chọn`);
        }
        await db.queryAsync(
            `INSERT INTO exam_paper_questions (exam_paper_id, question_id) VALUES (?, ?)`,
            [pid, questionId]
        );
    }
}

/** Danh sách câu — bắt buộc examPaperId (câu thuộc đề). */
router.get("/questions", async (req, res) => {
    try {
        const examPaperId =
            req.query.examPaperId != null && req.query.examPaperId !== ""
                ? Number(req.query.examPaperId)
                : null;
        if (!Number.isFinite(examPaperId) || examPaperId <= 0) {
            return res.status(400).json({
                error: "Truyền examPaperId (id đề thi) để xem câu hỏi theo đề",
            });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(5, parseInt(req.query.limit, 10) || 50));
        const offset = (page - 1) * limit;

        let total;
        let rows;
        try {
            const countRows = await db.queryAsync(
                `SELECT COUNT(*) AS c FROM questions WHERE exam_paper_id = ?`,
                [examPaperId]
            );
            total = countRows[0].c;
            try {
                rows = await db.queryAsync(
                    `SELECT id, question, subject_id, exam_paper_id, media_json, answer_hint FROM questions
           WHERE exam_paper_id = ?
           ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`,
                    [examPaperId, limit, offset]
                );
            } catch (e2) {
                if (e2.code !== "ER_BAD_FIELD_ERROR") throw e2;
                rows = await db.queryAsync(
                    `SELECT id, question, subject_id, exam_paper_id, media_json FROM questions
           WHERE exam_paper_id = ?
           ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`,
                    [examPaperId, limit, offset]
                );
            }
        } catch (e) {
            if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
            const countRows = await db.queryAsync(
                `SELECT COUNT(DISTINCT q.id) AS c FROM questions q
             INNER JOIN exam_paper_questions epq ON epq.question_id = q.id
             WHERE epq.exam_paper_id = ?`,
                [examPaperId]
            );
            total = countRows[0].c;
            rows = await db.queryAsync(
                `SELECT q.id, q.question, q.subject_id FROM questions q
             INNER JOIN exam_paper_questions epq ON epq.question_id = q.id
             WHERE epq.exam_paper_id = ?
             ORDER BY q.id ASC LIMIT ? OFFSET ?`,
                [examPaperId, limit, offset]
            );
        }

        res.json({
            questions: rows,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
        });
    } catch (err) {
        console.error("admin GET questions:", err);
        res.status(500).json({ error: "Lỗi DB" });
    }
});

router.get("/questions/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        let qrows;
        try {
            qrows = await db.queryAsync(
                `SELECT id, question, subject_id, exam_paper_id, media_json, answer_hint FROM questions WHERE id = ?`,
                [id]
            );
        } catch (e) {
            if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
            try {
                qrows = await db.queryAsync(
                    `SELECT id, question, subject_id, exam_paper_id, media_json FROM questions WHERE id = ?`,
                    [id]
                );
            } catch (e2) {
                if (e2.code !== "ER_BAD_FIELD_ERROR") throw e2;
                try {
                    qrows = await db.queryAsync(
                        `SELECT id, question, subject_id, exam_paper_id FROM questions WHERE id = ?`,
                        [id]
                    );
                } catch (e3) {
                    if (e3.code !== "ER_BAD_FIELD_ERROR") throw e3;
                    qrows = await db.queryAsync(`SELECT id, question, subject_id FROM questions WHERE id = ?`, [id]);
                }
            }
        }
        if (qrows.length === 0) {
            return res.status(404).json({ error: "Không tìm thấy" });
        }
        const arows = await db.queryAsync(
            `SELECT id, answer_text, is_correct FROM answers WHERE question_id = ? ORDER BY id`,
            [id]
        );
        let examPaperIds = [];
        try {
            const ep = await db.queryAsync(
                `SELECT exam_paper_id FROM exam_paper_questions WHERE question_id = ? ORDER BY exam_paper_id`,
                [id]
            );
            examPaperIds = ep.map((r) => r.exam_paper_id);
        } catch {
            examPaperIds = [];
        }
        const examPaperId = qrows[0].exam_paper_id != null ? qrows[0].exam_paper_id : examPaperIds[0] ?? null;
        const hintVal =
            Object.prototype.hasOwnProperty.call(qrows[0], "answer_hint") && qrows[0].answer_hint != null
                ? String(qrows[0].answer_hint)
                : null;
        res.json({
            question: {
                id: qrows[0].id,
                question: qrows[0].question,
                subject_id: qrows[0].subject_id,
                media: parseMediaColumn(qrows[0].media_json),
                answerHint: hintVal && hintVal.trim() !== "" ? hintVal : null,
            },
            subjectId: qrows[0].subject_id ?? null,
            examPaperId,
            examPaperIds: examPaperId != null ? [examPaperId] : examPaperIds,
            answers: arows.map((a) => ({
                id: a.id,
                text: a.answer_text,
                isCorrect: a.is_correct == 1 || a.is_correct === true,
            })),
        });
    } catch (err) {
        console.error("admin GET question:", err);
        res.status(500).json({ error: "Lỗi DB" });
    }
});

router.post("/uploads/question-media", (req, res) => {
    upload.single("file")(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || "Upload lỗi" });
        }
        if (!req.file) {
            return res.status(400).json({ error: "Thiếu file (field: file)" });
        }
        const url = `/api/uploads/question-media/${req.file.filename}`;
        res.json({
            url,
            name: req.file.originalname,
            mime: req.file.mimetype,
        });
    });
});

router.post("/questions", async (req, res) => {
    try {
        const {
            question,
            answers,
            examPaperId: bodyPaperId,
            subjectId,
            examPaperIds,
            media,
            answerHint,
        } = req.body;
        if (!question || typeof question !== "string") {
            return res.status(400).json({ error: "Thiếu nội dung câu hỏi" });
        }
        if (!Array.isArray(answers) || answers.length < 2) {
            return res.status(400).json({ error: "Cần ít nhất 2 đáp án" });
        }

        const normalized = answers.map((a) => ({
            text: (a.text || "").trim(),
            isCorrect: Boolean(a.isCorrect),
        }));

        const nonEmpty = normalized.filter((a) => a.text.length > 0);
        if (nonEmpty.length < 2) {
            return res.status(400).json({ error: "Cần ít nhất 2 đáp án có nội dung" });
        }

        const correctCount = nonEmpty.filter((a) => a.isCorrect).length;
        if (correctCount !== 1) {
            return res.status(400).json({
                error: "Phải chọn đúng một đáp án đúng trong các ô đã nhập",
            });
        }

        const examPaperId =
            bodyPaperId != null && bodyPaperId !== "" ? Number(bodyPaperId) : null;
        if (!Number.isFinite(examPaperId) || examPaperId <= 0) {
            return res.status(400).json({ error: "Thiếu examPaperId — câu hỏi phải gắn vào một đề thi" });
        }

        const prows = await db.queryAsync(`SELECT id, subject_id FROM exam_papers WHERE id = ?`, [examPaperId]);
        if (prows.length === 0) {
            return res.status(400).json({ error: "Không tìm thấy đề thi" });
        }
        const paperSubjectId = prows[0].subject_id;
        const mediaJson = normalizeMediaPayload(media);
        const hintInsert = normAnswerHint(answerHint);
        const hintParam = hintInsert === undefined ? null : hintInsert;

        await db.queryAsync("START TRANSACTION");

        let qid;
        try {
            const maxR = await db.queryAsync(
                `SELECT COALESCE(MAX(sort_order), 0) AS m FROM questions WHERE exam_paper_id = ?`,
                [examPaperId]
            );
            const sortOrder = Number(maxR[0].m) + 1;
            let ins;
            try {
                ins = await db.queryAsync(
                    `INSERT INTO questions (question, subject_id, exam_paper_id, sort_order, media_json, answer_hint) VALUES (?, ?, ?, ?, ?, ?)`,
                    [question.trim(), paperSubjectId, examPaperId, sortOrder, mediaJson, hintParam]
                );
            } catch (e) {
                if (e.code === "ER_BAD_FIELD_ERROR" && /answer_hint/i.test(String(e.message))) {
                    try {
                        ins = await db.queryAsync(
                            `INSERT INTO questions (question, subject_id, exam_paper_id, sort_order, media_json) VALUES (?, ?, ?, ?, ?)`,
                            [question.trim(), paperSubjectId, examPaperId, sortOrder, mediaJson]
                        );
                    } catch (e2) {
                        if (!/Unknown column.*media_json/i.test(String(e2.message))) throw e2;
                        ins = await db.queryAsync(
                            `INSERT INTO questions (question, subject_id, exam_paper_id, sort_order) VALUES (?, ?, ?, ?)`,
                            [question.trim(), paperSubjectId, examPaperId, sortOrder]
                        );
                    }
                } else if (!/Unknown column.*media_json/i.test(String(e.message))) {
                    throw e;
                } else {
                    ins = await db.queryAsync(
                        `INSERT INTO questions (question, subject_id, exam_paper_id, sort_order) VALUES (?, ?, ?, ?)`,
                        [question.trim(), paperSubjectId, examPaperId, sortOrder]
                    );
                }
            }
            qid = getInsertId(ins);
        } catch (e) {
            if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
            const sid =
                subjectId != null && subjectId !== "" ? Number(subjectId) : Number(paperSubjectId);
            const ins = await db.queryAsync(`INSERT INTO questions (question, subject_id) VALUES (?, ?)`, [
                question.trim(),
                Number.isFinite(sid) ? sid : null,
            ]);
            qid = getInsertId(ins);
            if (!Number.isFinite(qid) || qid <= 0) {
                await db.queryAsync("ROLLBACK");
                return res.status(500).json({
                    error: "Lỗi DB: không lấy được id câu hỏi",
                });
            }
            try {
                await syncQuestionExamPapers(qid, Number(paperSubjectId), [examPaperId]);
            } catch (syncErr) {
                await db.queryAsync("ROLLBACK");
                return res.status(400).json({
                    error: syncErr.message || "Không gán được đề thi",
                });
            }
        }

        if (!Number.isFinite(qid) || qid <= 0) {
            await db.queryAsync("ROLLBACK");
            return res.status(500).json({
                error: "Lỗi DB: không lấy được id câu hỏi",
            });
        }

        let insertedCorrect = 0;
        for (const a of normalized) {
            if (!a.text) continue;
            await db.queryAsync(
                `INSERT INTO answers (question_id, answer_text, is_correct) VALUES (?, ?, ?)`,
                [qid, a.text, a.isCorrect ? 1 : 0]
            );
            if (a.isCorrect) insertedCorrect += 1;
        }

        if (insertedCorrect !== 1) {
            await db.queryAsync("ROLLBACK");
            return res.status(400).json({
                error: "Phải có đúng một đáp án được đánh dấu đúng trong các dòng có chữ",
            });
        }

        await db.queryAsync("COMMIT");
        res.status(201).json({ id: qid });
    } catch (err) {
        try {
            await db.queryAsync("ROLLBACK");
        } catch {
            /* ignore */
        }
        console.error("admin POST question:", err);
        res.status(500).json({
            error: "Không tạo được câu hỏi",
            detail: err.sqlMessage || err.message || String(err),
        });
    }
});

router.put("/questions/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { question, answers, subjectId, examPaperIds, media, answerHint } = req.body;

        const exists = await db.queryAsync(`SELECT id FROM questions WHERE id = ?`, [id]);
        if (exists.length === 0) {
            return res.status(404).json({ error: "Không tìm thấy" });
        }

        if (Array.isArray(answers) && answers.length >= 2) {
            const normalized = answers.map((a) => ({
                text: (a.text || "").trim(),
                isCorrect: Boolean(a.isCorrect),
            }));
            const nonEmpty = normalized.filter((a) => a.text.length > 0);
            if (nonEmpty.length < 2) {
                return res.status(400).json({ error: "Cần ít nhất 2 đáp án có nội dung" });
            }
            if (nonEmpty.filter((a) => a.isCorrect).length !== 1) {
                return res.status(400).json({
                    error: "Phải chọn đúng một đáp án đúng trong các ô đã nhập",
                });
            }
        }

        await db.queryAsync("START TRANSACTION");

        if (media !== undefined) {
            const mediaJson = normalizeMediaPayload(media);
            try {
                await db.queryAsync(`UPDATE questions SET media_json = ? WHERE id = ?`, [mediaJson, id]);
            } catch (e) {
                if (!/Unknown column.*media_json/i.test(String(e.message))) throw e;
            }
        }

        if (answerHint !== undefined) {
            const ah = normAnswerHint(answerHint);
            try {
                await db.queryAsync(`UPDATE questions SET answer_hint = ? WHERE id = ?`, [ah, id]);
            } catch (e) {
                if (e.code !== "ER_BAD_FIELD_ERROR" || !/answer_hint/i.test(String(e.message))) throw e;
            }
        }

        if (question && typeof question === "string") {
            const sid =
                subjectId !== undefined
                    ? subjectId != null && subjectId !== ""
                        ? Number(subjectId)
                        : null
                    : undefined;
            if (sid !== undefined) {
                await db.queryAsync(`UPDATE questions SET question = ?, subject_id = ? WHERE id = ?`, [
                    question.trim(),
                    Number.isFinite(sid) ? sid : null,
                    id,
                ]);
            } else {
                await db.queryAsync(`UPDATE questions SET question = ? WHERE id = ?`, [question.trim(), id]);
            }
        } else if (subjectId !== undefined) {
            const sid =
                subjectId != null && subjectId !== "" ? Number(subjectId) : null;
            await db.queryAsync(`UPDATE questions SET subject_id = ? WHERE id = ?`, [
                Number.isFinite(sid) ? sid : null,
                id,
            ]);
        }

        if (Array.isArray(answers) && answers.length >= 2) {
            const normalized = answers.map((a) => ({
                text: (a.text || "").trim(),
                isCorrect: Boolean(a.isCorrect),
            }));

            await db.queryAsync(`DELETE FROM answers WHERE question_id = ?`, [id]);

            let insertedCorrect = 0;
            for (const a of normalized) {
                if (!a.text) continue;
                await db.queryAsync(
                    `INSERT INTO answers (question_id, answer_text, is_correct) VALUES (?, ?, ?)`,
                    [id, a.text, a.isCorrect ? 1 : 0]
                );
                if (a.isCorrect) insertedCorrect += 1;
            }
            if (insertedCorrect !== 1) {
                await db.queryAsync("ROLLBACK");
                return res.status(400).json({
                    error: "Phải có đúng một đáp án đúng sau khi lưu",
                });
            }
        }

        if (examPaperIds !== undefined) {
            const srow = await db.queryAsync(`SELECT subject_id FROM questions WHERE id = ?`, [id]);
            const finalSid = srow.length ? srow[0].subject_id : null;
            try {
                await syncQuestionExamPapers(id, finalSid, examPaperIds);
            } catch (syncErr) {
                await db.queryAsync("ROLLBACK");
                return res.status(400).json({
                    error: syncErr.message || "Không gán được đề thi",
                });
            }
        }

        await db.queryAsync("COMMIT");
        res.json({ ok: true });
    } catch (err) {
        try {
            await db.queryAsync("ROLLBACK");
        } catch {
            /* ignore */
        }
        console.error("admin PUT question:", err);
        res.status(500).json({
            error: "Không cập nhật được",
            detail: err.sqlMessage || err.message || String(err),
        });
    }
});

router.delete("/questions/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        try {
            await db.queryAsync(`DELETE FROM exam_paper_questions WHERE question_id = ?`, [id]);
        } catch {
            /* bảng chưa có */
        }
        await db.queryAsync(`DELETE FROM answers WHERE question_id = ?`, [id]);
        await db.queryAsync(`DELETE FROM questions WHERE id = ?`, [id]);
        res.json({ ok: true });
    } catch (err) {
        console.error("admin DELETE question:", err);
        res.status(500).json({ error: "Không xóa được" });
    }
});

module.exports = router;
