const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const {
    DEFAULT_EXAM_SIZE,
    pickRandomQuestionIdsForExamPaper,
    fetchQuestionsWithAnswersOrdered,
    getExamPaperAnswerPrefix,
} = require("../lib/examPaper");

const router = express.Router();

const TIME_LIMIT_SEC = 90 * 60;
const SESSION_HOURS = 24;

function sessionExpiryDate() {
    const d = new Date();
    d.setHours(d.getHours() + SESSION_HOURS);
    return d;
}

/**
 * Tạo phiên thi.
 * Body: { examPaperId?: number } — nếu có: lấy cấu hình đề + ngân hàng câu theo môn.
 * Không có: ngẫu nhiên toàn bộ ngân hàng (như cũ).
 */
router.post("/", async (req, res) => {
    try {
        const examPaperId =
            req.body.examPaperId != null ? Number(req.body.examPaperId) : null;

        let ids = [];
        let timeLimitSec = TIME_LIMIT_SEC;
        let examPaperIdToStore = null;

        if (examPaperId && !Number.isNaN(examPaperId)) {
            const papers = await db.queryAsync(
                `SELECT id, subject_id, duration_sec, question_count, is_active FROM exam_papers WHERE id = ?`,
                [examPaperId]
            );
            if (papers.length === 0) {
                return res.status(404).json({ error: "Không tìm thấy đề thi" });
            }
            const paper = papers[0];
            if (paper.is_active != 1 && paper.is_active !== true) {
                return res.status(400).json({ error: "Đề thi đang tắt" });
            }
            const qCount = Math.max(1, Math.min(200, Number(paper.question_count) || DEFAULT_EXAM_SIZE));
            timeLimitSec = Math.max(60, Math.min(24 * 3600, Number(paper.duration_sec) || TIME_LIMIT_SEC));
            ids = await pickRandomQuestionIdsForExamPaper(examPaperId, paper.subject_id, qCount);
            examPaperIdToStore = examPaperId;
        } else {
            ids = [];
        }

        if (ids.length === 0) {
            return res.json({
                token: null,
                questions: [],
                timeLimitSeconds: timeLimitSec,
                examSize: 0,
                examPaperId: examPaperIdToStore,
                message:
                    examPaperIdToStore != null
                        ? "Chưa có câu trong đề: vào Admin → Chương trình & đề → tab Đề thi → Quản lý câu hỏi theo đề."
                        : "Chọn đề thi (examPaperId) để làm bài.",
            });
        }

        const token = crypto.randomUUID();
        const expires = sessionExpiryDate();

        await db.queryAsync(
            `INSERT INTO exam_sessions (token, exam_paper_id, question_ids, answers, time_left_sec, current_index, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                token,
                examPaperIdToStore,
                JSON.stringify(ids),
                JSON.stringify({}),
                timeLimitSec,
                0,
                expires,
            ]
        );

        const questions = await fetchQuestionsWithAnswersOrdered(ids);
        const answerCodePrefix = await getExamPaperAnswerPrefix(examPaperIdToStore);

        res.json({
            token,
            questions,
            timeLimitSeconds: timeLimitSec,
            examSize: questions.length,
            examPaperId: examPaperIdToStore,
            answerCodePrefix,
        });
    } catch (err) {
        console.error("POST /sessions:", err);
        if (err.code === "ER_BAD_FIELD_ERROR" || /Unknown column/i.test(String(err.message))) {
            return res.status(500).json({
                error: "Chưa chạy migration schema_curriculum.sql (cột exam_paper_id / bảng exam_papers)",
                detail: err.sqlMessage || err.message,
            });
        }
        res.status(500).json({ error: "Không tạo được phiên thi", detail: err.message });
    }
});

router.get("/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const rows = await db.queryAsync(
            `SELECT s.question_ids, s.answers, s.time_left_sec, s.current_index, s.expires_at, s.exam_paper_id,
              ep.duration_sec AS paper_duration_sec
       FROM exam_sessions s
       LEFT JOIN exam_papers ep ON s.exam_paper_id = ep.id
       WHERE s.token = ?`,
            [token]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Phiên không tồn tại" });
        }

        const row = rows[0];
        if (new Date(row.expires_at) < new Date()) {
            return res.status(410).json({ error: "Phiên đã hết hạn" });
        }

        let ids;
        try {
            ids = typeof row.question_ids === "string" ? JSON.parse(row.question_ids) : row.question_ids;
        } catch {
            return res.status(500).json({ error: "Dữ liệu phiên lỗi" });
        }

        let answers = {};
        try {
            if (row.answers) {
                answers = typeof row.answers === "string" ? JSON.parse(row.answers) : row.answers;
            }
        } catch {
            answers = {};
        }

        const questions = await fetchQuestionsWithAnswersOrdered(ids);
        const answerCodePrefix = await getExamPaperAnswerPrefix(row.exam_paper_id ?? null);

        let timeLimitSeconds = TIME_LIMIT_SEC;
        if (row.paper_duration_sec != null) {
            timeLimitSeconds = Number(row.paper_duration_sec);
        }

        res.json({
            token,
            questions,
            timeLimitSeconds,
            examSize: questions.length,
            timeLeft: row.time_left_sec ?? timeLimitSeconds,
            answers,
            currentIndex: row.current_index ?? 0,
            examPaperId: row.exam_paper_id ?? null,
            answerCodePrefix,
        });
    } catch (err) {
        console.error("GET /sessions/:token:", err);
        if (err.code === "ER_BAD_FIELD_ERROR") {
            const rows = await db.queryAsync(
                `SELECT question_ids, answers, time_left_sec, current_index, expires_at FROM exam_sessions WHERE token = ?`,
                [req.params.token]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: "Phiên không tồn tại" });
            }
            const row = rows[0];
            let ids = typeof row.question_ids === "string" ? JSON.parse(row.question_ids) : row.question_ids;
            let answers = {};
            if (row.answers) {
                answers = typeof row.answers === "string" ? JSON.parse(row.answers) : row.answers;
            }
            const questions = await fetchQuestionsWithAnswersOrdered(ids);
            return res.json({
                token: req.params.token,
                questions,
                timeLimitSeconds: TIME_LIMIT_SEC,
                examSize: questions.length,
                timeLeft: row.time_left_sec ?? TIME_LIMIT_SEC,
                answers,
                currentIndex: row.current_index ?? 0,
                examPaperId: null,
                answerCodePrefix: "VDL",
            });
        }
        res.status(500).json({ error: "Lỗi máy chủ" });
    }
});

router.patch("/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const { answers, timeLeft, currentIndex } = req.body;

        const rows = await db.queryAsync(
            `SELECT expires_at FROM exam_sessions WHERE token = ?`,
            [token]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: "Phiên không tồn tại" });
        }
        if (new Date(rows[0].expires_at) < new Date()) {
            return res.status(410).json({ error: "Phiên đã hết hạn" });
        }

        const fields = [];
        const params = [];

        if (answers !== undefined) {
            fields.push("answers = ?");
            params.push(JSON.stringify(answers));
        }
        if (timeLeft !== undefined) {
            fields.push("time_left_sec = ?");
            params.push(Number(timeLeft));
        }
        if (currentIndex !== undefined) {
            fields.push("current_index = ?");
            params.push(Number(currentIndex));
        }

        if (fields.length === 0) {
            return res.json({ ok: true });
        }

        params.push(token);
        await db.queryAsync(`UPDATE exam_sessions SET ${fields.join(", ")} WHERE token = ?`, params);

        res.json({ ok: true });
    } catch (err) {
        console.error("PATCH /sessions/:token:", err);
        res.status(500).json({ error: "Không lưu được" });
    }
});

router.delete("/:token", async (req, res) => {
    try {
        await db.queryAsync(`DELETE FROM exam_sessions WHERE token = ?`, [req.params.token]);
        res.json({ ok: true });
    } catch (err) {
        console.error("DELETE /sessions:", err);
        res.status(500).json({ error: "Lỗi" });
    }
});

module.exports = router;
