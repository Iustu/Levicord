# 🔍 Plano de Ação Priorizado — Levicord (Backlog de Gaps Técnicos)

> Esta avaliação técnica foi reestruturada para refletir **a ordem de criticidade** de resolução. O projeto já passou por pesadas refatorações (IDOR, WebRTC Seguro, Refresh Tokens, SRP e Paginação), eliminando a esmagadora maioria dos bugs críticos de código. 
> 
> O que resta agora forma o **Backlog** para as próximas fases.

---

## 🔴 PRIORIDADE 1: CRÍTICA (Bloqueantes para Produção)
*Problemas graves de gestão, vazamento de credenciais ou ausência total de garantias de qualidade contínua. Resolvê-los é mandatório antes de qualquer lançamento público real.*

| # | Status | Área | Gap Técnico | Impacto | Ação Recomendada |
|---|--------|------|-------------|---------|------------------|
| **1.1** | ❌ **PENDENTE** | **DevSecOps** | Segredos Hardcoded no Docker: `JWT_SECRET` e `DATABASE_URL` estão com valores explícitos no `docker-compose.yml` que vai para o repositório. | Invasão direta ao banco de dados e falsificação de tokens JWT caso o repositório seja lido. | Substituir as chaves no YAML por variáveis de ambiente (`${JWT_SECRET}`) injetadas via `.env` externo ou Secret Manager na CI. |
| **1.2** | ❌ **PENDENTE** | **Testes** | Ausência absoluta de testes automatizados (`app.test.ts` está vazio e frontend não possui setup). | Toda nova feature inserida (como os recentes tokens) corre enorme risco de quebrar regras antigas de negócio silenciosamente. | Implementar testes Unitários com Vitest (para Services) e Integração com Supertest (para Routes). |
| **1.3** | ✅ **RESOLVIDO** | **Infraestrutura** | O serviço do `MinIO` (S3 clone) estava ativado consumindo RAM no Docker Compose, mas o backend fazia upload de arquivos diretamente no disco local. | Desperdício de recursos de nuvem, complexidade inútil e risco de disco cheio no servidor de aplicação. | Upload via SDK `minio` direto para bucket. Download via presigned URL (redirect 302) — servidor não faz proxy de bytes. `ensureBucket()` no startup cria o bucket se não existir. `@fastify/static` removido. MinIO com healthcheck no compose. **Arquivos:** `apps/server/src/lib/minio.ts`, `apps/server/src/routes/upload.routes.ts`, `apps/server/src/routes/download.routes.ts`, `docker-compose.yml` |

---

## 🟠 PRIORIDADE 2: ALTA (Débito Técnico e Performance Estrutural)
*Gaps arquiteturais que, embora não quebrem a aplicação imediatamente, vão causar lentidão extrema, exaustão de memória ou acoplamentos severos no médio prazo.*

