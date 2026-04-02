import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

dotenv.config();

// ─── CONFIG ────────────────────────────────────────────────────────────────

const GOOGLE_KEY     = process.env.GOOGLE_MAPS_API_KEY!;
const EVO_URL        = process.env.EVOLUTION_API_URL!;
const EVO_KEY        = process.env.EVOLUTION_API_KEY!;
const EVO_INSTANCE   = process.env.EVOLUTION_INSTANCE!;

// ─── TIPOS ─────────────────────────────────────────────────────────────────

interface RawPlace {
  place_id: string;
  name: string;
  formatted_address: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
}

interface PlaceDetail extends RawPlace {
  phone?: string;
  email?: string;
  whatsapp_from_instagram?: string;
}

interface ProspectResult {
  nome: string;
  endereco: string;
  telefone: string;
  email: string;
  tem_site: boolean;
  site_url: string;
  tem_whatsapp: boolean;
  rating: number;
  avaliacoes: number;
  qualidade: 'ótimo' | 'bom' | 'incompleto' | 'lixo';
}

// ─── GOOGLE MAPS ───────────────────────────────────────────────────────────

async function searchPlaces(query: string, pageToken?: string): Promise<{ results: RawPlace[]; next_page_token?: string }> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', query);
  url.searchParams.set('key', GOOGLE_KEY);
  url.searchParams.set('language', 'pt-BR');
  if (pageToken) url.searchParams.set('pagetoken', pageToken);

  const res = await fetch(url.toString());
  const data = await res.json() as any;
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error(`\n❌ Google API erro: ${data.status} — ${data.error_message ?? ''}`);
  }
  console.log(`\n🔎 Google status: ${data.status} | Resultados: ${data.results?.length ?? 0}`);
  return { results: data.results ?? [], next_page_token: data.next_page_token };
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetail> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total');
  url.searchParams.set('key', GOOGLE_KEY);
  url.searchParams.set('language', 'pt-BR');

  const res = await fetch(url.toString());
  const data = await res.json() as any;
  const r = data.result ?? {};

  return {
    place_id: placeId,
    name: r.name ?? '',
    formatted_address: r.formatted_address ?? '',
    phone: r.formatted_phone_number,
    website: r.website,
    rating: r.rating,
    user_ratings_total: r.user_ratings_total,
  };
}

// ─── EMAIL SCRAPER ─────────────────────────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EMAIL_BLACKLIST = ['example.', 'sentry.', 'wixpress.', 'squarespace.',
  'wordpress.', 'schemas.', 'google.', 'emailprotected'];

function extractEmails(html: string): string[] {
  const $ = cheerio.load(html);
  const found: string[] = [];

  // mailto: links (mais confiável)
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (email.includes('@')) found.push(email);
  });

  // Regex no HTML
  const matches: string[] = html.match(EMAIL_REGEX) ?? [];
  matches.forEach((e: string) => {
    const lower = e.toLowerCase();
    const isClean = !EMAIL_BLACKLIST.some(b => lower.includes(b))
      && !lower.endsWith('.js')
      && !lower.endsWith('.png')
      && !lower.endsWith('.jpg');
    if (isClean) found.push(lower);
  });

  return [...new Set(found)];
}

async function scrapeEmail(websiteUrl: string): Promise<string> {
  // Ignora se for rede social — vai pelo scraper dedicado
  if (/instagram|facebook|twitter|tiktok/.test(websiteUrl)) return '';

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

    // Tenta página principal
    const mainRes = await fetch(websiteUrl, { headers, signal: AbortSignal.timeout(6000) });
    const mainHtml = await mainRes.text();
    const mainEmails = extractEmails(mainHtml);
    if (mainEmails.length) return mainEmails[0];

    // Tenta /contato e /contact
    const base = new URL(websiteUrl).origin;
    for (const slug of ['/contato', '/contact', '/fale-conosco', '/sobre']) {
      try {
        const r = await fetch(base + slug, { headers, signal: AbortSignal.timeout(4000) });
        const emails = extractEmails(await r.text());
        if (emails.length) return emails[0];
      } catch { /* ignora */ }
    }
    return '';
  } catch {
    return '';
  }
}

// ─── INSTAGRAM SCRAPER ─────────────────────────────────────────────────────

