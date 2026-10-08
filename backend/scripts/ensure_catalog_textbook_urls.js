/**
 * Cột textbook_url (link SGK / tài liệu tham khảo) cho grade_block_links, catalog_themes, catalog_lessons.
 * Chạy: node backend/scripts/ensure_catalog_textbook_urls.js
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
        if (!(await hasColumn("grade_block_links", "textbook_url"))) {
            await db.queryAsync(
                "ALTER TABLE grade_block_links ADD COLUMN textbook_url VARCHAR(800) NULL"
            );
            console.log("+ grade_block_links.textbook_url");
        }
        if (!(await hasColumn("catalog_themes", "textbook_url"))) {
            await db.queryAsync(
                "ALTER TABLE catalog_themes ADD COLUMN textbook_url VARCHAR(800) NULL"
            );
            console.log("+ catalog_themes.textbook_url");
        }
        if (!(await hasColumn("catalog_lessons", "textbook_url"))) {
            await db.queryAsync(
                "ALTER TABLE catalog_lessons ADD COLUMN textbook_url VARCHAR(800) NULL"
            );
            console.log("+ catalog_lessons.textbook_url");
        }
        console.log("OK");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
