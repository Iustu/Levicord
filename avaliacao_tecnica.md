# 🔍 Plano de Ação Priorizado — Levicord (Gaps Pendentes)

> Apenas itens **PENDENTES** — resolvidos removidos. Gaps detectados pelo cruzamento com os 4 livros de referência marcados com 📚.

---

## 🔴 PRIORIDADE 1: CRÍTICA (Bloqueantes para Produção)

| # | Área | Gap Técnico | Impacto | Fonte | Ação Recomendada |
|---|------|-------------|---------|-------|------------------|
| **1.1** | **DevSecOps** | Segredos hardcoded no `docker-compose.yml`: `JWT_SECRET: local-development-secret-change-in-production` e `DATABASE_URL` com senha em texto plano. | Compromisso total de auth e banco se o repositório for lido. | BSRS Cap.14 · DevSecOps L2 | Substituir por `${JWT_SECRET}` sem valor default. Injetar via `.env` nunca commitado + `.env.example` documentado. |
| **1.2** | **Testes** | Ausência absoluta de testes automatizados: `app.test.ts` vazio, frontend sem setup. Vitest instalado mas zero casos escritos. | Qualquer mudança em `isAdmin`, `evictLru` ou nas routes quebra silenciosamente. Gap unânime nos 4 livros. | BSRS Cap.13 · DevSecOps L3 · ESM Cap.8 · DMMT Cap.9 | Vitest + Supertest (server) + React Testing Library (web). Cobrir: `auth.service`, `channel.service`, `isAdmin`, `evictLru`, routes de auth e upload. |
| **1.3** | **DevSecOps / Supply Chain** 📚 | Sem SCA no CI: `pnpm audit` não roda, sem Dependabot. ~400 dependências transitivas sem auditoria de CVEs. | CVE em `fastify`, `ioredis`, `minio` ou `prisma` passa despercebido indefinidamente. | DevSecOps L3 · BSRS Cap.7 | `pnpm audit --audit-level=high` no CI (falha o build). Dependabot (`dependabot.yml`) para PRs automáticos semanais. |

---

## 🟠 PRIORIDADE 2: ALTA (Segurança Estrutural)

| # | Área | Gap Técnico | Impacto | Fonte | Ação Recomendada |
|---|------|-------------|---------|-------|------------------|
| **2.1** | **Segurança / Auditoria** 📚 | Sem log estruturado de eventos de segurança: auth failures, uploads rejeitados, ações admin, acessos negados. | Impossível investigar incidente post-mortem. Sem audit trail, sistema não é auditável. | BSRS Cap.15 · DevSecOps L2 | `app.log.info({ event, userId, ip, ... })` em: `requireAuth` (falha), `isAdmin` (negado), `upload.routes` (MIME rejeitado), logout, callback OAuth. |
| **2.2** | **DevSecOps / SAST** 📚 | Sem SAST além de `tsc`. TypeScript não detecta timing attacks, regex DoS, injection fora do ORM. `tsc --noEmit` também não roda no CI. | Vulnerabilidades sutis e erros de tipo não detectados no PR. | DevSecOps L3 · BSRS Cap.13 | Semgrep (`semgrep --config=p/typescript`) ou GitHub CodeQL. Adicionar `tsc --noEmit` como step separado de `build`. |
| **2.3** | **DevSecOps / DAST** 📚 | Sem DAST: nenhuma varredura de segurança contra a aplicação em execução. | Vulnerabilidades só detectáveis em runtime (SSRF, open redirect, headers ausentes) passam invisíveis. | DevSecOps L3 | OWASP ZAP scan (`zaproxy/action-full-scan`) no CI contra ambiente de staging. |
| **2.4** | **DevSecOps / Containers** 📚 | Sem container image scanning: imagens `node:20`, `postgres:16`, `redis:7` podem ter CVEs não detectados. | Vulnerabilidade no OS base compromete todo o serviço. | DevSecOps L3 | `aquasecurity/trivy-action` em cada Dockerfile no CI. Falhar build em severidade `CRITICAL`. |
| **2.5** | **Segurança / Least Privilege** 📚 | Sem ACL por canal: qualquer user autenticado lê/escreve qualquer canal. Só `isAdmin` diferencia roles. | Canais privados expostos a todos os membros autenticados. Viola menor privilégio. | BSRS Cap.5 · DevSecOps L2 | Campo `isPrivate` + tabela `ChannelMember` no Prisma. Guard em `GET /:id/messages` e handler `join_channel` verificando membership. |
| **2.6** | **Segurança / XSS** 📚 | `content` de mensagem salvo sem sanitização server-side. `react-markdown` mitiga no browser mas dados brutos no banco vazam via outras superfícies. | XSS latente. Qualquer client sem sanitização executa payload malicioso. | BSRS Cap.12 · DevSecOps L2 | `sanitize-html` no server. Sanitizar `content` antes de `prisma.message.create` em `channel.service.ts` e `dm.service.ts`. |
| **2.7** | **DevSecOps / Processo** 📚 | Sem processo de triagem de CVEs nem SLA de patching. SCA vai detectar vulnerabilidades mas sem processo a resposta fica indefinida. | CVEs críticos detectados mas sem ação por falta de processo. | DevSecOps L3 | Definir SLA: CRITICAL ≤ 48h, HIGH ≤ 7 dias. Issue automática via Dependabot. Triagem semanal designada. |

