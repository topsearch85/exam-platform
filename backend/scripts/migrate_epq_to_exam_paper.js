/**
 * Chạy từ thư mục backend:  node scripts/migrate_epq_to_exam_paper.js
 * - Gán exam_paper_id cho câu từ bảng exam_paper_questions (câu thuộc nhiều đề → nhân bản câu + đáp án)
 * - DROP TABLE exam_paper_questions
 *
 * Cần đã chạy schema_questions_per_paper.sql
 */
const db = require("../db");

function getInsertId(result) {
    if (result == null) return null;
    const raw = result.insertId ?? result.insert_id;
    if (raw === undefined || raw === null) return null;
    return typeof raw === "bigint" ? Number(raw) : Number(raw);
}

async function hasColumn(table, column) {
    const rows = await db.queryAsync(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return rows[0].c > 0;
}

async function cloneQuestion(sourceQuestionId, examPaperId) {
    const qrows = await db.queryAsync(`SELECT question, subject_id FROM questions WHERE id = ?`, [sourceQuestionId]);
    if (!qrows.length) return null;
    const q = qrows[0];
    const prows = await db.queryAsync(`SELECT subject_id FROM exam_papers WHERE id = ?`, [examPaperId]);
    const subjectId = prows.length ? prows[0].subject_id : q.subject_id;
    const maxRows = await db.queryAsync(
        `SELECT COALESCE(MAX(sort_order), 0) AS m FROM questions WHERE exam_paper_id = ?`,
        [examPaperId]
    );
    const sortOrder = Number(maxRows[0].m) + 1;
    const ins = await db.queryAsync(
        `INSERT INTO questions (question, subject_id, exam_paper_id, sort_order) VALUES (?, ?, ?, ?)`,
        [q.question, subjectId, examPaperId, sortOrder]
    );
    const newId = getInsertId(ins);
    if (!newId) return null;
    const ans = await db.queryAsync(`SELECT answer_text, is_correct FROM answers WHERE question_id = ? ORDER BY id`, [
        sourceQuestionId,
    ]);
    for (const a of ans) {
        await db.queryAsync(`INSERT INTO answers (question_id, answer_text, is_correct) VALUES (?, ?, ?)`, [
            newId,
            a.answer_text,
            a.is_correct,
        ]);
    }
    return newId;
}

async function main() {
    const col = await hasColumn("questions", "exam_paper_id");
    if (!col) {
        console.error("Thiếu cột questions.exam_paper_id — chạy schema_questions_per_paper.sql trước.");
        process.exit(1);
    }
    const epqExists = await db.queryAsync(
        `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_paper_questions'`
    );
    if (!epqExists[0].c) {
        console.log("Không có bảng exam_paper_questions — bỏ qua migration dữ liệu.");
        await db.end();
        return;
    }

    const epqRows = await db.queryAsync(
        `SELECT exam_paper_id, question_id FROM exam_paper_questions ORDER BY question_id, exam_paper_id`
    );
    if (epqRows.length === 0) {
        console.log("exam_paper_questions rỗng — chỉ DROP bảng liên kết.");
        await db.queryAsync(`DROP TABLE IF EXISTS exam_paper_questions`);
        console.log("Đã DROP exam_paper_questions.");
        await db.end();
        return;
    }

    const byQ = {};
    for (const r of epqRows) {
        if (!byQ[r.question_id]) byQ[r.question_id] = [];
        byQ[r.question_id].push(r.exam_paper_id);
    }

    await db.queryAsync("START TRANSACTION");
    try {
        for (const [qidStr, paperIds] of Object.entries(byQ)) {
            const qid = Number(qidStr);
            const papers = [...new Set(paperIds)].sort((a, b) => a - b);
            const firstPaper = papers[0];
            const prows = await db.queryAsync(`SELECT subject_id FROM exam_papers WHERE id = ?`, [firstPaper]);
            const sid = prows.length ? prows[0].subject_id : null;
            const maxRows = await db.queryAsync(
                `SELECT COALESCE(MAX(sort_order), 0) AS m FROM questions WHERE exam_paper_id = ?`,
                [firstPaper]
            );
            const nextSort = Number(maxRows[0].m) + 1;
            await db.queryAsync(
                `UPDATE questions SET exam_paper_id = ?, subject_id = COALESCE(subject_id, ?), sort_order = ? WHERE id = ?`,
                [firstPaper, sid, nextSort, qid]
            );

            for (let i = 1; i < papers.length; i++) {
                await cloneQuestion(qid, papers[i]);
            }
        }

        await db.queryAsync(`DROP TABLE IF EXISTS exam_paper_questions`);
        await db.queryAsync("COMMIT");
        console.log("Đã gán exam_paper_id, nhân bản câu trùng đề, và DROP exam_paper_questions.");
    } catch (e) {
        await db.queryAsync("ROLLBACK");
        console.error(e);
        process.exit(1);
    }
    await db.end();
}

main();
