const express = require("express");
const router = express.Router();

/** API công khai cũ — đã ngừng; phiên thi dùng POST /api/sessions với examPaperId. */
router.get("/exam", (req, res) => {
    res.status(410).json({
        error: "Đã ngừng",
        hint: "Tạo phiên qua POST /api/sessions với body { examPaperId }",
    });
});

router.get("/", (req, res) => {
    res.status(410).json({
        error: "Đã ngừng",
        hint: "Câu hỏi chỉ quản lý theo từng đề trong Admin.",
    });
});

module.exports = router;
