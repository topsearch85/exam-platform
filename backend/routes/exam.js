const express = require("express");
const router = express.Router();
const db = require("../db");
const { optionalAuth } = require("../lib/authMiddleware");

router.post("/submit", optionalAuth, async (req, res) => {
    try {
        const {
            questionIds,
            answers: submitted,
            displayName,
            sessionToken,
            durationSec,
            examPaperId: bodyExamPaperId,
        } = req.body;

        let name =
            typeof displayName === "string" && displayName.trim()
                ? displayName.trim().slice(0, 120)
                : "Ẩn danh";

        if (req.userId) {
            try {
                const urows = await db.queryAsync(
                    `SELECT display_name FROM users WHERE id = ? LIMIT 1`,
                    [req.userId]
                );
                if (urows.length) {
                    const dn = String(urows[0].display_name || "").trim();
                    if (dn) {
                        name = dn.slice(0, 120);
                    }
                }
            } catch (e) {
                console.warn("exam submit display_name lookup:", e.message);
            }
        }

        if (!Array.isArray(questionIds) || questionIds.length === 0) {
            return res.json({
                score: 0,
                total: 0,
                results: [],
                timeExpired: Boolean(req.body.timeExpired),
                attemptId: null,
            });
        }

        const answerMap = {};
        if (Array.isArray(submitted)) {
            submitted.forEach((row) => {
                const qid = Number(row.question_id);
                const aid = row.answer_id;
                if (!Number.isNaN(qid)) {
                    answerMap[qid] = aid == null ? null : Number(aid);
                }
            });
        }

        const idsParam = [
            ...new Set(questionIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id))),
        ];

        let rows;
        try {
            rows = await db.queryAsync(
                `
            SELECT q.id AS question_id,
                   q.question,
                   q.answer_hint,
                   a.id AS answer_id,
                   a.answer_text,
                   a.is_correct
            FROM questions q
            JOIN answers a ON q.id = a.question_id
            WHERE q.id IN (?)
            ORDER BY q.id, a.id
            `,
                [idsParam]
            );
        } catch (e) {
            if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
            rows = await db.queryAsync(
                `
            SELECT q.id AS question_id,
                   q.question,
                   a.id AS answer_id,
                   a.answer_text,
                   a.is_correct
            FROM questions q
            JOIN answers a ON q.id = a.question_id
            WHERE q.id IN (?)
            ORDER BY q.id, a.id
            `,
                [idsParam]
            );
        }

        const byQuestion = {};

        rows.forEach((r) => {
            if (!byQuestion[r.question_id]) {
                const hint =
                    Object.prototype.hasOwnProperty.call(r, "answer_hint") && r.answer_hint != null
                        ? String(r.answer_hint).trim() || null
                        : null;
                byQuestion[r.question_id] = {
                    question: r.question,
                    answerHint: hint,
                    answers: [],
                };
            }
            byQuestion[r.question_id].answers.push({
                id: r.answer_id,
                text: r.answer_text,
                is_correct: r.is_correct == 1 || r.is_correct === true,
            });
        });

        const results = [];
        let score = 0;

        for (const qid of questionIds.map((id) => Number(id))) {
            if (Number.isNaN(qid)) continue;

            const block = byQuestion[qid];
            if (!block) {
                results.push({
                    questionId: qid,
                    question: "",
                    answerHint: null,
                    skipped: true,
                    isCorrect: false,
                    userAnswerId: null,
                    userAnswerText: null,
                    correctAnswerId: null,
                    correctAnswerText: null,
                });
                continue;
            }

            const correct = block.answers.find((a) => a.is_correct);
            const correctAnswerId = correct ? correct.id : null;
            const correctAnswerText = correct ? correct.text : null;

            const rawUser = answerMap[qid];
            const userAnswerId = rawUser != null && !Number.isNaN(rawUser) ? rawUser : null;
            const skipped = userAnswerId == null;

            const picked = block.answers.find((a) => a.id === userAnswerId);
            const userAnswerText = picked ? picked.text : null;

            const isCorrect = !skipped && Boolean(correct && userAnswerId === correctAnswerId);

            if (isCorrect) score++;

            results.push({
                questionId: qid,
                question: block.question,
                answerHint: block.answerHint != null ? block.answerHint : null,
                skipped,
                isCorrect,
                userAnswerId,
                userAnswerText,
                correctAnswerId,
                correctAnswerText,
            });
        }

        const timeExpired = Boolean(req.body.timeExpired);
        const dur = typeof durationSec === "number" && durationSec >= 0 ? Math.floor(durationSec) : 0;

        const paperId =
            bodyExamPaperId != null && !Number.isNaN(Number(bodyExamPaperId))
                ? Number(bodyExamPaperId)
                : null;

        let attemptId = null;

        const insertAttemptLegacy = async () => {
            try {
                const ins = await db.queryAsync(
                    `
        INSERT INTO exam_attempts (session_token, display_name, score, total, duration_sec, time_expired, exam_paper_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
                    [
                        sessionToken || null,
                        name,
                        score,
                        results.length,
                        dur,
                        timeExpired ? 1 : 0,
                        paperId,
                    ]
                );
                return ins.insertId != null ? Number(ins.insertId) : null;
            } catch (e) {
                if (/Unknown column|exam_paper_id/i.test(String(e.message))) {
                    const ins2 = await db.queryAsync(
                        `
            INSERT INTO exam_attempts (session_token, display_name, score, total, duration_sec, time_expired)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
                        [
                            sessionToken || null,
                            name,
                            score,
                            results.length,
                            dur,
                            timeExpired ? 1 : 0,
                        ]
                    );
                    return ins2.insertId != null ? Number(ins2.insertId) : null;
                }
                throw e;
            }
        };

        if (req.userId && paperId) {
            try {
                await db.queryAsync("START TRANSACTION");
                try {
                    await db.queryAsync(`DELETE FROM exam_attempts WHERE user_id = ? AND exam_paper_id = ?`, [
                        req.userId,
                        paperId,
                    ]);
                    const ins = await db.queryAsync(
                        `
            INSERT INTO exam_attempts (session_token, display_name, user_id, score, total, duration_sec, time_expired, exam_paper_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
                        [
                            sessionToken || null,
                            name,
                            req.userId,
                            score,
                            results.length,
                            dur,
                            timeExpired ? 1 : 0,
                            paperId,
                        ]
                    );
                    await db.queryAsync("COMMIT");
                    attemptId = ins.insertId != null ? Number(ins.insertId) : null;
                } catch (inner) {
                    try {
                        await db.queryAsync("ROLLBACK");
                    } catch {
                        /* ignore */
                    }
                    if (inner.code === "ER_BAD_FIELD_ERROR") {
                        attemptId = await insertAttemptLegacy();
                    } else {
                        console.warn("exam_attempts insert (user):", inner.message);
                        attemptId = await insertAttemptLegacy();
                    }
                }
            } catch (e) {
                if (e.code === "ER_BAD_FIELD_ERROR") {
                    attemptId = await insertAttemptLegacy();
                } else {
                    console.warn("exam_attempts user_id path:", e.message);
                    attemptId = await insertAttemptLegacy();
                }
            }
        } else {
            try {
                attemptId = await insertAttemptLegacy();
            } catch (e) {
                console.warn("exam_attempts insert skipped:", e.message);
            }
        }

        if (sessionToken) {
            try {
                await db.queryAsync(`DELETE FROM exam_sessions WHERE token = ?`, [sessionToken]);
            } catch (e) {
                console.warn("session delete:", e.message);
            }
        }

        if (req.userId && paperId) {
            const snapshot = JSON.stringify({
                timeExpired,
                durationSec: dur,
                results,
            });
            try {
                await db.queryAsync(
                    `INSERT INTO user_exam_paper_progress (user_id, exam_paper_id, score, total, last_results_json)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             score = VALUES(score),
             total = VALUES(total),
             last_results_json = VALUES(last_results_json),
             updated_at = CURRENT_TIMESTAMP`,
                    [req.userId, paperId, score, results.length, snapshot]
                );
            } catch (e) {
                if (e.code === "ER_BAD_FIELD_ERROR") {
                    try {
                        await db.queryAsync(
                            `INSERT INTO user_exam_paper_progress (user_id, exam_paper_id, score, total)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE score = VALUES(score), total = VALUES(total), updated_at = CURRENT_TIMESTAMP`,
                            [req.userId, paperId, score, results.length]
                        );
                    } catch (e2) {
                        if (!/doesn't exist|Unknown table/i.test(String(e2.message))) {
                            console.warn("user_exam_paper_progress:", e2.message);
                        }
                    }
                } else if (!/doesn't exist|Unknown table/i.test(String(e.message))) {
                    console.warn("user_exam_paper_progress:", e.message);
                }
            }
        }

        res.json({
            score,
            total: results.length,
            results,
            timeExpired,
            attemptId,
        });
    } catch (err) {
        console.error("POST /exam/submit:", err);
        res.status(500).json({ error: "Database error" });
    }
});

module.exports = router;