---

## 🟡 PRIORIDADE 3: MÉDIA (Confiabilidade, UX e Processo)

| # | Área | Gap Técnico | Impacto | Fonte | Ação Recomendada |
|---|------|-------------|---------|-------|------------------|
| **3.1** | **SRE / Backup** 📚 | Sem backup automático de PostgreSQL e MinIO. Sem RTO/RPO definidos. | Falha de disco = perda total de dados. | BSRS Caps.16-18 · DevSecOps L2 | `pg_dump` via cron + `mc mirror` para bucket externo. Documentar RTO/RPO no README. |
| **3.2** | **SRE / Resiliência** 📚 | Sem circuit breaker nem retry com backoff: se Postgres cair server crasha; se MinIO cair upload retorna 500 genérico. | Falha em cascata — um serviço derruba toda a stack sem aviso. | BSRS Cap.10 · DevSecOps L3 | `try/catch` com fallback em `ensureBucket()`. `/readyz` verificar MinIO. Retornar 503 descritivo. Retry com exponential backoff nos clients. |
| **3.3** | **SRE / Infraestrutura** 📚 | Single-instance de tudo sem réplica nem failover automático. | Qualquer restart derruba o sistema por inteiro. | BSRS Cap.8 | Postgres com réplica read-only. Redis Sentinel. Server com 2+ instâncias atrás de load balancer. |
| **3.4** | **UX / Navegação** 📚 | Sem busca de mensagens ou canais. Trunk Test (Krug Cap.6): qualquer site não trivial precisa de search. | Usabilidade degrada conforme volume de mensagens cresce. | DMMT Cap.6 | `GET /api/channels/:id/messages/search?q=` com `ILIKE` no Postgres. Campo de busca no header com debounce. |
| **3.5** | **Processo / Rastreabilidade** 📚 | Commits sem mensagem descritiva: `"teste"`, `"tche tche rere"`, `"Bahh tche"`. Sem conventional commits. | Rastreabilidade zero entre commits e features. Impossível gerar changelog. | ESM Cap.10 | Conventional Commits (`feat:`, `fix:`, `chore:`) + `commitlint` + `husky` pre-commit hook. |
| **3.6** | **Segurança / Processo** 📚 | Sem threat modelling formal (STRIDE). Controles existem mas sem rastreabilidade a adversários. Nenhum DFD produzido. | Controles são reativos, não proativos. | DevSecOps L2 · BSRS Cap.2 | Documento STRIDE para fluxos críticos: auth, upload, DMs, admin. Identificar ameaças por categoria. |
| **3.7** | **Processo / Code Review** 📚 | Commits diretos em `main` sem PRs nem revisor. Nenhuma verificação antes de merge. | Erro lógico ou gap de segurança entra sem segundo par de olhos. | DevSecOps L1 | Branch protection em `main`: PR + 1 approval obrigatório. Template de PR com checklist de segurança. |

---

## 🟢 PRIORIDADE 4: BAIXA ("Nice to Have")

