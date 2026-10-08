const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", async (req, res) => {
    const examPaperId =
        req.query.examPaperId != null && req.query.examPaperId !== ""
            ? Number(req.query.examPaperId)
            : null;
    const filterPaper = Number.isFinite(examPaperId) && examPaperId > 0;

    try {
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

        let rows;
        let paperTitle = null;
        if (filterPaper) {
            const meta = await db.queryAsync(
                `SELECT title FROM exam_papers WHERE id = ?`,
                [examPaperId]
            );
            paperTitle = meta.length ? meta[0].title : null;
            try {
                rows = await db.queryAsync(
                    `
      SELECT a.id, a.display_name, a.score, a.total, a.duration_sec, a.time_expired, a.created_at, a.exam_paper_id
      FROM exam_attempts a
      WHERE a.exam_paper_id = ?
      AND (
        a.user_id IS NULL
        OR a.id = (
          SELECT a2.id FROM exam_attempts a2
          WHERE a2.exam_paper_id = a.exam_paper_id AND a2.user_id = a.user_id
          ORDER BY a2.score DESC, a2.duration_sec ASC, a2.id ASC
          LIMIT 1
        )
      )
      ORDER BY a.score DESC, a.duration_sec ASC, a.created_at ASC
      LIMIT ?
    `,
                    [examPaperId, limit]
                );
            } catch (e) {
                if (e.code === "ER_BAD_FIELD_ERROR") {
                    rows = await db.queryAsync(
                        `
      SELECT a.id, a.display_name, a.score, a.total, a.duration_sec, a.time_expired, a.created_at, a.exam_paper_id
      FROM exam_attempts a
      WHERE a.exam_paper_id = ?
      ORDER BY a.score DESC, a.duration_sec ASC, a.created_at ASC
      LIMIT ?
    `,
                        [examPaperId, limit]
                    );
                } else {
                    throw e;
                }
            }
        } else {
            rows = await db.queryAsync(
                `
      SELECT id, display_name, score, total, duration_sec, time_expired, created_at, exam_paper_id
      FROM exam_attempts
      ORDER BY score DESC, duration_sec ASC, created_at ASC
      LIMIT ?
      `,
                [limit]
            );
        }

        res.json({
            examPaperId: filterPaper ? examPaperId : null,
            examPaperTitle: paperTitle,
            rows: rows.map((r, i) => ({
                rank: i + 1,
                id: r.id,
                displayName: r.display_name,
                score: r.score,
                total: r.total,
                durationSec: r.duration_sec,
                timeExpired: r.time_expired == 1,
                createdAt: r.created_at,
                examPaperId: r.exam_paper_id != null ? r.exam_paper_id : null,
            })),
        });
    } catch (err) {
        if (
            filterPaper &&
            /Unknown column.*exam_paper_id/i.test(String(err.message))
        ) {
            try {
                const meta = await db.queryAsync(`SELECT title FROM exam_papers WHERE id = ?`, [
                    examPaperId,
                ]);
                const pt = meta.length ? meta[0].title : null;
                return res.json({
                    examPaperId,
                    examPaperTitle: pt,
                    rows: [],
                    warning: "Cột exam_paper_id chưa có — chạy backend/schema_paper_questions.sql rồi nộp bài lại để có xếp hạng theo đề.",
                });
            } catch {
                /* fall through */
            }
        }
        if (/Unknown column.*exam_paper_id/i.test(String(err.message))) {
            try {
                const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
                const rows = await db.queryAsync(
                    `
          SELECT id, display_name, score, total, duration_sec, time_expired, created_at
          FROM exam_attempts
          ORDER BY score DESC, duration_sec ASC, created_at ASC
          LIMIT ?
          `,
                    [limit]
                );
                return res.json({
                    examPaperId: null,
                    examPaperTitle: null,
                    rows: rows.map((r, i) => ({
                        rank: i + 1,
                        id: r.id,
                        displayName: r.display_name,
                        score: r.score,
                        total: r.total,
                        durationSec: r.duration_sec,
                        timeExpired: r.time_expired == 1,
                        createdAt: r.created_at,
                        examPaperId: null,
                    })),
                });
            } catch (e2) {
                console.error("GET /leaderboard fallback:", e2);
            }
        }
        console.error("GET /leaderboard:", err);
        res.status(500).json({ error: "Không tải được bảng xếp hạng" });
    }
});

module.exports = router;
