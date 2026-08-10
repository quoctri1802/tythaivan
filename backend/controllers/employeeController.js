const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const getEmployees = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.username, e.full_name, e.role, e.department_id, e.title, 
              e.has_toxic_salary, e.has_toxic_in_kind, e.toxic_in_kind_level,
              d.name as department_name 
       FROM employees e 
       LEFT JOIN departments d ON e.department_id = d.id 
       ORDER BY e.role = 'admin' DESC, e.role = 'director' DESC, e.role = 'manager' DESC, e.id ASC`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Lỗi khi lấy danh sách nhân viên:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const createEmployee = async (req, res) => {
  const { username, password, full_name, role, department_id, title, has_toxic_salary, has_toxic_in_kind, toxic_in_kind_level } = req.body;

  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ: tài khoản, mật khẩu, họ tên và vai trò.' });
  }

  try {
    // Check if user exists
    const checkUser = await pool.query('SELECT id FROM employees WHERE username = $1', [username.toLowerCase().trim()]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ message: 'Tài khoản đã tồn tại trên hệ thống.' });
    }

    const passHash = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      `INSERT INTO employees (username, password, full_name, role, department_id, title, has_toxic_salary, has_toxic_in_kind, toxic_in_kind_level) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id, username, full_name, role, title`,
      [
        username.toLowerCase().trim(),
        passHash,
        full_name.trim(),
        role,
        department_id || null,
        title || null,
        has_toxic_salary || false,
        has_toxic_in_kind || false,
        toxic_in_kind_level || 3
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi khi tạo nhân viên:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const updateEmployee = async (req, res) => {
  const { id } = req.params;
  const { password, full_name, role, department_id, title, has_toxic_salary, has_toxic_in_kind, toxic_in_kind_level } = req.body;

  try {
    // Check if employee exists
    const checkEmp = await pool.query('SELECT password FROM employees WHERE id = $1', [id]);
    if (checkEmp.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên.' });
    }

    let passHash = checkEmp.rows[0].password;
    if (password && password.trim() !== '') {
      passHash = await bcrypt.hash(password, 10);
    }

    await pool.query(
      `UPDATE employees 
       SET password = $1, full_name = $2, role = $3, department_id = $4, title = $5, 
           has_toxic_salary = $6, has_toxic_in_kind = $7, toxic_in_kind_level = $8 
       WHERE id = $9`,
      [
        passHash,
        full_name.trim(),
        role,
        department_id || null,
        title || null,
        has_toxic_salary || false,
        has_toxic_in_kind || false,
        toxic_in_kind_level || 3,
        id
      ]
    );

    return res.json({ message: 'Cập nhật thông tin nhân viên thành công.' });
  } catch (err) {
    console.error('Lỗi khi cập nhật nhân viên:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const deleteEmployee = async (req, res) => {
  const { id } = req.params;
  try {
    const checkEmp = await pool.query('SELECT role FROM employees WHERE id = $1', [id]);
    if (checkEmp.rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên.' });
    }

    if (checkEmp.rows[0].role === 'admin') {
      return res.status(400).json({ message: 'Không thể xóa tài khoản Admin hệ thống.' });
    }

    await pool.query('DELETE FROM employees WHERE id = $1', [id]);
    return res.json({ message: 'Xóa nhân viên thành công.' });
  } catch (err) {
    console.error('Lỗi khi xóa nhân viên:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const getDepartments = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM departments ORDER BY id ASC');
    return res.json(result.rows);
  } catch (err) {
    console.error('Lỗi khi lấy danh sách phòng ban:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const createDepartment = async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'Vui lòng cung cấp tên phòng ban.' });
  }
  try {
    const result = await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING *', [name.trim()]);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi khi tạo phòng ban:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

module.exports = {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getDepartments,
  createDepartment
};