| # | Área | Gap Técnico | Impacto | Fonte | Ação Recomendada |
|---|------|-------------|---------|-------|------------------|
| **4.1** | **UX / Mobile** 📚 | Sidebar de largura fixa sem media queries. App inutilizável em smartphone. `icon-btn` provavelmente abaixo de 44px touch target. | Bloqueante para qualquer expansão além de time interno fixo. | DMMT Cap.10 | Breakpoints CSS: sidebar colapsável em `< 768px`. Touch targets mínimos 44×44px. |
| **4.2** | **SRE / CI** 📚 | Sem deploy contínuo: pipeline tem lint + format + secret scan mas nenhum step de deploy automatizado. | Risco de divergência entre `main` e produção. | ESM Cap.10 | Job `deploy` no CI via SSH + `docker compose pull && docker compose up -d` após testes passarem. |
| **4.3** | **SRE / Processo** 📚 | Sem runbook nem playbook de incident response. Sem procedimento de credential rotation documentado. | Em caso de incidente: equipe sem roteiro de ação. | BSRS Caps.16-18 | `RUNBOOK.md`: reiniciar cada serviço, `pg_dump` manual, rotacionar `JWT_SECRET` sem downtime. |
| **4.4** | **UX / Onboarding** 📚 | Login page tem "Welcome Back" mas sem tagline explicando o sistema. Zero contexto para usuário novo. | Inviável para qualquer expansão além de time já conhecendo o produto. | DMMT Cap.7 | Tagline de uma linha: ex. `"Levicord — Chat seguro para sua equipe"`. |
| **4.5** | **Qualidade / Observabilidade** 📚 | Sem SLOs numéricos. Prometheus coleta mas sem threshold de alerta — impossível saber quando sistema degrada. | Grafana sem baseline de comparação. | ESM Cap.3 | Definir SLOs: `p95 < 200ms` em rotas de mensagem, uptime `≥ 99.5%`. Alertas no Grafana quando violados. |
| **4.6** | **Infraestrutura / Segurança** 📚 | Sem criptografia em repouso no PostgreSQL. Dados de mensagens e DMs em texto plano no volume Docker. | Disco comprometido fisicamente = todos os dados expostos. | BSRS Cap.14 | `pgcrypto` para colunas sensíveis ou encryption-at-rest no nível do volume (LUKS / provider managed). |
| **4.7** | **Qualidade / Testabilidade** 📚 | Services testáveis mas sem injeção de dependência: Prisma e Redis são imports diretos — mock exige `vi.mock` no módulo inteiro. | Testes de unit difíceis de isolar sem mock invasivo. | ESM Cap.8 | Injetar `prisma` e `redis` como parâmetros nas funções de service. Permite mock simples por parâmetro. |

---
## 📚 CRUZAMENTO COM LITERATURA TÉCNICA

> Análise de aderência do projeto aos conceitos dos 4 livros técnicos de referência. Evidências extraídas diretamente do código.

---

### 📖 Building Secure and Reliable Systems (Google / O'Reilly)

