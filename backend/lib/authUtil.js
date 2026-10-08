const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-in-production";

function signToken(payload, rememberMe) {
    const expiresIn = rememberMe ? "30d" : "2d";
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

/** Captcha đăng ký: phép cộng, JWT ngắn hạn, không cần session */
function createRegisterCaptcha() {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    const token = jwt.sign(
        { typ: "regcaptcha", a, b },
        JWT_SECRET,
        { expiresIn: "10m" }
    );
    return {
        token,
        prompt: `${a} + ${b}`,
    };
}

function verifyRegisterCaptcha(token, answerStr) {
    if (!token || answerStr == null || answerStr === "") return false;
    let p;
    try {
        p = jwt.verify(token, JWT_SECRET);
    } catch {
        return false;
    }
    if (p.typ !== "regcaptcha") return false;
    const a = Number(p.a);
    const b = Number(p.b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    const ans = parseInt(String(answerStr).trim(), 10);
    return Number.isFinite(ans) && ans === a + b;
}

module.exports = {
    JWT_SECRET,
    signToken,
    verifyToken,
    createRegisterCaptcha,
    verifyRegisterCaptcha,
};
