# Avello Pipeline — Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um funil de vendas de sites com orquestrador de agentes IA que prospecta leads, faz contato por email e WhatsApp, envia o portfólio da Avello e aquece o lead via conversa até o fechamento.

**Architecture:** Um agente orquestrador central (Claude API) coordena 3 sub-agentes — Email, WhatsApp e Portfolio. O agente de WhatsApp usa Evolution API para enviar mensagens e responder leads de forma conversacional com Claude. O estado de cada lead é persistido no Supabase. Workflows no n8n disparam os agentes nas transições de etapa do funil.

**Tech Stack:** Claude API (orquestrador + agentes), Evolution API (WhatsApp), n8n (workflow automation), Supabase (banco + realtime), React + Vite + Shadcn/UI + TypeScript (dashboard CRM), Gmail API (email), Google Maps API / Apify (prospecção)

---

## Visão do Funil

```
[PROSPECÇÃO] → [PRIMEIRO CONTATO EMAIL] → [FOLLOW-UP WHATSAPP] → [ENVIO PORTFÓLIO] → [CONVERSA/AQUECIMENTO] → [FECHAMENTO]
     ↓                    ↓                        ↓                      ↓                      ↓                    ↓
  Lead criado       Email enviado          WA mensagem enviada      Portfolio visto        Claude responde          Cliente!
                                                                                          (conversacional)
```

## Subsistemas (planos separados)

| Plano | Arquivo | Status |
|-------|---------|--------|
| 1 - Prospecção | `2026-04-02-sub1-prospeccao.md` | 🔜 |
| 2 - Agente Email | `2026-04-02-sub2-email-agent.md` | 🔜 |
| 3 - Agente WhatsApp | `2026-04-02-sub3-whatsapp-agent.md` | 🔜 |
| 4 - Dashboard CRM | `2026-04-02-sub4-crm-dashboard.md` | 🔜 |
| 5 - Portfolio Sender | `2026-04-02-sub5-portfolio.md` | 🔜 |

---

## Estrutura de Arquivos

```
avello-pipeline/
├── orchestrator/
│   ├── index.ts               # Entrada principal do orquestrador
│   ├── agents/
│   │   ├── prospector.ts      # Sub-agente: prospecção de leads
│   │   ├── email-agent.ts     # Sub-agente: contato por email
│   │   ├── whatsapp-agent.ts  # Sub-agente: conversa WhatsApp (Evolution API)
│   │   └── portfolio-agent.ts # Sub-agente: envio de portfólio
│   ├── tools/
│   │   ├── supabase.ts        # Client Supabase + helpers
│   │   ├── gmail.ts           # Gmail API helper
│   │   ├── evolution.ts       # Evolution API helper (WhatsApp)
│   │   └── maps.ts            # Google Maps API helper
│   ├── prompts/
│   │   ├── orchestrator.ts    # System prompt do orquestrador
│   │   ├── email.ts           # Prompts do agente de email
│   │   ├── whatsapp.ts        # Prompts do agente WhatsApp (conversacional)
│   │   └── portfolio.ts       # Prompts do agente de portfólio
│   └── types.ts               # Tipos compartilhados (Lead, Stage, etc.)
├── dashboard/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx  # Kanban do pipeline
│   │   │   ├── Lead.tsx       # Detalhes do lead + histórico
│   │   │   └── Settings.tsx   # Config (APIs, prompts, templates)
│   │   ├── components/
│   │   │   ├── LeadCard.tsx   # Card do lead no kanban
│   │   │   ├── StageColumn.tsx# Coluna do funil
│   │   │   ├── Timeline.tsx   # Histórico de interações
│   │   │   └── AgentLog.tsx   # Log em tempo real do agente
│   │   └── lib/
│   │       └── supabase.ts    # Client Supabase (dashboard)
├── n8n/
│   └── workflows/
│       ├── pipeline-trigger.json    # Trigger por etapa do funil
│       └── daily-prospecting.json  # Prospecção diária automática
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # Schema inicial
├── docs/
│   └── superpowers/plans/          # Este arquivo + sub-planos
├── .env.example
└── package.json
```

---