| Conceito | Status | Evidência |
|----------|--------|-----------|
| **CIA — Confidentiality** | ⚠️ PARCIAL | JWT httpOnly + `sameSite: 'strict'` (`auth.routes.ts`). Download autenticado (`download.routes.ts`). Sem criptografia em repouso no PostgreSQL. |
| **CIA — Integrity** | ⚠️ PARCIAL | Prisma ORM previne SQL injection. Schema Fastify com `pattern`/`maxLength` em `channel.routes.ts`. Sem HMAC em mensagens armazenadas. |
| **CIA — Availability** | ⚠️ PARCIAL | `/livez` + `/readyz` (`app.ts`). Graceful shutdown (`server.ts`). Sem redundância — single node. |
| **Least Privilege (Cap. 5)** | ⚠️ PARCIAL | `isAdmin` guard em rotas admin. IDOR fixado em DMs. Mas sem ACL por canal — qualquer user autenticado lê todos os canais. |
| **Auditing de Acesso (Cap. 5)** | ❌ AUSENTE | Nenhum log de quem acessou qual canal, arquivo ou rota admin. Sem trilha de auditoria consultável. |
| **Design for Understandability (Cap. 6)** | ✅ | SRP: `useSocket` → `useSocketConnection` + `useSocketListeners`; handlers separados por domínio (`messageHandler`, `dmHandler`, `voiceHandler`, `presenceHandler`). |
| **Centralized Security Requirements (Cap. 6)** | ✅ | `requireAuth` via `addHook('onRequest')` — sem duplicação por rota. `getAuthUserId` abstrai claim JWT. |
| **Defense in Depth (Cap. 8)** | ✅ | 7 camadas independentes: Helmet → CORS → RateLimit → JWT → isAdmin → MIME allowlist → UUID filename + sanitizeFilename. |
| **Controlling Blast Radius (Cap. 8)** | ⚠️ PARCIAL | Roles USER/ADMIN. MinIO presigned URL limita exposição. Sem isolamento por canal. |
| **Failure Domains / Redundancy (Cap. 8)** | ❌ AUSENTE | Single-instance de tudo. Sem réplica, sem circuit breaker, sem retry com backoff. |
| **Design for Recovery — Graceful Shutdown (Cap. 9)** | ✅ | `server.ts`: SIGTERM/SIGINT → `app.close()` → `io.close()` → `prisma.$disconnect()` → `redis.quit()`. Ordem correta. |
| **Secrets Management (Cap. 9 / Cap. 14)** | ⚠️ PARCIAL → CRÍTICO | `app.ts` faz `throw` se `JWT_SECRET` ausente. Mas `docker-compose.yml` ainda tem `JWT_SECRET: local-development-secret-change-in-production` hardcoded — **gap 1.1 pendente**. |
| **DoS Mitigation (Cap. 10)** | ✅ | `fastifyRateLimit` 100 req/min global. `checkRateLimit` Redis sliding window em `messageHandler` e `dmHandler`. |
| **Graceful Degradation (Cap. 10)** | ❌ AUSENTE | `/readyz` retorna 503 mas sem circuit breaker. Se Postgres cair, server crasha. |
| **Frameworks para Segurança (Cap. 12)** | ✅ | `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/jwt`, `@fastify/oauth2` — segurança via plugins, não código custom. |
| **Input Sanitization (Cap. 12)** | ✅ | `sanitizeFilename()` + MIME allowlist server-side. `download.routes.ts`: regex `/^[a-zA-Z0-9.\-_]+$/`. UUID como object name no MinIO. |
| **Strong Types (Cap. 12)** | ✅ | TypeScript strict. `catch (err: unknown)` + `instanceof Error`. `Prisma.TransactionClient` tipado. Sem `any` nos paths críticos. |
| **XSS Prevention (Cap. 12)** | ⚠️ PARCIAL | Helmet CSP em produção. `react-markdown` no frontend. Sem sanitização server-side do `content` de mensagens antes de salvar. |
| **Unit + Integration Testing (Cap. 13)** | ❌ AUSENTE | `app.test.ts` vazio. Zero testes. CI não roda `pnpm test`. |
| **CI/CD Pipeline (Cap. 14)** | ⚠️ PARCIAL | `pnpm lint` + `pnpm format --check` + `trufflehog --only-verified`. Sem `pnpm audit`, sem `tsc --noEmit` no CI, sem step de deploy. |
| **Logging Estruturado (Cap. 15)** | ⚠️ PARCIAL | Pino logger ativo. Log de conexão socket. Prometheus APM. Sem log de eventos de segurança (auth failures, uploads rejeitados, ações admin). |
| **Disaster Planning (Caps. 16–18)** | ❌ AUSENTE | Sem runbook, sem playbook de incidente, sem backup automático de Postgres/MinIO, sem RTO/RPO definidos. |

**Score estimado: ~55%** — forte em código seguro e defense in depth, fraco em testes, observabilidade de segurança e recovery.

---

### 📖 DevSecOps — A Leader's Guide (Glenn Wilson)

#### Layer 1 — Security Education

| Conceito | Status | Evidência |
|----------|--------|-----------|
| Programa formal de educação em segurança | ❌ AUSENTE | Projeto individual — N/A estruturalmente |
| Security Champions | ❌ AUSENTE | N/A |
| Peer review / pair programming | ❌ AUSENTE | Commits diretos em `main`; sem PRs com revisor |
| Aprender com incidentes | ❌ AUSENTE | Sem post-mortems, sem runbooks |

#### Layer 2 — Secure by Design

