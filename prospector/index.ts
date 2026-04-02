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

async function scrapeEmail(websiteUrl: string): Promise<string> {
  try {
    const res = await fetch(websiteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    // Buscar mailto: links
    const emails: string[] = [];
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const email = href.replace('mailto:', '').split('?')[0].trim();
      if (email && email.includes('@')) emails.push(email);
    });
    if (emails.length) return emails[0];

    // Buscar email no texto
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex) ?? [];
    const filtered = matches.filter(e =>
      !e.includes('example.') &&
      !e.includes('sentry.') &&
      !e.includes('.png') &&
      !e.includes('.jpg') &&
      !e.endsWith('.js')
    );
    return filtered[0] ?? '';
  } catch {
    return '';
  }
}

// ─── WHATSAPP CHECK (EVOLUTION API) ───────────────────────────────────────

function normalizePhone(phone: string): string {
  // Remove tudo que não é número
  const digits = phone.replace(/\D/g, '');
  // Se começar com 0, remove
  const clean = digits.startsWith('0') ? digits.slice(1) : digits;
  // Adiciona DDI 55 se não tiver
  if (!clean.startsWith('55')) return '55' + clean;
  return clean;
}

async function checkWhatsApp(phones: string[]): Promise<Record<string, boolean>> {
  try {
    const normalized = phones.map(normalizePhone);
    const res = await fetch(`${EVO_URL}/chat/whatsappNumbers/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers: normalized }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json() as any[];
    const result: Record<string, boolean> = {};
    for (let i = 0; i < phones.length; i++) {
      result[phones[i]] = data[i]?.exists ?? false;
    }
    return result;
  } catch {
    // Se Evolution não está disponível, retorna false pra todos
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

  // 3. Checar emails nos sites
  const withEmail: PlaceDetail[] = [];
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    process.stdout.write(`\r📧 Buscando emails... ${i+1}/${details.length}`);
    if (d.website) {
      d.email = await scrapeEmail(d.website);
    }
    withEmail.push(d);
  }
  console.log('\n');

  // 4. Checar WhatsApp em lote
  const phones = details.filter(d => d.phone).map(d => d.phone!);
  console.log(`📱 Verificando WhatsApp em ${phones.length} números...`);
  const waResults = await checkWhatsApp(phones);

  // 5. Montar resultados
  const results: ProspectResult[] = withEmail.map(d => {
    const temWA = d.phone ? (waResults[d.phone] ?? false) : false;
    const r: ProspectResult = {
      nome: d.name,
      endereco: d.formatted_address,
      telefone: d.phone ?? '',
      email: d.email ?? '',
      tem_site: !!d.website,
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
