import React, { useState } from 'react';
import { API_BASE_URL } from '../config';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Vui lòng nhập đầy đủ tài khoản và mật khẩu.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Đăng nhập thất bại.');
      }

      // Store in localStorage
      localStorage.setItem('attendance_token', data.token);
      localStorage.setItem('attendance_user', JSON.stringify(data.user));

      onLoginSuccess(data.user, data.token);
    } catch (err) {
      setError(err.message || 'Kết nối máy chủ thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'radial-gradient(circle at top right, rgba(13, 148, 136, 0.15), transparent), radial-gradient(circle at bottom left, rgba(59, 130, 246, 0.15), transparent), #0f172a'
    }}>
      <div className="glass-card" style={{ width: '400px', textAlign: 'center' }}>
        <div style={{ marginBottom: '24px' }}>
          <img 
            src="/logo.jpg" 
            alt="Logo TYT Hải Vân" 
            style={{ 
              width: '80px', 
              height: '80px', 
              borderRadius: '50%', 
              margin: '0 auto 16px', 
              objectFit: 'cover', 
              border: '2px solid var(--primary-light)',
              display: 'block' 
            }} 
          />
          <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px', color: '#fff' }}>TRẠM Y PHƯỜNG TẾ HẢI VÂN</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Hệ thống Quản lý Chấm công & Phụ cấp Độc hại</p>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            color: 'var(--color-sick)',
            fontSize: '14px',
            marginBottom: '20px',
            textAlign: 'left'
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label className="form-label" htmlFor="username">Mã Nhân Viên (Tài khoản)</label>
            <input
              type="text"
              id="username"
              className="form-input"
              placeholder="Ví dụ: khanh.nd, hieu.nth"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group" style={{ textAlign: 'left' }}>
            <label className="form-label" htmlFor="password">Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                style={{ paddingRight: '45px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px'
                }}
              >
                {showPassword ? '👁️' : '🙈'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? 'Đang xác thực...' : 'Đăng Nhập'}
          </button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
          <p>Design by tritnq @2026</p>
        </div>
      </div>
    </div>
  );
}
