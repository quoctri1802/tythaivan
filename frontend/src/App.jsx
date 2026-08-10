import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AttendanceTable from './components/AttendanceTable';
import ReportViewer from './components/ReportViewer';
import Settings from './components/Settings';

export default function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [activePage, setActivePage] = useState('dashboard');
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // Check localStorage on mount
    const savedToken = localStorage.getItem('attendance_token');
    const savedUser = localStorage.getItem('attendance_user');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setInitializing(false);
  }, []);

  const handleLoginSuccess = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    setActivePage('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('attendance_token');
    localStorage.removeItem('attendance_user');
    setUser(null);
    setToken('');
    setActivePage('dashboard');
  };

  if (initializing) {
    return (
      <div style={{
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>Đang khởi động hệ thống chấm công...</div>
      </div>
    );
  }

  // If not logged in, show Login
  if (!token || !user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <img src="/logo.jpg" alt="Logo TYT Hải Vân" style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(255, 255, 255, 0.2)' }} />
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: 'white', letterSpacing: '-0.3px' }}>TYT HẢI VÂN</h2>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>PHƯỜNG HẢI VÂN</span>
          </div>
        </div>

        <nav>
          <ul className="nav-menu">
            <li>
              <button 
                onClick={() => setActivePage('dashboard')} 
                className={`nav-link ${activePage === 'dashboard' ? 'active' : ''}`}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', fontInherit: 'inherit' }}
              >
                🏠 Tổng quan
              </button>
            </li>
            <li>
              <button 
                onClick={() => setActivePage('attendance')} 
                className={`nav-link ${activePage === 'attendance' ? 'active' : ''}`}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', fontInherit: 'inherit' }}
              >
                📅 Bảng chấm công
              </button>
            </li>
            
            {/* Reports are visible to Manager, Director, and Admin */}
            {['manager', 'director', 'admin'].includes(user.role) && (
              <li>
                <button 
                  onClick={() => setActivePage('report')} 
                  className={`nav-link ${activePage === 'report' ? 'active' : ''}`}
                  style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', fontInherit: 'inherit' }}
                >
                  📋 Tổng hợp báo cáo
                </button>
              </li>
            )}

            {/* Settings visible to Admin or Manager/Director */}
            {['admin', 'manager', 'director'].includes(user.role) && (
              <li>
                <button 
                  onClick={() => setActivePage('settings')} 
                  className={`nav-link ${activePage === 'settings' ? 'active' : ''}`}
                  style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', fontInherit: 'inherit' }}
                >
                  ⚙️ Quản lý danh mục
                </button>
              </li>
            )}
          </ul>
        </nav>

        {/* User info at bottom */}
        <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div className="avatar">
              {user.full_name ? user.full_name.charAt(0) : 'U'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={user.full_name}>
                {user.full_name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {user.title || 'Cán bộ'}
              </div>
            </div>
          </div>
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
            onClick={handleLogout}
          >
            🚪 Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {activePage === 'dashboard' && <Dashboard user={user} token={token} setActivePage={setActivePage} />}
        {activePage === 'attendance' && <AttendanceTable user={user} token={token} />}
        {activePage === 'report' && <ReportViewer user={user} token={token} />}
        {activePage === 'settings' && <Settings user={user} token={token} />}
      </main>
    </div>
  );
}
