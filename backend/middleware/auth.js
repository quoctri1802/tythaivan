const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Định dạng token không hợp lệ.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tram_y_te_hai_van_secret_key_2026_jwt_token');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token đã hết hạn hoặc không hợp lệ.' });
  }
};

const authorize = (roles = []) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Chưa xác thực.' });
    }

    // Role hierarchy check
    // admin has access to everything
    if (req.user.role === 'admin') {
      return next();
    }

    if (roles.length && !roles.includes(req.user.role)) {
      // Role hierarchy helpers
      if (roles.includes('employee') && ['manager', 'director'].includes(req.user.role)) {
        return next();
      }
      if (roles.includes('manager') && req.user.role === 'director') {
        return next();
      }
      
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này.' });
    }

    next();
  };
};

module.exports = {
  authMiddleware,
  authorize
};