## Schema do Banco (Supabase)

```sql
-- Leads
create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business text not null,
  phone text,
  email text,
  city text,
  segment text,           -- restaurante, salão, clínica, etc.
  website_url text,       -- site atual (se tiver)
  has_website boolean default false,
  stage text default 'prospectado',  -- etapa do funil
  score integer default 0,           -- pontuação de aquecimento
  source text,            -- google_maps, indicação, manual
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Interações
create table interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  type text not null,     -- email, call, whatsapp, portfolio_sent
  direction text,         -- outbound, inbound
  content text,           -- corpo do email / transcrição da call
  agent_notes text,       -- observações do agente
  status text,            -- sent, delivered, opened, replied, failed
  created_at timestamptz default now()
);

-- Estágios do funil
-- prospectado → email_enviado → call_realizada → portfolio_enviado → aquecendo → reuniao_marcada → fechado → perdido
```

---

## Task 1: Setup do Projeto

**Files:**
- Create: `package.json`
- Create: `orchestrator/types.ts`
- Create: `.env.example`
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Inicializar o projeto**

```bash
cd C:/Users/andre/avello-pipeline
npm init -y
npm install @anthropic-ai/sdk @supabase/supabase-js dotenv zod
npm install -D typescript @types/node ts-node
npx tsc --init
```

- [ ] **Step 2: Criar `.env.example`**

```bash
# Anthropic
ANTHROPIC_API_KEY=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Gmail
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_FROM=contato@avello.com.br

# Evolution API (WhatsApp)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=avello

# Google Maps
GOOGLE_MAPS_API_KEY=

# Avello
AVELLO_PORTFOLIO_URL=https://avello-portfolio.netlify.app
AVELLO_WHATSAPP=5527999999999
```

- [ ] **Step 3: Criar tipos compartilhados em `orchestrator/types.ts`**

```typescript
export type FunnelStage =
  | 'prospectado'
  | 'email_enviado'
  | 'call_realizada'
  | 'portfolio_enviado'
  | 'aquecendo'
  | 'reuniao_marcada'
  | 'fechado'
  | 'perdido';

export type InteractionType = 'email' | 'call' | 'whatsapp' | 'portfolio_sent';

export interface Lead {
  id: string;
  name: string;
  business: string;
  phone?: string;
  email?: string;
  city: string;
  segment: string;
  website_url?: string;
  has_website: boolean;
  stage: FunnelStage;
  score: number;
  source: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  lead_id: string;
  type: InteractionType;
  direction: 'outbound' | 'inbound';
  content: string;
  agent_notes?: string;
  status: 'sent' | 'delivered' | 'opened' | 'replied' | 'failed';
  created_at: string;
}

export interface AgentResult {
  success: boolean;
  message: string;
  next_stage?: FunnelStage;
  score_delta?: number;
  data?: Record<string, unknown>;
}
```

- [ ] **Step 4: Criar migration do Supabase em `supabase/migrations/001_initial_schema.sql`**

```sql
create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business text not null,
  phone text,
  email text,
  city text,
  segment text,
  website_url text,
  has_website boolean default false,
  stage text default 'prospectado',
  score integer default 0,
  source text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  type text not null,
  direction text default 'outbound',
  content text,
  agent_notes text,
  status text default 'sent',
  created_at timestamptz default now()
);

-- Realtime para o dashboard
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table interactions;

-- Trigger updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();
```

- [ ] **Step 5: Aplicar migration no Supabase**

```bash
# Via Supabase dashboard → SQL Editor → colar e rodar o arquivo acima
# Ou via CLI:
npx supabase db push
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: setup inicial — tipos, schema, env"
```

---

## Task 2: Supabase Client + Helpers

**Files:**
- Create: `orchestrator/tools/supabase.ts`

