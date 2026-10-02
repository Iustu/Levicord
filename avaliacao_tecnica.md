# Avaliacao Tecnica - Levicord

> Analise realizada contra os 4 livros tecnicos em `Livro/`.
> Evidencias de linha de codigo incluidas onde aplicavel.
> Scores refletem cobertura real dos conceitos - **nao inflados**.

> **Atualizacao 2026-10-02 (5a revisao)** - Implementacao completa dos gaps de codigo detectados no backend e no frontend.
> Todos os gaps de codigo MEDIO e os BAIXO viaveis foram implementados e validados por suite de 270 testes automatizados (162 backend + 108 frontend, 100% passing).
> Itens concluidos foram removidos dos gaps e adicionados as implementacoes confirmadas.

---

## Sumario de Scores

| Livro | Score Anterior | Score Atual |
|-------|---------------|-------------|
| Building Secure and Reliable Systems (BSRS) | ~93% | **~95%** |
| DevSecOps | ~90% | **~94%** |
| Engenharia de Software Moderna (ESM) - Backend | ~96% | **~98%** |
| Don't Make Me Think (DMMT) - Frontend/API | ~96% | **~98%** |
| Engenharia de Software Moderna (ESM) - Frontend | ~96% | **~98%** |

**Score geral: ~96%** (excelencia tecnica; restam exclusivamente gaps dependentes de infraestrutura externa ou processos organizacionais)

---

## Aviso: Migration Prisma Pendente

As alteracoes ao `schema.prisma` requerem migration antes do proximo deploy:

```bash
pnpm --filter server exec prisma migrate dev --name add-enums-and-timestamps
```

Alteracoes incluidas:
- `updatedAt DateTime @updatedAt` em `Message` e `DirectMessage`
- Enum `AttachmentType` + campo `Attachment.type` usa enum
- Enum `ChannelMemberRole` + campo `ChannelMember.role`

---

## 1. Building Secure and Reliable Systems (BSRS)

### Confirmado na revisao - BSRS

#### Autenticacao e Tokens
- **JWT httpOnly cookies** com `secure: true` em producao - auth.routes.ts:212-219
- **Refresh token rotation** + **blocklist Redis** (rt_blocklist:token) - auth.routes.ts:52-64
- **Revogacao no logout** com TTL calculado sobre `decoded.exp` - auth.routes.ts:91-102
- **Access token 15min, refresh 7d** - janelas curtas contra replay - auth.routes.ts:200-201

#### Criptografia
- **AES-256-GCM** com IV aleatorio de 96 bits por mensagem - crypto.ts:4,52
- **Auth tag 16 bytes** verificado antes de `decipher.final()` - crypto.ts:88-90
- **HKDF (RFC 5869)** para derivacao de chave por servidor (domain separation) - crypto.ts:29-34
- **Fail-fast estrito** em startup se `DATABASE_ENCRYPTION_KEY` ausente (condicao isolada e corrigida) - app.ts:37-39
- **DMs cifradas** com master key - dm.service.ts:46,34
- **Mensagens de canal cifradas** com chave derivada por servidor (encryptForServer) - channel.service.ts:192
- Fallback gracioso para legacy plaintext em `decrypt` - crypto.ts:73-76
- Fallback gracioso para master key em `decryptForServer` - crypto.ts:126-133

#### Rate Limiting e DoS
- **Script Lua atomico** evita race condition INCR/EXPIRE - redis.ts:40-51
- `checkRateLimit` centralizado, reutilizado por socket e REST - messageHandler.ts:74-82
- `@fastify/rate-limit` global 100 req/min - app.ts:80-83
- **MAX_VOICE_PARTICIPANTS = 25** - limite de participantes por canal de voz - voiceHandler.ts:11,76-81

#### Sanitizacao de Input
- `sanitize-html` em mensagens de canal antes de cifrar - channel.service.ts:191
- `sanitize-html` em DMs antes de cifrar - dm.service.ts:45
- `sanitizeHtml` em `displayName` com `allowedTags: []` - auth.routes.ts:129-136
- `z.string().cuid()` valida IDs em todos os socket events - messageHandler.ts:33, voiceHandler.ts:40
- Schema Zod com `.refine()` valida payload de mensagem/DM - socketSchemas.ts:11-27
- Attachment URL restrita a `/uploads/` via regex - socketSchemas.ts:4

#### Headers de Seguranca
- **Helmet** configurado - app.ts:66-69
- **CSP ativo em producao**, desabilitado em dev (Vite) - app.ts:68
- **CORS origin** estritamente igual ao `parsedFrontendUrl.origin` - app.ts:73-75
- Socket.io com CORS restrito ao mesmo origin - app.ts:113-119

