(() => {
  'use strict';

  const releasePage = document.querySelector('.release-main');
  if (!releasePage) return;

  const releasesApi = 'https://api.github.com/repos/Vondereich/VonCMS/releases?per_page=6';
  const repositoryUrl = 'https://github.com/Vondereich/VonCMS/';
  const trustedHosts = new Set(['github.com', 'www.github.com']);
  const cacheKey = 'voncms-public-releases-v1';
  const cacheLifetime = 15 * 60 * 1000;

  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach(element => {
      element.textContent = value;
    });
  };

  const setHref = (selector, value) => {
    const safeValue = toSafeUrl(value);
    if (!safeValue) return;

    document.querySelectorAll(selector).forEach(element => {
      element.href = safeValue;
    });
  };

  function toSafeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    try {
      const url = new URL(value, repositoryUrl);
      if (url.protocol !== 'https:') return null;
      if (!trustedHosts.has(url.hostname.toLowerCase())) return null;
      if (!url.pathname.startsWith('/Vondereich/VonCMS/')) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function toSafeImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;

      const host = url.hostname.toLowerCase();
      const isGitHubAttachment = host === 'github.com'
        && /^\/user-attachments\/assets\/[0-9a-f-]+\/?$/i.test(url.pathname);
      const isGitHubImage = host === 'user-images.githubusercontent.com'
        || host === 'private-user-images.githubusercontent.com';
      const isRepositoryImage = host === 'raw.githubusercontent.com'
        && url.pathname.startsWith('/Vondereich/VonCMS/');

      return isGitHubAttachment || isGitHubImage || isRepositoryImage ? url.href : null;
    } catch {
      return null;
    }
  }

  function parseReleaseImage(value) {
    const htmlMatch = value.match(/^<img\b([^>]*)\/?\s*>$/i);
    if (htmlMatch) {
      const attributes = {};
      const attributePattern = /(?:^|\s)(src|alt|width|height)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

      for (const match of htmlMatch[1].matchAll(attributePattern)) {
        attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
      }

      const src = toSafeImageUrl(attributes.src);
      if (!src) return null;

      return {
        src,
        alt: attributes.alt || 'VonCMS release screenshot',
        width: Number.parseInt(attributes.width, 10),
        height: Number.parseInt(attributes.height, 10),
      };
    }

    const markdownMatch = value.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)$/i);
    if (!markdownMatch) return null;

    const src = toSafeImageUrl(markdownMatch[2]);
    return src ? { src, alt: markdownMatch[1] || 'VonCMS release screenshot' } : null;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatVersion(value) {
    return typeof value === 'string' ? value.replace(/^v\./i, 'v') : '';
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';

    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function stripInlineMarkdown(value) {
    return value
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`>#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractSummary(markdown) {
    if (typeof markdown !== 'string') return '';

    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    let inCodeBlock = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock || !line) continue;
      if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>|---+$)/.test(line)) continue;

      const summary = stripInlineMarkdown(line);
      if (summary.length >= 35) return summary;
    }

    return '';
  }

  function appendInlineMarkdown(parent, value) {
    const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]+\))/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(value)) !== null) {
      if (match.index > lastIndex) {
        parent.append(document.createTextNode(value.slice(lastIndex, match.index)));
      }

      const token = match[0];
      if (token.startsWith('`')) {
        const code = document.createElement('code');
        code.textContent = token.slice(1, -1);
        parent.append(code);
      } else if (token.startsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = token.slice(2, -2);
        parent.append(strong);
      } else {
        const separator = token.indexOf('](');
        const label = token.slice(1, separator);
        const destination = token.slice(separator + 2, -1).trim().split(/\s+/)[0];
        const safeDestination = toSafeUrl(destination);

        if (safeDestination) {
          const link = document.createElement('a');
          link.href = safeDestination;
          link.rel = 'noopener noreferrer';
          link.textContent = label;
          parent.append(link);
        } else {
          parent.append(document.createTextNode(label));
        }
      }

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < value.length) {
      parent.append(document.createTextNode(value.slice(lastIndex)));
    }
  }

  function renderMarkdown(markdown, container) {
    if (typeof markdown !== 'string' || !markdown.trim() || !container) return false;

    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    const fragment = document.createDocumentFragment();
    let paragraphLines = [];
    let activeList = null;

    const closeList = () => {
      activeList = null;
    };

    const flushParagraph = () => {
      if (!paragraphLines.length) return;

      const paragraph = document.createElement('p');
      appendInlineMarkdown(paragraph, paragraphLines.join(' ').trim());
      fragment.append(paragraph);
      paragraphLines = [];
    };

    const appendListItem = (type, content) => {
      flushParagraph();
      if (!activeList || activeList.tagName.toLowerCase() !== type) {
        activeList = document.createElement(type);
        fragment.append(activeList);
      }

      const item = document.createElement('li');
      appendInlineMarkdown(item, content.trim());
      activeList.append(item);
    };

    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index];
      const line = rawLine.trim();

      if (line.startsWith('```')) {
        flushParagraph();
        closeList();

        const language = line.slice(3).trim();
        const codeLines = [];
        index += 1;
        while (index < lines.length && !lines[index].trim().startsWith('```')) {
          codeLines.push(lines[index]);
          index += 1;
        }

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        if (language) code.dataset.language = language;
        code.textContent = codeLines.join('\n');
        pre.append(code);
        fragment.append(pre);
        continue;
      }

      if (!line) {
        flushParagraph();
        closeList();
        continue;
      }

      const releaseImage = parseReleaseImage(line);
      if (releaseImage) {
        flushParagraph();
        closeList();

        const figure = document.createElement('figure');
        figure.className = 'release-media';
        const image = document.createElement('img');
        image.src = releaseImage.src;
        image.alt = releaseImage.alt;
        image.loading = 'lazy';
        image.decoding = 'async';
        if (Number.isInteger(releaseImage.width) && releaseImage.width > 0 && releaseImage.width <= 10000) {
          image.width = releaseImage.width;
        }
        if (Number.isInteger(releaseImage.height) && releaseImage.height > 0 && releaseImage.height <= 10000) {
          image.height = releaseImage.height;
        }
        figure.append(image);
        fragment.append(figure);
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph();
        closeList();

        if (!fragment.childNodes.length) continue;

        const level = Math.min(5, Math.max(3, headingMatch[1].length + 1));
        const heading = document.createElement(`h${level}`);
        appendInlineMarkdown(heading, headingMatch[2]);
        fragment.append(heading);
        continue;
      }

      const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);
      if (unorderedMatch) {
        appendListItem('ul', unorderedMatch[1]);
        continue;
      }

      const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
      if (orderedMatch) {
        appendListItem('ol', orderedMatch[1]);
        continue;
      }

      if (/^(-{3,}|_{3,}|\*{3,})$/.test(line)) {
        flushParagraph();
        closeList();
        fragment.append(document.createElement('hr'));
        continue;
      }

      if (line.startsWith('>')) {
        flushParagraph();
        closeList();
        const quote = document.createElement('blockquote');
        const paragraph = document.createElement('p');
        appendInlineMarkdown(paragraph, line.replace(/^>\s?/, ''));
        quote.append(paragraph);
        fragment.append(quote);
        continue;
      }

      closeList();
      paragraphLines.push(line);
    }

    flushParagraph();
    container.replaceChildren(fragment);
    return true;
  }

  function updateDownloads(release) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const deployAsset = assets.find(asset => /deploy.*\.zip$/i.test(asset.name || ''));
    const sourceAsset = assets.find(asset => /source.*\.zip$/i.test(asset.name || ''));

    if (deployAsset) {
      setHref('[data-deploy-download]', deployAsset.browser_download_url);
      const size = formatBytes(deployAsset.size);
      setText('[data-deploy-meta]', size ? `For normal hosting installs - ${size}` : 'For normal hosting installs');
    } else {
      setHref('[data-deploy-download]', release.html_url);
    }

    if (sourceAsset) {
      setHref('[data-source-download]', sourceAsset.browser_download_url);
      const size = formatBytes(sourceAsset.size);
      setText('[data-source-meta]', size ? `For development and code review - ${size}` : 'For development and code review');
    } else {
      setHref('[data-source-download]', release.html_url);
    }
  }

  function updateRecentReleases(releases) {
    const list = document.querySelector('[data-release-list]');
    if (!list) return;

    const fragment = document.createDocumentFragment();
    releases.slice(0, 6).forEach(release => {
      const url = toSafeUrl(release.html_url);
      if (!url || !release.tag_name) return;

      const item = document.createElement('li');
      const link = document.createElement('a');
      const version = document.createElement('strong');
      const date = document.createElement('span');

      link.href = url;
      link.rel = 'noopener noreferrer';
      version.textContent = formatVersion(release.tag_name);
      date.textContent = formatDate(release.published_at) || 'Release notes';
      link.append(version, date);
      item.append(link);
      fragment.append(item);
    });

    if (fragment.childNodes.length) list.replaceChildren(fragment);
  }

  function applyReleases(releases, sourceLabel) {
    const stableReleases = releases.filter(release => !release.draft && !release.prerelease);
    const latest = stableReleases[0];
    if (!latest || !latest.tag_name) return false;

    const releaseDate = formatDate(latest.published_at);
    const releaseName = latest.name || latest.tag_name;
    const displayVersion = formatVersion(latest.tag_name);
    const summary = extractSummary(latest.body);

    setText('[data-release-version]', displayVersion);
    if (releaseDate) setText('[data-release-date]', releaseDate);
    setText('[data-release-name]', releaseName);
    if (summary) setText('[data-release-summary]', summary);
    setHref('[data-release-page]', latest.html_url);
    updateDownloads(latest);
    updateRecentReleases(stableReleases);

    const body = document.querySelector('[data-release-body]');
    renderMarkdown(latest.body, body);

    const sync = document.querySelector('[data-release-sync]');
    if (sync) {
      sync.dataset.state = sourceLabel === 'live' ? 'live' : 'cached';
      sync.textContent = sourceLabel === 'live'
        ? `Live release notes loaded from GitHub for ${displayVersion}.`
        : `Showing the most recently loaded GitHub release, ${displayVersion}.`;
    }

    return true;
  }

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey));
      if (!cached || !Array.isArray(cached.releases)) return null;
      if (Date.now() - cached.savedAt > cacheLifetime) return null;
      return cached.releases;
    } catch {
      return null;
    }
  }

  function writeCache(releases) {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), releases }));
    } catch {
      // The page still works when storage is unavailable.
    }
  }

  async function loadLiveReleases() {
    const cached = readCache();
    if (cached) applyReleases(cached, 'cached');

    try {
      const response = await fetch(releasesApi, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

      const releases = await response.json();
      if (!Array.isArray(releases) || !releases.length) throw new Error('No releases returned');

      writeCache(releases);
      applyReleases(releases, 'live');
    } catch (error) {
      if (!cached) {
        const sync = document.querySelector('[data-release-sync]');
        if (sync) {
          sync.dataset.state = 'fallback';
          sync.textContent = 'GitHub is temporarily unavailable. Showing the last verified release notes.';
        }
      }
      console.error('VonCMS: Live release notes could not be loaded.', error);
    }
  }

  loadLiveReleases();
})();