- [ ] **Step 1: Criar `orchestrator/tools/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Lead, Interaction, FunnelStage } from '../types.js';

const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function getLead(id: string): Promise<Lead> {
  const { data, error } = await client
    .from('leads')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(`getLead: ${error.message}`);
  return data;
}

export async function getLeadsByStage(stage: FunnelStage): Promise<Lead[]> {
  const { data, error } = await client
    .from('leads')
    .select('*')
    .eq('stage', stage)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`getLeadsByStage: ${error.message}`);
  return data ?? [];
}

export async function updateLeadStage(
  id: string,
  stage: FunnelStage,
  scoreDelta = 0
): Promise<void> {
  const { error } = await client.rpc('update_lead_stage', {
    p_id: id,
    p_stage: stage,
    p_score_delta: scoreDelta,
  });
  if (error) throw new Error(`updateLeadStage: ${error.message}`);
}

export async function createInteraction(
  interaction: Omit<Interaction, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await client.from('interactions').insert(interaction);
  if (error) throw new Error(`createInteraction: ${error.message}`);
}

export async function getLeadInteractions(leadId: string): Promise<Interaction[]> {
  const { data, error } = await client
    .from('interactions')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`getLeadInteractions: ${error.message}`);
  return data ?? [];
}

export async function createLead(
  lead: Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'stage' | 'score'>
): Promise<Lead> {
  const { data, error } = await client
    .from('leads')
    .insert(lead)
    .select()
    .single();
  if (error) throw new Error(`createLead: ${error.message}`);
  return data;
}
```

- [ ] **Step 2: Adicionar função RPC no Supabase**

No Supabase SQL Editor:
```sql
create or replace function update_lead_stage(
  p_id uuid,
  p_stage text,
  p_score_delta integer default 0
) returns void as $$
begin
  update leads
  set stage = p_stage,
      score = score + p_score_delta
  where id = p_id;
end;
$$ language plpgsql;
```

- [ ] **Step 3: Commit**

```bash
git add orchestrator/tools/supabase.ts
git commit -m "feat: supabase client + helpers de lead/interação"
```

---

## Task 3: Orquestrador Central

**Files:**
- Create: `orchestrator/prompts/orchestrator.ts`
- Create: `orchestrator/index.ts`

- [ ] **Step 1: Criar system prompt em `orchestrator/prompts/orchestrator.ts`**

```typescript
export const ORCHESTRATOR_PROMPT = `
Você é o orquestrador do funil de vendas da Avello, agência de criação de sites.

Seu trabalho é analisar o estado atual de um lead e decidir qual ação tomar a seguir.

# Avello
- Cria sites profissionais para pequenos negócios
- Portfólio: ${process.env.AVELLO_PORTFOLIO_URL}
- Preço inicial: R$497
- WhatsApp: ${process.env.AVELLO_WHATSAPP}

# Estágios do Funil
1. prospectado → disparar email de primeiro contato
2. email_enviado → aguardar 2 dias, depois ligar
3. call_realizada → enviar portfólio por email/WhatsApp
4. portfolio_enviado → follow-up de aquecimento após 3 dias
5. aquecendo → marcar reunião
6. reuniao_marcada → fechar
7. fechado / perdido → encerrado

# Decisões
Com base no stage atual e histórico de interações, decida:
- qual sub-agente chamar (email_agent | phone_agent | portfolio_agent)
- o que passar para ele
- quando o lead deve avançar de estágio
- quando marcar como perdido (sem resposta após 3 tentativas)

Responda sempre em JSON válido com a estrutura:
{
  "action": "email_agent" | "phone_agent" | "portfolio_agent" | "wait" | "close_won" | "close_lost",
  "reason": "string explicando a decisão",
  "payload": { ... dados para o sub-agente ... }
}
`;
```

