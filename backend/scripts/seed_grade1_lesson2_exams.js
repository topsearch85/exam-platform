/**
 * Tạo 10 đề trắc nghiệm cho Lớp 1 — Bài 2: Các số 6, 7, 8, 9, 10
 *
 * Chạy từ thư mục backend:
 *   node scripts/seed_grade1_lesson2_exams.js
 *
 * - Tìm lớp "Lớp 1", bài học trùng tiêu đề; nếu chưa có thì tạo khối/link/chủ đề/bài tối thiểu.
 * - Xóa các đề cũ do script tạo (tiêu đề khớp mẫu) rồi chèn lại 10 đề × 12 câu, mỗi đề 10 câu/lần làm.
 */

const db = require("../db");

const LESSON_TITLE = "Bài 2: Các số 6, 7, 8, 9, 10";
const PAPER_TITLE_PREFIX = "Đề trắc nghiệm";
const QUESTIONS_PER_PAPER = 12;
const QUESTION_COUNT_ON_EXAM = 10;
const DURATION_SEC = 15 * 60;

const VI_WORD = { 6: "sáu", 7: "bảy", 8: "tám", 9: "chín", 10: "mười" };
const VI_CAP = { 6: "Sáu", 7: "Bảy", 8: "Tám", 9: "Chín", 10: "Mười" };
const ALL = [6, 7, 8, 9, 10];

