/**
 * fetch-news.js  — v3
 * Each item gets its own .md file. Every post is guaranteed an image.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import RSSParser from 'rss-parser';
import { load as cheerioLoad } from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Setup ───────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.join(__dirname, 'src', 'content', 'blog');

const parser = new RSSParser({
  customFields: {
    item: [
      ['media:content',   'mediaContent',   { keepArray: false }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: false }],
      ['enclosure',       'enclosure',      { keepArray: false }],
    ],
  },
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CriativeBlogBot/1.0)' },
});

// ─── Fallback images (dark / abstract) ───────────────────────────────────────

const FALLBACKS = {
  awwwards:
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop',
  'google-cloud':
    'https://images.unsplash.com/photo-1639762681057-408e52192e55?q=80&w=1200&auto=format&fit=crop',
  feed:
    'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=1200&auto=format&fit=crop',
  default:
    'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop',
};

function fallback(source = 'default') {
  return FALLBACKS[source] ?? FALLBACKS.default;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function slugify(str = '') {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 55);
}

function ey(str = '') {
  return String(str).replace(/'/g, "''");
}

/**
 * Extract an image URL from an RSS item.
 * Priority: cheerio HTML parse → structured media fields → enclosure
 *
 * Cheerio is used first because Awwwards embeds the featured image deep
 * inside HTML-encoded <description> / <content:encoded> tags where simple
 * regex can miss it (e.g. single-quoted src, extra attributes, CDATA wrapping).
 */
function extractImage(item) {
  // 1. Cheerio parse — most reliable for HTML-embedded images
  const htmlCandidates = [
    item['content:encoded'],
    item.content,
    item.description,
    item.summary,
  ];
  for (const html of htmlCandidates) {
    if (!html) continue;
    const $ = cheerioLoad(html);
    const src = $('img').first().attr('src');
    if (src) return src;
  }

  // 2. Structured media fields
  if (item.mediaContent?.['$']?.url)   return item.mediaContent['$'].url;
  if (item.mediaThumbnail?.['$']?.url) return item.mediaThumbnail['$'].url;
  if (item.enclosure?.url)             return item.enclosure.url;

  return null;
}

/**
 * Write one .md file. Skips if it already exists (idempotent).
 * Guarantees `image` is always present using the fallback.
 */
function writePost({ filename, title, description, pubDate, image, sourceLink, source, body }) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const filepath = path.join(OUT_DIR, filename);

  if (fs.existsSync(filepath)) {
    console.log(`  ↩  Skipped (exists): ${filename}`);
    return;
  }

  // Always guarantee an image
  const finalImage = image || fallback(source);

  const lines = [
    `---`,
    `title: '${ey(title)}'`,
    `description: '${ey(description)}'`,
    `pubDate: '${pubDate}'`,
    `image: '${ey(finalImage)}'`,
    sourceLink ? `sourceLink: '${ey(sourceLink)}'` : null,
    source     ? `source: '${ey(source)}'`         : null,
    `---`,
    '',
    body.trim(),
    '',
  ].filter((l) => l !== null);

  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
  console.log(`  ✅  Written: ${filename}`);
}

// ─── Feed 1: Awwwards ────────────────────────────────────────────────────────

async function processAwwwards() {
  console.log('\n[Awwwards] Fetching…');
  try {
    const feed  = await parser.parseURL('https://www.awwwards.com/feed/');
    const items = (feed.items || []).slice(0, 20);

    if (items.length === 0) { console.warn('  ⚠  No items found'); return; }

    for (const item of items) {
      const siteName = item.title?.trim() || 'Awwwards Site of the Day';
      const dateStr  = (item.isoDate || item.pubDate || todayISO()).split('T')[0];
      const image    = extractImage(item);
      const link     = item.link || item.guid || '';

      const body = [
        `**${siteName}** has been awarded the Awwwards Site of the Day for its exceptional design, creativity, and usability.`,
        '',
        `Explore the full site and jury scores: [${link}](${link})`,
      ].join('\n');

      writePost({
        filename:    `${dateStr}-awwwards-${slugify(siteName)}.md`,
        title:       `Awwwards SOTD: ${siteName}`,
        description: `Awwwards Site of the Day: ${siteName}`,
        pubDate:     dateStr,
        image,
        sourceLink:  link,
        source:      'awwwards',
        body,
      });

      console.log(`  → ${siteName}`);
    }
  } catch (err) {
    console.error('  ✗ Error:', err.message);
  }
}