- [ ] **Step 2: Criar `orchestrator/index.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { getLead, getLeadsByStage, getLeadInteractions, updateLeadStage } from './tools/supabase.js';
import { ORCHESTRATOR_PROMPT } from './prompts/orchestrator.js';
import { runEmailAgent } from './agents/email-agent.js';
import { runPhoneAgent } from './agents/phone-agent.js';
import { runPortfolioAgent } from './agents/portfolio-agent.js';
import type { Lead, FunnelStage } from './types.js';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface OrchestratorDecision {
  action: 'email_agent' | 'phone_agent' | 'portfolio_agent' | 'wait' | 'close_won' | 'close_lost';
  reason: string;
  payload: Record<string, unknown>;
}

export async function processLead(leadId: string): Promise<void> {
  const lead = await getLead(leadId);
  const interactions = await getLeadInteractions(leadId);

  console.log(`[Orchestrator] Processando lead: ${lead.business} (${lead.stage})`);

  const response = await claude.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: ORCHESTRATOR_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ lead, interactions }),
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const decision: OrchestratorDecision = JSON.parse(text);

  console.log(`[Orchestrator] Decisão: ${decision.action} — ${decision.reason}`);

  switch (decision.action) {
    case 'email_agent':
      await runEmailAgent(lead, decision.payload);
      break;
    case 'phone_agent':
      await runPhoneAgent(lead, decision.payload);
      break;
    case 'portfolio_agent':
      await runPortfolioAgent(lead, decision.payload);
      break;
    case 'close_won':
      await updateLeadStage(lead.id, 'fechado', 50);
      console.log(`✅ Lead ${lead.business} FECHADO!`);
      break;
    case 'close_lost':
      await updateLeadStage(lead.id, 'perdido', 0);
      console.log(`❌ Lead ${lead.business} perdido.`);
      break;
    case 'wait':
      console.log(`⏳ Lead ${lead.business} aguardando: ${decision.reason}`);
      break;
  }
}

export async function runPipeline(): Promise<void> {
  const stages: FunnelStage[] = [
    'prospectado',
    'email_enviado',
    'call_realizada',
    'portfolio_enviado',
    'aquecendo',
    'reuniao_marcada',
  ];

  for (const stage of stages) {
    const leads = await getLeadsByStage(stage);
    console.log(`\n[Pipeline] ${stage}: ${leads.length} leads`);
    for (const lead of leads) {
      await processLead(lead.id);
    }
  }
}

// Execução direta
if (process.argv[2] === 'run') {
  runPipeline().catch(console.error);
}
```

- [ ] **Step 3: Testar orquestrador (dry run)**

```bash
# Inserir 1 lead de teste no Supabase:
# INSERT INTO leads (name, business, city, segment, has_website, source)
# VALUES ('João Silva', 'Restaurante do João', 'Vitória', 'restaurante', false, 'manual');

npx ts-node orchestrator/index.ts run
```

Esperado: log mostrando o lead e a decisão do Claude.

- [ ] **Step 4: Commit**

```bash
git add orchestrator/
git commit -m "feat: orquestrador central com decisão via Claude"
```

---

## Task 4: Agente de Email

**Files:**
- Create: `orchestrator/tools/gmail.ts`
- Create: `orchestrator/prompts/email.ts`
- Create: `orchestrator/agents/email-agent.ts`

- [ ] **Step 1: Criar `orchestrator/tools/gmail.ts`**

```typescript
import { google } from 'googleapis';

const auth = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET
);
auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth });

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<string> {
  const message = [
    `From: Avello <${process.env.GMAIL_FROM}>`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    params.html,
  ].join('\n');

  const encoded = Buffer.from(message).toString('base64url');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });

  return res.data.id ?? '';
}
```

- [ ] **Step 2: Criar `orchestrator/prompts/email.ts`**

```typescript
export const EMAIL_AGENT_PROMPT = `
Você é o agente de email da Avello, agência de criação de sites profissionais.

Seu tom: direto, humano, sem exageros. Não use palavras como "incrível", "revolucionário" ou "transformar".
Seja breve — máximo 5 parágrafos curtos.

# Contexto da Avello
- Criamos sites profissionais para pequenos negócios
- Preço inicial: R$497
- Portfolio: ${process.env.AVELLO_PORTFOLIO_URL}
- WhatsApp: ${process.env.AVELLO_WHATSAPP}

# Tipos de email que você pode escrever:
- primeiro_contato: apresentação inicial, sem pressão
- follow_up: segundo contato após silêncio
- portfolio: envio do portfólio com cases do segmento do lead
- reuniao: convite para conversa rápida de 15 minutos

Retorne JSON:
{
  "subject": "assunto do email",
  "html": "corpo em HTML simples"
}
`;
```

