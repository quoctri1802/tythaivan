const pool = require('./db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const seedDataPath = "C:\\Users\\Admin\\.gemini\\antigravity\\brain\\bb5183e9-c472-4097-93bc-770bbef494f8\\scratch\\attendance_seed.json";

const ddl = `
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS attendance_types CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'director', 'employee')),
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    title VARCHAR(100),
    has_toxic_salary BOOLEAN DEFAULT FALSE,
    has_toxic_in_kind BOOLEAN DEFAULT FALSE,
    toxic_in_kind_level INT DEFAULT 3
);

CREATE TABLE attendance_types (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_paid BOOLEAN DEFAULT TRUE,
    is_toxic_salary BOOLEAN DEFAULT FALSE,
    is_toxic_in_kind BOOLEAN DEFAULT FALSE,
    is_duty BOOLEAN DEFAULT FALSE
);

CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    symbol VARCHAR(10) REFERENCES attendance_types(code),
    notes TEXT,
    updated_by INT REFERENCES employees(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_employee_date UNIQUE (employee_id, date)
);

CREATE TABLE approvals (
    id SERIAL PRIMARY KEY,
    department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    month INT NOT NULL,
    year INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'manager_approved', 'director_approved')),
    manager_approved_by INT REFERENCES employees(id),
    manager_approved_at TIMESTAMP,
    director_approved_by INT REFERENCES employees(id),
    director_approved_at TIMESTAMP,
    CONSTRAINT unique_dept_month_year UNIQUE (department_id, month, year)
);

CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    employee_id INT REFERENCES employees(id) ON DELETE SET NULL,
    target_employee_id INT REFERENCES employees(id) ON DELETE SET NULL,
    date DATE,
    old_value VARCHAR(10),
    new_value VARCHAR(10),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE holidays (
    date DATE PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);
`;

const attendanceTypes = [
  // Lương thời gian
  { code: '+', name: 'Có mặt ≥ 4h', is_paid: true, is_toxic_salary: true, is_toxic_in_kind: true, is_duty: false },
  { code: '-', name: 'Có mặt < 4h (Nửa công)', is_paid: true, is_toxic_salary: true, is_toxic_in_kind: true, is_duty: false },
  // Trực
  { code: 'T', name: 'Trực thường (24h)', is_paid: true, is_toxic_salary: true, is_toxic_in_kind: true, is_duty: true },
  { code: 'Tc', name: 'Tiêm chủng', is_paid: true, is_toxic_salary: true, is_toxic_in_kind: true, is_duty: false },
  { code: 'TTc', name: 'Trực tiêm chủng', is_paid: true, is_toxic_salary: true, is_toxic_in_kind: true, is_duty: true },
  { code: 'Td', name: 'Trực dịch', is_paid: true, is_toxic_salary: true, is_toxic_in_kind: true, is_duty: true },
  { code: 'cd', name: 'Chống dịch', is_paid: true, is_toxic_salary: true, is_toxic_in_kind: true, is_duty: true },
  // Nghỉ
  { code: 'Nb', name: 'Nghỉ bù', is_paid: true, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false },
  { code: 'No', name: 'Nghỉ không lương', is_paid: false, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false },
  { code: 'P', name: 'Nghỉ phép', is_paid: true, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false },
  { code: 'Pcđ', name: 'Phép chế độ', is_paid: true, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false },
  { code: 'BL', name: 'Bù lễ', is_paid: true, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false },
  { code: 'Ngl', name: 'Nghỉ lễ', is_paid: true, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false },
  // Ốm / Thai sản
  { code: 'Ô', name: 'Nghỉ ốm', is_paid: false, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false }, // BHXH trả
  { code: 'Cô', name: 'Con ốm', is_paid: false, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false }, // BHXH trả
  { code: 'Ts', name: 'Thai sản', is_paid: false, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false }, // BHXH trả
  // Khác
  { code: 'H', name: 'Hội nghị học tập', is_paid: true, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false },
  { code: 'CT', name: 'Công tác', is_paid: true, is_toxic_salary: false, is_toxic_in_kind: false, is_duty: false },
];

const holidays2026 = [
  { date: '2026-01-01', name: 'Tết Dương lịch' },
  { date: '2026-02-16', name: 'Tết Nguyên đán (Mùng 1)' },
  { date: '2026-02-17', name: 'Tết Nguyên đán (Mùng 2)' },
  { date: '2026-02-18', name: 'Tết Nguyên đán (Mùng 3)' },
  { date: '2026-02-19', name: 'Tết Nguyên đán (Mùng 4)' },
  { date: '2026-02-20', name: 'Tết Nguyên đán (Mùng 5)' },
  { date: '2026-04-26', name: 'Giỗ tổ Hùng Vương' },
  { date: '2026-04-27', name: 'Nghỉ bù Giỗ tổ Hùng Vương' },
  { date: '2026-04-30', name: 'Ngày Chiến thắng 30/4' },
  { date: '2026-05-01', name: 'Ngày Quốc tế Lao động' },
  { date: '2026-09-02', name: 'Ngày Quốc khánh' },
  { date: '2026-09-03', name: 'Ngày Quốc khánh (Bổ sung)' },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('Starting DB migration...');
    await client.query('BEGIN');
    
    // 1. Run DDL
    await client.query(ddl);
    console.log('Tables created successfully.');
    
    // 2. Insert Departments
    const deptResult = await client.query(
      `INSERT INTO departments (name) VALUES ('Khoa Dược-Thiết bị y tế và Cận lâm sàng') RETURNING id`
    );
    const mainDeptId = deptResult.rows[0].id;
    console.log(`Department created with ID: ${mainDeptId}`);
    
    // 3. Insert Attendance Types
    for (const type of attendanceTypes) {
      await client.query(
        `INSERT INTO attendance_types (code, name, is_paid, is_toxic_salary, is_toxic_in_kind, is_duty) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [type.code, type.name, type.is_paid, type.is_toxic_salary, type.is_toxic_in_kind, type.is_duty]
      );
    }
    console.log('Attendance types seeded.');

    // 4. Insert Holidays
    for (const hol of holidays2026) {
      await client.query(
        `INSERT INTO holidays (date, name) VALUES ($1, $2)`,
        [hol.date, hol.name]
      );
    }
    console.log('Holidays seeded.');

    // 5. Insert System Users (Admin, Director)
    const adminHash = await bcrypt.hash('admin123', 10);
    const directorHash = await bcrypt.hash('director123', 10);
    
    await client.query(
      `INSERT INTO employees (username, password, full_name, role, department_id, title) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['admin', adminHash, 'Quản trị viên Hệ thống', 'admin', null, 'Quản trị viên']
    );
    
    const directorResult = await client.query(
      `INSERT INTO employees (username, password, full_name, role, department_id, title) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['director', directorHash, 'Bác sĩ Nguyễn Văn Trưởng', 'director', null, 'Trưởng trạm / Thủ trưởng']
    );
    const directorId = directorResult.rows[0].id;
    console.log('System roles (admin, director) seeded.');

    let managerId = null;

    // 6. Insert Employees from JSON and Seed Attendance
    if (fs.existsSync(seedDataPath)) {
      const employeesSeed = JSON.parse(fs.readFileSync(seedDataPath, 'utf8'));
      
      for (const emp of employeesSeed) {
        // Hash password: username (without dot) + 123
        const cleanUsername = emp.username.replace('.', '');
        const plainPassword = cleanUsername + '123';
        const passHash = await bcrypt.hash(plainPassword, 10);
        
        // Determine role and title: Nguyen Thi Hoang Hieu is the manager/Phu trach
        const role = emp.username === 'hieu.nth' ? 'manager' : 'employee';
        const title = emp.username === 'hieu.nth' ? 'Phụ trách bộ phận' : 'Nhân viên';
        
        const empResult = await client.query(
          `INSERT INTO employees (username, password, full_name, role, department_id, title, has_toxic_salary, has_toxic_in_kind) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [emp.username, passHash, emp.full_name, role, mainDeptId, title, emp.has_toxic_salary, emp.has_toxic_in_kind]
        );
        const empId = empResult.rows[0].id;
        console.log(`Seeded employee: ${emp.full_name} (${emp.username}) with password: ${plainPassword}`);
        
        if (role === 'manager') {
          managerId = empId;
        }

        // Seed attendance days (July 2026)
        for (const [dayStr, symbol] of Object.entries(emp.days)) {
          if (symbol && symbol.trim() !== '') {
            const dayInt = parseInt(dayStr, 10);
            const dateStr = `2026-07-${dayInt.toString().padStart(2, '0')}`;
            
            await client.query(
              `INSERT INTO attendance (employee_id, date, symbol, updated_by) 
               VALUES ($1, $2, $3, $4)`,
              [empId, dateStr, symbol, directorId]
            );
          }
        }
      }
      console.log('Employee attendance data seeded.');
    } else {
      console.warn(`Seeding file not found at ${seedDataPath}. Skipping attendance seed.`);
    }

    // 7. Seed sample Approval for July 2026
    if (managerId) {
      await client.query(
        `INSERT INTO approvals (department_id, month, year, status, manager_approved_by, manager_approved_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [mainDeptId, 7, 2026, 'manager_approved', managerId, new Date('2026-07-31T17:00:00Z')]
      );
      console.log('Sample approval seeded.');
    }

    await client.query('COMMIT');
    console.log('Database initialization completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during database initialization:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