function getInsertId(result) {
    if (result == null) return null;
    const raw = result.insertId ?? result.insert_id;
    if (raw === undefined || raw === null) return null;
    return typeof raw === "bigint" ? Number(raw) : Number(raw);
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function wrongDigits(correct, n = 3) {
    return shuffle(ALL.filter((x) => x !== correct)).slice(0, n);
}

function wrongWords(correct) {
    return shuffle(
        ALL.filter((x) => x !== correct).map((x) => VI_CAP[x])
    ).slice(0, 3);
}

/** 4 đáp án, đúng 1 — text là chữ số */
function packDigitChoices(correct) {
    const opts = [{ text: String(correct), isCorrect: true }, ...wrongDigits(correct).map((d) => ({ text: String(d), isCorrect: false }))];
    return shuffle(opts);
}

/** 4 đáp án — đúng là từ đọc số */
function packWordChoices(correctDigit) {
    const opts = [{ text: VI_CAP[correctDigit], isCorrect: true }, ...wrongWords(correctDigit).map((t) => ({ text: t, isCorrect: false }))];
    return shuffle(opts);
}

/**
 * Sinh 12 câu cho đề `paperIndex` (0..9) — nội dung lệch theo đề để các bài không trùng hết.
 */
function buildQuestionsForPaper(paperIndex) {
    const o = paperIndex;
    const n = (i) => ALL[(i + o) % ALL.length];

    const out = [];

    const d1 = n(0);
    out.push({
        question: `Số "${VI_WORD[d1]}" viết bằng chữ số là:`,
        answers: packDigitChoices(d1),
    });

    const d2 = n(1);
    out.push({
        question: `Chữ số ${d2} đọc là:`,
        answers: packWordChoices(d2),
    });

    const d3 = 6 + ((o + 2) % 4);
    out.push({
        question: `Số liền sau của ${d3} là:`,
        answers: packDigitChoices(d3 + 1),
    });

    const d4 = 7 + ((o + 1) % 4);
    out.push({
        question: `Số liền trước của ${d4} là:`,
        answers: packDigitChoices(d4 - 1),
    });

    const a = n(4),
        b = n(5),
        c = n(6);
    const mx = Math.max(a, b, c);
    out.push({
        question: `Trong các số ${a}, ${b}, ${c}, số lớn nhất là:`,
        answers: packDigitChoices(mx),
    });

    const mn = Math.min(a, b, c);
    out.push({
        question: `Trong các số ${a}, ${b}, ${c}, số bé nhất là:`,
        answers: packDigitChoices(mn),
    });

    const d5 = 6 + (o % 4);
    out.push({
        question: `${d5} + 1 = ?`,
        answers: packDigitChoices(d5 + 1),
    });

    const d6 = 7 + ((o + 2) % 4);
    out.push({
        question: `${d6} − 1 = ?`,
        answers: packDigitChoices(d6 - 1),
    });

    const lo = n(2),
        hi = n(5);
    const smaller = Math.min(lo, hi);
    const larger = Math.max(lo, hi);
    out.push({
        question: `Số nào bé hơn: ${larger} hay ${smaller}?`,
        answers: packDigitChoices(smaller),
    });

    const x = 6 + (o % 3);
    out.push({
        question: `${x} + 2 = ?`,
        answers: packDigitChoices(x + 2),
    });

    const u = n(0),
        v = n(2),
        w = n(4);
    const sorted = [u, v, w].sort((a, b) => a - b);
    const mid = sorted[1];
    out.push({
        question: `Cho ba số ${u}, ${v}, ${w}. Khi xếp từ bé đến lớn, số đứng giữa là:`,
        answers: packDigitChoices(mid),
    });

    const count = 6 + (o % 5);
    const stars = "☆".repeat(count);
    out.push({
        question: `Có các ngôi sao: ${stars}. Hỏi có tất cả mấy ngôi sao?`,
        answers: packDigitChoices(count),
    });

    return out.slice(0, QUESTIONS_PER_PAPER);
}

async function ensureDefaultSubjectForGrade(gradeId) {
    const rows = await db.queryAsync(`SELECT id FROM subjects WHERE grade_id = ? ORDER BY id LIMIT 1`, [gradeId]);
    if (rows.length) return rows[0].id;
    const r = await db.queryAsync(`INSERT INTO subjects (grade_id, name, sort_order) VALUES (?, ?, 0)`, [
        gradeId,
        "Toán",
    ]);
    return getInsertId(r);
}

async function resolveSubjectIdFromLessonId(lessonId) {
    const rows = await db.queryAsync(
        `SELECT gb.grade_id FROM catalog_lessons cl
     JOIN catalog_themes ct ON cl.catalog_theme_id = ct.id
     JOIN grade_block_links gbl ON ct.grade_block_link_id = gbl.id
     JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
     WHERE cl.id = ?`,
        [Number(lessonId)]
    );
    if (!rows.length) return null;
    return ensureDefaultSubjectForGrade(rows[0].grade_id);
}

async function findLessonIdForGrade(gradeId) {
    const rows = await db.queryAsync(
        `SELECT cl.id FROM catalog_lessons cl
     JOIN catalog_themes ct ON cl.catalog_theme_id = ct.id
     JOIN grade_block_links gbl ON ct.grade_block_link_id = gbl.id
     JOIN grade_blocks gb ON gbl.grade_block_id = gb.id
     WHERE gb.grade_id = ? AND cl.title = ?`,
        [gradeId, LESSON_TITLE]
    );
    return rows.length ? rows[0].id : null;
}

async function createLessonUnderGrade(gradeId) {
    let blocks = await db.queryAsync(`SELECT id FROM grade_blocks WHERE grade_id = ? ORDER BY sort_order, id LIMIT 1`, [gradeId]);
    let blockId;
    if (!blocks.length) {
        const r = await db.queryAsync(`INSERT INTO grade_blocks (grade_id, title, sort_order) VALUES (?, ?, 0)`, [
            gradeId,
            "Chương trình lớp 1",
        ]);
        blockId = getInsertId(r);
    } else {
        blockId = blocks[0].id;
    }

    const slug = `seed-lop1-b2-${Date.now()}`.slice(0, 80);
    const rLink = await db.queryAsync(
        `INSERT INTO grade_block_links (grade_block_id, label, slug, sort_order) VALUES (?, ?, ?, 99)`,
        [blockId, "Toán — (seed Bài 2)", slug]
    );
    const linkId = getInsertId(rLink);

    const rTheme = await db.queryAsync(
        `INSERT INTO catalog_themes (grade_block_link_id, title, sort_order) VALUES (?, ?, 0)`,
        [linkId, "Số trong phạm vi 10"]
    );
    const themeId = getInsertId(rTheme);

    try {
        const rLess = await db.queryAsync(
            `INSERT INTO catalog_lessons (catalog_theme_id, title, description, sort_order) VALUES (?, ?, ?, 1)`,
            [
                themeId,
                LESSON_TITLE,
                "Ôn tập trắc nghiệm: nhận biết, đọc viết, so sánh và thứ tự các số 6, 7, 8, 9, 10.",
            ]
        );
        return getInsertId(rLess);
    } catch (e) {
        if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
        const rLess = await db.queryAsync(
            `INSERT INTO catalog_lessons (catalog_theme_id, title, sort_order) VALUES (?, ?, 1)`,
            [themeId, LESSON_TITLE]
        );
        return getInsertId(rLess);
    }
}

async function deleteSeededPapers(lessonId) {
    const rows = await db.queryAsync(`SELECT id, title FROM exam_papers WHERE catalog_lesson_id = ?`, [lessonId]);
    const toDelete = rows.filter((r) => {
        const t = r.title || "";
        return t.startsWith(`${PAPER_TITLE_PREFIX} `) && t.includes("/10 - ") && t.includes(LESSON_TITLE);
    });
    for (const r of toDelete) {
        await db.queryAsync(`DELETE FROM exam_papers WHERE id = ?`, [r.id]);
    }
    if (toDelete.length) {
        console.log(`Đã xóa ${toDelete.length} đề cũ (seed trước đó).`);
    }
}

async function insertPaper(lessonId, subjectId, num01to10) {
    const title = `${PAPER_TITLE_PREFIX} ${String(num01to10).padStart(2, "0")}/10 - ${LESSON_TITLE}`;
    let r;
    try {
        r = await db.queryAsync(
            `INSERT INTO exam_papers (subject_id, catalog_lesson_id, title, description, duration_sec, question_count, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                subjectId,
                lessonId,
                title,
                "10 câu trắc nghiệm mỗi lần làm (chọn ngẫu nhiên trong 12 câu của đề).",
                DURATION_SEC,
                QUESTION_COUNT_ON_EXAM,
                num01to10,
            ]
        );
    } catch (e) {
        if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
        r = await db.queryAsync(
            `INSERT INTO exam_papers (subject_id, topic_id, catalog_lesson_id, title, description, duration_sec, question_count, sort_order, is_active)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 1)`,
            [
                subjectId,
                lessonId,
                title,
                "10 câu trắc nghiệm mỗi lần làm (chọn ngẫu nhiên trong 12 câu của đề).",
                DURATION_SEC,
                QUESTION_COUNT_ON_EXAM,
                num01to10,
            ]
        );
    }
    return getInsertId(r);
}

async function insertQuestion(paperId, subjectId, sortOrder, q) {
    const insQ = await db.queryAsync(
        `INSERT INTO questions (question, subject_id, exam_paper_id, sort_order) VALUES (?, ?, ?, ?)`,
        [q.question, subjectId, paperId, sortOrder]
    );
    const qid = getInsertId(insQ);
    for (const a of q.answers) {
        await db.queryAsync(`INSERT INTO answers (question_id, answer_text, is_correct) VALUES (?, ?, ?)`, [
            qid,
            a.text,
            a.isCorrect ? 1 : 0,
        ]);
    }
}

async function main() {
    const grades = await db.queryAsync(`SELECT id FROM grades WHERE name = ? LIMIT 1`, ["Lớp 1"]);
    if (!grades.length) {
        console.error('Không tìm thấy lớp tên "Lớp 1". Chạy seed_grades.sql trước.');
        process.exit(1);
    }
    const gradeId = grades[0].id;

    let lessonId = await findLessonIdForGrade(gradeId);
    if (!lessonId) {
        lessonId = await createLessonUnderGrade(gradeId);
        console.log(`Đã tạo bài học mới id=${lessonId} (${LESSON_TITLE}).`);
    } else {
        console.log(`Dùng bài học id=${lessonId} (${LESSON_TITLE}).`);
    }

    const subjectId = await resolveSubjectIdFromLessonId(lessonId);
    if (!subjectId) {
        console.error("Không xác định được subject_id.");
        process.exit(1);
    }

    await deleteSeededPapers(lessonId);

    for (let p = 1; p <= 10; p++) {
        const paperId = await insertPaper(lessonId, subjectId, p);
        const items = buildQuestionsForPaper(p - 1);
        let ord = 0;
        for (const item of items) {
            ord += 1;
            await insertQuestion(paperId, subjectId, ord, item);
        }
        console.log(`  + Đề ${p}/10 — exam_papers.id = ${paperId} (${items.length} câu trong ngân hàng đề)`);
    }

    console.log("Xong. Mở site → Lớp 1 → bài tương ứng để thấy 10 đề.");
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
