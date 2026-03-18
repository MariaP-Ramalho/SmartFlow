# Resolve-to-Close

Agente de Suporte Autonomo que resolve solicitacoes fim a fim: identifica o problema, busca contexto, executa diagnosticos guiados, abre/atualiza tickets, aciona RMA/garantia quando aplicavel, e encerra o caso quando atendido -- com aprovacao humana por regras e trilha de auditoria completa.

## Stack Tecnica

- **Backend**: NestJS 10 + TypeScript + Mongoose
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS v4 + shadcn-inspired components
- **Database**: MongoDB
- **LLM**: Multi-provider (OpenAI, Anthropic, Azure OpenAI) com fallback automatico
- **Tickets**: ClickUp API v2
- **Charts**: Recharts

## Arquitetura

```
backend/src/
  agent/          -> Motor ReAct (loop autonomo + ferramentas + fluxos de diagnostico)
  agent/llm/      -> Camada de abstracao LLM multi-provider
  agent/tools/    -> Ferramentas do agente (tickets, KB, diagnostico, politicas)
  agent/flows/    -> Motor de arvore de decisao + templates JSON
  tickets/        -> CRUD de tickets + integracao ClickUp
  knowledge/      -> RAG (ingestao, embeddings, busca semantica)
  policies/       -> Motor de politicas + aprovacoes
  audit/          -> Trilha de auditoria global
  metrics/        -> Metricas ROI + computacao diaria

frontend/src/
  app/            -> Paginas (dashboard, tickets, auditoria, politicas, aprovacoes, KB)
  components/     -> Componentes reutilizaveis (layout, ui, dashboard)
  lib/            -> API client, utils
  types/          -> TypeScript interfaces
```

## Requisitos

- Node.js >= 18
- MongoDB (local ou Atlas)
- Pelo menos uma API key de LLM (OpenAI, Anthropic, ou Azure OpenAI)
- ClickUp API key (opcional, para integracao de tickets)

## Setup

### 1. Configurar variaveis de ambiente

```bash
# Backend
cp backend/.env.example backend/.env
# Edite backend/.env com suas chaves

# Frontend
cp frontend/.env.example frontend/.env.local
```

### 2. Instalar dependencias

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Iniciar MongoDB

```bash
# Se usando MongoDB local
mongod --dbpath /data/db

# Ou configure MONGODB_URI no .env para MongoDB Atlas
```

### 4. Rodar o projeto

```bash
# Terminal 1 - Backend (porta 3001)
cd backend && npm run start:dev

# Terminal 2 - Frontend (porta 3000)
cd frontend && npm run dev
```

### 5. Acessar

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Swagger Docs**: http://localhost:3001/api/docs

## API Endpoints

### Agent
- `POST /agent/process` - Processar novo caso
- `POST /agent/message` - Mensagem de follow-up
- `GET /agent/status/:caseId` - Status de um caso

### Tickets
- `POST /tickets` - Criar ticket
- `GET /tickets` - Listar tickets (com filtros)
- `GET /tickets/:id` - Detalhe do ticket
- `PATCH /tickets/:id` - Atualizar ticket
- `PATCH /tickets/:id/status` - Mudar status
- `POST /tickets/:id/resolve` - Resolver ticket
- `GET /tickets/stats` - Estatisticas

### Knowledge Base
- `POST /knowledge` - Ingerir documento
- `POST /knowledge/bulk` - Ingestao em lote
- `GET /knowledge` - Listar documentos
- `GET /knowledge/search?q=` - Busca semantica
- `PATCH /knowledge/:id` - Atualizar
- `DELETE /knowledge/:id` - Remover

### Policies
- `POST /policies` - Criar politica
- `GET /policies` - Listar politicas
- `POST /policies/evaluate` - Avaliar acao contra politicas
- `POST /approvals` - Solicitar aprovacao
- `GET /approvals` - Aprovacoes pendentes
- `PATCH /approvals/:id/resolve` - Aprovar/Rejeitar

### Audit
- `GET /audit` - Listar logs de auditoria
- `GET /audit/case/:caseId` - Timeline de um caso
- `GET /audit/stats` - Estatisticas de auditoria

### Metrics
- `GET /metrics/dashboard` - Dashboard snapshot
- `GET /metrics/summary` - Resumo por periodo
- `GET /metrics/timeseries` - Serie temporal
- `POST /metrics/compute` - Computar metricas diarias

## Fluxo do Agente

1. Recebe solicitacao via POST /agent/process
2. Cria caso (UUID) e ticket
3. Busca contexto na base de conhecimento (RAG)
4. Analisa com LLM e decide proxima acao
5. Executa ferramentas (ticket, KB, diagnostico, politica)
6. Verifica politicas antes de acoes de risco
7. Se aprovacao necessaria, cria requisicao e aguarda
8. Resolve ticket e registra na trilha de auditoria
9. Cada passo e logado para auditoria completa

## Docker

### Desenvolvimento local

```bash
# Criar .env no backend (copie de backend/.env.example)
cp backend/.env.example backend/.env

# Subir os containers
docker compose up -d --build

# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
# Swagger: http://localhost:3001/api/docs
```

### Produção (GitLab CI)

O pipeline em `.gitlab-ci.yml` faz build e push das imagens `resolve-backend` e `resolve-frontend` para o Docker Hub, e deploy via `stack-resolve.yml`.

**Variáveis no GitLab CI/CD:**
- `DOCKER_HUB_USER` - usuário Docker Hub
- `DOCKER_HUB_PWD` - senha (masked)
- `NEXT_PUBLIC_API_URL` - URL pública da API (ex: `https://api.resolve.softwell.com.br`)

**No servidor de deploy** (`/opt/apps/resolve`):
- Criar `.env` com variáveis do backend (MONGODB_URI, JWT_SECRET, etc.) e `DOCKER_HUB_USER`, `VERSION`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`
- Criar rede: `docker network create infra-network` (se não existir)

**Produção - obrigatório:**
- `JWT_SECRET`: mínimo 32 caracteres, não usar valores padrão
- `CORS_ORIGINS`: origens permitidas separadas por vírgula (ex: `https://app.resolve.softwell.com.br`)
- `NEXT_PUBLIC_API_URL`: URL pública da API para o frontend

## Variaveis de Ambiente

Veja `backend/.env.example` para a lista completa. As principais:

| Variavel | Descricao |
|---|---|
| `MONGODB_URI` | URI do MongoDB |
| `OPENAI_API_KEY` | Chave da API OpenAI |
| `ANTHROPIC_API_KEY` | Chave da API Anthropic |
| `CLICKUP_API_KEY` | Chave da API ClickUp |
| `CLICKUP_LIST_ID` | ID da lista padrao no ClickUp |
| `DEFAULT_LLM_PROVIDER` | Provider padrao (openai, anthropic, azure-openai) |