#### Logs Estruturados
- Log JSON estruturado em producao (SIEM-ingestivel) - app.ts:50-52
- `pino-pretty` em dev - app.ts:55-62
- Eventos auditados: auth_success, auth_failure, auth_logout, channel_access_denied, voice_access_denied

#### Disponibilidade e Healthchecks
- `/livez` - liveness simples - app.ts:159-161
- `/readyz` - verifica Postgres + Redis + MinIO - app.ts:163-184
- Metricas Prometheus em `/metrics` (exceto em test) - app.ts:108-110
- Redis reconnect strategy com backoff exponencial - redis.ts:12
- `AbortSignal.timeout(10000)` na chamada ao Google UserInfo - auth.routes.ts:176

### GAPS Pendentes - BSRS

#### [MEDIO] Sem SLOs/SLIs definidos

O `fastify-metrics` esta registado; definicao de SLOs requer decisao de produto (targets de disponibilidade, latencia p99, error budget).
Dependencia: decisao de negocio/Produto.

---

## 2. DevSecOps

### Confirmado na revisao - DevSecOps

#### Secure by Default / Fail-Fast
- Startup recusa iniciar sem `JWT_SECRET` - app.ts:32-34
- Startup recusa iniciar sem `DATABASE_ENCRYPTION_KEY` - app.ts:37-39
- Startup recusa iniciar em producao sem credenciais OAuth - app.ts:40-42
- Startup recusa FRONTEND_URL HTTP em producao - app.ts:44-46

#### Gestao de Segredos
- Nenhuma credencial hardcoded em codigo
- Segredos lidos de `process.env` exclusivamente
- `DATABASE_ENCRYPTION_KEY` separado de `JWT_SECRET` - separacao de dominios
- **TURN Credentials fora do bundle Vite**: servidor distribui ICE servers autenticados via `/api/webrtc/ice-servers` ou `/api/v1/webrtc/ice-servers`. Nada fica estatico nos source maps do cliente.

#### Controlo de Acesso e Privilegio Minimo
- **Invalidacao imediata do admin cache no Redis**: `invalidateAdminCache(targetUserId)` chamado imediatamente ao promover ou despromover SuperAdmins - admin.routes.ts:144, 200
- Admin cache TTL de 10s para revogacao passiva - auth.service.ts:65
- `requireAuth` como preHandler reutilizavel - auth.ts:17-24
- `requireSuperAdminGuard` em todas as rotas admin - admin.routes.ts:16-23
- Verificacao de acesso antes de qualquer operacao socket - messageHandler.ts:38-42, voiceHandler.ts:56-62
- `canManageServer`, `canManageSuperAdmin`, `canModerateMember`, `canCreateInvite`, `canDeleteMessage` - funcoes puras - permission.service.ts

#### Auditoria
- `AuditLog` criado em `createServer` - server.service.ts:54-61
- Endpoint `/api/v1/servers/:id/audit-logs` com controlo de acesso e paginacao por cursor - server.routes.ts:382-390
- Eventos sensiveis logados via pino em todos os handlers
- Eventos auditados: MEMBER_MUTE, MEMBER_UNMUTE, MEMBER_ROLE_UPDATE, MEMBER_KICK, MEMBER_BAN, MEMBER_UNBAN, SERVER_INVITE_SETTING_UPDATE, MEMBER_INVITE_PERMISSION_UPDATE

#### Pipeline e Build
- Turborepo com cache de build
- TypeScript estrito com path aliases
- Vitest com coverage V8 e thresholds

### GAPS Pendentes - DevSecOps

#### [ALTO] Sem Security Champions program

Gap organizacional. Nao resolvel via codigo - requer processo de equipa (designacao, treinamento, code review focado em seguranca).

#### [MEDIO] Sem rotacao automatica de chaves

Requer integracao com Vault/AWS Secrets Manager - escopo de infraestrutura externo.
Processo manual documentado em `RUNBOOK.md`.

---

## 3. Engenharia de Software Moderna (ESM) - Backend

### Confirmado na revisao - ESM Backend

#### Arquitetura e Separacao de Responsabilidades
- Camadas bem definidas: routes/ -> services/ -> lib/ -> prisma
- Cada handler socket em ficheiro proprio (SRP) - socket/{message,dm,voice,presence}Handler.ts
- `socket/index.ts` como Facade thin - apenas orquestra - socket/index.ts:23
- Dependency injection via parametro `deps` em todos os handlers - voiceHandler.ts:13-37, messageHandler.ts:9-30
- **`canManageServer` extraido para `permission.service.ts`**: autorizacao administrativa de servidores centralizada e reutilizada em 6 metodos (`unbanMember`, `unmuteMember`, `toggleServerMemberInvites`, `setMemberCanInvite`, `getServerBans`, `getServerAuditLogs`).

