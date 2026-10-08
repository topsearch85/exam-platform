const nodemailer = require("nodemailer");

/**
 * MAIL_TRANSPORT=smtp (mặc định): dùng SMTP_HOST / Mailpit / nhà cung cấp.
 * MAIL_TRANSPORT=sendmail: gọi binary sendmail trên máy (tương tự luồng thường dùng với PHP mail() + MTA cục bộ).
 * Node không gọi trực tiếp hàm PHP mail() — cần sendmail/postfix cài sẵn hoặc đường dẫn tới sendmail (XAMPP, v.v.).
 */
function getTransporter() {
    const mode = String(process.env.MAIL_TRANSPORT || "smtp").toLowerCase();
    if (mode === "sendmail") {
        const path =
            (process.env.SENDMAIL_PATH && String(process.env.SENDMAIL_PATH).trim()) ||
            (process.platform === "win32" ? "" : "/usr/sbin/sendmail");
        if (!path) {
            return null;
        }
        return nodemailer.createTransport({
            sendmail: true,
            newline: "unix",
            path,
        });
    }
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS || "";
    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
    });
}

/** Đã cấu hình để gửi được thư (SMTP hoặc sendmail). */
function isMailConfigured() {
    const mode = String(process.env.MAIL_TRANSPORT || "smtp").toLowerCase();
    if (mode === "sendmail") {
        const p = process.env.SENDMAIL_PATH && String(process.env.SENDMAIL_PATH).trim();
        if (p) return true;
        return process.platform !== "win32";
    }
    return Boolean(process.env.SMTP_HOST && String(process.env.SMTP_HOST).trim());
}

/** @deprecated Dùng isMailConfigured */
function isSmtpConfigured() {
    return isMailConfigured();
}

function getMailFrom() {
    return process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@localhost";
}

/**
 * @param {string} to
 * @param {string} resetUrl
 */
async function sendPasswordResetEmail(to, resetUrl) {
    const transporter = getTransporter();
    if (!transporter) {
        const err = new Error("NO_MAIL_TRANSPORT");
        err.code = "NO_MAIL_TRANSPORT";
        throw err;
    }
    const from = getMailFrom();
    await transporter.sendMail({
        from,
        to,
        subject: "Đặt lại mật khẩu — Exam Platform",
        text:
            `Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu.\n\n` +
            `Mở liên kết sau (có hiệu lực trong 1 giờ):\n${resetUrl}\n\n` +
            `Nếu không phải bạn, bỏ qua email này.`,
        html:
            `<p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu.</p>` +
            `<p><a href="${resetUrl}">Đặt lại mật khẩu</a></p>` +
            `<p>Liên kết có hiệu lực trong 1 giờ. Nếu không phải bạn, bỏ qua email này.</p>`,
    });
}

/**
 * @param {string} to
 * @param {{ username: string, displayName: string }} info
 */
async function sendWelcomeEmail(to, info) {
    const transporter = getTransporter();
    if (!transporter) {
        const err = new Error("NO_MAIL_TRANSPORT");
        err.code = "NO_MAIL_TRANSPORT";
        throw err;
    }
    const from = getMailFrom();
    const base = String(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const loginUrl = `${base}/dang-nhap`;
    const un = info.username || "";
    const dn = info.displayName || "";
    await transporter.sendMail({
        from,
        to,
        subject: "Chào mừng bạn đến với Exam Platform",
        text:
            `Xin chào ${dn || un},\n\n` +
            `Tài khoản của bạn đã được tạo thành công.\n` +
            `- Tên đăng nhập: ${un}\n` +
            `- Email đăng ký: ${to}\n\n` +
            `Đăng nhập tại: ${loginUrl}\n\n` +
            `Nếu bạn không thực hiện đăng ký này, hãy bỏ qua email hoặc liên hệ quản trị.`,
        html:
            `<p>Xin chào <strong>${escapeHtml(dn || un)}</strong>,</p>` +
            `<p>Tài khoản của bạn đã được tạo thành công.</p>` +
            `<ul><li><strong>Tên đăng nhập:</strong> ${escapeHtml(un)}</li>` +
            `<li><strong>Email đăng ký:</strong> ${escapeHtml(to)}</li></ul>` +
            `<p><a href="${loginUrl}">Đăng nhập</a></p>` +
            `<p style="color:#666;font-size:12px">Nếu bạn không thực hiện đăng ký này, hãy bỏ qua hoặc liên hệ quản trị.</p>`,
    });
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

module.exports = {
    sendPasswordResetEmail,
    sendWelcomeEmail,
    isMailConfigured,
    isSmtpConfigured,
};
