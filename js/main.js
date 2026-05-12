// Security: Frame Buster (Anti-Clickjacking)
if (window.top !== window.self) {
  window.top.location = window.self.location;
}

// Force scroll to top on reload
if (history.scrollRestoration) {
  history.scrollRestoration = 'manual';
}
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => window.scrollTo(0, 0), 10);
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

    const badge = document.querySelector('[data-gh-version-badge]');
    if (badge) badge.textContent = `${version} · Stable Release · ${monthYear}`;

    const zipName = document.querySelector('[data-gh-zip-name]');
    if (zipName) zipName.textContent = `voncms-${version.replace(/\./g, '-')}.zip`;

    const ctaNote = document.querySelector('[data-gh-cta-note]');
    if (ctaNote) ctaNote.textContent = `Latest Stable: ${version} · PHP 8.2+ · MySQL · Apache`;

    console.log(`VonCMS: Version ${version} fetched successfully.`);
    // Trigger engagement toast
    setTimeout(showEngagementToast, 8000);
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
// Target all images except nav logos and footer brand icons
const triggers = document.querySelectorAll('main img, section img, .cta-section img, header img');

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
    <div class="toast-title"><span></span> Interested in VonCMS?</div>
    <div class="toast-desc">If you find VonCMS useful, consider giving us a star on GitHub. It helps the rebel cause grow.</div>
    <div class="toast-actions">
      <a href="https://github.com/Vondereich/VonCMS" target="_blank" rel="noopener noreferrer" class="toast-btn toast-btn-primary" id="toast-star-btn">⭐ Give a Star</a>
      <div class="toast-btn toast-btn-secondary" id="toast-close-btn">Next time</div>
    </div>
  </div>
`;
document.body.insertAdjacentHTML('beforeend', toastHTML);

const toast = document.getElementById('engagement-toast');
const starBtn = document.getElementById('toast-star-btn');
const closeBtn = document.getElementById('toast-close-btn');
const xBtn = document.getElementById('toast-x-btn');

const showToast = () => {
  // Using sessionStorage: cleared when tab/browser is closed
  if (sessionStorage.getItem('voncms-toast-dismissed')) return;
  
  setTimeout(() => {
    toast.classList.add('active');
  }, 5000); // Show after 5 seconds
};

const dismissToast = () => {
  toast.classList.remove('active');
  sessionStorage.setItem('voncms-toast-dismissed', 'true');
};

closeBtn.addEventListener('click', dismissToast);
starBtn.addEventListener('click', dismissToast);
xBtn.addEventListener('click', dismissToast);

showToast();
