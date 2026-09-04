import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryApi = 'https://api.github.com/repos/Vondereich/VonCMS/releases?per_page=6';
const repositoryUrl = 'https://github.com/Vondereich/VonCMS/';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = join(root, 'whats-new.html');

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value, repositoryUrl);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'github.com') return null;
    if (!url.pathname.startsWith('/Vondereich/VonCMS/')) return null;
    return url.href;
  } catch {
    return null;
  }
}

function safeImageUrl(value) {
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

    const src = safeImageUrl(attributes.src);
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

  const src = safeImageUrl(markdownMatch[2]);
  return src ? { src, alt: markdownMatch[1] || 'VonCMS release screenshot' } : null;
}

function renderReleaseImage(image) {
  const width = Number.isInteger(image.width) && image.width > 0 && image.width <= 10000
    ? ` width="${image.width}"`
    : '';
  const height = Number.isInteger(image.height) && image.height > 0 && image.height <= 10000
    ? ` height="${image.height}"`
    : '';

  return `<figure class="release-media"><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}"${width}${height} loading="lazy" decoding="async"></figure>`;
}

function formatVersion(value) {
  return typeof value === 'string' ? value.replace(/^v\./i, 'v') : '';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
  let inCodeBlock = false;

  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || !line || /^(#{1,6}\s|[-*+]\s|\d+\.\s|>|---+$)/.test(line)) continue;
    const summary = stripInlineMarkdown(line);
    if (summary.length >= 35) return summary;
  }

  return '';
}

function inlineMarkdown(value) {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[([^\]\n]+)\]\(([^)\n]+)\))/g;
  let output = '';
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    output += escapeHtml(value.slice(lastIndex, match.index));

    if (token.startsWith('`')) {
      output += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else if (token.startsWith('**')) {
      output += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    } else {
      const destination = safeUrl(match[3].trim().split(/\s+/)[0]);
      output += destination
        ? `<a href="${escapeHtml(destination)}" rel="noopener noreferrer">${escapeHtml(match[2])}</a>`
        : escapeHtml(match[2]);
    }

    lastIndex = match.index + token.length;
  }

  return output + escapeHtml(value.slice(lastIndex));
}

function renderMarkdown(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) return '<p>Release notes are not available yet.</p>';

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let paragraphLines = [];
  let listType = null;

  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = null;
  };

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    output.push(`<p>${inlineMarkdown(paragraphLines.join(' ').trim())}</p>`);
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

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
      const languageAttribute = language ? ` data-language="${escapeHtml(language)}"` : '';
      output.push(`<pre><code${languageAttribute}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
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
      output.push(renderReleaseImage(releaseImage));
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = Math.min(5, Math.max(3, headingMatch[1].length + 1));
      output.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const nextListType = unorderedMatch ? 'ul' : 'ol';
      if (listType !== nextListType) {
        closeList();
        output.push(`<${nextListType}>`);
        listType = nextListType;
      }
      output.push(`<li>${inlineMarkdown((unorderedMatch || orderedMatch)[1].trim())}</li>`);
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line)) {
      flushParagraph();
      closeList();
      output.push('<hr>');
      continue;
    }

    if (line.startsWith('>')) {
      flushParagraph();
      closeList();
      output.push(`<blockquote><p>${inlineMarkdown(line.replace(/^>\s?/, ''))}</p></blockquote>`);
      continue;
    }

    closeList();
    paragraphLines.push(line);
  }

  flushParagraph();
  closeList();
  return output.join('\n');
}

function replaceInner(source, expression, replacement) {
  const next = source.replace(expression, (_match, prefix, suffix) => `${prefix}${replacement}${suffix}`);
  if (next === source) throw new Error(`Could not find expected HTML anchor: ${expression}`);
  return next;
}

function releaseListMarkup(releases) {
  return releases.map(release => {
    const url = safeUrl(release.html_url);
    const version = formatVersion(release.tag_name);
    if (!url || !version) return '';
    const date = formatDate(release.published_at) || 'Release notes';
    return `          <li><a href="${escapeHtml(url)}" rel="noopener noreferrer"><strong>${escapeHtml(version)}</strong><span>${escapeHtml(date)}</span></a></li>`;
  }).filter(Boolean).join('\n');
}

async function syncReleaseFallback() {
  const response = await fetch(repositoryApi, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

  const releases = await response.json();
  const stableReleases = releases.filter(release => !release.draft && !release.prerelease && release.tag_name);
  const latest = stableReleases[0];
  if (!latest) throw new Error('No stable release returned');

  const version = formatVersion(latest.tag_name);
  const releaseUrl = safeUrl(latest.html_url);
  if (!version || !releaseUrl) throw new Error('Latest release data failed validation');

  const date = formatDate(latest.published_at) || 'Latest stable release';
  const name = latest.name || latest.tag_name;
  const summary = extractSummary(latest.body) || `The latest VonCMS release for publishers and journalists: ${version}.`;
  const assets = Array.isArray(latest.assets) ? latest.assets : [];
  const deployAsset = assets.find(asset => /deploy.*\.zip$/i.test(asset.name || ''));
  const sourceAsset = assets.find(asset => /source.*\.zip$/i.test(asset.name || ''));
  const deployUrl = safeUrl(deployAsset?.browser_download_url) || releaseUrl;
  const sourceUrl = safeUrl(sourceAsset?.browser_download_url) || releaseUrl;
  const page = await readFile(pagePath, 'utf8');

  let next = page;
  next = replaceInner(next, /(<p class="release-lead" data-release-summary>)[\s\S]*?(<\/p>)/, `\n        ${escapeHtml(summary)}\n      `);
  next = replaceInner(next, /(<dd data-release-version>)[\s\S]*?(<\/dd>)/, escapeHtml(version));
  next = replaceInner(next, /(<dd data-release-date>)[\s\S]*?(<\/dd>)/, escapeHtml(date));
  next = replaceInner(next, /(<h2 id="release-title" data-release-name>)[\s\S]*?(<\/h2>)/, escapeHtml(name));
  next = replaceInner(next, /(<div class="release-body" data-release-body>)[\s\S]*?(<\/div>\s*<\/article>)/, `\n        ${renderMarkdown(latest.body)}\n      `);
  next = next.replace(/https:\/\/github\.com\/Vondereich\/VonCMS\/releases\/download\/[^"\s]+\/VonCMS_[^"\s]+_Deploy\.zip/g, deployUrl);
  next = next.replace(/https:\/\/github\.com\/Vondereich\/VonCMS\/releases\/download\/[^"\s]+\/VonCMS_[^"\s]+_Source\.zip/g, sourceUrl);
  next = next.replace(/(<a href=")https:\/\/github\.com\/Vondereich\/VonCMS\/releases\/tag\/[^"\s]+(" rel="noopener noreferrer" data-release-page>Original notes<\/a>)/, `$1${releaseUrl}$2`);
  next = replaceInner(next, /(<ol class="recent-releases" data-release-list>)[\s\S]*?(<\/ol>)/, `\n${releaseListMarkup(stableReleases)}\n        `);

  await writeFile(pagePath, next, 'utf8');
  console.log(`VonCMS: generated static release fallback for ${version}.`);
}

try {
  await syncReleaseFallback();
} catch (error) {
  console.warn(`VonCMS: keeping checked-in release fallback (${error.message}).`);
}
