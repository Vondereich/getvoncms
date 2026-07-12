// Security: Frame Buster (Anti-Clickjacking)
if (window.top !== window.self) {
  window.top.location = window.self.location;
}

// Force scroll to top on reload
if (history.scrollRestoration && !window.location.hash) {
  history.scrollRestoration = 'manual';
}
window.addEventListener('DOMContentLoaded', () => {
  if (!window.location.hash) {
    setTimeout(() => window.scrollTo(0, 0), 10);
  }
});

// Scroll reveal
const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
reveals.forEach(el => observer.observe(el));

// Auto-fetch latest GitHub release
async function fetchLatestRelease() {
  try {
    const response = await fetch('https://api.github.com/repos/Vondereich/VonCMS/releases/latest');
    if (!response.ok) return;
    const data = await response.json();
    
    let version = data.tag_name;
    let fullName = data.name;
    if (!version || !fullName) return;

    // Extract only the series name (e.g., "Rentaka") from "v1.23.10 · Rentaka"
    let seriesName = fullName;
    const dash = fullName.includes('—') ? '—' : (fullName.includes('·') ? '·' : null);
    if (dash) {
      seriesName = seriesName.split(dash)[1].trim().split(' ')[0];
    } else if (seriesName.includes('"')) {
      seriesName = seriesName.split('"')[1];
    }

    const publishedAt = new Date(data.published_at);
    const monthYear = publishedAt.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const releaseLabel = fullName
      .replace(/^VonCMS\s*/i, '')
      .replace(version, '')
      .replace(/^[\s\-–—·:]+/, '')
      .trim();

    document.querySelectorAll('[data-gh-version-badge]').forEach(badge => {
      badge.textContent = `${version} · Stable Release · ${monthYear}`;
    });

    const zipName = document.querySelector('[data-gh-zip-name]');
    if (zipName) zipName.textContent = `voncms-${version.replace(/\./g, '-')}.zip`;

    const ctaNote = document.querySelector('[data-gh-cta-note]');
    if (ctaNote) ctaNote.textContent = `Latest Stable: ${version} · PHP 8.2+ · MySQL · Apache`;

    const releaseLink = document.querySelector('[data-gh-release-link]');
    if (releaseLink && data.html_url) releaseLink.href = data.html_url;

    const releaseTitle = document.querySelector('[data-gh-release-title]');
    if (releaseTitle) releaseTitle.textContent = releaseLabel ? `${version} ${releaseLabel}` : version;

    const releaseDate = document.querySelector('[data-gh-release-date]');
    if (releaseDate) releaseDate.textContent = monthYear;

    console.log(`VonCMS: Version ${version} fetched successfully.`);
    // The toast initializes below; release fetch only updates visible metadata.
  } catch (error) {
    console.error("VonCMS: Release fetch failed.", error);
  }
}

// Sidebar Scroll Spy & Active State (Docs/Manifesto)
const initSidebarLogic = () => {
  const links = document.querySelectorAll('.sidebar-links a');
  const sections = document.querySelectorAll('section[id], header[id]');
  
  if (!links.length || !sections.length) return;

  // Active state on click
  links.forEach(link => {
    link.addEventListener('click', () => {
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  // Scroll spy
  const spyObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        links.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          }
        });
      }
    });
  }, { 
    rootMargin: '-10% 0px -80% 0px',
    threshold: 0
  });

  sections.forEach(section => spyObserver.observe(section));
};

// Global Init
document.addEventListener('DOMContentLoaded', () => {
  fetchLatestRelease();
  initSidebarLogic();

  // ── BURGER MENU TOGGLE ──
  const burger = document.getElementById('burger-btn');
  const navLinks = document.getElementById('nav-links');

  if (burger && navLinks) {
    burger.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      burger.classList.toggle('active');
      burger.setAttribute('aria-expanded', isOpen);
    });

    // Close menu when a nav link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        burger.classList.remove('active');
        burger.setAttribute('aria-expanded', 'false');
      });
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!burger.contains(e.target) && !navLinks.contains(e.target)) {
        navLinks.classList.remove('open');
        burger.classList.remove('active');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }
});

// UNIVERSAL LIGHTBOX LOGIC
const lightbox = document.createElement('div');
lightbox.id = 'lightbox';
lightbox.innerHTML = `
  <div class="lightbox-close">&times;</div>
  <img src="" alt="Full size view">
`;
document.body.appendChild(lightbox);

const lightboxImg = lightbox.querySelector('img');
const triggers = document.querySelectorAll('.lightbox-trigger');

triggers.forEach(trigger => {
  trigger.style.cursor = 'zoom-in';
  trigger.addEventListener('click', () => {
    lightboxImg.src = trigger.src;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  });
});

const closeLightbox = () => {
  lightbox.classList.remove('active');
  document.body.style.overflow = 'auto';
};

lightbox.addEventListener('click', (e) => {
  if (e.target !== lightboxImg) closeLightbox();
});

// ENGAGEMENT TOAST LOGIC
const toastHTML = `
  <div class="toast" id="engagement-toast">
    <div class="toast-x-close" id="toast-x-btn">&times;</div>
    <div class="toast-title"><span></span> Recent download</div>
    <div class="toast-desc">Someone just opened the VonCMS Deploy ZIP for a self-hosted publishing site.</div>
    <div class="toast-actions">
      <a href="https://github.com/Vondereich/VonCMS/releases/latest" target="_blank" rel="noopener noreferrer" class="toast-btn toast-btn-primary" id="toast-download-btn">Download ZIP</a>
      <div class="toast-btn toast-btn-secondary" id="toast-close-btn">Next time</div>
    </div>
  </div>
`;
document.body.insertAdjacentHTML('beforeend', toastHTML);

const toast = document.getElementById('engagement-toast');
const downloadBtn = document.getElementById('toast-download-btn');
const closeBtn = document.getElementById('toast-close-btn');
const xBtn = document.getElementById('toast-x-btn');

const showToast = () => {
  // Using sessionStorage: cleared when tab/browser is closed
  if (sessionStorage.getItem('voncms-download-toast-dismissed')) return;
  
  setTimeout(() => {
    toast.classList.add('active');
  }, 5000); // Show after 5 seconds
};

const dismissToast = () => {
  toast.classList.remove('active');
  sessionStorage.setItem('voncms-download-toast-dismissed', 'true');
};

closeBtn.addEventListener('click', dismissToast);
downloadBtn.addEventListener('click', dismissToast);
xBtn.addEventListener('click', dismissToast);

showToast();