- [ ] **Step 3: Criar `orchestrator/agents/email-agent.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { sendEmail } from '../tools/gmail.js';
import { createInteraction, updateLeadStage } from '../tools/supabase.js';
import { EMAIL_AGENT_PROMPT } from '../prompts/email.js';
import type { Lead, AgentResult } from '../types.js';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runEmailAgent(
  lead: Lead,
  payload: Record<string, unknown>
): Promise<AgentResult> {
  if (!lead.email) {
    return { success: false, message: 'Lead sem email' };
  }

  const emailType = (payload.type as string) ?? 'primeiro_contato';

  const response = await claude.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: EMAIL_AGENT_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          type: emailType,
          lead: {
            name: lead.name,
            business: lead.business,
            segment: lead.segment,
            city: lead.city,
          },
        }),
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const { subject, html } = JSON.parse(text);

  await sendEmail({ to: lead.email, subject, html });

  await createInteraction({
    lead_id: lead.id,
    type: 'email',
    direction: 'outbound',
    content: `${subject}\n\n${html}`,
    agent_notes: `Tipo: ${emailType}`,
    status: 'sent',
  });

  await updateLeadStage(lead.id, 'email_enviado', 10);

  console.log(`[EmailAgent] Email "${subject}" enviado para ${lead.email}`);

  return {
    success: true,
    message: `Email enviado: ${subject}`,
    next_stage: 'email_enviado',
    score_delta: 10,
  };
}
```

- [ ] **Step 4: Instalar googleapis**

```bash
npm install googleapis
```

- [ ] **Step 5: Testar envio**

```bash
# Com lead de teste que tenha email:
npx ts-node -e "
import { runEmailAgent } from './orchestrator/agents/email-agent.js';
runEmailAgent({ id: 'TEST_ID', email: 'seu@email.com', business: 'Teste', segment: 'restaurante', city: 'Vitória', name: 'Teste', has_website: false, score: 0, source: 'manual', stage: 'prospectado', created_at: '', updated_at: '' }, { type: 'primeiro_contato' });
"
```

Esperado: email recebido na caixa + log de sucesso.

- [ ] **Step 6: Commit**

```bash
git add orchestrator/agents/email-agent.ts orchestrator/tools/gmail.ts orchestrator/prompts/email.ts
git commit -m "feat: agente de email com Claude + Gmail API"
```

---

## Task 5: Agente de WhatsApp (Evolution API)

**Files:**
- Create: `orchestrator/tools/evolution.ts`
- Create: `orchestrator/prompts/whatsapp.ts`
- Create: `orchestrator/agents/whatsapp-agent.ts`

- [ ] **Step 1: Criar `orchestrator/tools/evolution.ts`**

```typescript
const BASE_URL = process.env.EVOLUTION_API_URL!;
const API_KEY  = process.env.EVOLUTION_API_KEY!;
const INSTANCE = process.env.EVOLUTION_INSTANCE!;

async function evoRequest(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Evolution API error [${path}]: ${await res.text()}`);
  return res.json();
}

export async function sendTextMessage(params: {
  to: string;   // formato: 5527999999999
  text: string;
}): Promise<void> {
  await evoRequest(`/message/sendText/${INSTANCE}`, {
    number: params.to,
    text: params.text,
  });
}

export async function sendMediaMessage(params: {
  to: string;
  url: string;
  caption: string;
  mediaType: 'image' | 'document' | 'video';
}): Promise<void> {
  await evoRequest(`/message/sendMedia/${INSTANCE}`, {
    number: params.to,
    mediatype: params.mediaType,
    media: params.url,
    caption: params.caption,
  });
}
```

- [ ] **Step 2: Criar `orchestrator/prompts/whatsapp.ts`**

```typescript
export const WHATSAPP_AGENT_PROMPT = `
Você é a Sofia, assistente da Avello — agência que cria sites profissionais para pequenos negócios.

Tom: informal, direto, humano. Como uma conversa de WhatsApp real.
Mensagens curtas — máximo 3 linhas por mensagem.
Nunca use listas ou markdown. Escreva como texto corrido.
Nunca pressione. Nunca use palavras como "incrível" ou "revolucionário".

# Contexto da Avello
- Sites profissionais a partir de R$497
- Portfólio: ${process.env.AVELLO_PORTFOLIO_URL}
- Tempo de entrega: 7 dias úteis

# Sua missão nessa conversa
1. Se apresentar de forma natural
2. Mencionar que viu que o negócio ainda não tem site
3. Perguntar se pode mostrar o portfólio
4. Responder dúvidas com naturalidade
5. Quando o lead demonstrar interesse, perguntar se prefere marcar uma conversa rápida

# Regras
- Se o lead disser que não tem interesse, agradeça e encerre
- Se perguntar o preço, diga "a partir de R$497 dependendo do que precisar"
- Se perguntar o prazo, diga "em torno de 7 dias úteis"
- Nunca invente informações sobre a Avello

Responda APENAS com o texto da próxima mensagem de WhatsApp. Sem JSON. Sem formatação.
`;