| # | Status | Área | Gap Técnico | Impacto | Ação Recomendada |
|---|--------|------|-------------|---------|------------------|
| **2.1** | ✅ **RESOLVIDO** | **Gestão de Estado** | O estado `dms` do Zustand não possui limite lógico. Se o usuário abrir muitos chats, a RAM do navegador estourará. | Vazamento de memória clássico de SPA (*Memory Leak* no client). | LRU Cache implementado no store do Zustand. Limite de 20 conversas ativas. Entradas mais antigas são evicted automaticamente. **Arquivo:** `apps/web/src/stores/useChatStore.ts` |
| **2.2** | ✅ **RESOLVIDO** | **Otimização** | `getChannels` e `getUsers` buscam todos os registros da base sem paginação (`limit`/`offset`). | *Full Table Scans* farão as rotas caírem por timeout quando o Discord tiver centenas de usuários. | `getChannels`: paginação offset (`limit`/`offset`, max 200). `getUsers`: paginação cursor-based. Ambas as rotas expõem os parâmetros via query string. **Arquivos:** `apps/server/src/services/channel.service.ts`, `apps/server/src/services/user.service.ts`, rotas correspondentes. |
| **2.3** | ✅ **RESOLVIDO** | **Segurança / UX** | Anexos sendo servidos abertamente pelo `@fastify/static`. Não há verificação se o usuário que acessa a imagem/arquivo possui leitura àquele canal de DMs. | Quebra de privacidade de arquivos trocados em mensagem direta. | `fastifyStatic` removido. Nova rota `GET /uploads/:filename` com `requireAuth` faz stream do arquivo com header `Cache-Control: private`. **Arquivo:** `apps/server/src/routes/download.routes.ts` |
| **2.4** | ✅ **RESOLVIDO** | **Arquitetura** | Hook `useSocket` continua muito central. Ele gerencia conexão, binds de eventos, state de stores e métodos imperativos. | Viola SRP. Dificulta muito a criação de testes de mock para WebSocket. | Quebrado em `useSocketConnection` (cria/destrói socket), `useSocketListeners` (registra handlers de eventos) e `useSocket` (facade — interface pública inalterada para callers). **Arquivos:** `apps/web/src/hooks/useSocketConnection.ts`, `apps/web/src/hooks/useSocketListeners.ts`, `apps/web/src/hooks/useSocket.ts` |
| **2.5** | ✅ **RESOLVIDO** | **SRE** | Ausência de *Graceful Shutdown*. Se o servidor reinicia, conexões web socket morrem subitamente. | Perda de mensagens em trânsito e timeouts secos pro usuário. | `SIGTERM`/`SIGINT` interceptados: `app.close()` para HTTP, `io.close()` para Socket.io, `prisma.$disconnect()` e `redis.quit()`. **Arquivo:** `apps/server/src/server.ts` |
| **2.6** | ✅ **RESOLVIDO** | **Otimização DB** | Função middleware de admin (`isAdmin`) realiza query no SQL em toda e qualquer rota de administração, sem cache. | Sobrecarga I/O desnecessária ao PostgreSQL para dados frios. | Resultado cacheado no Redis com TTL de 60s (chave `admin:<userId>`). Cache-aside: hit evita query; miss popula o cache. **Arquivo:** `apps/server/src/services/auth.service.ts` |

---

## 🟡 PRIORIDADE 3: MÉDIA (Refinamentos de UX, Tipagem e CI/CD)
*Erros pontuais de design, falta de polimento nas pipelines ou "code smells" locais.*

| # | Status | Área | Gap Técnico | Impacto | Ação Recomendada |
|---|--------|------|-------------|---------|------------------|
| **3.1** | ✅ **RESOLVIDO** | **UX / Errors** | `logout()` do frontend fazia `fetch` assíncrono não aguardado (void). Ignorava falhas de rede. | Usuário pensava que saiu, mas cookie continuava válido caso caísse a internet. | `logout()` refatorado para `async`; faz `await` no fetch com `try/catch`; dispara evento `toast_error` em falha de rede. **Arquivo:** `apps/web/src/hooks/useAuth.ts` |
| **3.2** | ✅ **RESOLVIDO** | **CI / CD** | Ausência de verificação de Lint, formatação e secret scan na pipeline. | Código acumulava lixo sem padrão ou vazava chaves sem alerta. | `pnpm lint` e `pnpm format --check` adicionados ao job principal. Job separado `secret-scan` com `trufflehog@main` usando `--only-verified`. **Arquivo:** `.github/workflows/ci.yml` |
| **3.3** | ✅ **RESOLVIDO** | **Acessibilidade** | Lista de canais sem navegação via teclado, foco perdido ao fechar modal. | Viola WCAG AA para leitores de tela. | `channel-list` e DM list: `role="listbox"`, itens com `role="option"`, `aria-selected`, `tabIndex={0}`, `onKeyDown` (Enter/Space). Modal: `triggerRef` restaura foco ao botão de origem ao fechar. **Arquivos:** `apps/web/src/pages/MainApp.tsx`, `apps/web/src/components/CreateChannelModal.tsx` |
| **3.4** | ✅ **RESOLVIDO** | **TypeScript** | `(error: any)` usados em blocos catch e tipagem `any` no Prisma `$transaction`. | Perda da segurança de tipo no compilador e no LSP da IDE. | `CreateChannelModal.tsx`: `catch (err: any)` → `catch (err: unknown)` + `instanceof Error`. `channel.service.ts`: `$transaction` tipado como `Prisma.TransactionClient`. **Arquivos:** `apps/web/src/components/CreateChannelModal.tsx`, `apps/server/src/services/channel.service.ts` |
| **3.5** | ✅ **RESOLVIDO** | **Segurança** | Cookie JWT usava `sameSite: 'lax'`. | Margem de ataque cross-site. | Alterado para `sameSite: 'strict'` nos dois `setCookie` (callback OAuth + endpoint `/refresh`). **Arquivo:** `apps/server/src/routes/auth.routes.ts` |
| **3.6** | ✅ **RESOLVIDO** | **Performance UI** | Sem `Lazy Load` nas imagens e spread excessivo no `setRemoteStreams` do WebRTC causando re-renders desnecessários. | Degradação de FPS em chats com muitas imagens e em chamadas com múltiplos participantes. | `loading="lazy"` aplicado em todas as imagens de anexo (`MessageList`). `setRemoteStreams` refatorado para usar `Map` com early-return quando stream é idêntico — evita criar novo objeto quando nada mudou. **Arquivos:** `apps/web/src/components/MessageList.tsx`, `apps/web/src/hooks/useWebRTC.ts` |
| **3.7** | ✅ **RESOLVIDO** | **Banco de Dados** | Entidade `Attachment` estava sem índices para `messageId` e `dmId`. | Buscar anexos de uma mensagem ficaria N+1 lento com tabela grande. | Adicionado `@@index([messageId])` e `@@index([dmId])` no model `Attachment`. **Arquivo:** `apps/server/prisma/schema.prisma` — ⚠️ executar `npx prisma migrate dev` com banco ativo. |

