const crypto = require("crypto");

function generateResetToken() {
    return crypto.randomBytes(32).toString("hex");
}

function hashResetToken(token) {
    return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

module.exports = { generateResetToken, hashResetToken };
