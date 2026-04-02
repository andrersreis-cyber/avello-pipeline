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

// ─── WHATSAPP DETECTION (lógica BR) ───────────────────────────────────────
// No Brasil, celulares têm 9 dígitos locais começando com 9.
// Ex: (27) 99248-9096 → celular → tem WhatsApp
//     (27) 3225-5773  → fixo    → não tem WhatsApp
// Essa heurística tem ~95% de precisão para BR e elimina dependência de API externa.

function isBrazilianMobile(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  // Formato: DDD (2 dígitos) + 9 + 8 dígitos = 11 dígitos locais
  // Ex: 27992489096 → DDD 27, começa com 9, 9 dígitos locais
  if (digits.length === 11) {
    const localPart = digits.slice(2); // remove DDD
    return localPart.startsWith('9');
  }
  // Com DDI 55: 5527992489096 = 13 dígitos
  if (digits.length === 13 && digits.startsWith('55')) {
    const localPart = digits.slice(4); // remove 55 + DDD
    return localPart.startsWith('9');
  }
  return false;
}

// Mantém Evolution disponível para uso futuro no pipeline principal
export async function checkWhatsAppEvolution(phones: string[]): Promise<Record<string, boolean>> {
  const instance = encodeURIComponent(EVO_INSTANCE);
  const normalized = phones.map(p => {
    const d = p.replace(/\D/g, '');
    const c = d.startsWith('0') ? d.slice(1) : d;
    return c.startsWith('55') ? c : '55' + c;
  });
  const res = await fetch(`${EVO_URL}/chat/whatsappNumbers/${instance}`, {
    method: 'POST',
    headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ numbers: normalized }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Evolution ${res.status}`);
  const data = await res.json() as any[];
  const result: Record<string, boolean> = {};
  phones.forEach((p, i) => result[p] = data[i]?.exists ?? false);
  return result;
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

// ─── BAIRROS POR CIDADE ────────────────────────────────────────────────────

const BAIRROS: Record<string, string[]> = {
  'Vitória ES': [
    'Jardim da Penha', 'Jardim Camburi', 'Bento Ferreira',
    'Santa Lúcia', 'Mata da Praia', 'Goiabeiras',
    'Maruípe', 'São Pedro', 'Resistência',
    'Santo Antônio', 'Caratoíra', 'Itararé',
    'Consolação', 'São Cristóvão', 'Forte São João',
  ],
  'Vila Velha ES': [
    'Itaparica', 'Coqueiral', 'Glória',
    'Jardim Colorado', 'Centro', 'Cobilândia',
    'Riviera da Barra', 'Praia de Itaparica',
  ],
  'Serra ES': [
    'Laranjeiras', 'Carapina', 'Novo Horizonte',
    'Bairro de Fátima', 'André Carloni', 'Parque Residencial Laranjeiras',
  ],
  'Cariacica ES': [
    'Alto Lage', 'Campo Grande', 'Itacibá',
    'Jardim América', 'Porto de Santana',
  ],
};

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function coletarPlaces(queries: string[]): Promise<RawPlace[]> {
  const allPlaces: RawPlace[] = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    let pageToken: string | undefined;
    for (let page = 0; page < 2; page++) {
      const { results, next_page_token } = await searchPlaces(query, pageToken);
      for (const r of results) {
        if (!seenIds.has(r.place_id)) {
          seenIds.add(r.place_id);
          allPlaces.push(r);
        }
      }
      pageToken = next_page_token;
      if (!pageToken) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    process.stdout.write(`\r🗺️  Queries: ${queries.indexOf(query)+1}/${queries.length} | Únicos: ${allPlaces.length}`);
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('\n');
  return allPlaces;
}

async function run() {
  const args      = process.argv.slice(2);
  const segmento  = args[0] ?? 'restaurantes';
  const cidade    = args[1] ?? 'Vitória ES';
  const modoBairros = args[2] === '--bairros';

  console.log(`\n🔑 Google Maps API: ${GOOGLE_KEY ? '✅ OK' : '❌ NÃO ENCONTRADA'}`);
  if (!GOOGLE_KEY) process.exit(1);

  // Montar lista de queries
  let queries: string[];
  if (modoBairros && BAIRROS[cidade]) {
    queries = BAIRROS[cidade].map(b => `${segmento} em ${b} ${cidade}`);
    console.log(`\n🏘️  Modo bairros: ${queries.length} bairros em "${cidade}"`);
  } else {
    queries = [`${segmento} em ${cidade}`];
    console.log(`\n🔍 Modo cidade: "${segmento} em ${cidade}"`);
  }
  console.log('⏳ Buscando...\n');

  // 1. Buscar lugares
  const allPlaces = await coletarPlaces(queries);
  console.log(`📍 ${allPlaces.length} estabelecimentos únicos encontrados\n`);

  // 2. Pegar detalhes
  const details: PlaceDetail[] = [];
  for (let i = 0; i < allPlaces.length; i++) {
    process.stdout.write(`\r📋 Coletando detalhes... ${i+1}/${allPlaces.length}`);
    const detail = await getPlaceDetails(allPlaces[i].place_id);
    details.push(detail);
    await new Promise(r => setTimeout(r, 120));
  }
  console.log('\n');

  // 3. Enriquecer email via site real
  const enriched: PlaceDetail[] = [];
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    process.stdout.write(`\r📧 Buscando emails... ${i+1}/${details.length} — ${d.name.slice(0,28)}`);
    if (d.website && !/instagram|facebook|twitter|tiktok|linktr/.test(d.website)) {
      d.email = await scrapeEmail(d.website);
    }
    enriched.push(d);
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('\n');

  // 4. Montar resultados com heurística de WhatsApp BR
  const results: ProspectResult[] = enriched.map(d => {
    const temWA = isBrazilianMobile(d.phone ?? '');
    const temSiteReal = !!(d.website && !/instagram|facebook|twitter|tiktok|linktr/.test(d.website));

    const r: ProspectResult = {
      nome: d.name,
      endereco: d.formatted_address,
      telefone: d.phone ?? '',
      email: d.email ?? '',
      tem_site: temSiteReal,
      site_url: d.website ?? '',
      tem_whatsapp: temWA,
      rating: d.rating ?? 0,
      avaliacoes: d.user_ratings_total ?? 0,
      qualidade: 'lixo',
    };
    r.qualidade = calcQuality(r);
    return r;
  });

  // 5. Filtrar: priorizar sem site real (alvo principal Avello)
  const semSiteReal = results.filter(r => !r.tem_site);
  const comSiteReal = results.filter(r => r.tem_site);
  console.log(`\n🎯 Sem site real: ${semSiteReal.length} | Com site: ${comSiteReal.length}`);

  // 6. Imprimir relatório (foco em sem site)
  const label = modoBairros ? `${segmento} em ${cidade} [bairros]` : `${segmento} em ${cidade}`;
  printReport(semSiteReal, label); // relatório só dos sem site real

  // 7. Salvar dois JSONs: todos + só alvos
  const outDir = path.join(__dirname, '../reports');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = Date.now();
  const slug = `${segmento}-${cidade.replace(/ /g,'-')}${modoBairros?'-bairros':''}`;

  const allFile   = path.join(outDir, `${ts}-${slug}-todos.json`);
  const alvoFile  = path.join(outDir, `${ts}-${slug}-alvos.json`);

  fs.writeFileSync(allFile,  JSON.stringify(results, null, 2));
  fs.writeFileSync(alvoFile, JSON.stringify(semSiteReal, null, 2));

  console.log(`\n💾 Todos:  ${allFile}`);
  console.log(`🎯 Alvos:  ${alvoFile}\n`);
}

run().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
