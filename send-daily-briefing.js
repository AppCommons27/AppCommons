// Automotive Intelligence Daily Email
// Stage 1: Claude Web Search → Top 1 Global + 1 NA with full analysis
// Stage 2: NewsAPI → 2 Global + 2 NA summaries (free)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = process.env.TO_EMAIL;
const NEWS_API_KEY = '64467d00422a487e83ead23a128b0116';

const today = new Date();
const dateStr = today.toISOString().split('T')[0];
const dateLabel = today.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric', weekday:'long' });

async function fetchTopStories() {
  console.log('Stage 1: Claude searching for top stories...');
  const sys = `You are a senior automotive industry analyst focused on Smart Cockpit. Search today (${dateStr}) and find the single most important automotive news for Global and for North America. Return JSON only:
{"global":{"title":"...","summary":"...","source":"...","sourceUrl":"...","type":"new-car","background":"60-80w","keyPoints":["p1","p2","p3"],"impact":"50-70w","cockpit":"40-60w","tags":["high"]},"na":{"title":"...","summary":"...","source":"...","sourceUrl":"...","type":"new-car","background":"60-80w","keyPoints":["p1","p2","p3"],"impact":"50-70w","cockpit":"40-60w","tags":["high"]}}
type: new-car/arch/design. tags: high/mid/watch. JSON only.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 5000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: sys,
      messages: [{ role: 'user', content: `Find today (${dateStr}) most important: 1 global + 1 North America automotive news. Focus on new cars, EV, Smart Cockpit, design. JSON only.` }]
    })
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean.substring(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
}

async function fetchSummaryStories(excludeUrls = []) {
  console.log('Stage 2: Fetching summaries from NewsAPI...');
  const queries = ['automotive electric vehicle new car 2026', 'North America auto industry Ford GM Tesla Stellantis'];
  const allArticles = [];
  for (const q of queries) {
    const res = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=6&apiKey=${NEWS_API_KEY}`);
    if (res.ok) { const d = await res.json(); if (d.articles) allArticles.push(...d.articles); }
  }
  const seen = new Set(excludeUrls);
  return allArticles.filter(a => {
    if (!a.title || a.title === '[Removed]' || !a.description) return false;
    if (seen.has(a.url)) return false;
    seen.add(a.url); return true;
  }).slice(0, 4).map((a, i) => ({
    region: i < 2 ? 'global' : 'na',
    title: a.title.length > 90 ? a.title.substring(0, 90) + '...' : a.title,
    summary: a.description ? a.description.substring(0, 180) : '',
    source: a.source?.name || 'News',
    sourceUrl: a.url
  }));
}