// ─── Feed 2: Google Cloud Blog ───────────────────────────────────────────────

const AI_KEYWORDS = ['ai & machine learning', 'ai', 'machine learning', 'gemini', 'vertex'];

function isAiRelated(item) {
  const hay = [item.title || '', ...(item.categories || []), item['dc:subject'] || '']
    .join(' ').toLowerCase();
  return AI_KEYWORDS.some((kw) => hay.includes(kw));
}

async function processGoogleCloud() {
  console.log('\n[Google Cloud] Fetching…');
  try {
    const feed  = await parser.parseURL('https://cloudblog.withgoogle.com/rss/');
    const items = (feed.items || []).filter(isAiRelated).slice(0, 20);

    if (items.length === 0) { console.warn('  ⚠  No AI posts found'); return; }

    for (const item of items) {
      const title   = item.title?.trim() || 'Google Cloud AI Update';
      const link    = item.link || item.guid || '';
      const dateStr = (item.isoDate || item.pubDate || todayISO()).split('T')[0];
      const snippet = item.contentSnippet?.slice(0, 300).trim() || '';
      const image   = extractImage(item);

      const body = [
        snippet ? `${snippet}\n` : '',
        `Read the full article: [${title}](${link})`,
      ].join('\n');

      writePost({
        filename:    `${dateStr}-gcp-${slugify(title)}.md`,
        title,
        description: (snippet.slice(0, 160) || title),
        pubDate:     dateStr,
        image,
        sourceLink:  link,
        source:      'google-cloud',
        body,
      });

      console.log(`  → ${title}`);
    }
  } catch (err) {
    console.error('  ✗ Error:', err.message);
  }
}

// ─── Feed 3: X.com via rss.app ───────────────────────────────────────────────

async function processXPost() {
  console.log('\n[X / rss.app] Fetching…');
  try {
    const feed  = await parser.parseURL('https://rss.app/feeds/28wi2nSsPdrXiLpi.xml');
    const items = (feed.items || []).slice(0, 10);
    if (items.length === 0) { console.warn('  ⚠  No items found'); return; }

    for (const item of items) {
      const rawText = item.contentSnippet || item.content || item.title || '';
      const url     = item.link || item.guid || '';
      const dateStr = (item.isoDate || item.pubDate || todayISO()).split('T')[0];
      const image   = extractImage(item);

      console.log('  → Sending to Gemini…');
      const structured = await rewriteWithGemini(rawText);

      writePost({
        filename:    `${dateStr}-feed-${slugify(structured.title)}.md`,
        title:       structured.title,
        description: structured.description,
        pubDate:     dateStr,
        image,
        sourceLink:  url,
        source:      'feed',
        body:        structured.content,
      });

      console.log(`  → ${structured.title}`);
    }
  } catch (err) {
    console.error('  ✗ Error:', err.message);
  }
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

async function rewriteWithGemini(rawText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('  ⚠  GEMINI_API_KEY not set — using raw text');
    return {
      title:       rawText.split(' ').slice(0, 8).join(' '),
      description: rawText.slice(0, 120),
      content:     rawText,
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an expert tech blogger. Given this social media post, respond ONLY with a valid JSON object (no markdown fences, no extra text):
{
  "title": "A short, punchy headline — max 10 words",
  "description": "One sentence summary — max 25 words",
  "content": "Two polished, engaging paragraphs rewriting the post as a blog update. Keep it factual."
}

Social media post:
${rawText}`;

    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();
    const json   = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(json);
  } catch (err) {
    console.error('  ✗ Gemini error:', err.message, '— falling back');
    return {
      title:       rawText.split(' ').slice(0, 8).join(' '),
      description: rawText.slice(0, 120),
      content:     rawText,
    };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔═ fetch-news.js  [${todayISO()}] ════════════════════`);
  await Promise.all([
    processAwwwards(),
    processGoogleCloud(),
    processXPost(),
  ]);
  console.log('\n╚═ Done ════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('[fetch-news] Fatal:', err);
  process.exit(1);
});