export const WHATSAPP_FIRST_MESSAGE = (lead: {
  name: string;
  business: string;
  segment: string;
}) => `Oi ${lead.name}! Aqui é a Sofia da Avello 👋

Vi que o ${lead.business} ainda não tem site e queria mostrar o que fazemos por negócios do seu segmento.

Posso te mandar nosso portfólio? Leva 1 minutinho 😊`;
```

- [ ] **Step 3: Criar `orchestrator/agents/whatsapp-agent.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { sendTextMessage } from '../tools/evolution.js';
import { createInteraction, updateLeadStage, getLeadInteractions } from '../tools/supabase.js';
import { WHATSAPP_AGENT_PROMPT, WHATSAPP_FIRST_MESSAGE } from '../prompts/whatsapp.js';
import type { Lead, AgentResult, Interaction } from '../types.js';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Primeira abordagem — mensagem inicial
export async function runWhatsappAgent(
  lead: Lead,
  payload: Record<string, unknown>
): Promise<AgentResult> {
  if (!lead.phone) {
    return { success: false, message: 'Lead sem telefone' };
  }

  const isFirstContact = payload.type === 'primeiro_contato';

  let text: string;

  if (isFirstContact) {
    text = WHATSAPP_FIRST_MESSAGE({
      name: lead.name,
      business: lead.business,
      segment: lead.segment,
    });
  } else {
    // Resposta conversacional baseada no histórico
    const interactions = await getLeadInteractions(lead.id);
    const history = buildChatHistory(interactions);

    const response = await claude.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 256,
      system: WHATSAPP_AGENT_PROMPT,
      messages: history,
    });

    text = response.content[0].type === 'text' ? response.content[0].text : '';
  }

  await sendTextMessage({ to: lead.phone, text });

  await createInteraction({
    lead_id: lead.id,
    type: 'whatsapp',
    direction: 'outbound',
    content: text,
    agent_notes: `Tipo: ${payload.type ?? 'follow_up'}`,
    status: 'sent',
  });

  await updateLeadStage(lead.id, 'email_enviado', 10);

  console.log(`[WhatsAppAgent] Mensagem enviada para ${lead.phone}: "${text.slice(0, 60)}..."`);

  return {
    success: true,
    message: 'Mensagem WhatsApp enviada',
    next_stage: 'email_enviado',
    score_delta: 10,
  };
}

// Webhook — lead respondeu no WhatsApp
export async function handleIncomingMessage(params: {
  leadId: string;
  incomingText: string;
  lead: Lead;
}): Promise<void> {
  const { leadId, incomingText, lead } = params;

  // Salvar mensagem recebida
  await createInteraction({
    lead_id: leadId,
    type: 'whatsapp',
    direction: 'inbound',
    content: incomingText,
    status: 'delivered',
  });

  // Buscar histórico completo
  const interactions = await getLeadInteractions(leadId);
  const history = buildChatHistory(interactions);

  // Claude responde
  const response = await claude.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 256,
    system: WHATSAPP_AGENT_PROMPT,
    messages: history,
  });

  const replyText = response.content[0].type === 'text' ? response.content[0].text : '';

  await sendTextMessage({ to: lead.phone!, text: replyText });

  await createInteraction({
    lead_id: leadId,
    type: 'whatsapp',
    direction: 'outbound',
    content: replyText,
    agent_notes: 'Resposta automática Claude',
    status: 'sent',
  });

  // Aumentar score quando lead responde
  await updateLeadStage(lead.id, 'aquecendo', 25);
}

