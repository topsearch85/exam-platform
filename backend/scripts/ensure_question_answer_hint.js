/**
 * Cột questions.answer_hint — gợi ý trả lời (chỉ hiển thị sau khi nộp bài).
 * Chạy: node backend/scripts/ensure_question_answer_hint.js
 */
const db = require("../db");

async function hasColumn(table, column) {
    const rows = await db.queryAsync(
        `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return rows.length > 0;
}

async function main() {
    try {
        if (!(await hasColumn("questions", "answer_hint"))) {
            await db.queryAsync("ALTER TABLE questions ADD COLUMN answer_hint TEXT NULL");
            console.log("+ questions.answer_hint");
        }
        console.log("OK");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