| Conceito | Status | Evidência |
|----------|--------|-----------|
| Threat Modelling (STRIDE) | ❌ AUSENTE | Nenhum DFD ou modelo de ameaças formal. Controles existem mas sem rastreabilidade a adversários. |
| OWASP — Injection | ✅ | Prisma ORM; `sanitizeFilename`; `@fastify/helmet` CSP |
| OWASP — IDOR | ✅ | `user.routes.ts:25` — guard `loggedUserId !== targetUserId` |
| OWASP — Broken Auth | ✅ | JWT 1h + refresh token httpOnly + `sameSite: 'strict'` |
| OWASP — XSS | ⚠️ PARCIAL | Helmet CSP; sem sanitização server-side do conteúdo de mensagem |
| Menor Privilégio | ⚠️ PARCIAL | RBAC USER/ADMIN existe; sem ACL granular por canal |
| Segredos fora do código | ⚠️ CRÍTICO | Padrão `${VAR:-default}` no compose com valores fracos hardcoded — **P1.1 pendente** |
| TLS / dados em trânsito | ✅ | Cloudflare Tunnel HTTPS. Guard `protocol !== 'https:'` em produção (`app.ts:38`) |
| Containers / Docker | ✅ | Docker Compose completo; healthchecks em todos os serviços |
| Clean Code / SRP / DRY | ✅ | Evidência extensa — ver seção BSRS acima |
| Securing the Pipeline | ✅ | `.github/workflows/ci.yml`: lint + format + `trufflehog` |
| Rate Limiting / DDoS | ✅ | HTTP global + Socket Redis sliding window |

#### Layer 3 — Security Automation

| Conceito | Status | Evidência |
|----------|--------|-----------|
| Testes unitários | ❌ AUSENTE | `app.test.ts` vazio — **P1.2 pendente** |
| Testes de integração | ❌ AUSENTE | Sem Supertest, sem DB de teste |
| SAST | ⚠️ PARCIAL | TypeScript strict = SAST básico. Sem Semgrep / CodeQL / Snyk Code |
| SCA (Software Composition Analysis) | ❌ AUSENTE | Sem `pnpm audit` no CI. Sem Dependabot. ~400 dependências transitivas sem auditoria. |
| DAST | ❌ AUSENTE | Sem OWASP ZAP ou equivalente |
| Container image scanning | ❌ AUSENTE | Sem Trivy / Grype no pipeline |
| Secret scanning | ✅ | `trufflehog@main --only-verified` no job `secret-scan` |
| Monitoramento e alertas | ✅ | Prometheus + Grafana + `/metrics` + `/livez` + `/readyz` |
| Vulnerability management | ❌ AUSENTE | Sem processo de triagem de CVEs, sem SLA de patching |

**Score por camada: L1 ~0% · L2 ~55% · L3 ~25% · Infra/SRE ~100%**
**Score global estimado: ~40%** — Layer 2 técnico bem coberto; Layer 1 (processo/educação) e Layer 3 (automação) praticamente ausentes.

---

### 📖 Engenharia de Software Moderna (Marco Tulio Valente)

