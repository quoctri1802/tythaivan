const pool = require('../config/db');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper to check if a date is a weekend (Saturday or Sunday)
const isWeekend = (dateStr) => {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6; // 0: Sunday, 6: Saturday
};

// Main preview and calculation logic
const calculateMonthlySummaries = async (month, year, departmentId) => {
  // 1. Get employees
  let empQuery = `
    SELECT id, username, full_name, role, department_id, title, 
           has_toxic_salary, has_toxic_in_kind, toxic_in_kind_level 
    FROM employees 
    WHERE role != 'admin'
  `;
  const empParams = [];
  if (departmentId) {
    empQuery += ` AND department_id = $1`;
    empParams.push(parseInt(departmentId, 10));
  }
  empQuery += ` ORDER BY id ASC`;
  const employeesRes = await pool.query(empQuery, empParams);
  const employees = employeesRes.rows;

  if (employees.length === 0) return { employees: [], summaries: [] };

  // 2. Get holidays
  const holidaysRes = await pool.query(
    `SELECT date::text FROM holidays WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2`,
    [parseInt(month, 10), parseInt(year, 10)]
  );
  const holidays = new Set(holidaysRes.rows.map(h => h.date));

  // 3. Get attendance for the month
  const attendanceRes = await pool.query(
    `SELECT employee_id, date::text, symbol 
     FROM attendance 
     WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2`,
    [parseInt(month, 10), parseInt(year, 10)]
  );
  
  // Group attendance by employee_id -> dateStr -> symbol
  const attendanceMap = {};
  attendanceRes.rows.forEach(att => {
    if (!attendanceMap[att.employee_id]) {
      attendanceMap[att.employee_id] = {};
    }
    attendanceMap[att.employee_id][att.date] = att.symbol;
  });

  // 4. Calculate days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  
  // Calculate standard working days (Mon-Fri and not holiday)
  let standardWorkingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    if (!isWeekend(dateStr) && !holidays.has(dateStr)) {
      standardWorkingDays++;
    }
  }

  // 5. Build summary for each employee
  const summaries = employees.map(emp => {
    const empAtt = attendanceMap[emp.id] || {};
    
    let countAH = 0; // Lương thời gian
    let countAI = 0; // Nghỉ không lương (No)
    let countAJ = 0; // Công trực (T)
    let countAK = 0; // Nghỉ bù (Nb)
    let countAL = 0; // Nghỉ phép (P, Pcđ)
    let countAM = 0; // Nghỉ lễ (Ngl)
    let countAN = 0; // Hưởng BHXH (Ô, Cô, Ts)

    // Trực sheet splits
    let countDutyWeekday = 0;
    let countDutyWeekend = 0;
    let countDutyHoliday = 0;

    // Toxic sheets counts
    let countToxicSalary = 0;
    let countToxicInKind = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      const symbol = empAtt[dateStr] || '';

      const isWkEnd = isWeekend(dateStr);
      const isHol = holidays.has(dateStr);
      const isWkDay = !isWkEnd && !isHol;

      // Count base columns
      if (symbol === 'No') {
        countAI++;
      } else if (symbol === 'Nb') {
        countAK++;
      } else if (['P', 'Pcđ'].includes(symbol)) {
        countAL++;
      } else if (symbol === 'Ngl') {
        countAM++;
      } else if (['Ô', 'Cô', 'Ts'].includes(symbol)) {
        countAN++;
      }

      // Count duties (T is the main duty symbol)
      if (symbol === 'T') {
        countAJ++;
        if (isHol) {
          countDutyHoliday++;
        } else if (isWkEnd) {
          countDutyWeekend++;
        } else {
          countDutyWeekday++;
        }
      }

      // Count toxic allowance by salary
      // Active days: +, -, T, Tc (and potentially others like TTc, Td, cd, BL)
      const isActiveWorking = ['+', '-', 'T', 'Tc', 'TTc', 'Td', 'cd', 'BL'].includes(symbol);
      if (emp.has_toxic_salary && isActiveWorking) {
        countToxicSalary++;
      }

      // Count toxic allowance in kind: only (+) on weekdays (x1), (BL) (x1) and (T) (x2)
      if (emp.has_toxic_in_kind) {
        if (symbol === 'T') {
          countToxicInKind += 2;
        } else if ((isWkDay && symbol === '+') || symbol === 'BL') {
          countToxicInKind += 1;
        }
      }
    }

    // AH (Lương thời gian) logic:
    // Starts with total weekdays in the month, and subtracts unpaid/BHXH days that fell on weekdays
    // Also subtracts half-days (-) by 0.5
    // And if employee worked compensatory (BL) on weekend/holiday, adds 1
    let unpaidWeekdays = 0;
    let extraWorkingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      const isWkDay = !isWeekend(dateStr) && !holidays.has(dateStr);
      const symbol = empAtt[dateStr] || '';
      if (isWkDay) {
        if (['No', 'Ô', 'Cô', 'Ts'].includes(symbol)) {
          unpaidWeekdays++;
        } else if (symbol === '-') {
          unpaidWeekdays += 0.5; // Half-day deduction
        }
      } else {
        if (symbol === 'BL') {
          extraWorkingDays++;
        }
      }
    }
    countAH = standardWorkingDays - unpaidWeekdays + extraWorkingDays;

    return {
      employee: {
        id: emp.id,
        username: emp.username,
        full_name: emp.full_name,
        title: emp.title,
        has_toxic_salary: emp.has_toxic_salary,
        has_toxic_in_kind: emp.has_toxic_in_kind,
        toxic_in_kind_level: emp.toxic_in_kind_level
      },
      attendance: empAtt,
      summaries: {
        AH: countAH,
        AI: countAI > 0 ? countAI : null,
        AJ: countAJ > 0 ? countAJ : null,
        AK: countAK > 0 ? countAK : null,
        AL: countAL > 0 ? countAL : null,
        AM: countAM > 0 ? countAM : null,
        AN: countAN > 0 ? countAN : null
      },
      duty: {
        has_duty: countAJ > 0,
        weekday: countDutyWeekday > 0 ? countDutyWeekday : null,
        weekend: countDutyWeekend > 0 ? countDutyWeekend : null,
        holiday: countDutyHoliday > 0 ? countDutyHoliday : null,
        total: countAJ > 0 ? countAJ : null
      },
      toxic: {
        salary: countToxicSalary > 0 ? countToxicSalary : null,
        in_kind: countToxicInKind > 0 ? countToxicInKind : null
      }
    };
  });

  return {
    month: parseInt(month, 10),
    year: parseInt(year, 10),
    standardWorkingDays,
    holidays: Array.from(holidays),
    data: summaries
  };
};

