/**
 * XenoValidator — Dedicated Auth Page Logic
 * Handles login, registration, password strength, eye toggle, and canvas animation.
 */
(function () {
  'use strict';

  // ── Tab Switching ────────────────────────────────────────────────
  const tabLogin    = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const indicator   = document.getElementById('tab-indicator');
  const formLogin   = document.getElementById('form-login');
  const formReg     = document.getElementById('form-register');

  function switchTab(mode) {
    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      indicator.classList.remove('tab-right');
      formLogin.style.display = 'block';
      formReg.style.display = 'none';
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      indicator.classList.add('tab-right');
      formReg.style.display = 'block';
      formLogin.style.display = 'none';
    }
  }

  tabLogin.addEventListener('click', () => switchTab('login'));
  tabRegister.addEventListener('click', () => switchTab('register'));

  // Check URL param to open on register tab directly
  if (new URLSearchParams(window.location.search).get('mode') === 'register') {
    switchTab('register');
  }

  // ── Password Visibility Toggle ────────────────────────────────────
  function setupPasswordToggle(btnId, inputId) {
    const btn   = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;

    const eyeOpen = btn.querySelector('.icon-eye');
    const eyeOff  = btn.querySelector('.icon-eye-off');

    btn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      eyeOpen.style.display = isPassword ? 'none' : 'block';
      eyeOff.style.display  = isPassword ? 'block' : 'none';
    });
  }

  setupPasswordToggle('toggle-login-pw', 'login-password');
  setupPasswordToggle('toggle-reg-pw', 'reg-password');

  // ── Password Strength Indicator ───────────────────────────────────
  const regPassword = document.getElementById('reg-password');
  const pwFill      = document.getElementById('pw-fill');
  const pwLabel     = document.getElementById('pw-label');

  function getPasswordStrength(pw) {
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  }

  if (regPassword) {
    regPassword.addEventListener('input', () => {
      const pw = regPassword.value;
      if (!pw) {
        pwFill.style.width = '0%';
        pwLabel.textContent = '';
        return;
      }
      const score = getPasswordStrength(pw);
      const levels = [
        { w: '20%',  color: '#ef4444', label: 'Very Weak', textColor: '#f87171' },
        { w: '40%',  color: '#f97316', label: 'Weak',      textColor: '#fb923c' },
        { w: '60%',  color: '#f59e0b', label: 'Fair',      textColor: '#fbbf24' },
        { w: '80%',  color: '#10b981', label: 'Strong',    textColor: '#34d399' },
        { w: '100%', color: '#6366f1', label: 'Very Strong', textColor: '#818cf8' },
      ];
      const lvl = levels[Math.min(score - 1, 4)] || levels[0];
      pwFill.style.width      = lvl.w;
      pwFill.style.background = lvl.color;
      pwLabel.textContent     = lvl.label;
      pwLabel.style.color     = lvl.textColor;
    });
  }

  // ── Show / Hide Error ─────────────────────────────────────────────
  function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'flex';
  }

  function hideError(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  // ── Loading State ─────────────────────────────────────────────────
  function setLoading(btnId, loading) {
    const btn     = document.getElementById(btnId);
    const text    = btn.querySelector('.btn-auth-text');
    const spinner = btn.querySelector('.btn-auth-spinner');
    btn.disabled = loading;
    text.style.display    = loading ? 'none' : 'inline';
    spinner.style.display = loading ? 'inline-flex' : 'none';
  }

  // ── Redirect After Login ──────────────────────────────────────────
  function redirectAfterLogin() {
    const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '/';
    window.location.href = returnTo;
  }

  // ── Login Form ────────────────────────────────────────────────────
  const loginForm = document.getElementById('login-form');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('login-error');

    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showError('login-error', 'Email and password are required.');
      return;
    }

    setLoading('btn-login-submit', true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed. Check your credentials.');
      }

      redirectAfterLogin();
    } catch (err) {
      showError('login-error', err.message);
      setLoading('btn-login-submit', false);
    }
  });

  // ── Register Form ─────────────────────────────────────────────────
  const registerForm = document.getElementById('register-form');

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('reg-error');

    const name     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    if (!name || !email || !password) {
      showError('reg-error', 'All fields are required.');
      return;
    }

    if (password.length < 8) {
      showError('reg-error', 'Password must be at least 8 characters.');
      return;
    }

    setLoading('btn-reg-submit', true);

    try {
      // Register
      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const regData = await regRes.json();
      if (!regRes.ok) {
        throw new Error(regData.error || 'Registration failed.');
      }

      // Auto-login after registration
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!loginRes.ok) {
        const errData = await loginRes.json();
        throw new Error(errData.error || 'Auto-login failed after registration.');
      }

      redirectAfterLogin();
    } catch (err) {
      showError('reg-error', err.message);
      setLoading('btn-reg-submit', false);
    }
  });

  // ── Canvas Particle Background ────────────────────────────────────
  const canvas = document.getElementById('auth-canvas');
  const ctx    = canvas.getContext('2d');
  let particles = [];
  let W, H;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function createParticles() {
    particles = [];
    const count = Math.floor(W * H / 22000);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5 + 0.3,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        alpha: Math.random() * 0.5 + 0.1,
      });
    }
  }
  createParticles();
  window.addEventListener('resize', createParticles);

  function drawParticles() {
    ctx.clearRect(0, 0, W, H);

    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(99, 102, 241, ${(1 - dist / 130) * 0.07})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    // Draw dots
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(129, 140, 248, ${p.alpha})`;
      ctx.fill();

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    }

    requestAnimationFrame(drawParticles);
  }

  drawParticles();
})();