| Capítulo / Conceito | Status | Evidência |
|---------------------|--------|-----------|
| **Cap 2 — Processos Ágeis / Sprints** | ⚠️ PARCIAL | Sprints 1–6 em `PLANO_DE_IMPLEMENTACAO.md`. Sem board, sem cerimônias documentadas. CI é única prática ágil concreta. |
| **Cap 2 — Integração Contínua** | ✅ | `.github/workflows/ci.yml` roda a cada push. |
| **Cap 2 — TDD** | ❌ AUSENTE | Zero testes escritos antes ou depois de qualquer feature. |
| **Cap 2 — Commits semânticos** | ❌ FRACO | Commits recentes: `"teste"`, `"tche tche rere"`, `"Bahh tche"` — rastreabilidade zero. |
| **Cap 3 — Requisitos Funcionais** | ⚠️ PARCIAL | Features listadas no plano. Sem user stories formais ou critérios de aceite. |
| **Cap 3 — Requisitos Não-Funcionais** | ⚠️ PARCIAL | Segurança, performance e SRE cobertos em `avaliacao_tecnica.md`. Sem SLAs numéricos (ex: `< 200ms`). |
| **Cap 5 — SRP** | ✅ | Handlers por domínio. Hooks decompostos. Comentários no código citam SRP explicitamente. |
| **Cap 5 — DRY** | ✅ | `requireAuth`, `checkRateLimit`, `getAuthUserId`, `evictLru` — todos extraídos e reutilizados. |
| **Cap 5 — Coesão Alta** | ✅ | `auth.service`, `channel.service`, `user.service`, `dm.service` — responsabilidade única por domínio. |
| **Cap 5 — Baixo Acoplamento** | ✅ | `@discord-clone/shared` isola tipos. `lib/redis.ts`, `lib/minio.ts` encapsulam clientes. Routes dependem de services, não de Prisma diretamente. |
| **Cap 5 — Composição > Herança** | ✅ | Sem herança de classe. `useSocket` compõe dois hooks especializados. |
| **Cap 6 — Padrão Singleton** | ✅ | `lib/redis.ts`, `prisma.ts`, `lib/minio.ts` — instâncias únicas exportadas. |
| **Cap 6 — Padrão Facade** | ✅ | `useSocket` é Facade sobre `useSocketConnection` + `useSocketListeners`. Interface pública inalterada para callers. |
| **Cap 6 — Padrão Observer** | ⚠️ PARCIAL | Socket.io implementa Observer implicitamente. Não modelado formalmente. |
| **Cap 7 — Arquitetura em Camadas** | ✅ | Backend: `routes → services → prisma/redis`. Frontend: `pages → hooks → stores`. Sem bypass de camadas. |
| **Cap 7 — Pub/Sub / Event-Driven** | ✅ | Eventos Socket.io nomeados (`new_message`, `typing_start`, `join_voice`, `webrtc_offer`). Redis como cache de estado distribuído. |
| **Cap 7 — Anti-pattern Big Ball of Mud** | ✅ EVITADO | Handlers delegam para services. Nenhum handler faz query direta ao Prisma. |
| **Cap 8 — Testes Unitários** | ❌ AUSENTE | `app.test.ts` vazio. Nenhum teste de `isAdmin`, `evictLru`, `getChannelMessages`, etc. |
| **Cap 8 — Testes de Integração** | ❌ AUSENTE | Sem Supertest, sem DB de teste isolado. |
| **Cap 8 — Testabilidade do Código** | ⚠️ PARCIAL | Services são funções puras exportadas (fáceis de mockar). `useSocketConnection` retorna socket como estado. Sem injeção de dependência formal. |
| **Cap 9 — Refactoring / Extract Function** | ✅ | `sanitizeFilename`, `getAttachmentType`, `evictLru`, `configuredAdminEmails`, `getCookieValue` — extracts com nome declarativo. |
| **Cap 9 — Code Smells eliminados** | ✅ | `(error: any)` → `(error: unknown)`. `void fetch()` → `async/await`. `console.log` em produção removido. Spread WebRTC → Map early-return. |
| **Cap 9 — Refactoring preserva comportamento** | ✅ | Interface pública de `useSocket` inalterada. Callers (`useWebRTC`, `MainApp`) não tocados após SRP split. |
| **Cap 10 — Containers / Infra como Código** | ✅ | `docker-compose.yml` + `prometheus.yml` versionados. `.env.example` documentado. |
| **Cap 10 — Observabilidade** | ✅ | `fastify-metrics` + Prometheus + Grafana + `/livez` + `/readyz` + Pino. |
| **Cap 10 — Deploy Contínuo** | ❌ AUSENTE | Sem job de deploy automatizado. Deploy manual via Docker Compose. |

**Score por área: Princípios de Projeto ~90% · Arquitetura ~85% · Refactoring ~80% · DevOps ~70% · Testes ~5%**
**Score global estimado: ~75%** — único gap que derruba score de 90%+ para 75% é ausência total de testes.

---

### 📖 Don't Make Me Think (Steve Krug)

