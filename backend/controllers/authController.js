const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Vui lòng điền đầy đủ tài khoản và mật khẩu.' });
  }

  try {
    const result = await pool.query(
      `SELECT e.*, d.name as department_name 
       FROM employees e 
       LEFT JOIN departments d ON e.department_id = d.id 
       WHERE e.username = $1`,
      [username.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Tài khoản không chính xác.' });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Mật khẩu không chính xác.' });
    }

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      department_id: user.department_id,
      full_name: user.full_name,
      title: user.title
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'tram_y_te_hai_van_secret_key_2026_jwt_token',
      { expiresIn: '24h' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        department_id: user.department_id,
        department_name: user.department_name,
        full_name: user.full_name,
        title: user.title,
        has_toxic_salary: user.has_toxic_salary,
        has_toxic_in_kind: user.has_toxic_in_kind,
        toxic_in_kind_level: user.toxic_in_kind_level
      }
    });
  } catch (err) {
    console.error('Lỗi khi đăng nhập:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ nội bộ.' });
  }
};

const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.username, e.full_name, e.role, e.department_id, e.title, e.has_toxic_salary, e.has_toxic_in_kind, e.toxic_in_kind_level, d.name as department_name 
       FROM employees e 
       LEFT JOIN departments d ON e.department_id = d.id 
       WHERE e.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    }

    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Lỗi khi lấy thông tin user:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ nội bộ.' });
  }
};

module.exports = {
  login,
  getMe
};