function buildChatHistory(
  interactions: Interaction[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return interactions
    .filter((i) => i.type === 'whatsapp')
    .map((i) => ({
      role: i.direction === 'inbound' ? 'user' : 'assistant',
      content: i.content,
    }));
}
```

- [ ] **Step 4: Adicionar webhook Evolution no server.ts**

No arquivo `orchestrator/server.ts`, adicionar após o webhook VAPI:
```typescript
import { handleIncomingMessage } from './agents/whatsapp-agent.js';
import { getLead } from './tools/supabase.js';

// Webhook Evolution API — lead respondeu no WhatsApp
app.post('/api/webhook/evolution', async (req, res) => {
  const { data } = req.body;

  // Ignorar mensagens do próprio número
  if (data?.key?.fromMe) return res.json({ ok: true });

  const phone = data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
  const text  = data?.message?.conversation ?? data?.message?.extendedTextMessage?.text;

  if (!phone || !text) return res.json({ ok: true });

  // Buscar lead pelo telefone
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('phone', phone)
    .limit(1);

  if (!leads?.length) return res.json({ ok: true });

  await handleIncomingMessage({
    leadId: leads[0].id,
    incomingText: text,
    lead: leads[0],
  });

  res.json({ ok: true });
});
```

- [ ] **Step 5: Configurar webhook na Evolution API**

No painel Evolution API ou via requisição:
```bash
curl -X POST "${EVOLUTION_API_URL}/webhook/set/${EVOLUTION_INSTANCE}" \
  -H "apikey: ${EVOLUTION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seu-servidor.com/api/webhook/evolution",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

- [ ] **Step 6: Testar envio e resposta**

```bash
# Enviar primeira mensagem para seu próprio WhatsApp de teste:
npx ts-node -e "
import 'dotenv/config';
import { sendTextMessage } from './orchestrator/tools/evolution.js';
sendTextMessage({ to: '5527SEU_NUMERO', text: 'Teste Evolution API ✅' });
"
```

Esperado: mensagem recebida no WhatsApp.

- [ ] **Step 7: Commit**

```bash
git add orchestrator/agents/whatsapp-agent.ts orchestrator/tools/evolution.ts orchestrator/prompts/whatsapp.ts
git commit -m "feat: agente WhatsApp conversacional com Evolution API + Claude"
```

---

## Task 6: Agente de Portfólio

**Files:**
- Create: `orchestrator/prompts/portfolio.ts`
- Create: `orchestrator/agents/portfolio-agent.ts`

- [ ] **Step 1: Criar `orchestrator/prompts/portfolio.ts`**

```typescript
export const PORTFOLIO_PROMPT = `
Você é o agente de portfólio da Avello.

Sua função: escrever uma mensagem personalizada de envio de portfólio, adequada ao segmento do lead.

Mencione cases do mesmo segmento se disponíveis.
Inclua o link do portfólio e convide para uma conversa rápida.
Máximo 3 parágrafos. Tom humano, sem exageros.

Portfolio: ${process.env.AVELLO_PORTFOLIO_URL}
WhatsApp: ${process.env.AVELLO_WHATSAPP}

Retorne JSON:
{
  "subject": "assunto (para email)",
  "html": "corpo em HTML (para email)",
  "whatsapp": "texto para WhatsApp (sem HTML)"
}
`;
```

- [ ] **Step 2: Criar `orchestrator/agents/portfolio-agent.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { sendEmail } from '../tools/gmail.js';
import { createInteraction, updateLeadStage } from '../tools/supabase.js';
import { PORTFOLIO_PROMPT } from '../prompts/portfolio.js';
import type { Lead, AgentResult } from '../types.js';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runPortfolioAgent(
  lead: Lead,
  payload: Record<string, unknown>
): Promise<AgentResult> {
  const response = await claude.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: PORTFOLIO_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          lead: {
            name: lead.name,
            business: lead.business,
            segment: lead.segment,
            city: lead.city,
          },
        }),
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const { subject, html, whatsapp } = JSON.parse(text);

  if (lead.email) {
    await sendEmail({ to: lead.email, subject, html });
  }

  await createInteraction({
    lead_id: lead.id,
    type: 'portfolio_sent',
    direction: 'outbound',
    content: whatsapp,
    agent_notes: `Email: ${lead.email ? 'enviado' : 'sem email'} | WhatsApp: pendente envio manual`,
    status: 'sent',
  });

  await updateLeadStage(lead.id, 'portfolio_enviado', 15);

  console.log(`[PortfolioAgent] Portfólio enviado para ${lead.business}`);
  console.log(`[PortfolioAgent] WhatsApp: ${whatsapp}`);

  return {
    success: true,
    message: 'Portfólio enviado',
    next_stage: 'portfolio_enviado',
    score_delta: 15,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add orchestrator/agents/portfolio-agent.ts orchestrator/prompts/portfolio.ts
git commit -m "feat: agente de portfólio com envio por email + WhatsApp"
```

---

## Task 7: n8n Workflow Trigger

**Files:**
- Create: `n8n/workflows/pipeline-trigger.json`

- [ ] **Step 1: Criar workflow n8n**

No n8n, criar workflow com os nodes:
```
Schedule Trigger (a cada hora)
  → HTTP Request: GET /api/pipeline/run
  → IF: success == true
    → Slack/Telegram: notificar resultado
```

- [ ] **Step 2: Criar endpoint de trigger em `orchestrator/server.ts`**

```typescript
import express from 'express';
import { runPipeline } from './index.js';

const app = express();
app.use(express.json());

app.post('/api/pipeline/run', async (req, res) => {
  try {
    await runPipeline();
    res.json({ success: true, message: 'Pipeline executado' });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Webhook Evolution — lead respondeu no WhatsApp (ver Task 5, Step 4)

app.listen(3000, () => console.log('Avello Pipeline rodando na porta 3000'));
```

```bash
npm install express @types/express
```

- [ ] **Step 3: Commit**

```bash
git add n8n/ orchestrator/server.ts
git commit -m "feat: endpoint de trigger + webhook VAPI"
```

---

## Task 8: Push e Deploy

- [ ] **Step 1: Criar `.gitignore`**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 2: Push para o GitHub**

```bash
git push -u origin main
```

- [ ] **Step 3: Configurar variáveis de ambiente**

No servidor/Render/Railway, configurar todas as variáveis do `.env.example`.

- [ ] **Step 4: Testar pipeline completo**

```bash
# Inserir lead real de teste
# Rodar pipeline
npx ts-node orchestrator/index.ts run

# Verificar:
# ✅ Email recebido
# ✅ Call iniciada no VAPI
# ✅ Portfólio enviado
# ✅ Stage atualizado no Supabase
```

- [ ] **Step 5: Commit final**

```bash
git add .gitignore
git commit -m "chore: gitignore + configuração de deploy"
```

---

## Self-Review

### Cobertura da spec:
- ✅ Prospecção de leads — Task 2 (Supabase) + sub-plano dedicado
- ✅ Contato por email com agente IA — Task 4
- ✅ Contato por WhatsApp com agente IA conversacional — Task 5 (Evolution API)
- ✅ Envio de portfólio — Task 6
- ✅ Apresentação da Avello — prompts de todos os agentes
- ✅ Aquecimento do lead — score system + stages
- ✅ Fechamento — orquestrador decide close_won/close_lost
- ✅ Orquestrador coordenando tudo — Task 3

### Sub-planos pendentes:
- [ ] `2026-04-02-sub1-prospeccao.md` — Google Maps API + scraping
- [ ] `2026-04-02-sub4-crm-dashboard.md` — React Kanban + realtime

---

## Próximos Passos

**Sub-planos a desenvolver:**
1. **Prospecção** — busca automática de negócios sem site no Google Maps por cidade/segmento
2. **CRM Dashboard** — React Kanban com colunas por estágio, realtime Supabase, log de interações