| Conceito | Status | Evidência |
|----------|--------|-----------|
| **Lei #1 — Eliminar pontos de interrogação** | ✅ | Ícones `<Hash>` e `<Volume2>` identificam tipo de canal sem texto. Botão "Criar canal" com `aria-label` explícito. |
| **Scanning, não leitura (Cap. 2)** | ✅ | Lista de canais escaneável. Mensagens consecutivas agrupam avatar via `isConsecutive` (`MessageList.tsx:116`), reduzindo ruído visual. |
| **Satisficing — primeiro link razoável (Cap. 2)** | ✅ | Canal de texto selecionado automaticamente no load (`firstText` em `MainApp.tsx:111`). |
| **Convenções visuais / layout Discord-like (Cap. 3)** | ✅ | Sidebar esquerda + área central + input na base — padrão mental já estabelecido. |
| **Hierarquia visual (Cap. 3)** | ✅ | `<h3>` para nome do canal no header. `author-name` destacado acima de `timestamp`. |
| **Clickability óbvia (Cap. 3)** | ✅ | Botões com ícones `lucide-react` reconhecíveis (`Plus`, `Pencil`, `Send`). |
| **Noise Reduction (Cap. 3)** | ✅ | `isConsecutive` omite avatar/header em mensagens sequenciais. `loading="lazy"` em imagens. |
| **Escolhas mindless / dois modos claros (Cap. 4)** | ✅ | Toggle `Canais` / `Mensagens Diretas` — um clique, sem sub-navegação. |
| **Feedback just-in-time (Cap. 4)** | ✅ | Validação inline em `CreateChannelModal.tsx:67`. Upload error inline em `ChatInput`. |
| **Omitir palavras / zero happy-talk (Cap. 5)** | ✅ | Empty states com uma linha. Sem parágrafos de boas-vindas. |
| **Navegação persistente (Cap. 6)** | ✅ | Sidebar sempre visível. Botões Canais/DMs sempre presentes. Nome "Levicord" fixo no topo. |
| **"You are here" — localização atual (Cap. 6)** | ✅ | `className={... 'active'}` + `aria-selected={activeChannelId === channel.id}` em cada item. |
| **Page name visível (Cap. 6)** | ✅ | `<h3>{activeChannel?.name}</h3>` no chat header. |
| **Trunk Test — Search (Cap. 6)** | ❌ AUSENTE | Nenhum campo de busca de mensagens ou canais. Com histórico crescente, busca manual por scroll é inviável. |
| **First impression / onboarding (Cap. 7)** | ⚠️ PARCIAL | Login page tem "Welcome Back" mas sem tagline explicando o sistema. Aceitável para time interno fixo de 20 pessoas; inviável para qualquer expansão. |
| **Mobile usability (Cap. 10)** | ❌ AUSENTE | Sidebar de largura fixa sem media queries. App inutilizável em smartphone. `icon-btn` provavelmente abaixo de 44px touch target. |
| **Usabilidade como cortesia — error recovery (Cap. 11)** | ✅ | `Tentar novamente` em erros. Scroll automático para última mensagem. `window.confirm` ao fechar modal com dados (`CreateChannelModal.tsx:44`). |
| **Acessibilidade (Cap. 12)** | ✅ | `role="listbox"` + `role="option"` + `aria-selected` + `tabIndex={0}` + `onKeyDown` Enter/Space. `aria-live="polite"` no typing indicator. `triggerRef` restaura foco ao fechar modal. |

**Score estimado: ~86%** — muito alta para sistema interno. Gaps: busca ausente e zero responsividade mobile.

---

### Denominador Comum — Gap em TODOS os 4 livros

**Ausência total de testes automatizados.**

| Livro | Como cita o gap |
|-------|-----------------|
| BSRS Cap. 13 | "Continuous Validation" — sem baseline comportamental, impossível detectar regressão |
| DevSecOps L3 | "Unit Testing" zerado — SAST/DAST perdem valor sem cobertura de testes |
| ESM Cap. 8 | Testes como prática indispensável — `vitest` instalado, zero casos escritos |
| DMMT Cap. 9 | "Usability testing on 10 cents a day" — nunca realizado |

### Score Consolidado por Livro

| Livro | Score | Principal força | Principal gap |
|-------|-------|-----------------|---------------|
| Building Secure & Reliable Systems | **~55%** | Defense in depth 7 camadas, graceful shutdown | Testes, secrets P1.1, sem audit log, sem backup |
| DevSecOps (Wilson) | **~40%** | Layer 2 Secure by Design ~55% | Layer 3 ~25% — sem SAST/SCA/container scan/testes |
| Engenharia de Software Moderna | **~75%** | Princípios de projeto ~90%, arquitetura ~85% | Testes ~5%, commits sem mensagem |
| Don't Make Me Think | **~86%** | Acessibilidade WCAG AA, scanning design, feedback | Busca ausente, zero responsividade mobile |
