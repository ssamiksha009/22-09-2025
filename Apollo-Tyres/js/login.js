// Unified, single-submit login handler that reliably redirects by role.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');

  // Toggle password visibility (if present)
  const toggle = document.querySelector('.toggle-password');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const pwd = document.getElementById('password');
      if (!pwd) return;
      const isPwd = pwd.getAttribute('type') === 'password';
      pwd.setAttribute('type', isPwd ? 'text' : 'password');
      toggle.classList.toggle('fa-eye');
      toggle.classList.toggle('fa-eye-slash');
    });
  }

  if (!form) return;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (errorMessage) errorMessage.textContent = '';

    const email = (document.getElementById('email') || {}).value || '';
    const password = (document.getElementById('password') || {}).value || '';

    if (!email || !password) {
      if (errorMessage) errorMessage.textContent = 'Please enter both email and password';
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      // Attempt to parse JSON safely
      let data = {};
      try { data = await res.json(); } catch (_) { /* no-op */ }

      if (!res.ok) {
        const msg = (data && (data.message || data.error)) || `Login failed (status ${res.status})`;
        if (errorMessage) errorMessage.textContent = msg;
        return;
      }

      // Support server responses that include token and either user or role
      const token = data.token || data.accessToken || data.authToken;
      let role = (data.user && data.user.role) || data.role || null;

      if (!token) {
        if (errorMessage) errorMessage.textContent = 'Login succeeded but no token received';
        return;
      }

      // Persist token
      localStorage.setItem('authToken', token);

      // Try to decode role from token if not provided by API
      if (!role) {
        try {
          const payloadB64 = token.split('.')[1] || '';
          const json = JSON.parse(decodeURIComponent(escape(atob(payloadB64.replace(/-/g,'+').replace(/_/g,'/')))));
          role = json.role || json.role_name || json['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || null;
          // Also save basic user info if present
          if (json.email) localStorage.setItem('userEmail', json.email);
          if (json.name)  localStorage.setItem('userName', json.name);
        } catch (_) { /* ignore decode errors */ }
      }

      // If API returned a user object, persist it too
      if (data.user) {
        if (data.user.email) localStorage.setItem('userEmail', data.user.email);
        if (data.user.name)  localStorage.setItem('userName', data.user.name);
        if (data.user.role)  localStorage.setItem('userRole', data.user.role);
        if (data.user.created_at) localStorage.setItem('userCreatedAt', data.user.created_at);
        if (data.user.last_login)  localStorage.setItem('userLastLogin', data.user.last_login);
      } else {
        if (role) localStorage.setItem('userRole', role);
      }

      // Normalize role and redirect accordingly
      const normalized = (role || '').toString().toLowerCase();
      const target = (normalized === 'manager') ? '/manager-dashboard.html' : '/user-dashboard.html';

      // Use replace to avoid back-button going to login
      window.location.replace(target);
      // Fallback
      setTimeout(() => { window.location.href = target; }, 300);
    } catch (err) {
      console.error('Login error:', err);
      if (errorMessage) errorMessage.textContent = 'An error occurred during login. Please try again.';
    }
  }, { passive: false });
});