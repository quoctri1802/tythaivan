const pool = require('./config/db');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWeekend = (dateStr) => {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6;
};

async function testExport() {
  const month = 7;
  const year = 2026;
  const deptId = 1; // Khoa Dược

  try {
    console.log("1. Fetching data from Neon DB...");
    
    // Employees
    const employeesRes = await pool.query(
      `SELECT id, username, full_name, role, department_id, title, 
              has_toxic_salary, has_toxic_in_kind, toxic_in_kind_level 
       FROM employees 
       WHERE role != 'admin' AND role != 'director' AND department_id = $1
       ORDER BY id ASC`,
      [deptId]
    );
    const employees = employeesRes.rows;
    console.log(`Found ${employees.length} employees.`);

    // Holidays
    const holidaysRes = await pool.query(
      `SELECT date::text FROM holidays WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2`,
      [month, year]
    );
    const holidays = new Set(holidaysRes.rows.map(h => h.date));
    console.log(`Found ${holidays.size} holidays in July 2026.`);

    // Attendance
    const attendanceRes = await pool.query(
      `SELECT employee_id, date::text, symbol 
       FROM attendance 
       WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2`,
      [month, year]
    );
    console.log(`Found ${attendanceRes.rows.length} attendance records.`);

    const attendanceMap = {};
    attendanceRes.rows.forEach(att => {
      if (!attendanceMap[att.employee_id]) {
        attendanceMap[att.employee_id] = {};
      }
      attendanceMap[att.employee_id][att.date] = att.symbol;
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    let standardWorkingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      if (!isWeekend(dateStr) && !holidays.has(dateStr)) {
        standardWorkingDays++;
      }
    }
    console.log(`Standard working days: ${standardWorkingDays}`);

    const summaries = employees.map(emp => {
      const empAtt = attendanceMap[emp.id] || {};
      let countAH = 0, countAI = 0, countAJ = 0, countAK = 0, countAL = 0, countAM = 0;
      let countDutyWeekday = 0, countDutyWeekend = 0, countDutyHoliday = 0;
      let countToxicSalary = 0, countToxicInKind = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
        const symbol = empAtt[dateStr] || '';
        const isWkEnd = isWeekend(dateStr);
        const isHol = holidays.has(dateStr);
        const isWkDay = !isWkEnd && !isHol;

        if (symbol === 'No') countAI++;
        else if (symbol === 'Nb') countAK++;
        else if (['P', 'Pcđ', 'BL'].includes(symbol)) countAL++;
        else if (['Ô', 'Cô', 'Ts'].includes(symbol)) countAM++;

        if (symbol === 'T') {
          countAJ++;
          if (isHol) countDutyHoliday++;
          else if (isWkEnd) countDutyWeekend++;
          else countDutyWeekday++;
        }

        const isActive = ['+', '-', 'T', 'Tc', 'TTc', 'Td', 'cd'].includes(symbol);
        if (emp.has_toxic_salary && isActive) countToxicSalary++;
        
        if (emp.has_toxic_in_kind) {
          if (symbol === 'T') {
            countToxicInKind += 2;
          } else if (isWkDay) {
            if (['+', 'Tc', 'CT', 'H'].includes(symbol)) {
              countToxicInKind += 1;
            } else if (symbol === '-') {
              countToxicInKind += 0.5;
            }
          }
        }
      }

      let unpaidWeekdays = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
        const isWkDay = !isWeekend(dateStr) && !holidays.has(dateStr);
        if (isWkDay) {
          const symbol = empAtt[dateStr] || '';
          if (['No', 'Ô', 'Cô', 'Ts'].includes(symbol)) unpaidWeekdays++;
          else if (symbol === '-') unpaidWeekdays += 0.5;
        }
      }
      countAH = standardWorkingDays - unpaidWeekdays;

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
          AM: countAM > 0 ? countAM : null
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

    const reportData = {
      month,
      year,
      standardWorkingDays,
      data: summaries
    };

    const payload = {
      month,
      year,
      department_name: 'Khoa Dược-Thiết bị y tế và Cận lâm sàng',
      writer_name: 'Nguyễn Thị Hoàng Hiếu',
      manager_name: 'Nguyễn Thị Hoàng Hiếu',
      director_name: 'Bác sĩ Nguyễn Văn Trưởng',
      reportData
    };

    console.log("2. Writing temp payload JSON...");
    const tempJsonPath = path.join(__dirname, 'temp_test_payload.json');
    const outputExcelPath = path.join(__dirname, '..', 'Bao_cao_cham_cong_Thang_7_2026_TEST.xlsx');

    fs.writeFileSync(tempJsonPath, JSON.stringify(payload, null, 2), 'utf8');

    console.log("3. Invoking python excel_generator.py...");
    const pythonProcess = spawn('python', [
      path.join(__dirname, 'utils', 'excel_generator.py'),
      tempJsonPath,
      outputExcelPath
    ]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => stdout += data.toString());
    pythonProcess.stderr.on('data', (data) => stderr += data.toString());

    pythonProcess.on('close', (code) => {
      // Clean up
      try {
        fs.unlinkSync(tempJsonPath);
      } catch (e) {}

      if (code !== 0) {
        console.error("❌ Python script failed with code", code);
        console.error("Stderr:", stderr);
      } else {
        console.log(`\n=== TEST SUCCESSFUL ===`);
        console.log(`Excel file created at: g:\\QL cham cong\\Bao_cao_cham_cong_Thang_7_2026_TEST.xlsx`);
        console.log(`Output: ${stdout}`);
      }
      pool.end();
    });

  } catch (err) {
    console.error("❌ Test failed:", err);
    pool.end();
  }
}

testExport();
