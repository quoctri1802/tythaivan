import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export default function AttendanceTable({ user, token }) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({}); // employee_id -> dateStr -> { symbol, notes }
  const [attendanceTypes, setAttendanceTypes] = useState([]);
  const [holidays, setHolidays] = useState(new Set());
  const [approval, setApproval] = useState({ status: 'draft' });
  const [auditLogs, setAuditLogs] = useState([]);
  
  // Unsaved edits state: employee_id -> dateStr -> { symbol, notes }
  const [unsavedEdits, setUnsavedEdits] = useState({});
  const [selectedCell, setSelectedCell] = useState(null); // { employee, dateStr, day }
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [cellNotes, setCellNotes] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [month, year]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setMessage({ text: '', type: '' });
      setUnsavedEdits({});

      const deptId = user.role === 'manager' ? user.department_id : (user.department_id || 1);

      // 1. Get employees
      if (user.role === 'employee') {
        setEmployees([user]);
      } else {
        const empRes = await fetch(`${API_BASE_URL}/api/employees`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const empData = await empRes.json();
        setEmployees(empData.filter(e => e.department_id === deptId));
      }

      // 2. Get attendance types
      const typeRes = await fetch(`${API_BASE_URL}/api/attendance/types`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const typeData = await typeRes.json();
      setAttendanceTypes(typeData);

      // 3. Get holidays
      const holRes = await fetch(`${API_BASE_URL}/api/attendance/holidays`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const holData = await holRes.json();
      const holSet = new Set(holData.map(h => {
        // Format to YYYY-MM-DD
        return new Date(h.date).toISOString().split('T')[0];
      }));
      setHolidays(holSet);

      // 4. Get attendance records for month
      const attRes = await fetch(`${API_BASE_URL}/api/attendance?month=${month}&year=${year}&department_id=${deptId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const attData = await attRes.json();

      // Convert to employee_id -> dateStr -> { symbol, notes }
      const attMap = {};
      attData.forEach(r => {
        if (!attMap[r.employee_id]) {
          attMap[r.employee_id] = {};
        }
        const dStr = new Date(r.date).toISOString().split('T')[0];
        attMap[r.employee_id][dStr] = { symbol: r.symbol, notes: r.notes || '' };
      });
      setAttendance(attMap);

      // 5. Get Approval
      const appRes = await fetch(`${API_BASE_URL}/api/attendance/approvals?month=${month}&year=${year}&department_id=${deptId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const appData = await appRes.json();
      setApproval(appData);

      // 6. Get Audit Logs
      fetchAuditLogs();

    } catch (err) {
      console.error(err);
      setMessage({ text: 'Lỗi tải thông tin chấm công.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/attendance/audit-log?month=${month}&year=${year}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAuditLogs(data);
    } catch (e) {
      console.error(e);
    }
  };

  const getDaysInMonth = () => {
    return new Date(year, month, 0).getDate();
  };

  const isWeekendDay = (day) => {
    const dStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const date = new Date(dStr);
    const wDay = date.getDay();
    return wDay === 0 || wDay === 6;
  };

  const getDayName = (day) => {
    const dStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const date = new Date(dStr);
    const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return names[date.getDay()];
  };

  const handleCellClick = (employee, day) => {
    // If locked by Director, only allow admin to edit
    if (approval.status === 'director_approved' && user.role !== 'admin') {
      setMessage({ text: 'Bảng công đã được Trưởng khoa phê duyệt khóa, không thể chỉnh sửa.', type: 'danger' });
      return;
    }

    // If approved by Manager, only allow manager/director/admin to edit
    if (approval.status === 'manager_approved' && user.role === 'employee') {
      setMessage({ text: 'Bảng công đã được Phụ trách bộ phận duyệt, vui lòng liên hệ phụ trách để điều chỉnh.', type: 'danger' });
      return;
    }

    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    
    // Find current values
    const saved = (attendance[employee.id] || {})[dateStr] || { symbol: '', notes: '' };
    const unsaved = (unsavedEdits[employee.id] || {})[dateStr];
    
    const activeSymbol = unsaved ? unsaved.symbol : saved.symbol;
    const activeNotes = unsaved ? unsaved.notes : saved.notes;

    setSelectedCell({ employee, day, dateStr });
    setSelectedSymbol(activeSymbol || '');
    setCellNotes(activeNotes || '');
  };

  const handleApplyCellChange = () => {
    if (!selectedCell) return;
    const { employee, dateStr } = selectedCell;

    const saved = (attendance[employee.id] || {})[dateStr] || { symbol: '', notes: '' };

    // Update unsavedEdits
    const newEdits = { ...unsavedEdits };
    if (!newEdits[employee.id]) {
      newEdits[employee.id] = {};
    }

    if (selectedSymbol === saved.symbol && cellNotes === saved.notes) {
      // Remove from unsaved if it matches original database values
      delete newEdits[employee.id][dateStr];
      if (Object.keys(newEdits[employee.id]).length === 0) {
        delete newEdits[employee.id];
      }
    } else {
      newEdits[employee.id][dateStr] = { symbol: selectedSymbol, notes: cellNotes };
    }

    setUnsavedEdits(newEdits);
    setSelectedCell(null);
  };

  const handleSaveAll = async () => {
    const updates = [];
    Object.entries(unsavedEdits).forEach(([empId, days]) => {
      Object.entries(days).forEach(([dateStr, editVal]) => {
        updates.push({
          employee_id: parseInt(empId, 10),
          date: dateStr,
          symbol: editVal.symbol,
          notes: editVal.notes
        });
      });
    });

    if (updates.length === 0) {
      setMessage({ text: 'Không có thay đổi nào cần lưu.', type: 'secondary' });
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/attendance/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ updates })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Lỗi lưu bảng công.');

      setMessage({ text: 'Lưu bảng chấm công thành công!', type: 'success' });
      setUnsavedEdits({});
      // Refresh
      fetchInitialData();
    } catch (e) {
      setMessage({ text: e.message, type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (actionType) => {
    // actionType: 'manager_approve', 'director_approve', 'admin_unlock'
    if (actionType === 'admin_unlock') {
      const confirmUnlock = window.confirm(
        `Bạn có chắc chắn muốn MỞ KHÓA bảng chấm công Tháng ${month}/${year}? Bảng công sẽ quay về trạng thái Bản nháp và cho phép chỉnh sửa.`
      );
      if (!confirmUnlock) return;
    }
    const deptId = user.role === 'manager' ? user.department_id : 1;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/attendance/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          month,
          year,
          department_id: deptId,
          action: actionType
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Lỗi phê duyệt.');

      setMessage({ text: data.message, type: 'success' });
      fetchInitialData();
    } catch (e) {
      setMessage({ text: e.message, type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const getSymbolClass = (sym) => {
    if (!sym) return '';
    const code = sym.toUpperCase();
    if (['+'].includes(code)) return 'sym-work';
    if (['-'].includes(code)) return 'sym-half';
    if (['T', 'TD', 'CD', 'TTC', 'TC'].includes(code)) return 'sym-duty';
    if (['NB', 'BL'].includes(code)) return 'sym-rest';
    if (['NGL'].includes(code)) return 'sym-holiday';
    if (['P', 'PCĐ'].includes(code)) return 'sym-leave';
    if (['Ô', 'CÔ', 'TS'].includes(code)) return 'sym-sick';
    if (['NO'].includes(code)) return 'sym-unpaid';
    return '';
  };

  const renderGrid = () => {
    const daysCount = getDaysInMonth();
    const daysArray = Array.from({ length: daysCount }, (_, i) => i + 1);

    if (isMobile && user.role === 'employee') {
      const emp = employees[0];
      if (!emp) return <div style={{ color: 'var(--text-secondary)' }}>Đang tải dữ liệu nhân sự...</div>;
      
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
          {daysArray.map(d => {
            const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            const saved = (attendance[emp.id] || {})[dateStr] || { symbol: '', notes: '' };
            const unsaved = (unsavedEdits[emp.id] || {})[dateStr];
            
            const cellVal = unsaved ? unsaved.symbol : saved.symbol;
            const cellNotes = unsaved ? unsaved.notes : saved.notes;
            const isEdited = !!unsaved;

            const isWk = isWeekendDay(d);
            const isHol = holidays.has(dateStr);
            
            return (
              <div 
                key={d} 
                onClick={() => handleCellClick(emp, d)}
                className="glass-card" 
                style={{
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  border: isEdited ? '1.5px solid var(--primary-light)' : '1px solid var(--glass-border)',
                  backgroundColor: isEdited ? 'rgba(13, 148, 136, 0.15)' : (isHol ? 'rgba(217, 70, 239, 0.1)' : (isWk ? 'rgba(15, 23, 42, 0.3)' : 'rgba(30, 41, 59, 0.4)')),
                  transition: 'all var(--transition-fast)'
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', fontSize: '15px', color: 'white' }}>
                    Ngày {d.toString().padStart(2, '0')}/{month.toString().padStart(2, '0')} - {getDayName(d)}
                    {isHol && <span style={{ fontSize: '11px', color: 'var(--color-holiday)', marginLeft: '8px', backgroundColor: 'rgba(217, 70, 239, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>Lễ</span>}
                    {isWk && !isHol && <span style={{ fontSize: '11px', color: 'var(--accent-light)', marginLeft: '8px' }}>Cuối tuần</span>}
                  </div>
                  {cellNotes && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                      Ghi chú: {cellNotes}
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {cellVal ? (
                    <span className={`symbol-badge ${getSymbolClass(cellVal)}`} style={{ width: '32px', height: '32px', fontSize: '14px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0' }}>
                      {cellVal}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Chưa chấm</span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: '16px' }}>⚙️</span>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div style={{ overflowX: 'auto', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)' }}>
              <th style={{ padding: '8px', borderRight: '1px solid var(--glass-border)', borderBottom: '1px solid var(--glass-border)', minWidth: '40px', textAlign: 'center' }}>STT</th>
              <th style={{ padding: '8px', borderRight: '1px solid var(--glass-border)', borderBottom: '1px solid var(--glass-border)', minWidth: '160px', position: 'sticky', left: 0, backgroundColor: '#0f172a', zIndex: 5 }}>Họ và Tên</th>
              {daysArray.map(d => {
                const isWk = isWeekendDay(d);
                const dStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                const isHol = holidays.has(dStr);
                
                return (
                  <th key={d} style={{
                    padding: '6px 2px',
                    borderRight: '1px solid var(--glass-border)',
                    borderBottom: '1px solid var(--glass-border)',
                    minWidth: '28px',
                    textAlign: 'center',
                    backgroundColor: isHol ? 'var(--color-holiday)' : (isWk ? 'rgba(255, 255, 255, 0.05)' : 'transparent'),
                    color: isHol ? '#white' : (isWk ? 'var(--accent-light)' : 'var(--text-secondary)')
                  }}>
                    <div>{d}</div>
                    <div style={{ fontSize: '9px', opacity: 0.8 }}>{getDayName(d)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, idx) => {
              return (
                <tr key={emp.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '8px', borderRight: '1px solid var(--glass-border)', textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                  <td style={{
                    padding: '8px 12px',
                    borderRight: '1px solid var(--glass-border)',
                    fontWeight: '600',
                    position: 'sticky',
                    left: 0,
                    backgroundColor: 'var(--bg-secondary)',
                    zIndex: 2,
                    whiteSpace: 'nowrap'
                  }}>
                    {emp.full_name}
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'normal' }}>{emp.title}</div>
                  </td>
                  {daysArray.map(d => {
                    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                    const saved = (attendance[emp.id] || {})[dateStr] || { symbol: '', notes: '' };
                    const unsaved = (unsavedEdits[emp.id] || {})[dateStr];
                    
                    const cellVal = unsaved ? unsaved.symbol : saved.symbol;
                    const cellNotes = unsaved ? unsaved.notes : saved.notes;
                    const isEdited = !!unsaved;

                    const isWk = isWeekendDay(d);
                    const isHol = holidays.has(dateStr);
                    
                    return (
                      <td 
                        key={d} 
                        onClick={() => handleCellClick(emp, d)}
                        style={{
                          padding: '4px',
                          borderRight: '1px solid var(--glass-border)',
                          textAlign: 'center',
                          cursor: 'pointer',
                          backgroundColor: isEdited ? 'rgba(13, 148, 136, 0.2)' : (isHol ? 'rgba(217, 70, 239, 0.1)' : (isWk ? 'rgba(15, 23, 42, 0.4)' : 'transparent')),
                          border: isEdited ? '1.5px solid var(--primary-light)' : '1px solid var(--glass-border)',
                          transition: 'background-color var(--transition-fast)'
                        }}
                        title={`${emp.full_name}, ngày ${d}/${month}: ${cellVal || 'Không chấm'} ${cellNotes ? `(${cellNotes})` : ''}`}
                      >
                        {cellVal ? (
                          <div className={`symbol-badge ${getSymbolClass(cellVal)}`} style={{ margin: '0 auto' }}>
                            {cellVal}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{isWk ? '' : ''}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const daysCount = getDaysInMonth();
  const hasEdits = Object.keys(unsavedEdits).length > 0;

  return (
    <div>
      <div className="header-row">
        <div>
          <h1>Bảng Chấm Công Lịch Tháng</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Chọn tháng, click vào ô tương ứng để cập nhật ký hiệu chấm công.</p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <select className="form-select" style={{ width: '100px' }} value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>

          <select className="form-select" style={{ width: '120px' }} value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
            {[2025, 2026, 2027].map(y => (
              <option key={y} value={y}>Năm {y}</option>
            ))}
          </select>

          <button className="btn btn-secondary" onClick={() => setShowAuditLogs(!showAuditLogs)}>
            📜 Lịch sử thay đổi
          </button>
        </div>
      </div>

      {message.text && (
        <div style={{
          backgroundColor: message.type === 'danger' ? 'rgba(244, 63, 94, 0.15)' : (message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)'),
          border: `1px solid ${message.type === 'danger' ? 'rgba(244, 63, 94, 0.3)' : (message.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.15)')}`,
          color: message.type === 'danger' ? 'var(--color-sick)' : (message.type === 'success' ? 'var(--color-rest)' : 'var(--text-primary)'),
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          fontSize: '14px'
        }}>
          {message.text}
        </div>
      )}

      <div className="glass-card" style={{ marginBottom: '24px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Trạng thái phê duyệt: 
            </span>
            <span className={`status-badge ${approval.status === 'director_approved' ? 'status-approved-director' : (approval.status === 'manager_approved' ? 'status-approved-manager' : 'status-draft')}`}>
              {approval.status === 'director_approved' ? 'Trưởng khoa đã khóa' : (approval.status === 'manager_approved' ? 'Phụ trách bộ phận đã duyệt' : 'Bản nháp')}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {hasEdits && (
              <button className="btn btn-success" onClick={handleSaveAll} disabled={loading}>
                💾 Lưu thay đổi ({Object.values(unsavedEdits).reduce((sum, d) => sum + Object.keys(d).length, 0)} ô)
              </button>
            )}

            {user.role === 'manager' && approval.status === 'draft' && !hasEdits && (
              <button className="btn btn-primary" onClick={() => handleApprove('manager_approve')} disabled={loading}>
                ✔️ Duyệt Bảng Công (Phụ trách)
              </button>
            )}

            {user.role === 'director' && approval.status === 'manager_approved' && (
              <button className="btn btn-primary" onClick={() => handleApprove('director_approve')} disabled={loading}>
                🔒 Khóa Bảng Công (Trưởng khoa)
              </button>
            )}

            {user.role === 'admin' && approval.status !== 'draft' && (
              <button className="btn btn-warning" onClick={() => handleApprove('admin_unlock')} disabled={loading}>
                🔓 Mở Khóa Bảng Công (Admin)
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Đang cập nhật dữ liệu bảng công...</div>
        ) : (
          renderGrid()
        )}
      </div>

      {/* Legend guide */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>Ký hiệu Chấm công:</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', fontSize: '13px' }}>
          {attendanceTypes.length > 0 ? (
            attendanceTypes.map(t => (
              <div key={t.code} style={{ display: 'flex', alignItems: 'center' }}>
                <span className={`symbol-badge ${getSymbolClass(t.code)}`} style={{ display: 'inline-flex', marginRight: '6px', minWidth: '28px', justifyContent: 'center' }}>{t.code}</span>
                <span>{t.name}</span>
              </div>
            ))
          ) : (
            <>
              <div><span className="symbol-badge sym-work" style={{ display: 'inline-flex', marginRight: '6px' }}>+</span> Lương thời gian (≥ 4h)</div>
              <div><span className="symbol-badge sym-half" style={{ display: 'inline-flex', marginRight: '6px' }}>-</span> Lương thời gian (&lt; 4h)</div>
              <div><span className="symbol-badge sym-duty" style={{ display: 'inline-flex', marginRight: '6px' }}>T</span> Trực thường chuyên môn</div>
              <div><span className="symbol-badge sym-duty" style={{ display: 'inline-flex', marginRight: '6px' }}>Tc</span> Tiêm chủng dịch vụ</div>
              <div><span className="symbol-badge sym-rest" style={{ display: 'inline-flex', marginRight: '6px' }}>Nb</span> Nghỉ bù chế độ</div>
              <div><span className="symbol-badge sym-unpaid" style={{ display: 'inline-flex', marginRight: '6px' }}>No</span> Nghỉ không lương</div>
              <div><span className="symbol-badge sym-leave" style={{ display: 'inline-flex', marginRight: '6px' }}>P</span> Nghỉ phép năm</div>
              <div><span className="symbol-badge sym-holiday" style={{ display: 'inline-flex', marginRight: '6px' }}>Ngl</span> Nghỉ lễ</div>
              <div><span className="symbol-badge sym-sick" style={{ display: 'inline-flex', marginRight: '6px' }}>Ô</span> Nghỉ ốm đau</div>
              <div><span className="symbol-badge sym-sick" style={{ display: 'inline-flex', marginRight: '6px' }}>Ts</span> Nghỉ thai sản</div>
              <div><span className="symbol-badge sym-leave" style={{ display: 'inline-flex', marginRight: '6px' }}>H</span> Hội nghị, học tập</div>
            </>
          )}
        </div>
      </div>

      {/* Modal Cell Editor */}
      {selectedCell && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <h2 style={{ marginBottom: '8px' }}>Chấm công: {selectedCell.employee.full_name}</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Ngày {selectedCell.day}/{month}/{year} ({getDayName(selectedCell.day)})</p>
            
            <label className="form-label">Chọn ký hiệu công:</label>
            <div className="symbol-selector-grid">
              <button 
                onClick={() => setSelectedSymbol('')}
                className="symbol-selector-item"
                style={{ borderColor: selectedSymbol === '' ? 'var(--primary)' : 'var(--glass-border)' }}
              >
                <div className="symbol-badge" style={{ backgroundColor: 'transparent', border: '1px dashed var(--text-muted)', color: 'var(--text-muted)' }}>∅</div>
                <div style={{ fontSize: '10px', marginTop: '4px', color: 'var(--text-secondary)' }}>Trống</div>
              </button>
              {attendanceTypes.map(t => (
                <button
                  key={t.code}
                  onClick={() => setSelectedSymbol(t.code)}
                  className="symbol-selector-item"
                  style={{ borderColor: selectedSymbol === t.code ? 'var(--primary)' : 'var(--glass-border)' }}
                >
                  <div className={`symbol-badge ${getSymbolClass(t.code)}`}>{t.code}</div>
                  <div style={{ fontSize: '10px', marginTop: '4px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }} title={t.name}>{t.name}</div>
                </button>
              ))}
            </div>

            <div className="form-group" style={{ marginTop: '20px' }}>
              <label className="form-label">Ghi chú (Lý do nghỉ, lý do trực...):</label>
              <textarea 
                className="form-input" 
                style={{ height: '80px', resize: 'none', fontSize: '14px', fontFamily: 'inherit' }}
                value={cellNotes}
                onChange={(e) => setCellNotes(e.target.value)}
                placeholder="Ví dụ: Nghỉ cưới, Trực thay ca B..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedCell(null)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleApplyCellChange}>Xác nhận</button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs Sidebar Panel */}
      {showAuditLogs && (
        <div className="modal-overlay" onClick={() => setShowAuditLogs(false)}>
          <div className="glass-card" onClick={(e) => e.stopPropagation()} style={{
            width: '500px',
            maxHeight: '85vh',
            overflowY: 'auto',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>📜 Lịch Sử Thay Đổi</h2>
              <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setShowAuditLogs(false)}>Đóng</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {auditLogs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '20px 0' }}>Không tìm thấy lịch sử ghi chép sửa đổi.</div>
              ) : (
                auditLogs.map(log => {
                  const date = new Date(log.created_at).toLocaleString();
                  const actDate = new Date(log.date).toLocaleDateString('vi-VN');
                  
                  return (
                    <div key={log.id} style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px',
                      fontSize: '13px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '11px', marginBottom: '6px' }}>
                        <span>Sửa đổi bởi: <b>{log.editor_name || 'Hệ thống'}</b></span>
                        <span>{date}</span>
                      </div>
                      <div style={{ color: 'var(--text-primary)', marginBottom: '4px' }}>
                        Nhân sự: <b>{log.target_name}</b> | Ngày: <b>{actDate}</b>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        Ký hiệu: 
                        <span className="status-badge status-draft" style={{ textDecoration: 'line-through' }}>{log.old_value || '∅'}</span>
                        ➡️ 
                        <span className="status-badge status-approved-manager">{log.new_value || '∅'}</span>
                      </div>
                      {log.notes && (
                        <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '12px' }}>
                          Ghi chú: {log.notes}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
