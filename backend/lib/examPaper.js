const db = require("../db");

const DEFAULT_EXAM_SIZE = 50;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Tiền tố hiển thị mã đáp án (vd: «VDL 1.A»). Mặc định VDL.
 * @param {number|null|undefined} examPaperId
 */
async function getExamPaperAnswerPrefix(examPaperId) {
    if (examPaperId == null || Number.isNaN(Number(examPaperId))) {
        return "VDL";
    }
    try {
        const pr = await db.queryAsync(`SELECT answer_code_prefix FROM exam_papers WHERE id = ?`, [
            Number(examPaperId),
        ]);
        if (
            pr.length &&
            pr[0].answer_code_prefix != null &&
            String(pr[0].answer_code_prefix).trim() !== ""
        ) {
            return String(pr[0].answer_code_prefix).trim().slice(0, 32);
        }
    } catch {
        /* cột chưa có */
    }
    return "VDL";
}

/**
 * Chọn k id ngẫu nhiên không trùng — O(k) expected, không dùng ORDER BY RAND() trên bảng lớn.
 * Phù hợp ~10k–100k id (một query SELECT id).
 */
function sampleUniqueIds(allIds, k) {
    const n = allIds.length;
    if (n === 0 || k <= 0) return [];
    const take = Math.min(k, n);
    if (take === n) return [...allIds];
    const chosen = new Set();
    while (chosen.size < take) {
        chosen.add(allIds[Math.floor(Math.random() * n)]);
    }
    return [...chosen];
}

async function pickRandomQuestionIds(count = DEFAULT_EXAM_SIZE) {
    const rows = await db.queryAsync("SELECT id FROM questions");
    const ids = rows.map((r) => r.id);
    return sampleUniqueIds(ids, count);
}

/** @deprecated Không còn dùng cho phiên thi có đề — giữ cho tương thích. */
async function pickRandomQuestionIdsFromSubject(subjectId, count = DEFAULT_EXAM_SIZE) {
    const rows = await db.queryAsync("SELECT id FROM questions WHERE subject_id = ?", [
        subjectId,
    ]);
    const ids = rows.map((r) => r.id);
    return sampleUniqueIds(ids, count);
}

/**
 * Đề thi: chỉ random trong câu thuộc đề (questions.exam_paper_id).
 * Legacy: nếu chưa có cột exam_paper_id thì đọc exam_paper_questions.
 */
async function pickRandomQuestionIdsForExamPaper(examPaperId, subjectId, count = DEFAULT_EXAM_SIZE) {
    void subjectId;
    let ids = [];
    try {
        const rows = await db.queryAsync(
            `SELECT id FROM questions WHERE exam_paper_id = ? ORDER BY sort_order ASC, id ASC`,
            [examPaperId]
        );
        ids = rows.map((r) => r.id);
    } catch (e) {
        if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
    }
    if (ids.length === 0) {
        try {
            const rows = await db.queryAsync(
                `SELECT question_id AS id FROM exam_paper_questions WHERE exam_paper_id = ?`,
                [examPaperId]
            );
            ids = rows.map((r) => r.id);
        } catch {
            ids = [];
        }
    }
    if (ids.length === 0) {
        return [];
    }
    return sampleUniqueIds(ids, count);
}

function parseMediaJson(raw) {
    if (raw == null || raw === "") return [];
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * @param {number[]} ids — thứ tự câu trong đề
 */
async function fetchQuestionsWithAnswersOrdered(ids) {
    if (ids.length === 0) {
        return [];
    }

    let rows;
    try {
        rows = await db.queryAsync(
            `
        SELECT q.id, q.question, q.media_json,
               a.id AS answer_id,
               a.answer_text
        FROM questions q
        JOIN answers a ON q.id = a.question_id
        WHERE q.id IN (?)
        ORDER BY q.id, a.id
        `,
            [ids]
        );
    } catch (e) {
        if (!/Unknown column.*media_json/i.test(String(e.message))) throw e;
        rows = await db.queryAsync(
            `
        SELECT q.id, q.question,
               a.id AS answer_id,
               a.answer_text
        FROM questions q
        JOIN answers a ON q.id = a.question_id
        WHERE q.id IN (?)
        ORDER BY q.id, a.id
        `,
            [ids]
        );
    }

    const map = {};
    rows.forEach((r) => {
        if (!map[r.id]) {
            const media = Object.prototype.hasOwnProperty.call(r, "media_json")
                ? parseMediaJson(r.media_json)
                : [];
            map[r.id] = {
                id: r.id,
                question: r.question,
                media,
                answers: [],
            };
        }
        const idx = map[r.id].answers.length;
        map[r.id].answers.push({
            id: r.answer_id,
            text: r.answer_text,
            letter: LETTERS[idx] || String(idx + 1),
        });
    });

    return ids.map((id) => map[id]).filter(Boolean);
}

module.exports = {
    DEFAULT_EXAM_SIZE,
    sampleUniqueIds,
    pickRandomQuestionIds,
    pickRandomQuestionIdsFromSubject,
    pickRandomQuestionIdsForExamPaper,
    fetchQuestionsWithAnswersOrdered,
    getExamPaperAnswerPrefix,
};
