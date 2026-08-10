import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export default function Dashboard({ user, token, setActivePage }) {
  const today = new Date();
  const currentRealMonth = today.getMonth() + 1;
  const currentRealYear = today.getFullYear();
  
  // Format today's date: YYYY-MM-DD
  const todayDateStr = `${currentRealYear}-${currentRealMonth.toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
  
  // Vietnamese weekday name
  const getVietnameseWeekday = () => {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    return days[today.getDay()];
  };

  const [month, setMonth] = useState(7); // Default to July for demo data
  const [year, setYear] = useState(2026); // Default to 2026 for demo data
  
  const [stats, setStats] = useState({
    workDays: 0,
    duties: 0,
    leaves: 0,
    unpaid: 0,
    toxicSalary: 0,
    toxicInKind: 0,
    vaccinations: 0,
    deptWorkDays: 0,
    deptDuties: 0,
    deptVaccinations: 0,
    employeeCount: 0
  });
  const [approvalStatus, setApprovalStatus] = useState('draft');
  const [loading, setLoading] = useState(true);

  // Today's check-in state
  const [todaySymbol, setTodaySymbol] = useState('+');
  const [todayNotes, setTodayNotes] = useState('');
  const [todaySaved, setTodaySaved] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayMessage, setTodayMessage] = useState('');

  useEffect(() => {
    fetchStats();
    if (user.role === 'employee' || user.role === 'manager') {
      fetchTodayAttendance();
    }
  }, [user, month, year]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const url = `${API_BASE_URL}/api/attendance?month=${month}&year=${year}${
        user.role === 'employee' ? '' : `&department_id=${user.department_id || 1}`
      }`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();

      if (response.ok) {
        calculateStats(data);
      }

      if (user.department_id) {
        const appResponse = await fetch(`${API_BASE_URL}/api/attendance/approvals?month=${month}&year=${year}&department_id=${user.department_id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const appData = await appResponse.json();
        if (appResponse.ok && appData.status) {
          setApprovalStatus(appData.status);
        } else {
          setApprovalStatus('draft');
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải thống kê:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTodayAttendance = async () => {
    try {
      // Query records for current real month/year to see today's status
      const response = await fetch(`${API_BASE_URL}/api/attendance?month=${currentRealMonth}&year=${currentRealYear}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (response.ok) {
        const todayRecord = data.find(r => {
          const rDateStr = new Date(r.date).toISOString().split('T')[0];
          return rDateStr === todayDateStr && r.employee_id === user.id;
        });

        if (todayRecord) {
          setTodaySymbol(todayRecord.symbol);
          setTodayNotes(todayRecord.notes || '');
          setTodaySaved(true);
        } else {
          setTodaySymbol('+');
          setTodayNotes('');
          setTodaySaved(false);
        }
      }
    } catch (err) {
      console.error('Lỗi khi lấy thông tin chấm công hôm nay:', err);
    }
  };

  const handleTodayCheckIn = async (e) => {
    e.preventDefault();
    try {
      setTodayLoading(true);
      setTodayMessage('');

      const response = await fetch(`${API_BASE_URL}/api/attendance/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          updates: [{
            employee_id: user.id,
            date: todayDateStr,
            symbol: todaySymbol,
            notes: todayNotes
          }]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Lỗi lưu chấm công.');

      setTodaySaved(true);
      setTodayMessage('Đã chấm công hôm nay thành công!');
      
      // If we are currently viewing the current month/year, refresh stats
      if (month === currentRealMonth && year === currentRealYear) {
        fetchStats();
      }
    } catch (err) {
      setTodayMessage(`Lỗi: ${err.message}`);
    } finally {
      setTodayLoading(false);
    }
  };

  const calculateStats = (records) => {
    // 1. Calculate personal stats (for employee or manager)
    let w = 0, d = 0, l = 0, u = 0, ts = 0, tk = 0, vac = 0;
    const personalRecords = records.filter(r => r.employee_id === user.id);
    
    personalRecords.forEach(r => {
      const sym = r.symbol;
      if (['+', '-'].includes(sym)) w += (sym === '+' ? 1 : 0.5);
      if (r.symbol === 'T') d++;
      if (r.symbol === 'Tc') vac++;
      if (['P', 'Pcđ', 'BL'].includes(sym)) l++;
      if (sym === 'No') u++;
      
      const isActive = ['+', '-', 'T', 'Tc', 'TTc', 'Td', 'cd'].includes(sym);
      if (user.has_toxic_salary && isActive) ts++;
      
      if (user.has_toxic_in_kind) {
        if (sym === 'T') {
          tk += 2;
        } else {
          const dateObj = new Date(r.date);
          const isWkDay = dateObj.getDay() !== 0 && dateObj.getDay() !== 6;
          if (isWkDay && sym === '+') {
            tk += 1;
          }
        }
      }
    });

    // 2. Calculate department stats (for manager or director or admin)
    let totalW = 0, totalD = 0, totalVac = 0, employeesSet = new Set();
    records.forEach(r => {
      employeesSet.add(r.employee_id);
      const sym = r.symbol;
      if (['+', '-'].includes(sym)) totalW += (sym === '+' ? 1 : 0.5);
      if (sym === 'T') totalD++;
      if (sym === 'Tc') totalVac++;
    });

    setStats({
      workDays: w,
      duties: d,
      leaves: l,
      unpaid: u,
      toxicSalary: ts,
      toxicInKind: tk,
      vaccinations: vac,
      deptWorkDays: totalW,
      deptDuties: totalD,
      deptVaccinations: totalVac,
      employeeCount: employeesSet.size
    });
  };

  const getApprovalText = (status) => {
    switch (status) {
      case 'director_approved': return 'Đã phê duyệt (Đã khóa bảng công)';
      case 'manager_approved': return 'Đang chờ thủ trưởng duyệt (Phụ trách đã duyệt)';
      default: return 'Bản nháp (Chưa duyệt)';
    }
  };

  const getApprovalClass = (status) => {
    switch (status) {
      case 'director_approved': return 'status-badge status-approved-director';
      case 'manager_approved': return 'status-badge status-approved-manager';
      default: return 'status-badge status-draft';
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>HỆ THỐNG TRẠM Y TẾ</p>
          <h1 style={{ marginBottom: '4px' }}>Chào mừng, {user.full_name}</h1>
          <p style={{ color: 'var(--text-muted)' }}>Vai trò: <b>{user.title || 'Nhân viên'}</b> | Khoa: <b>{user.department_name || 'Hành chính'}</b></p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {user.role !== 'admin' && (
            <div className="user-badge" style={{ padding: '6px 12px' }}>
              <span className={getApprovalClass(approvalStatus)}>
                {getApprovalText(approvalStatus)}
              </span>
            </div>
          )}

          {/* Month selector for stats */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <select className="form-select" style={{ width: '90px', padding: '8px 12px' }} value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>T.{m}</option>
              ))}
            </select>
            <select className="form-select" style={{ width: '100px', padding: '8px 12px' }} value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 1. PERSONAL SECTION (For Employee and Department Manager) */}
      {['employee', 'manager'].includes(user.role) && (
        <div style={{ marginBottom: '32px' }}>
          {/* Today Quick Check-in Card (High Mobile UX) */}
          <div className="glass-card" style={{ marginBottom: '32px', borderLeft: '4px solid var(--primary)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px', color: '#fff' }}>
              📲 Chấm Công Nhanh Hôm Nay (Cá nhân)
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {getVietnameseWeekday()}, ngày {today.getDate().toString().padStart(2, '0')}/{currentRealMonth.toString().padStart(2, '0')}/{currentRealYear}
            </p>

            {todayMessage && (
              <div style={{
                backgroundColor: todayMessage.includes('Lỗi') ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                border: `1px solid ${todayMessage.includes('Lỗi') ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                color: todayMessage.includes('Lỗi') ? 'var(--color-sick)' : 'var(--color-rest)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                marginBottom: '16px'
              }}>{todayMessage}</div>
            )}

            <form onSubmit={handleTodayCheckIn} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px' }}>Ký hiệu công</label>
                  <select 
                    className="form-select" 
                    style={{ padding: '10px 12px', fontSize: '14px' }}
                    value={todaySymbol}
                    onChange={(e) => setTodaySymbol(e.target.value)}
                    disabled={todayLoading}
                  >
                    <option value="+">+ : Có mặt đầy đủ (≥ 4h)</option>
                    <option value="-">- : Có mặt nửa buổi (&lt; 4h)</option>
                    <option value="T">T : Trực chuyên môn 24h</option>
                    <option value="Nb">Nb : Nghỉ bù chế độ</option>
                    <option value="P">P : Nghỉ phép năm</option>
                    <option value="No">No : Nghỉ không lương</option>
                    <option value="Ô">Ô : Nghỉ ốm hưởng BHXH</option>
                    <option value="H">H : Hội nghị học tập</option>
                    <option value="CT">CT : Đi công tác</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px' }}>Ghi chú ca / lý do</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ padding: '10px 12px', fontSize: '14px' }}
                    placeholder="Không có ghi chú"
                    value={todayNotes}
                    onChange={(e) => setTodayNotes(e.target.value)}
                    disabled={todayLoading}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ flex: 1, padding: '10px', fontSize: '14px' }}
                  disabled={todayLoading}
                >
                  {todayLoading ? 'Đang gửi...' : (todaySaved ? '🔄 Cập nhật chấm công hôm nay' : '📝 Gửi chấm công hôm nay')}
                </button>
                {todaySaved && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: 'var(--color-rest)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0 16px',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}>
                    ✓ Đã ghi nhận ({todaySymbol})
                  </div>
                )}
              </div>
            </form>
          </div>

          <h2 style={{ marginBottom: '20px', color: 'var(--primary-light)' }}>Thống Kê Cá Nhân - Tháng {month}/{year}</h2>
          
          <div className="metrics-row" style={{ marginBottom: '32px' }}>
            <div className="glass-card metric-card">
              <div className="metric-icon">📅</div>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Ngày công hưởng lương</p>
                <div className="metric-val" style={{ color: 'var(--primary-light)' }}>{stats.workDays}</div>
              </div>
            </div>

            <div className="glass-card metric-card">
              <div className="metric-icon">⏰</div>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Ngày công trực (24h)</p>
                <div className="metric-val" style={{ color: 'var(--color-duty)' }}>{stats.duties}</div>
              </div>
            </div>

            <div className="glass-card metric-card">
              <div className="metric-icon">🏝️</div>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Ngày nghỉ (phép/lễ/bù)</p>
                <div className="metric-val" style={{ color: 'var(--color-leave)' }}>{stats.leaves}</div>
              </div>
            </div>

            <div className="glass-card metric-card">
              <div className="metric-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-light)' }}>💉</div>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Ngày tiêm chủng dịch vụ</p>
                <div className="metric-val" style={{ color: 'var(--accent-light)' }}>{stats.vaccinations} công</div>
              </div>
            </div>

            <div className="glass-card metric-card">
              <div className="metric-icon">🛡️</div>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Độc hại theo lương / Hiện vật</p>
                <div className="metric-val" style={{ fontSize: '18px', color: 'var(--color-holiday)', marginTop: '4px' }}>
                  {user.has_toxic_salary ? `${stats.toxicSalary} công` : 'Không'} / {user.has_toxic_in_kind ? `${stats.toxicInKind} công` : 'Không'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. MANAGEMENT & DEPARTMENT SECTION (For Manager, Director, and Admin) */}
      {['manager', 'director', 'admin'].includes(user.role) && (
        <div style={{ marginTop: user.role === 'manager' ? '32px' : '0' }}>
          <h2 style={{ marginBottom: '20px', color: 'var(--primary-light)' }}>
            {user.role === 'manager' ? 'Thống Kê Khoa / Bộ Phận' : 'Thống Kê Toàn Đơn Vị'} - Tháng {month}/{year}
          </h2>
          
          <div className="metrics-row" style={{ marginBottom: '32px' }}>
            <div className="glass-card metric-card">
              <div className="metric-icon">👥</div>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Nhân viên trong khoa</p>
                <div className="metric-val" style={{ color: '#fff' }}>{stats.employeeCount || 7}</div>
              </div>
            </div>

            <div className="glass-card metric-card">
              <div className="metric-icon">📅</div>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tổng công làm việc</p>
                <div className="metric-val" style={{ color: 'var(--primary-light)' }}>{stats.deptWorkDays}</div>
              </div>
            </div>

            <div className="glass-card metric-card">
              <div className="metric-icon">⏰</div>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tổng số ca trực đã chấm</p>
                <div className="metric-val" style={{ color: 'var(--color-duty)' }}>{stats.deptDuties}</div>
              </div>
            </div>

            <div className="glass-card metric-card">
              <div className="metric-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-light)' }}>💉</div>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Tổng công tiêm chủng</p>
                <div className="metric-val" style={{ color: 'var(--accent-light)' }}>{stats.deptVaccinations} ca</div>
              </div>
            </div>

            <div className="glass-card metric-card">
              <div className="metric-icon">📁</div>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Trạng thái bảng công</p>
                <div className="metric-val" style={{ fontSize: '16px', color: 'var(--color-leave)', marginTop: '8px' }}>
                  {getApprovalText(approvalStatus)}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📋 Tác vụ Quản lý
              </h3>
              <p style={{ fontSize: '14px', marginBottom: '20px' }}>Chỉnh sửa bảng chấm công tổng hợp của khoa, điền lý do trực hoặc nghỉ, xem lịch sử thay đổi để đảm bảo tính minh bạch.</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-primary" onClick={() => setActivePage('attendance')}>
                  Chỉnh sửa công
                </button>
                <button className="btn btn-secondary" onClick={() => setActivePage('report')}>
                  Xem báo cáo & Xuất Excel
                </button>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚙️ Danh mục & Cài đặt
              </h3>
              <p style={{ fontSize: '14px', marginBottom: '20px' }}>Thêm mới nhân viên, điều chỉnh thông tin chức vụ, đăng ký đối tượng hưởng chế độ phụ cấp độc hại, và cấu hình lịch nghỉ lễ của năm.</p>
              <button className="btn btn-secondary" onClick={() => setActivePage('settings')}>
                Quản lý Danh mục
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. SUBTITLE EXTRA ACTION FOR EMPLOYEE ONLY */}
      {user.role === 'employee' && (
        <div className="glass-card" style={{ padding: '24px', marginTop: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Chỉnh sửa nâng cao</h3>
          <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>Xem chi tiết toàn bộ các ngày trong tháng, điều chỉnh chấm công các ngày trước hoặc xem lịch nghỉ lễ của khoa phòng.</p>
          <button className="btn btn-primary" onClick={() => setActivePage('attendance')}>
            📅 Xem chi tiết lịch tháng
          </button>
        </div>
      )}
    </div>
  );
}
