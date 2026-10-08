/**
 * Speaking Coach — chỉ nhận diện giọng qua Whisper self-host (HTTP).
 * Không dùng OpenAI. Cấu hình: LOCAL_WHISPER_HTTP_URL (URL đầy đủ endpoint nhận multipart giống OpenAI).
 */

const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../lib/authMiddleware");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
});

function getLocalWhisperUrl() {
    const u = process.env.LOCAL_WHISPER_HTTP_URL;
    if (!u || !String(u).trim()) return null;
    return String(u).trim();
}

function optionalHeaderObject() {
    const raw = process.env.LOCAL_WHISPER_HTTP_HEADERS;
    if (!raw || !String(raw).trim()) return {};
    try {
        const j = JSON.parse(String(raw));
        return j && typeof j === "object" ? j : {};
    } catch {
        return {};
    }
}

/** Giải thích lỗi fetch (Node/undici thường chỉ trả "fetch failed"). */
function describeUpstreamFetchError(err) {
    const bits = [];
    const msg = err && typeof err.message === "string" ? err.message : "";
    if (msg) bits.push(msg);
    const c = err && err.cause;
    if (c != null) {
        if (typeof c === "object") {
            if (c.code) bits.push(String(c.code));
            if (c.message && c.message !== msg) bits.push(String(c.message));
            if (c.errno != null) bits.push(`errno=${c.errno}`);
        } else if (typeof c === "string") {
            bits.push(c);
        }
    }
    return bits.filter(Boolean).join(" — ") || "Lỗi kết nối HTTP";
}

/**
 * POST /api/speaking-coach/transcribe
 * multipart field: file (webm/wav/mp3…)
 */
router.post("/transcribe", requireAuth, upload.single("file"), async (req, res) => {
    const url = getLocalWhisperUrl();
    if (!url) {
        return res.status(503).json({
            error: "Chưa cấu hình LOCAL_WHISPER_HTTP_URL trên backend (URL đầy đủ tới endpoint transcribe).",
        });
    }

    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "Thiếu file âm thanh (field: file)" });
    }

    const type = req.file.mimetype || "audio/webm";
    const blob = new Blob([req.file.buffer], { type });
    const formData = new FormData();
    formData.append("file", blob, req.file.originalname || "recording.webm");

    const model = process.env.LOCAL_WHISPER_MODEL || process.env.WHISPER_MODEL || "whisper-1";
    formData.append("model", model);

    const lang = process.env.WHISPER_LANGUAGE;
    if (lang && String(lang).trim()) {
        formData.append("language", String(lang).trim());
    }

    try {
        const headers = { ...optionalHeaderObject() };
        const r = await fetch(url, {
            method: "POST",
            headers,
            body: formData,
        });

        const text = await r.text();
        if (!r.ok) {
            console.error("speaking-coach whisper:", r.status, text.slice(0, 400));
            return res.status(502).json({
                error: "Dịch vụ Whisper local trả lỗi. Kiểm tra LOCAL_WHISPER_HTTP_URL và log backend.",
            });
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            return res.status(502).json({ error: "Phản hồi Whisper không phải JSON hợp lệ." });
        }

        const transcriptRaw =
            typeof data.text === "string"
                ? data.text
                : typeof data.transcript === "string"
                  ? data.transcript
                  : "";
        const transcript = transcriptRaw.trim();
        return res.json({ transcript });
    } catch (e) {
        const detail = describeUpstreamFetchError(e);
        console.error("speaking-coach transcribe →", url, detail, e);
        const isConn =
            /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|ECONNRESET|socket/i.test(detail) ||
            /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|ECONNRESET|socket/i.test(String(e && e.message));
        const hint = isConn
            ? `Không gọi được Whisper tại URL đã cấu hình. Bật server Whisper, kiểm tra LOCAL_WHISPER_HTTP_URL (ví dụ http://127.0.0.1:9000/...), firewall. Chi tiết: ${detail}`
            : `Lỗi khi gọi Whisper: ${detail}`;
        return res.status(502).json({ error: hint });
    }
});

module.exports = router;