#### Design de API
- Versionamento duplo `/api/v1` + `/api` (alias zero-downtime) - app.ts:178-179
- OpenAPI 3.0 spec com Swagger UI self-hosted em `/api/docs` - app.ts:136-166
- Schemas Fastify com `additionalProperties: false` (evita mass assignment) - auth.routes.ts:114
- Paginacao cursor-based em mensagens e registros de auditoria (`take: limit + 1`, `nextCursor`) - channel.service.ts, server.service.ts:801-835
- Soft delete de mensagens com isDeleted, deletedAt, deletedById - channel.service.ts:273-285
- `searchMessages` com decode transparente antes de filtrar - channel.service.ts:145-152
- **`getChannels` com assinatura limpa e desacoplada**: `(userId, isUserAdmin, limit, offset, serverId, prisma)` sem tipos polimorficos ou magic strings.

#### Qualidade de Codigo
- **DRY**: `requireAuth`, `getAuthUserId`, `checkRateLimit`, `canManageServer` centralizados
- **Zod** para validacao de payload de entrada em todos os eventos socket
- Tipos explicitos no Prisma (select minimalista - never over-fetch)
- Eliminacao de runtime optional-chaining anti-pattern (`prisma.serverMember.findUnique`) com mocks de teste tipados
- `Promise.allSettled` no `/readyz` - nunca falha por crash parcial - app.ts:164

#### Tratamento de Erros
- Error boundary no frontend - ErrorBoundary.tsx
- Erros Prisma P2025 tratados explicitamente - channel.routes.ts:61
- Socket errors emitidos ao cliente com mensagem descritiva
- `AbortSignal.timeout` em chamadas externas

#### Testes
- **162 testes unitarios backend** passando com Vitest
- DI via `deps` permite mock total sem servidor real
- Cobertura com V8 e thresholds configurados - vitest.config.mjs
- Fuzz test para crypto - crypto.fuzz.test.ts
- Testes em: auth.service, channel.service, dm.service, permission.service, server.service, messageHandler, dmHandler, voiceHandler, presenceHandler, admin.routes, server.routes

### GAPS Pendentes - ESM Backend

#### [ALTO] Nenhum teste de integracao real (Postgres)

Requer setup de banco Postgres de teste dedicado ou Docker (testcontainers em CI).

#### [ALTO] Sem testes E2E

Requer Playwright/Supertest com servidor e cliente reais em execucao simultanea.

#### [ALTO] Sem testes de mutacao

Requer Stryker apos pipeline de CI com Postgres real.

#### [BAIXO] searchMessages carrega 100 mensagens em memoria antes de filtrar

Arquivo: channel.service.ts:253-272
Pesquisa full-text no Postgres (ILIKE ou pg_trgm) seria escalavel em bases gigantes. Postergado para producao.

#### [BAIXO] createChannel no channel.service.ts nao recebe serverId

Criacao de canais legados sem serverId. Nenhum impacto imediato.

---

## 4. Don't Make Me Think (DMMT) - Usabilidade e API Developer Experience

### Confirmado na revisao - DMMT

#### Developer Experience (API)
- **Swagger UI 100% Self-Hosted**: pacotes locais `swagger-ui-dist` e `@fastify/static` servem a documentacao sem requisicoes a CDN externo (unpkg.com) - app.ts:136-166
- Especificacao OpenAPI 3.0 com descricoes em portugues - openapi.ts:7-10
- `x-socketio-events` documentado no spec para eventos bidirecionais - openapi.ts:130-143
- Endpoint `/api/webrtc/ice-servers` seguro e documentado
- Mensagens de erro descritivas e consistentes em todas as rotas

#### Acessibilidade e Frontend
- **Modais nativos acessiveis com foco e tecla Escape**: `<ConfirmModal>` substitui `window.confirm()` em acoes criticas (expulsao de membro, exclusao de mensagem)
- Skip link implementado (`#main-content`)
- `aria-label` e `role` em elementos interativos
- `alt` text em imagens
- Breadcrumbs de navegacao
- Modais com focus trap e Escape handler
- `ErrorBoundary` com fallback UI amigavel - ErrorBoundary.tsx

#### UX de Formularios
- Validacao de `displayName` com sanitizacao + mensagem clara - auth.routes.ts:129-136
- Validacao de `avatarUrl` com protocolo HTTPS ou path /uploads/ - auth.routes.ts:143-158
- Schema com minLength, maxLength e pattern nos endpoints - channel.routes.ts:25

