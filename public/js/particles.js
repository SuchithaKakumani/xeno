/**
 * Lightweight particle animation for hero background.
 * Uses canvas with requestAnimationFrame for smooth performance.
 * Responds to theme changes via custom 'themechange' events.
 */
(function () {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height;
  let particles = [];
  let animationId;

  const THEMES = {
    light: {
      colors: ['rgba(37, 99, 235, 0.25)', 'rgba(59, 130, 246, 0.2)', 'rgba(29, 78, 216, 0.15)'],
      connectionColor: [37, 99, 235],
      connectionOpacity: 0.04,
    },
    dark: {
      colors: ['rgba(99, 102, 241, 0.4)', 'rgba(6, 182, 212, 0.4)', 'rgba(129, 140, 248, 0.3)'],
      connectionColor: [99, 102, 241],
      connectionOpacity: 0.06,
    },
  };

  let currentThemeKey = 'light';

  const CONFIG = {
    count: 50,
    maxRadius: 2,
    minRadius: 0.5,
    speed: 0.3,
    connectionDistance: 150,
  };

  function getTheme() {
    return THEMES[currentThemeKey] || THEMES.light;
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function createParticle() {
    const theme = getTheme();
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * CONFIG.speed,
      vy: (Math.random() - 0.5) * CONFIG.speed,
      radius: Math.random() * (CONFIG.maxRadius - CONFIG.minRadius) + CONFIG.minRadius,
      colorIndex: Math.floor(Math.random() * theme.colors.length),
    };
  }

  function init() {
    resize();
    particles = [];
    for (let i = 0; i < CONFIG.count; i++) {
      particles.push(createParticle());
    }
  }

  function update() {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      p.x = Math.max(0, Math.min(width, p.x));
      p.y = Math.max(0, Math.min(height, p.y));
    }
  }

  function draw() {
    const theme = getTheme();
    ctx.clearRect(0, 0, width, height);

    // Draw connections
    const [cr, cg, cb] = theme.connectionColor;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONFIG.connectionDistance) {
          const opacity = theme.connectionOpacity * (1 - dist / CONFIG.connectionDistance);
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${opacity})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    // Draw particles
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = theme.colors[p.colorIndex % theme.colors.length];
      ctx.fill();
    }
  }

  function animate() {
    update();
    draw();
    animationId = requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    resize();
  });

  // Listen for theme changes from app.js
  window.addEventListener('themechange', (e) => {
    currentThemeKey = e.detail.theme || 'light';
  });

  // Detect initial theme from data attribute
  const initial = document.documentElement.getAttribute('data-theme');
  if (initial) currentThemeKey = initial;

  // Reduce particles on mobile
  if (window.innerWidth < 768) {
    CONFIG.count = 25;
    CONFIG.connectionDistance = 100;
  }

  init();
  animate();
})();
