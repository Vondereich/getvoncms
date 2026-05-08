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

// Simple active link tracker
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('.sidebar-links a');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.clientHeight;
    if (pageYOffset >= (sectionTop - 150)) {
      current = section.getAttribute('id');
    }
  });

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href').includes(current)) {
      link.classList.add('active');
    }
  });
});