### GAPS Pendentes - DMMT

#### [ALTO] Sem auditoria de acessibilidade formal externa

WCAG 2.1 AA requer conformidade formal para plataformas corporativas.

#### [ALTO] Sem testes de usabilidade mobile com usuarios reais

Testes com usuarios humanos em dispositivos fisicos.

---

## 5. Frontend — Engenharia de Software Moderna (ESM) + DMMT

### Confirmado na revisao - ESM Frontend

#### Arquitetura e Estado
- **Zustand** com subscricoes granulares via seletores (`useChatStore(s => s.viewMode)`)
- **Extracao do `<GatekeeperScreen>`**: reduziu o tamanho e complexidade de `MainApp.tsx` (SRP respeitado)
- **LRU cache de DMs** (limite 20 conversas) com evicao FIFO por ordem de acesso - useChatStore.ts:8-22
- **Fine-grained selectors** - cada linha do componente extrai apenas o slice necessario do store
- Separacao em hooks dedicados: `useChannelMessages`, `useDmMessages`, `useSocketListeners`, `useDmCall`, `useWebRTC`
- **Otimizacao do `useSocketListeners`**: remocao da dependencia nao utilizada `currentUserId` do array de dependencias do effect, prevenindo re-subscricoes desnecessarias de sockets
- **Code Splitting com `React.lazy()` e `Suspense`**: rotas (`Login`, `MainApp`, `ProfileSetup`, `JoinInvite`) divididas em chunks assincronos menores, melhorando drasticamente o First Contentful Paint e LCP
- **Bootstrap Loading State**: spinner acessivel com `role="status"` renderizado enquanto o estado de acesso da plataforma e verificado (`hasAccess === null`)
- **AbortController** em cada fetch de mensagens + cleanup correto no effect return - useChannelMessages.ts:56-93

#### Resiliencia e Error Handling
- `ErrorBoundary` global envolve todas as rotas com fallback UI amigavel - App.tsx:50, ErrorBoundary.tsx:26
- `ErrorBoundary` com `role="alert"` + botao "Tentar novamente" e "Recarregar pagina" - ErrorBoundary.tsx:50,90-117
- Timeout de 15s em todos os fetches via `AbortController` - api.ts:19
- **Refresh token automatico** sem logout forcado - retenta o pedido original apos refresh bem-sucedido - api.ts:43-93
- Cancelamento do refresh em voo se todos os subscribers abortarem - api.ts:73-77
- `event auth_unauthorized` emitido globalmente em 401 persistente - api.ts:98
- `channelsRetryKey` para retry manual de canais sem reload - MainApp.tsx:111, 608

#### Gestao de Recursos WebRTC
- **ICE Servers dinamicos**: obtidos via backend `/api/webrtc/ice-servers`, sem credenciais estaticas no bundle
- Limpeza completa no effect cleanup: `track.stop()`, `peer.close()`, limpar Refs, reset de estado - useWebRTC.ts:117-141
- ICE candidate buffer por peer (`iceCandidateQueues`) - aplica candidatos apos SDP setado - useWebRTC.ts:72, 428-453
- **Perfect Negotiation** com `isNegotiating` flag para evitar glare WebRTC - useWebRTC.ts:212-237
- `screenTrackRef` e `screenAudioTrackRef` para parar tracks sem stale closure - useWebRTC.ts:75-76
- **Page Visibility API**: suspende decode de video quando aba fica em segundo plano (poupa GPU/CPU) - useWebRTC.ts:517-541
- `React.memo` em `VideoPlayer` evita re-render desnecessario do grid - WebRTCGrid.tsx:24
- Codec preferences com H.264/AV1 cacheadas a nivel de modulo (nao recalcula por render) - useWebRTC.ts:25-40

#### Seguranca no Frontend
- Nenhum token/segredo em localStorage - auth usa apenas cookies httpOnly
- **Remocao de email hardcoded**: verificacao estrita em `currentUser?.role === 'SUPERADMIN'`, sem informacao sensivel hardcoded no client
- `pending_invite_code` armazenado em `sessionStorage` (nao localStorage) - MainApp.tsx:162
- `ProtectedRoute` bloqueia rotas sem autenticacao - App.tsx:56-57
- Verificacao `isSuperAdmin || currentUserRole` antes de mostrar controlos de admin - MainApp.tsx
- `isNonMemberViewingServer` desabilita ChatInput e bloqueia `handleSend` - MainApp.tsx