---

## 🟢 PRIORIDADE 4: BAIXA ("Nice to Have")
*Features e polimentos que diferenciam a aplicação, mas não causam danos de negócio se ausentes.*

| # | Status | Área | Gap Técnico | Impacto | Ação Recomendada |
|---|--------|------|-------------|---------|------------------|
| **4.1** | ✅ **RESOLVIDO** | **UX / Features** | Chat sem indicador de *"Digitando..."* e sem suporte a formatação *Markdown* visual. | Diminui o valor percebido de "clone do Discord". | Servidor: eventos `typing_start`/`typing_stop` emitidos via Socket no `messageHandler.ts`. Frontend: `useSocket` expõe `sendTypingStart`/`sendTypingStop`; `ChatInput` emite ao digitar (debounce 2s); `MessageList` exibe indicador animado. Markdown: `react-markdown` instalado e aplicado em todas as mensagens. **Arquivos:** `apps/server/src/socket/messageHandler.ts`, `apps/web/src/hooks/useSocket.ts`, `apps/web/src/components/ChatInput.tsx`, `apps/web/src/components/MessageList.tsx` |
| **4.2** | ✅ **RESOLVIDO** | **UX** | Upload sem barra de progresso e sem feedback visual pós-sucesso. | Usuário pode achar que travou em uploads > 5MB. | Substituído `fetch` por `XMLHttpRequest` com listener `upload.progress` — barra de progresso exibida com % em tempo real. Erro de rede exibido inline com dismiss. **Arquivo:** `apps/web/src/components/ChatInput.tsx` |
| **4.3** | ✅ **RESOLVIDO** | **Prevenção de Erros** | Modal de criação de canal podia ser fechado acidentalmente perdendo dados. | Frustração do usuário. | `handleClose` substituiu `onClose` direto — se `isDirty`, exibe `window.confirm` antes de fechar. Aplicado no backdrop, botão cancelar e tecla Escape. **Arquivo:** `apps/web/src/components/CreateChannelModal.tsx` |
| **4.4** | ✅ **RESOLVIDO** | **Observabilidade** | Ausência de métricas APM. | Impossível ver gráficos de uso sem APM. | `fastify-metrics@10.6.0` instalado; endpoint `/metrics` registrado no Fastify. Prometheus + Grafana adicionados ao `docker-compose.yml`. Arquivo `prometheus.yml` criado com scrape do server. **Arquivos:** `apps/server/src/app.ts`, `docker-compose.yml`, `prometheus.yml` |
| **4.5** | ✅ **RESOLVIDO** | **Limpeza** | `console.log('Connected to socket server')` vazando no cliente em ambiente de Produção. | Ruído nos DevTools em produção. | Removido do handler `connect` em `useSocket`. **Arquivo:** `apps/web/src/hooks/useSocket.ts` |

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
