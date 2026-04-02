# Avello Pipeline — Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um funil de vendas de sites com orquestrador de agentes IA que prospecta leads, faz contato por email e telefone, envia o portfólio da Avello e aquece o lead até o fechamento.

**Architecture:** Um agente orquestrador central (Claude API) coordena 4 sub-agentes especializados — Prospecção, Email, Telefone e Portfolio — cada um executando sua etapa do funil. O estado de cada lead é persistido no Supabase e visível em um dashboard React. Workflows no n8n disparam os agentes nas transições de etapa do funil.

**Tech Stack:** Claude API (orquestrador + agentes), n8n (workflow automation), Supabase (banco + realtime), React + Vite + Shadcn/UI + TypeScript (dashboard CRM), VAPI.ai (agente de voz), Gmail API (email), Google Maps API / Apify (prospecção)

---

## Visão do Funil

```
[PROSPECÇÃO] → [PRIMEIRO CONTATO EMAIL] → [FOLLOW-UP TELEFONE] → [ENVIO PORTFÓLIO] → [AQUECIMENTO] → [FECHAMENTO]
     ↓                    ↓                        ↓                      ↓                  ↓               ↓
  Lead criado       Email enviado            Call realizada         Portfolio visto      Reunião marcada   Cliente!
```

## Subsistemas (planos separados)

| Plano | Arquivo | Status |
|-------|---------|--------|
| 1 - Prospecção | `2026-04-02-sub1-prospeccao.md` | 🔜 |
| 2 - Agente Email | `2026-04-02-sub2-email-agent.md` | 🔜 |
| 3 - Agente Telefone | `2026-04-02-sub3-phone-agent.md` | 🔜 |
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
│   │   ├── phone-agent.ts     # Sub-agente: contato por telefone
│   │   └── portfolio-agent.ts # Sub-agente: envio de portfólio
│   ├── tools/
│   │   ├── supabase.ts        # Client Supabase + helpers
│   │   ├── gmail.ts           # Gmail API helper
│   │   ├── vapi.ts            # VAPI.ai helper (calls)
│   │   └── maps.ts            # Google Maps API helper
│   ├── prompts/
│   │   ├── orchestrator.ts    # System prompt do orquestrador
│   │   ├── email.ts           # Prompts do agente de email
│   │   ├── phone.ts           # Prompts do agente de telefone
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

# VAPI (phone agent)
VAPI_API_KEY=
VAPI_PHONE_NUMBER=

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

## Task 5: Agente de Telefone (VAPI)

**Files:**
- Create: `orchestrator/tools/vapi.ts`
- Create: `orchestrator/prompts/phone.ts`
- Create: `orchestrator/agents/phone-agent.ts`

- [ ] **Step 1: Criar `orchestrator/tools/vapi.ts`**

```typescript
export async function initiateCall(params: {
  to: string;
  assistantId: string;
  variables: Record<string, string>;
}): Promise<string> {
  const res = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER,
      customer: { number: params.to },
      assistantId: params.assistantId,
      assistantOverrides: {
        variableValues: params.variables,
      },
    }),
  });

  if (!res.ok) throw new Error(`VAPI error: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}
```

- [ ] **Step 2: Criar `orchestrator/prompts/phone.ts`**

```typescript
export const PHONE_AGENT_PROMPT = `
Você é a Sofia, assistente da Avello — agência de sites para pequenos negócios.

Tom: amigável, direto, respeitoso. Nunca pressione. Máximo 3 minutos de ligação.

Script base:
1. Se apresentar: "Oi, aqui é a Sofia da Avello. Tudo bem?"
2. Motivo: "Entramos em contato pois vimos que o {{business}} ainda não tem site e queríamos apresentar uma solução rápida."
3. Pergunta: "Você tem uns 2 minutinhos pra eu te contar?"
4. Se sim: mencionar portfólio + preço inicial R$497 + perguntar se pode enviar por WhatsApp
5. Se não: pedir melhor horário para ligar de volta

Variáveis disponíveis: {{name}}, {{business}}, {{segment}}, {{city}}
`;
```

- [ ] **Step 3: Criar `orchestrator/agents/phone-agent.ts`**

```typescript
import { initiateCall } from '../tools/vapi.js';
import { createInteraction, updateLeadStage } from '../tools/supabase.js';
import type { Lead, AgentResult } from '../types.js';

const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID ?? '';

export async function runPhoneAgent(
  lead: Lead,
  payload: Record<string, unknown>
): Promise<AgentResult> {
  if (!lead.phone) {
    return { success: false, message: 'Lead sem telefone' };
  }

  const callId = await initiateCall({
    to: lead.phone,
    assistantId: VAPI_ASSISTANT_ID,
    variables: {
      name: lead.name,
      business: lead.business,
      segment: lead.segment,
      city: lead.city,
    },
  });

  await createInteraction({
    lead_id: lead.id,
    type: 'call',
    direction: 'outbound',
    content: `Call iniciada via VAPI. ID: ${callId}`,
    agent_notes: 'Aguardando transcrição do VAPI webhook',
    status: 'sent',
  });

  await updateLeadStage(lead.id, 'call_realizada', 20);

  console.log(`[PhoneAgent] Call iniciada para ${lead.phone} — VAPI ID: ${callId}`);

  return {
    success: true,
    message: `Call iniciada: ${callId}`,
    next_stage: 'call_realizada',
    score_delta: 20,
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add orchestrator/agents/phone-agent.ts orchestrator/tools/vapi.ts orchestrator/prompts/phone.ts
git commit -m "feat: agente de telefone com VAPI.ai"
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

// Webhook VAPI — receber transcrição das calls
app.post('/api/webhook/vapi', async (req, res) => {
  const { call_id, transcript, summary } = req.body;
  console.log(`[VAPI Webhook] Call ${call_id}: ${summary}`);
  // TODO: atualizar interaction com transcrição
  res.json({ ok: true });
});

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
- ✅ Contato por telefone com agente IA — Task 5
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