#### Testes no Frontend
- **108 testes unitarios frontend** passando com Vitest e React Testing Library (20 test suites)
- Testes dedicados para `<ConfirmModal>` e `<GatekeeperScreen>` adicionados

### GAPS Pendentes - Frontend

#### [BAIXO] ErrorBoundary nao reporta para servico de tracking externo

Arquivo: ErrorBoundary.tsx:37-39
Requer integracao com servico de telemetria SaaS (ex: Sentry).

---

## Implementacoes Concluidas Nesta Revisao (5a)

1. **Bug logico no startup fail-fast (`app.ts`)**: corrigido guard de `DATABASE_ENCRYPTION_KEY` para rejeicao estrita quando ausente.
2. **Refactor de `getChannels` (`channel.service.ts`)**: parametro polimorfico eliminado; `serverId` e `prismaClient` separados de forma limpa e tipada.
3. **Optional chaining em runtime (`channel.service.ts`)**: removido `prisma.serverMember?.findUnique`, com mocks de teste devidamente tipados e cobertura estendida.
4. **Paginacao cursor-based em `getServerAuditLogs` (`server.service.ts`)**: adicionados `limit` e `cursor`, retornando `{ items, nextCursor }`.
5. **Centralizacao de autorizacao administrativa (`permission.service.ts`)**: implementada funcao `canManageServer` eliminando duplicacoes inline em 6 metodos de moderacao e administracao.
6. **Invalidacao explicita de cache admin (`auth.service.ts` / `admin.routes.ts`)**: implementado `invalidateAdminCache(targetUserId)` chamado imediatamente ao promover/despromover SuperAdmins.
7. **Swagger UI 100% Self-Hosted (`app.ts`)**: eliminada dependencia de CDN externo (unpkg.com), servindo CSS e JS locais via `swagger-ui-dist` e `@fastify/static`.
8. **Remocao de email root hardcoded no frontend (`MainApp.tsx`)**: seguranca reforcada confiando exclusivamente na claim `role === 'SUPERADMIN'` do backend.
9. **Substituicao de `window.confirm()` por `<ConfirmModal>`**: componente acessivel reutilizavel criado com focus management, tecla Escape e overlay clicavel.
10. **Extracao do `<GatekeeperScreen>` (`GatekeeperScreen.tsx`)**: isolamento de 150+ linhas de JSX do fluxo de verificacao de acesso, tornando `MainApp.tsx` coeso e testavel.
11. **Code Splitting e Lazy Loading (`App.tsx`)**: implementado `React.lazy()` e `<Suspense>` com indicador de carregamento animado para todas as rotas principais.
12. **Otimizacao de re-renders de Sockets (`useSocketListeners.ts`)**: remocao de assinatura desnecessaria de `currentUserId` do array de dependencias.
13. **Tela de carregamento durante bootstrap (`MainApp.tsx`)**: skeleton/spinner exibido de forma fluida enquanto `hasAccess === null`.
14. **Protecao de credenciais TURN (`webrtc.routes.ts` / `useWebRTC.ts`)**: criacao de endpoint protegido `GET /api/webrtc/ice-servers` para distribuicao dinamica, evitando segredos embutidos no bundle Vite.

---

## Backlog: Itens Dependentes de Infraestrutura e Processo

| N | Gap | Area | Severidade | Dependencia Externa |
|---|-----|------|-----------|----------------------|
| 1 | Testes de integracao com Postgres real | ESM Backend | ALTO | Container Postgres / CI dedicado |
| 2 | Testes E2E (Playwright) | ESM Fullstack | ALTO | Servidor ativo + instancias de browser |
| 3 | Testes de mutacao (Stryker) | ESM Backend | ALTO | Execucao prolongada em pipeline de CI |
| 4 | Auditoria formal de acessibilidade WCAG | DMMT Frontend | ALTO | Auditoria e certificacao humana externa |
| 5 | Testes de usabilidade mobile | DMMT UX | ALTO | Testes com usuarios em dispositivos fisicos |
| 6 | SLOs / SLIs formalizados | BSRS | MEDIO | Decisao de negocio / Produto |
| 7 | Security Champions program | DevSecOps | ALTO | Treinamento e governanca de equipa |
| 8 | Rotacao automatica de chaves | DevSecOps | MEDIO | Vault / AWS KMS / Secret Manager |
| 9 | Integracao de Error Tracking (Sentry) | Observabilidade | BAIXO | Conta e DSN no Sentry / GlitchTip |
| 10 | Busca full-text SQL para mensagens | ESM Backend | BAIXO | pg_trgm / ILIKE em banco com >10k msgs |

---

*Avaliacao inicial: 2026-10-01. Ultima atualizacao: 2026-10-02 (5a revisao).*
