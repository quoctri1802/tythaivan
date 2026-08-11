import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export default function ReportViewer({ token }) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [activeTab, setActiveTab] = useState('summary'); // 'summary', 'duty', 'toxic_salary', 'toxic_inkind'
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPreview();
  }, [month, year]);

  const fetchPreview = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_BASE_URL}/api/reports/preview?month=${month}&year=${year}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message || 'Lỗi tải dữ liệu báo cáo.');
      setReportData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetch(`${API_BASE_URL}/api/reports/export?month=${month}&year=${year}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message + (errorData.error ? '\n\nChi tiết lỗi:\n' + errorData.error : ''));
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Bao_cao_cham_cong_T${month}_${year}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (e) {
      alert(e.message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', padding: '20px' }}>Đang tổng hợp dữ liệu báo cáo tháng...</div>;
  }

  return (
    <div>
      <div className="header-row">
        <div>
          <h1>Tổng Hợp & Xuất Báo Cáo Tháng</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Xem trước dữ liệu tổng hợp của 4 sheet và tải xuống file Excel chuẩn thông tư 107/2017/TT-BTc</p>
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

          <button className="btn btn-primary" onClick={handleDownload} disabled={downloading || !reportData}>
            📥 {downloading ? 'Đang xuất...' : 'Xuất Báo Cáo Excel'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          backgroundColor: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          color: 'var(--color-sick)',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px'
        }}>{error}</div>
      )}

      {reportData && (
        <div>
          <div className="tabs-container">
            <button className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>
              Sheet 1: Chấm công
            </button>
            <button className={`tab-btn ${activeTab === 'duty' ? 'active' : ''}`} onClick={() => setActiveTab('duty')}>
              Sheet 2: Chấm công trực
            </button>
            <button className={`tab-btn ${activeTab === 'toxic_salary' ? 'active' : ''}`} onClick={() => setActiveTab('toxic_salary')}>
              Sheet 3: Độc hại theo lương
            </button>
            <button className={`tab-btn ${activeTab === 'toxic_inkind' ? 'active' : ''}`} onClick={() => setActiveTab('toxic_inkind')}>
              Sheet 4: Độc hại hiện vật
            </button>
          </div>

          <div className="glass-card" style={{ padding: '20px' }}>
            {activeTab === 'summary' && (
              <div>
                <h3 style={{ marginBottom: '16px' }}>Bảng Chấm Công Tổng Hợp (Tháng {month}/{year})</h3>
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Họ và Tên</th>
                        <th>Chức vụ</th>
                        <th style={{ textAlign: 'center' }}>Lương thời gian (AH)</th>
                        <th style={{ textAlign: 'center' }}>Nghỉ không lương (AI)</th>
                        <th style={{ textAlign: 'center' }}>Công trực (AJ)</th>
                        <th style={{ textAlign: 'center' }}>Nghỉ bù (AK)</th>
                        <th style={{ textAlign: 'center' }}>Nghỉ phép (AL)</th>
                        <th style={{ textAlign: 'center' }}>Hưởng BHXH (AM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.data.map((row, idx) => (
                        <tr key={row.employee.id}>
                          <td>{idx + 1}</td>
                          <td style={{ fontWeight: '600' }}>{row.employee.full_name}</td>
                          <td>{row.employee.title}</td>
                          <td style={{ textAlign: 'center', color: 'var(--primary-light)', fontWeight: 'bold' }}>{row.summaries.AH}</td>
                          <td style={{ textAlign: 'center' }}>{row.summaries.AI || '-'}</td>
                          <td style={{ textAlign: 'center', color: 'var(--accent-light)', fontWeight: 'bold' }}>{row.summaries.AJ || '-'}</td>
                          <td style={{ textAlign: 'center' }}>{row.summaries.AK || '-'}</td>
                          <td style={{ textAlign: 'center' }}>{row.summaries.AL || '-'}</td>
                          <td style={{ textAlign: 'center', color: 'var(--color-sick)' }}>{row.summaries.AM || '-'}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 'bold', backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                        <td colSpan="3" style={{ textAlign: 'right' }}>Tổng cộng ({reportData.data.length} nhân viên):</td>
                        <td style={{ textAlign: 'center', color: 'var(--primary-light)' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.summaries.AH || 0), 0)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.summaries.AI || 0), 0) || '-'}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--accent-light)' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.summaries.AJ || 0), 0) || '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.summaries.AK || 0), 0) || '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.summaries.AL || 0), 0) || '-'}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--color-sick)' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.summaries.AM || 0), 0) || '-'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'duty' && (
              <div>
                <h3 style={{ marginBottom: '16px' }}>Bảng Chấm Công Trực (Tháng {month}/{year})</h3>
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Họ và Tên</th>
                        <th>Chức vụ</th>
                        <th style={{ textAlign: 'center' }}>Trực Ngày thường</th>
                        <th style={{ textAlign: 'center' }}>Trực Thứ 7/CN</th>
                        <th style={{ textAlign: 'center' }}>Trực Ngày Lễ</th>
                        <th style={{ textAlign: 'center' }}>Tổng cộng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.data.filter(r => r.duty.has_duty).map((row, idx) => (
                        <tr key={row.employee.id}>
                          <td>{idx + 1}</td>
                          <td style={{ fontWeight: '600' }}>{row.employee.full_name}</td>
                          <td>{row.employee.title}</td>
                          <td style={{ textAlign: 'center' }}>{row.duty.weekday || '-'}</td>
                          <td style={{ textAlign: 'center' }}>{row.duty.weekend || '-'}</td>
                          <td style={{ textAlign: 'center' }}>{row.duty.holiday || '-'}</td>
                          <td style={{ textAlign: 'center', color: 'var(--color-duty)', fontWeight: 'bold' }}>{row.duty.total}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 'bold', backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                        <td colSpan="3" style={{ textAlign: 'right' }}>Tổng cộng:</td>
                        <td style={{ textAlign: 'center' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.duty.weekday || 0), 0) || '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.duty.weekend || 0), 0) || '-'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.duty.holiday || 0), 0) || '-'}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--color-duty)' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.duty.total || 0), 0) || '-'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'toxic_salary' && (
              <div>
                <h3 style={{ marginBottom: '16px' }}>Bảng Chấm Công Hưởng Phụ Cấp Độc Hại Theo Lương (Tháng {month}/{year})</h3>
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Họ và Tên</th>
                        <th>Chức vụ</th>
                        <th style={{ textAlign: 'center' }}>Số ngày công được hưởng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.data.filter(r => r.employee.has_toxic_salary).map((row, idx) => (
                        <tr key={row.employee.id}>
                          <td>{idx + 1}</td>
                          <td style={{ fontWeight: '600' }}>{row.employee.full_name}</td>
                          <td>{row.employee.title}</td>
                          <td style={{ textAlign: 'center', color: 'var(--color-leave)', fontWeight: 'bold' }}>{row.toxic.salary || 0}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 'bold', backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                        <td colSpan="3" style={{ textAlign: 'right' }}>Tổng cộng:</td>
                        <td style={{ textAlign: 'center', color: 'var(--color-leave)' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.toxic.salary || 0), 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'toxic_inkind' && (
              <div>
                <h3 style={{ marginBottom: '16px' }}>Bảng Chấm Công Hưởng Phụ Cấp Độc Hại Bằng Hiện Vật (Tháng {month}/{year})</h3>
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Họ và Tên</th>
                        <th>Chức vụ</th>
                        <th style={{ textAlign: 'center' }}>Chế độ</th>
                        <th style={{ textAlign: 'center' }}>Số ngày công được hưởng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.data.filter(r => r.employee.has_toxic_in_kind).map((row, idx) => (
                        <tr key={row.employee.id}>
                          <td>{idx + 1}</td>
                          <td style={{ fontWeight: '600' }}>{row.employee.full_name}</td>
                          <td>{row.employee.title}</td>
                          <td style={{ textAlign: 'center' }}>1 Xuất mức {row.employee.toxic_in_kind_level || 3}</td>
                          <td style={{ textAlign: 'center', color: 'var(--color-leave)', fontWeight: 'bold' }}>{row.toxic.in_kind || 0}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 'bold', backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                        <td colSpan="4" style={{ textAlign: 'right' }}>Tổng cộng:</td>
                        <td style={{ textAlign: 'center', color: 'var(--color-leave)' }}>
                          {reportData.data.reduce((sum, r) => sum + (r.toxic.in_kind || 0), 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
