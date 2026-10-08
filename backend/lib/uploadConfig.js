const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDir = path.join(__dirname, "..", "uploads", "question-media");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").slice(0, 16);
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
});

const ALLOWED = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
    storage,
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Loại file không hỗ trợ (chỉ ảnh, PDF, Word)"));
        }
    },
});

module.exports = { upload, uploadDir };