function buildEmailHTML(topStories, summaryStories) {
  const tagColor = { high: '#ff6b6b', mid: '#f5a623', watch: '#1fce8a' };
  const tagLabel = { high: 'High Impact', mid: 'Mid Impact', watch: 'Watch' };
  const typeLabel = { 'new-car': 'New Car', arch: 'Architecture', design: 'Design' };

  function topCard(n, regionLabel, regionColor, regionBg) {
    const tags = (n.tags || []).map(t => `<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${tagColor[t]}22;color:${tagColor[t]};border:1px solid ${tagColor[t]}44;font-family:monospace;">${tagLabel[t] || t}</span>`).join(' ');
    const srcLink = n.sourceUrl ? `<a href="${n.sourceUrl}" style="color:#4a9eff;font-size:11px;font-family:monospace;text-decoration:none;">${n.source} ↗</a>` : `<span style="font-size:11px;color:#888;">${n.source}</span>`;
    const pts = (n.keyPoints || []).map(p => `<li style="margin:4px 0;font-size:13px;color:#8a8fa8;line-height:1.6;">${p}</li>`).join('');
    return `
<div style="background:#151820;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:16px;">
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
    <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${regionBg};color:${regionColor};border:1px solid ${regionColor}33;font-family:monospace;">${regionLabel}</span>
    <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:rgba(155,127,232,0.12);color:#9b7fe8;border:1px solid rgba(155,127,232,0.2);font-family:monospace;">${typeLabel[n.type] || n.type}</span>
    <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:rgba(31,206,138,0.1);color:#1fce8a;font-family:monospace;">★ Top Story</span>
  </div>
  <h3 style="font-size:15px;font-weight:500;color:#e8eaf0;margin:0 0 8px;line-height:1.5;">${n.title}</h3>
  <p style="font-size:13px;color:#8a8fa8;margin:0 0 16px;line-height:1.6;">${n.summary}</p>
  <div style="background:#1c2030;border-radius:8px;padding:14px;margin-bottom:10px;">
    <div style="font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#555b72;font-family:monospace;margin-bottom:8px;">Background</div>
    <p style="font-size:13px;color:#8a8fa8;margin:0;line-height:1.7;">${n.background}</p>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
    <div style="background:#1c2030;border-radius:8px;padding:14px;">
      <div style="font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#555b72;font-family:monospace;margin-bottom:6px;">Key Points</div>
      <ul style="margin:0;padding-left:16px;">${pts}</ul>
    </div>
    <div style="background:#1c2030;border-radius:8px;padding:14px;">
      <div style="font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#555b72;font-family:monospace;margin-bottom:6px;">Industry Impact</div>
      <p style="font-size:13px;color:#8a8fa8;margin:0;line-height:1.7;">${n.impact}</p>
    </div>
  </div>
  <div style="background:#1c2030;border-radius:8px;padding:14px;margin-bottom:12px;">
    <div style="font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#555b72;font-family:monospace;margin-bottom:6px;">Smart Cockpit Opportunity</div>
    <p style="font-size:13px;color:#8a8fa8;margin:0;line-height:1.7;">${n.cockpit}</p>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">${srcLink}<div>${tags}</div></div>
</div>`;
  }

  function summaryCard(n, regionLabel, regionColor, regionBg) {
    const srcLink = n.sourceUrl ? `<a href="${n.sourceUrl}" style="color:#4a9eff;font-size:11px;font-family:monospace;text-decoration:none;">${n.source} ↗</a>` : `<span style="font-size:11px;color:#888;">${n.source}</span>`;
    const appUrl = `https://appcommons27.github.io/AppCommons/automotive-intelligence.html?analyze=1&url=${encodeURIComponent(n.sourceUrl||'')}&title=${encodeURIComponent(n.title)}&summary=${encodeURIComponent(n.summary)}&source=${encodeURIComponent(n.source)}`;
    return `
<div style="background:#151820;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;margin-bottom:10px;">
  <div style="display:flex;gap:8px;margin-bottom:8px;">
    <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${regionBg};color:${regionColor};border:1px solid ${regionColor}33;font-family:monospace;">${regionLabel}</span>
  </div>
  <h4 style="font-size:14px;font-weight:500;color:#e8eaf0;margin:0 0 6px;line-height:1.5;">${n.title}</h4>
  <p style="font-size:12px;color:#8a8fa8;margin:0 0 10px;line-height:1.6;">${n.summary}</p>
  <div style="display:flex;align-items:center;justify-content:space-between;">${srcLink}<a href="${appUrl}" style="font-size:11px;color:#1fce8a;text-decoration:none;font-family:monospace;">Deep analysis in app ↗</a></div>
</div>`;
  }

  const globalSummaries = summaryStories.filter(s => s.region === 'global');
  const naSummaries = summaryStories.filter(s => s.region === 'na');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Automotive Intelligence — ${dateLabel}</title></head>
<body style="margin:0;padding:0;background:#0d0f12;font-family:'DM Sans',system-ui,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:32px 24px;">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
    <div style="width:36px;height:36px;background:#1fce8a;border-radius:8px;display:flex;align-items:center;justify-content:center;">
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none"><rect x="1" y="6" width="16" height="8" rx="3" fill="#0d1a12"/><circle cx="5" cy="14" r="2" fill="#0d1a12"/><circle cx="13" cy="14" r="2" fill="#0d1a12"/><path d="M3 6L5.5 2H12.5L15 6" stroke="#0d1a12" stroke-width="1.5" stroke-linecap="round"/></svg>
    </div>
    <div>
      <div style="font-size:16px;font-weight:600;color:#e8eaf0;">Automotive Intelligence Daily</div>
      <div style="font-size:11px;color:#555b72;font-family:monospace;">${dateLabel}</div>
    </div>
  </div>
  <p style="font-size:13px;color:#555b72;margin:0 0 28px;border-bottom:1px solid rgba(255,255,255,0.07);padding-bottom:16px;">Top stories powered by Claude AI · Additional summaries by NewsAPI</p>
  <h2 style="font-size:11px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:#555b72;margin:0 0 16px;font-family:monospace;">★ TOP STORIES</h2>
  ${topCard(topStories.global, 'Global · 全球', '#1fce8a', 'rgba(31,206,138,0.12)')}
  ${topCard(topStories.na, 'North America · 北美', '#4a9eff', 'rgba(74,158,255,0.12)')}
  <h2 style="font-size:11px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:#555b72;margin:24px 0 16px;border-top:1px solid rgba(255,255,255,0.07);padding-top:20px;font-family:monospace;">MORE NEWS</h2>
  ${globalSummaries.map(n => summaryCard(n, 'Global · 全球', '#1fce8a', 'rgba(31,206,138,0.12)')).join('')}
  ${naSummaries.map(n => summaryCard(n, 'North America · 北美', '#4a9eff', 'rgba(74,158,255,0.12)')).join('')}
  <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;">
    <a href="https://appcommons27.github.io/AppCommons/automotive-intelligence.html" style="color:#1fce8a;font-size:12px;text-decoration:none;font-family:monospace;">Open full app ↗</a>
    <p style="font-size:11px;color:#555b72;margin:8px 0 0;">Automotive Intelligence Daily · ${dateLabel}</p>
  </div>
</div></body></html>`;
}

async function sendEmail(html) {
  const recipients = TO_EMAIL.split(',').map(e => e.trim());
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: 'Automotive Intelligence <onboarding@resend.dev>', to: recipients, subject: `🚗 Automotive Intelligence Daily — ${dateLabel}`, html })
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(JSON.stringify(e)); }
  return await res.json();
}

async function main() {
  console.log(`[${dateStr}] Starting Automotive Intelligence Daily...`);
  const topStories = await fetchTopStories();
  console.log(`Top: Global="${topStories.global?.title?.substring(0,40)}" NA="${topStories.na?.title?.substring(0,40)}"`);
  const excludeUrls = [topStories.global?.sourceUrl, topStories.na?.sourceUrl].filter(Boolean);
  const summaryStories = await fetchSummaryStories(excludeUrls);
  console.log(`Summaries: ${summaryStories.length}`);
  const html = buildEmailHTML(topStories, summaryStories);
  const result = await sendEmail(html);
  console.log('✅ Email sent:', result.id);
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