function extractInstagramUsername(url: string): string {
  try {
    const match = url.match(/instagram\.com\/([^/?#]+)/);
    return match ? match[1].replace(/\/$/, '') : '';
  } catch { return ''; }
}

async function scrapeInstagramBio(username: string): Promise<{ whatsapp: string; email: string }> {
  if (!username || username === 'p' || username === 'reel') return { whatsapp: '', email: '' };
  try {
    const url = `https://www.instagram.com/${username}/`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();

    // WhatsApp via wa.me
    const waMatch = html.match(/wa\.me\/(\d{10,15})/);
    const whatsapp = waMatch ? waMatch[1] : '';

    // Email na bio
    const emails = extractEmails(html);
    const email = emails.find(e => !e.includes('example')) ?? '';

    return { whatsapp, email };
  } catch {
    return { whatsapp: '', email: '' };
  }
}

// ─── WHATSAPP CHECK (EVOLUTION API) ───────────────────────────────────────

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const clean = digits.startsWith('0') ? digits.slice(1) : digits;
  if (!clean.startsWith('55')) return '55' + clean;
  // Garantir celular com 9 dígito (Brasil)
  // Ex: 5527 3xxx-xxxx (fixo) ou 5527 9xxxx-xxxx (celular)
  return clean;
}

async function checkWhatsApp(phones: string[]): Promise<Record<string, boolean>> {
  try {
    // FIX: encode o nome da instância (suporta espaços e caracteres especiais)
    const instance = encodeURIComponent(EVO_INSTANCE);
    const normalized = phones.map(normalizePhone);

    console.log(`\n🔍 Checando WhatsApp via Evolution (instância: ${EVO_INSTANCE})...`);

    const res = await fetch(`${EVO_URL}/chat/whatsappNumbers/${instance}`, {
      method: 'POST',
      headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers: normalized }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`❌ Evolution API erro ${res.status}: ${await res.text()}`);
      throw new Error('Evolution API error');
    }

    const data = await res.json() as any[];
    console.log(`✅ Evolution respondeu: ${data.length} números verificados`);

    const result: Record<string, boolean> = {};
    for (let i = 0; i < phones.length; i++) {
      result[phones[i]] = data[i]?.exists ?? false;
    }
    return result;
  } catch (err) {
    console.warn(`⚠️  WhatsApp check falhou: ${err}. Continuando sem WA check.`);
    const result: Record<string, boolean> = {};
    phones.forEach(p => result[p] = false);
    return result;
  }
}

// ─── QUALIDADE ─────────────────────────────────────────────────────────────

function calcQuality(r: ProspectResult): 'ótimo' | 'bom' | 'incompleto' | 'lixo' {
  const hasContact = r.tem_whatsapp || r.email;
  if (!hasContact) return 'lixo';
  if (r.tem_whatsapp && r.email) return 'ótimo';
  if (r.tem_whatsapp || r.email) return 'bom';
  return 'incompleto';
}

// ─── RELATÓRIO ─────────────────────────────────────────────────────────────

function printReport(results: ProspectResult[], query: string) {
  const total     = results.length;
  const otimo     = results.filter(r => r.qualidade === 'ótimo').length;
  const bom       = results.filter(r => r.qualidade === 'bom').length;
  const incompleto = results.filter(r => r.qualidade === 'incompleto').length;
  const lixo      = results.filter(r => r.qualidade === 'lixo').length;
  const comWA     = results.filter(r => r.tem_whatsapp).length;
  const comEmail  = results.filter(r => r.email).length;
  const semSite   = results.filter(r => !r.tem_site).length;
  const aproveitaveis = otimo + bom;

  console.log('\n' + '═'.repeat(60));
  console.log(`📊 RELATÓRIO DE PROSPECÇÃO`);
  console.log(`🔍 Busca: "${query}"`);
  console.log('═'.repeat(60));
  console.log(`Total encontrado:        ${total}`);
  console.log(`Sem site:                ${semSite} (${pct(semSite, total)}%)`);
  console.log('─'.repeat(60));
  console.log(`✅ Com WhatsApp:         ${comWA} (${pct(comWA, total)}%)`);
  console.log(`📧 Com email:            ${comEmail} (${pct(comEmail, total)}%)`);
  console.log('─'.repeat(60));
  console.log(`⭐ Ótimo (WA + email):   ${otimo}`);
  console.log(`👍 Bom (WA ou email):    ${bom}`);
  console.log(`⚠️  Incompleto:          ${incompleto}`);
  console.log(`🗑️  Lixo (sem contato):  ${lixo}`);
  console.log('─'.repeat(60));
  console.log(`🎯 Aproveitáveis:        ${aproveitaveis}/${total} (${pct(aproveitaveis, total)}%)`);
  console.log('═'.repeat(60));

  // Top leads
  const top = results
    .filter(r => r.qualidade === 'ótimo' || r.qualidade === 'bom')
    .slice(0, 10);

  if (top.length) {
    console.log('\n🏆 TOP LEADS APROVEITÁVEIS:\n');
    top.forEach((r, i) => {
      const wa    = r.tem_whatsapp ? '📱 WA' : '    ';
      const email = r.email ? `📧 ${r.email}` : '';
      const site  = r.tem_site ? '🌐' : '🚫 sem site';
      console.log(`${i+1}. ${r.nome}`);
      console.log(`   ${r.telefone}  ${wa}  ${email}`);
      console.log(`   ${site}  ⭐${r.rating} (${r.avaliacoes} avaliações)`);
      console.log('');
    });
  }
}

function pct(val: number, total: number) {
  return total ? Math.round((val / total) * 100) : 0;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function run() {
  const args = process.argv.slice(2);
  const segmento = args[0] ?? 'restaurantes';
  const cidade   = args[1] ?? 'Vitória ES';
  const query    = `${segmento} em ${cidade}`;

  // DEBUG — testar chave diretamente
  console.log(`\n🔑 Chave Google: ${GOOGLE_KEY ? GOOGLE_KEY.slice(0,10)+'...' : 'NÃO ENCONTRADA'}`);
  const testUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=restaurantes+em+Vitoria+ES&key=${GOOGLE_KEY}&language=pt-BR`;
  const testRes = await fetch(testUrl);
  const testData = await testRes.json() as any;
  console.log(`🔎 Status: ${testData.status}`);
  console.log(`📋 Resultados: ${testData.results?.length ?? 0}`);
  if (testData.error_message) console.log(`❌ Erro: ${testData.error_message}`);
  if (testData.status !== 'OK') { process.exit(1); }

  console.log(`\n🔍 Buscando: "${query}"...`);
  console.log('⏳ Isso pode levar 1-2 minutos...\n');

  // 1. Buscar lugares (até 2 páginas = ~40 resultados)
  const allPlaces: RawPlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 2; page++) {
    const { results, next_page_token } = await searchPlaces(query, pageToken);
    allPlaces.push(...results);
    pageToken = next_page_token;
    if (!pageToken) break;
    await new Promise(r => setTimeout(r, 2000)); // Google exige delay entre páginas
  }

  console.log(`📍 ${allPlaces.length} estabelecimentos encontrados\n`);

  // 2. Pegar detalhes de cada lugar
  const details: PlaceDetail[] = [];
  for (let i = 0; i < allPlaces.length; i++) {
    const place = allPlaces[i];
    process.stdout.write(`\r📋 Coletando detalhes... ${i+1}/${allPlaces.length}`);
    const detail = await getPlaceDetails(place.place_id);
    details.push(detail);
    await new Promise(r => setTimeout(r, 100));
  }
  console.log('\n');

  // 3. Enriquecer: email (site) + Instagram bio (WA + email)
  const enriched: PlaceDetail[] = [];
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    process.stdout.write(`\r🔎 Enriquecendo... ${i+1}/${details.length} — ${d.name.slice(0,30)}`);

    // 3a. Scrape de email no site real
    if (d.website && !/instagram|facebook|twitter|tiktok/.test(d.website)) {
      d.email = await scrapeEmail(d.website);
    }

    // 3b. Instagram bio → WhatsApp direto + email
    const igUrl = d.website && /instagram/.test(d.website)
      ? d.website
      : '';
    if (igUrl) {
      const username = extractInstagramUsername(igUrl);
      if (username) {
        const igData = await scrapeInstagramBio(username);
        if (igData.whatsapp) d.whatsapp_from_instagram = igData.whatsapp;
        if (igData.email && !d.email) d.email = igData.email;
      }
    }

    enriched.push(d);
    await new Promise(r => setTimeout(r, 300)); // respeitar rate limit
  }
  console.log('\n');

  // 4. Checar WhatsApp via Evolution (apenas celulares)
  const celulares = enriched
    .filter(d => d.phone && /9\d{4}/.test(d.phone.replace(/\D/g,'')))
    .map(d => d.phone!);
  console.log(`📱 Verificando WhatsApp em ${celulares.length} celulares...`);
  const waResults = await checkWhatsApp(celulares);

  // 5. Montar resultados
  const results: ProspectResult[] = enriched.map(d => {
    const waFromEvolution = d.phone ? (waResults[d.phone] ?? false) : false;
    const waFromInsta     = !!d.whatsapp_from_instagram;
    const temWA           = waFromEvolution || waFromInsta;
    const phoneWA         = waFromInsta ? d.whatsapp_from_instagram! : (d.phone ?? '');

    const r: ProspectResult = {
      nome: d.name,
      endereco: d.formatted_address,
      telefone: d.phone ?? '',
      email: d.email ?? '',
      tem_site: !!(d.website && !/instagram|facebook/.test(d.website)),
      site_url: d.website ?? '',
      tem_whatsapp: temWA,
      rating: d.rating ?? 0,
      avaliacoes: d.user_ratings_total ?? 0,
      qualidade: 'lixo',
    };
    r.qualidade = calcQuality(r);
    return r;
  });

  // 6. Imprimir relatório
  printReport(results, query);

  // 7. Salvar JSON
  const outDir  = path.join(__dirname, '../reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${Date.now()}-${segmento}-${cidade.replace(/ /g,'-')}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Dados salvos em: ${outFile}\n`);
}

run().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
