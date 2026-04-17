// fetch-news.js
// Runs daily via GitHub Actions: fetches automotive news from NewsAPI and stores in Firebase

const NEWS_API_KEY = '64467d00422a487e83ead23a128b0116';
const FIREBASE_SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const today = new Date();
const dateStr = today.toISOString().split('T')[0];

// ── Firebase Admin (using REST API to avoid npm install) ──
async function getFirebaseToken() {
  const { createSign } = await import('crypto');

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: FIREBASE_SERVICE_ACCOUNT.client_email,
    sub: FIREBASE_SERVICE_ACCOUNT.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(FIREBASE_SERVICE_ACCOUNT.private_key, 'base64url');
  const jwt = `${header}.${payload}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  return data.access_token;
}

async function saveToFirestore(token, news) {
  const projectId = FIREBASE_SERVICE_ACCOUNT.project_id;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/dailyNews/${dateStr}`;

  // Convert news array to Firestore format
  const fields = {
    date: { stringValue: dateStr },
    savedAt: { stringValue: new Date().toISOString() },
    news: {
      arrayValue: {
        values: news.map(n => ({
          mapValue: {
            fields: {
              id: { integerValue: n.id },
              region: { stringValue: n.region },
              type: { stringValue: n.type },
              title: { stringValue: n.title },
              summary: { stringValue: n.summary },
              source: { stringValue: n.source },
              sourceUrl: { stringValue: n.sourceUrl || '' },
              readMin: { integerValue: n.readMin }
            }
          }
        }))
      }
    }
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });

  if (!res.ok) {
    const e = await res.json();
    throw new Error(JSON.stringify(e));
  }
  return await res.json();
}

// ── Fetch from NewsAPI ──
function detectType(text) {
  const t = text.toLowerCase();
  if (t.includes('design') || t.includes('concept') || t.includes('style') || t.includes('reveal')) return 'design';
  if (t.includes('platform') || t.includes('software') || t.includes('sdv') || t.includes('adas') || t.includes('electric') || t.includes('battery') || t.includes('architecture')) return 'arch';
  return 'new-car';
}

async function fetchNews() {
  console.log(`[${dateStr}] Fetching automotive news from NewsAPI...`);
  const queries = [
    'automotive electric vehicle new car launch',
    'automotive software cockpit infotainment ADAS platform',
    'North America auto industry Ford GM Tesla Stellantis',
    'car design concept reveal automaker',
    'EV battery electric vehicle technology 2026'
  ];

  const allArticles = [];
  for (const q of queries) {
    const res = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${NEWS_API_KEY}`);
    if (res.ok) {
      const d = await res.json();
      if (d.articles) allArticles.push(...d.articles);
    }
  }

  const seen = new Set();
  const filtered = allArticles.filter(a => {
    if (!a.title || a.title === '[Removed]' || !a.description) return false;
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  // Pick 3 global + 3 NA
  const global = filtered.slice(0, 3);
  const na = filtered.slice(3, 6);

  return [...global, ...na].map((a, i) => ({
    id: i + 1,
    region: i < 3 ? 'global' : 'na',
    type: detectType(a.title + ' ' + (a.description || '')),
    title: a.title.length > 100 ? a.title.substring(0, 100) + '...' : a.title,
    summary: a.description ? a.description.substring(0, 250) : '',
    source: a.source?.name || 'News',
    sourceUrl: a.url,
    readMin: 3
  }));
}

async function main() {
  console.log(`Fetching news for ${dateStr}...`);
  const news = await fetchNews();
  console.log(`Fetched ${news.length} articles`);

  console.log('Getting Firebase token...');
  const token = await getFirebaseToken();

  console.log('Saving to Firestore...');
  await saveToFirestore(token, news);
  console.log(`✅ Saved ${news.length} articles to Firestore for ${dateStr}`);
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
