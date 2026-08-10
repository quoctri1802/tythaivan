const pool = require('../config/db');

const getAttendance = async (req, res) => {
  const { month, year, department_id, employee_id } = req.query;

  if (!month || !year) {
    return res.status(400).json({ message: 'Vui lòng cung cấp tháng và năm.' });
  }

  try {
    let queryStr = `
      SELECT a.id, a.employee_id, a.date, a.symbol, a.notes, a.updated_at,
             e.full_name, e.username, e.title, e.department_id, 
             u.full_name as updated_by_name
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN employees u ON a.updated_by = u.id
      WHERE EXTRACT(MONTH FROM a.date) = $1 
        AND EXTRACT(YEAR FROM a.date) = $2
    `;
    const params = [parseInt(month, 10), parseInt(year, 10)];

    // Role-based restrictions
    if (req.user.role === 'employee') {
      queryStr += ` AND a.employee_id = $3`;
      params.push(req.user.id);
    } else if (employee_id) {
      queryStr += ` AND a.employee_id = $${params.length + 1}`;
      params.push(parseInt(employee_id, 10));
    } else if (department_id) {
      queryStr += ` AND e.department_id = $${params.length + 1}`;
      params.push(parseInt(department_id, 10));
    } else if (req.user.role === 'manager') {
      // Managers can only see their own department's employees by default
      queryStr += ` AND e.department_id = $${params.length + 1}`;
      params.push(req.user.department_id);
    }

    const result = await pool.query(queryStr, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('Lỗi khi lấy dữ liệu chấm công:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const saveAttendanceBulk = async (req, res) => {
  const { updates } = req.body; // Array of { employee_id, date, symbol, notes }

  if (!updates || !Array.isArray(updates)) {
    return res.status(400).json({ message: 'Định dạng dữ liệu không hợp lệ.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const update of updates) {
      const { employee_id, date, symbol, notes } = update;

      if (!employee_id || !date) continue;

      // Validate permissions
      // Employees can only save their own attendance
      if (req.user.role === 'employee' && req.user.id !== parseInt(employee_id, 10)) {
        throw new Error('Bạn không có quyền chấm công cho người khác.');
      }
      
      // Managers can only save attendance for their department
      if (req.user.role === 'manager') {
        const empCheck = await client.query('SELECT department_id FROM employees WHERE id = $1', [employee_id]);
        if (empCheck.rows.length === 0 || empCheck.rows[0].department_id !== req.user.department_id) {
          throw new Error('Bạn không có quyền chỉnh sửa nhân sự ngoài bộ phận.');
        }
      }

      // Check current attendance symbol
      const currentRes = await client.query(
        'SELECT symbol, notes FROM attendance WHERE employee_id = $1 AND date = $2',
        [employee_id, date]
      );

      const oldSymbol = currentRes.rows.length > 0 ? currentRes.rows[0].symbol : null;
      const cleanSymbol = symbol && symbol.trim() !== '' ? symbol.toUpperCase().trim() : null;

      if (oldSymbol === cleanSymbol) {
        // If symbol matches but notes changed, just update notes without auditing symbol
        if (currentRes.rows.length > 0 && currentRes.rows[0].notes !== notes) {
          await client.query(
            'UPDATE attendance SET notes = $1, updated_by = $2, updated_at = NOW() WHERE employee_id = $3 AND date = $4',
            [notes, req.user.id, employee_id, date]
          );
        }
        continue;
      }

      if (cleanSymbol === null) {
        // Delete record if symbol is empty
        await client.query('DELETE FROM attendance WHERE employee_id = $1 AND date = $2', [employee_id, date]);
        
        // Log deletion
        await client.query(
          `INSERT INTO audit_log (action, employee_id, target_employee_id, date, old_value, new_value, notes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['DELETE_ATTENDANCE', req.user.id, employee_id, date, oldSymbol, null, notes || 'Xóa chấm công']
        );
      } else {
        // Validate symbol code exists
        const symCheck = await client.query('SELECT code FROM attendance_types WHERE code = $1', [cleanSymbol]);
        if (symCheck.rows.length === 0) {
          throw new Error(`Ký hiệu chấm công '${cleanSymbol}' không tồn tại.`);
        }

        // Upsert record
        if (currentRes.rows.length > 0) {
          await client.query(
            `UPDATE attendance 
             SET symbol = $1, notes = $2, updated_by = $3, updated_at = NOW() 
             WHERE employee_id = $4 AND date = $5`,
            [cleanSymbol, notes, req.user.id, employee_id, date]
          );
        } else {
          await client.query(
            `INSERT INTO attendance (employee_id, date, symbol, notes, updated_by) 
             VALUES ($1, $2, $3, $4, $5)`,
            [employee_id, date, cleanSymbol, notes, req.user.id]
          );
        }

        // Log edit
        await client.query(
          `INSERT INTO audit_log (action, employee_id, target_employee_id, date, old_value, new_value, notes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [oldSymbol ? 'UPDATE_ATTENDANCE' : 'CREATE_ATTENDANCE', req.user.id, employee_id, date, oldSymbol, cleanSymbol, notes || 'Thay đổi chấm công']
        );
      }
    }

    await client.query('COMMIT');
    return res.json({ message: 'Lưu chấm công thành công.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Lỗi khi lưu chấm công bulk:', err);
    return res.status(400).json({ message: err.message || 'Lỗi lưu chấm công.' });
  } finally {
    client.release();
  }
};

const getAuditLogs = async (req, res) => {
  const { month, year, employee_id } = req.query;

  try {
    let queryStr = `
      SELECT l.id, l.action, l.date, l.old_value, l.new_value, l.notes, l.created_at,
             e.full_name as editor_name, t.full_name as target_name
      FROM audit_log l
      LEFT JOIN employees e ON l.employee_id = e.id
      LEFT JOIN employees t ON l.target_employee_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (month && year) {
      queryStr += ` AND EXTRACT(MONTH FROM l.date) = $${params.length + 1} AND EXTRACT(YEAR FROM l.date) = $${params.length + 2}`;
      params.push(parseInt(month, 10), parseInt(year, 10));
    }

    if (employee_id) {
      queryStr += ` AND (l.employee_id = $${params.length + 1} OR l.target_employee_id = $${params.length + 1})`;
      params.push(parseInt(employee_id, 10));
    }

    // Restriction for managers: only see logs affecting their department
    if (req.user.role === 'manager') {
      queryStr += ` AND (t.department_id = $${params.length + 1} OR l.employee_id = $${params.length + 1})`;
      params.push(req.user.department_id);
    }

    queryStr += ` ORDER BY l.created_at DESC LIMIT 100`;

    const result = await pool.query(queryStr, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('Lỗi khi lấy audit log:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const getApprovals = async (req, res) => {
  const { month, year, department_id } = req.query;

  if (!month || !year || !department_id) {
    return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ: tháng, năm và bộ phận.' });
  }

  try {
    const result = await pool.query(
      `SELECT a.*, 
              m.full_name as manager_name, 
              d.full_name as director_name
       FROM approvals a
       LEFT JOIN employees m ON a.manager_approved_by = m.id
       LEFT JOIN employees d ON a.director_approved_by = d.id
       WHERE a.department_id = $1 AND a.month = $2 AND a.year = $3`,
      [parseInt(department_id, 10), parseInt(month, 10), parseInt(year, 10)]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'draft' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Lỗi khi lấy thông tin duyệt:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const approveMonth = async (req, res) => {
  const { month, year, department_id, action } = req.body; // action: 'manager_approve', 'director_approve', 'admin_unlock'

  if (!month || !year || !department_id || !action) {
    return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin duyệt.' });
  }

  try {
    // Validate roles
    if (action === 'manager_approve') {
      if (!['manager', 'admin', 'director'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Chỉ phụ trách bộ phận mới được duyệt ở bước này.' });
      }
      if (req.user.role === 'manager' && req.user.department_id !== parseInt(department_id, 10)) {
        return res.status(403).json({ message: 'Bạn chỉ có quyền duyệt bộ phận của mình.' });
      }
    } else if (action === 'director_approve') {
      if (!['director', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Chỉ Trưởng khoa mới được duyệt ở bước này.' });
      }
    } else if (action === 'admin_unlock') {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Chỉ quản trị viên hệ thống mới được phép mở khóa bảng công.' });
      }
    }

    // Check current approval status
    const currentRes = await pool.query(
      'SELECT id, status FROM approvals WHERE department_id = $1 AND month = $2 AND year = $3',
      [parseInt(department_id, 10), parseInt(month, 10), parseInt(year, 10)]
    );

    const hasApproval = currentRes.rows.length > 0;
    const currentStatus = hasApproval ? currentRes.rows[0].status : 'draft';

    if (action === 'manager_approve') {
      if (hasApproval) {
        await pool.query(
          `UPDATE approvals 
           SET status = 'manager_approved', manager_approved_by = $1, manager_approved_at = NOW() 
           WHERE id = $2`,
          [req.user.id, currentRes.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO approvals (department_id, month, year, status, manager_approved_by, manager_approved_at) 
           VALUES ($1, $2, $3, 'manager_approved', $4, NOW())`,
          [parseInt(department_id, 10), parseInt(month, 10), parseInt(year, 10), req.user.id]
        );
      }
      return res.json({ message: 'Phụ trách bộ phận đã duyệt bảng công thành công.' });
    } else if (action === 'director_approve') {
      if (currentStatus !== 'manager_approved' && req.user.role !== 'admin') {
        return res.status(400).json({ message: 'Bảng công cần được phụ trách bộ phận duyệt trước khi Trưởng khoa phê duyệt.' });
      }

      if (hasApproval) {
        await pool.query(
          `UPDATE approvals 
           SET status = 'director_approved', director_approved_by = $1, director_approved_at = NOW() 
           WHERE id = $2`,
          [req.user.id, currentRes.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO approvals (department_id, month, year, status, director_approved_by, director_approved_at) 
           VALUES ($1, $2, $3, 'director_approved', $4, NOW())`,
          [parseInt(department_id, 10), parseInt(month, 10), parseInt(year, 10), req.user.id]
        );
      }
      return res.json({ message: 'Trưởng khoa đã phê duyệt khóa bảng công thành công.' });
    } else if (action === 'admin_unlock') {
      if (hasApproval) {
        await pool.query(
          `UPDATE approvals 
           SET status = 'draft', 
               manager_approved_by = NULL, manager_approved_at = NULL, 
               director_approved_by = NULL, director_approved_at = NULL 
           WHERE id = $1`,
          [currentRes.rows[0].id]
        );
      }
      return res.json({ message: 'Quản trị viên đã mở khóa bảng công thành công.' });
    }

    return res.status(400).json({ message: 'Hành động không hợp lệ.' });
  } catch (err) {
    console.error('Lỗi khi duyệt bảng công:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const getAttendanceTypes = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM attendance_types ORDER BY code ASC');
    return res.json(result.rows);
  } catch (err) {
    console.error('Lỗi khi lấy loại công:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const getHolidays = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM holidays ORDER BY date ASC');
    return res.json(result.rows);
  } catch (err) {
    console.error('Lỗi khi lấy ngày lễ:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

module.exports = {
  getAttendance,
  saveAttendanceBulk,
  getAuditLogs,
  getApprovals,
  approveMonth,
  getAttendanceTypes,
  getHolidays
};
