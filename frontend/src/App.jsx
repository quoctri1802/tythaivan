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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    setMobileMenuOpen(false);
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
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
          <span style={{ fontWeight: 'bold', color: 'white', fontSize: '15px', letterSpacing: '-0.3px' }}>TYT HẢI VÂN</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => {
              if (window.confirm('Bạn có chắc chắn muốn đăng xuất không?')) {
                handleLogout();
              }
            }} 
            style={{ 
              background: 'rgba(244, 63, 94, 0.12)', 
              border: '1px solid rgba(244, 63, 94, 0.25)', 
              color: '#f43f5e', 
              fontSize: '12px', 
              fontWeight: '600',
              borderRadius: '6px',
              padding: '5px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            🚪 Thoát
          </button>
          <button className="mobile-menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Backdrop overlay for mobile menu */}
      {mobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)}></div>
      )}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <img src="/logo.jpg" alt="Logo TYT Hải Vân" style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(255, 255, 255, 0.2)' }} />
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: 'white', letterSpacing: '-0.3px' }}>TYT PHƯỜNG HẢI VÂN</h2>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>PHƯỜNG HẢI VÂN</span>
          </div>
        </div>

        <nav>
          <ul className="nav-menu">
            <li>
              <button 
                onClick={() => { setActivePage('dashboard'); setMobileMenuOpen(false); }} 
                className={`nav-link ${activePage === 'dashboard' ? 'active' : ''}`}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', fontInherit: 'inherit' }}
              >
                🏠 Tổng quan
              </button>
            </li>
            <li>
              <button 
                onClick={() => { setActivePage('attendance'); setMobileMenuOpen(false); }} 
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
                  onClick={() => { setActivePage('report'); setMobileMenuOpen(false); }} 
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
                  onClick={() => { setActivePage('settings'); setMobileMenuOpen(false); }} 
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
      <main className="main-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ flex: 1 }}>
          {activePage === 'dashboard' && <Dashboard user={user} token={token} setActivePage={setActivePage} />}
          {activePage === 'attendance' && <AttendanceTable user={user} token={token} />}
          {activePage === 'report' && <ReportViewer user={user} token={token} />}
          {activePage === 'settings' && <Settings user={user} token={token} />}
        </div>
        <footer style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--glass-border)', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
          Hệ thống Quản lý Chấm công & Phụ cấp Độc hại Trạm Y tế Phường Hải Vân | Design by tritnq @2026 trạm y tế phường Hải Vân
        </footer>
      </main>
    </div>
  );
}
