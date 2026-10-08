/**
 * Cột bổ sung: questions.media_json, exam_papers.answer_code_prefix
 * Chạy: node backend/scripts/ensure_exam_enhancements.js
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
        if (!(await hasColumn("questions", "media_json"))) {
            await db.queryAsync(
                "ALTER TABLE questions ADD COLUMN media_json LONGTEXT NULL"
            );
            console.log("+ questions.media_json");
        }
        if (!(await hasColumn("exam_papers", "answer_code_prefix"))) {
            await db.queryAsync(
                "ALTER TABLE exam_papers ADD COLUMN answer_code_prefix VARCHAR(32) NULL DEFAULT 'VDL'"
            );
            console.log("+ exam_papers.answer_code_prefix");
        }
        console.log("OK");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