const getReportPreview = async (req, res) => {
  const { month, year, department_id } = req.query;

  if (!month || !year) {
    return res.status(400).json({ message: 'Vui lòng cung cấp tháng và năm.' });
  }

  // Fallback to user's department for manager
  const deptId = req.user.role === 'manager' ? req.user.department_id : (department_id || null);

  try {
    const reportData = await calculateMonthlySummaries(month, year, deptId);
    return res.json(reportData);
  } catch (err) {
    console.error('Lỗi khi tải bản xem trước báo cáo:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

const exportExcel = async (req, res) => {
  const { month, year, department_id } = req.query;

  if (!month || !year) {
    return res.status(400).json({ message: 'Vui lòng cung cấp tháng và năm.' });
  }

  const deptId = req.user.role === 'manager' ? req.user.department_id : (department_id || null);

  try {
    // 1. Calculate summaries data
    const reportData = await calculateMonthlySummaries(month, year, deptId);

    // Get department name
    let deptName = 'Khoa Dược-Thiết bị Y tế và Cận lâm sàng';
    if (deptId) {
      const deptRes = await pool.query('SELECT name FROM departments WHERE id = $1', [deptId]);
      if (deptRes.rows.length > 0) {
        deptName = deptRes.rows[0].name;
      }
    } else {
      const deptRes = await pool.query('SELECT name FROM departments LIMIT 1');
      if (deptRes.rows.length > 0) {
        deptName = deptRes.rows[0].name;
      }
    }

    // Get signatures name based on database
    // People:
    // - Người chấm công: Current user full_name
    // - Phụ trách bộ phận: Manager of the department
    // - Thủ trưởng: The Director user
    const writerName = req.user.full_name;
    
    let managerName = '...............................';
    if (deptId) {
      const managerRes = await pool.query("SELECT full_name FROM employees WHERE department_id = $1 AND role = 'manager' LIMIT 1", [deptId]);
      if (managerRes.rows.length > 0) {
        managerName = managerRes.rows[0].full_name;
      }
    }

    let directorName = '...............................';
    const directorRes = await pool.query("SELECT full_name FROM employees WHERE role = 'director' LIMIT 1");
    if (directorRes.rows.length > 0) {
      directorName = directorRes.rows[0].full_name;
    }

    // Package metadata for python script
    const payload = {
      month: parseInt(month, 10),
      year: parseInt(year, 10),
      department_name: deptName,
      writer_name: writerName,
      manager_name: managerName,
      director_name: directorName,
      reportData: reportData
    };

    // 2. Write temp json file
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    const tempJsonPath = path.join(tempDir, `report_${month}_${year}_${Date.now()}.json`);
    const outputExcelPath = path.join(tempDir, `Bao_cao_cham_cong_T${month}_${year}_${Date.now()}.xlsx`);

    fs.writeFileSync(tempJsonPath, JSON.stringify(payload, null, 2), 'utf8');

    // 3. Call Node.js excel_generator.js script
    const scriptPath = path.join(__dirname, '..', 'utils', 'excel_generator.js');

    console.log(`Spawning node process to generate excel...`);
    const pythonProcess = spawn('node', [scriptPath, tempJsonPath, outputExcelPath]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      // Clean up temp JSON
      try {
        fs.unlinkSync(tempJsonPath);
      } catch (e) {}

      if (code !== 0) {
        console.error('Node excel generator script failed with code', code);
        console.error('Stderr:', stderr);
        return res.status(500).json({ message: 'Lỗi xuất Excel từ script ExcelJS.', error: stderr });
      }

      // Stream file to response
      if (!fs.existsSync(outputExcelPath)) {
        return res.status(500).json({ message: 'File Excel đầu ra không được tạo thành công.' });
      }

      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Bao_cao_cham_cong_Thang_${month}_${year}.xlsx`);

      const fileStream = fs.createReadStream(outputExcelPath);
      fileStream.pipe(res);

      fileStream.on('end', () => {
        // Clean up output Excel after download
        try {
          fs.unlinkSync(outputExcelPath);
        } catch (e) {}
      });
    });

  } catch (err) {
    console.error('Lỗi khi chuẩn bị xuất báo cáo:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ.' });
  }
};

module.exports = {
  getReportPreview,
  exportExcel
};
