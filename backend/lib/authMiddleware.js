const { verifyToken } = require("./authUtil");

function optionalAuth(req, res, next) {
    req.userId = null;
    req.user = null;
    const h = req.headers.authorization;
    if (h && typeof h === "string" && h.startsWith("Bearer ")) {
        const token = h.slice(7).trim();
        if (token) {
            try {
                const decoded = verifyToken(token);
                if (decoded && decoded.sub != null) {
                    req.userId = Number(decoded.sub);
                    const role = decoded.role === "admin" ? "admin" : "user";
                    req.user = {
                        id: req.userId,
                        username: decoded.username,
                        displayName: decoded.displayName,
                        role,
                    };
                }
            } catch {
                /* invalid token */
            }
        }
    }
    next();
}

function requireAuth(req, res, next) {
    optionalAuth(req, res, () => {
        if (!req.userId) {
            return res.status(401).json({ error: "Cần đăng nhập" });
        }
        next();
    });
}

/** Chỉ user có JWT role === admin (payload khi đăng nhập) */
function requireAdminJwt(req, res, next) {
    optionalAuth(req, res, () => {
        if (!req.userId) {
            return res.status(401).json({ error: "Cần đăng nhập bằng tài khoản quản trị" });
        }
        if (req.user?.role !== "admin") {
            return res.status(403).json({ error: "Chỉ quản trị viên mới truy cập được mục này" });
        }
        next();
    });
}

module.exports = { optionalAuth, requireAuth, requireAdminJwt };
