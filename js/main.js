'use strict';

document.documentElement.classList.add('js');

function trustedReleaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && !url.username && !url.password
      && url.pathname.startsWith('/Vondereich/VonCMS/releases/') ? url.href : null;
  } catch {
    return null;
  }
}

async function fetchLatestRelease() {
  try {
    const response = await fetch('https://api.github.com/repos/Vondereich/VonCMS/releases/latest', {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;
    const release = await response.json();
    if (release.draft || release.prerelease || !/^v\.?\d+(?:\.\d+)+$/i.test(release.tag_name || '')) return;
    const version = release.tag_name.replace(/^v\./i, 'v');
    const date = new Date(release.published_at);
    if (Number.isNaN(date.getTime())) return;
    const month = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    document.querySelectorAll('[data-gh-version-badge]').forEach(el => {
      el.textContent = `${version} \u00b7 Stable Release \u00b7 ${month}`;
    });
    document.querySelectorAll('[data-gh-cta-note]').forEach(el => {
      el.textContent = `Latest stable: ${version} \u00b7 Free and open source \u00b7 GPL-3.0-only`;
    });
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const deploy = assets.find(asset => /deploy.*\.zip$/i.test(asset.name || ''));
    const deployUrl = trustedReleaseUrl(deploy?.browser_download_url);
    if (deployUrl) {
      document.querySelectorAll('[data-gh-deploy-download]').forEach(el => { el.href = deployUrl; });
    }
  } catch {
    // Keep the published static release data when GitHub is unavailable.
  }
}

function initNavigation() {
  const button = document.getElementById('burger-btn');
  const links = document.getElementById('nav-links');
  if (!button || !links) return;
  function toggle(open) {
    links.classList.toggle('open', open);
    button.classList.toggle('active', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }
  button.addEventListener('click', () => toggle(button.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', event => {
    if (event.target.closest('a')) toggle(false);
  });
  document.addEventListener('click', event => {
    if (!button.contains(event.target) && !links.contains(event.target)) toggle(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      toggle(false);
      button.focus();
    }
  });
  matchMedia('(min-width: 901px)').addEventListener('change', () => toggle(false));
}

function initProductViews() {
  const list = document.querySelector('.product-tabs');
  if (!list) return;
  const tabs = [...list.querySelectorAll('a')];
  const panels = tabs.map(tab => document.getElementById(tab.hash.slice(1)));
  if (panels.some(panel => !panel)) return;
  list.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', tab.id);
  });
  function select(index, focus = false) {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', event => { event.preventDefault(); select(index); });
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      select(next, true);
    });
  });
  const initial = panels.findIndex(panel => '#' + panel.id === location.hash);
  select(initial >= 0 ? initial : 0);
}

function initContents() {
  const toggle = document.querySelector('.toc-toggle');
  const links = [...document.querySelectorAll('.sidebar-links a')];
  if (!links.length) return;
  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
    });
  }
  function activate(link) {
    links.forEach(item => {
      const current = item === link;
      item.classList.toggle('active', current);
      if (current) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    });
  }
  links.forEach(link => link.addEventListener('click', () => {
    activate(link);
    if (toggle && matchMedia('(max-width: 800px)').matches) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus({ preventScroll: true });
    }
  }));
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const link = links.find(item => item.hash === '#' + entry.target.id);
      if (link) activate(link);
    }
  }, { rootMargin: '-100px 0px -65% 0px', threshold: 0 });
  links.forEach(link => {
    const section = document.getElementById(link.hash.slice(1));
    if (section) observer.observe(section);
  });
}

function initComparison() {
  const controls = document.querySelector('.comparison-controls');
  const table = document.querySelector('.comparison-table');
  if (!controls || !table) return;
  const buttons = [...controls.querySelectorAll('[data-compare]')];
  function select(button) {
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    table.querySelectorAll('[data-cms]').forEach(cell => {
      cell.hidden = cell.dataset.cms !== button.dataset.compare;
    });
    table.querySelector('caption').textContent = 'VonCMS and ' + button.textContent + ': publishing and hosting';
  }
  buttons.forEach(button => button.addEventListener('click', () => select(button)));
  controls.hidden = false;
  table.classList.add('comparison-ready');
  select(buttons[0]);
}

function initLightbox() {
  const triggers = [...document.querySelectorAll('img.lightbox-trigger')];
  if (!triggers.length) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'lightbox';
  dialog.setAttribute('aria-label', 'Full-size screenshot');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lightbox-close';
  close.setAttribute('aria-label', 'Close screenshot');
  close.textContent = '\u00d7';
  const image = document.createElement('img');
  dialog.append(close, image);
  document.body.append(dialog);
  let previousOverflow = '';
  dialog.addEventListener('close', () => {
    dialog.classList.remove('active');
    document.body.style.overflow = previousOverflow;
    image.removeAttribute('src');
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  triggers.forEach(trigger => {
    trigger.tabIndex = 0;
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-label', 'View full screenshot: ' + trigger.alt);
    function open() {
      image.src = trigger.currentSrc || trigger.src;
      image.alt = trigger.alt;
      previousOverflow = document.body.style.overflow;
      dialog.classList.add('active');
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    }
    trigger.addEventListener('click', open);
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
  });
}

function initDownloadReminder() {
  if (!document.querySelector('.hero-content')) return;
  const key = 'voncms-download-toast-dismissed';
  try { if (sessionStorage.getItem(key)) return; } catch { /* Storage is optional. */ }
  const toast = document.createElement('aside');
  toast.className = 'toast';
  toast.setAttribute('aria-label', 'VonCMS download');
  toast.innerHTML = '<button type="button" class="toast-x-close" aria-label="Dismiss download reminder">&times;</button><p class="toast-title">Start your own publication.</p><p class="toast-desc">The Deploy ZIP includes the production app. Your hosting and database are yours to choose.</p><div class="toast-actions"><a class="toast-btn toast-btn-primary" href="https://github.com/Vondereich/VonCMS/releases/latest">Download ZIP</a><button type="button" class="toast-btn toast-btn-secondary">Later</button></div>';
  document.body.append(toast);
  function dismiss() {
    toast.classList.remove('active');
    try { sessionStorage.setItem(key, 'true'); } catch { /* Keep dismissal local. */ }
  }
  toast.querySelectorAll('button, a').forEach(control => control.addEventListener('click', dismiss));
  setTimeout(() => toast.classList.add('active'), 5000);
}

document.querySelectorAll('[data-current-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
initNavigation();
initProductViews();
initComparison();
initContents();
initLightbox();
initDownloadReminder();
if (document.querySelector('[data-gh-version-badge]')) fetchLatestRelease();
