const path = require("path");
// Luôn đọc backend/.env dù chạy `node server.js` từ thư mục gốc repo (cwd khác __dirname).
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const authRoutes = require("./routes/auth");
const questionRoutes = require("./routes/questions");
const examRoutes = require("./routes/exam");
const sessionRoutes = require("./routes/sessions");
const leaderboardRoutes = require("./routes/leaderboard");
const adminRoutes = require("./routes/admin");
const adminUsersRoutes = require("./routes/adminUsers");
const catalogRoutes = require("./routes/catalog");
const adminCurriculumRoutes = require("./routes/adminCurriculum");
const speakingCoachWhisperRoutes = require("./routes/speakingCoachWhisper");

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));

app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    next();
});

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        service: "exam-backend",
        admin: "/api/admin",
        adminHealth: "/api/admin/health",
    });
});

app.use(
    "/api/uploads/question-media",
    express.static(path.join(__dirname, "uploads", "question-media"))
);

app.use("/api/auth", authRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/exam", examRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/speaking-coach", speakingCoachWhisperRoutes);
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/curriculum", adminCurriculumRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
    res.status(404).json({
        error: "Not found",
        method: req.method,
        path: req.originalUrl,
        hint: "Đảm bảo chạy đúng server Node (backend/server.js) và đã restart sau khi sửa code.",
    });
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin API: GET http://localhost:${PORT}/api/admin/health (không cần key)`);
    console.log(`         Quản trị: Bearer JWT (role admin) cho /api/admin/* và /api/admin/curriculum/*`);
});

const db = require("./db");

db.query("SELECT 1 + 1 AS result", (err, rows) => {
    if (err) {
        console.log("DB ERROR:", err);
    } else {
        console.log("DB TEST:", rows);
    }
});
