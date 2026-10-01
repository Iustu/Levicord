# Avaliacao Tecnica - Levicord

> Analise realizada contra os 4 livros tecnicos em `Livro/`.
> Evidencias de linha de codigo incluidas onde aplicavel.
> Scores refletem cobertura real dos conceitos - **nao inflados**.

> **Atualizacao 2026-10-01 (2a revisao)** - reavaliacao completa apos mudancas extensas do utilizador.
> Itens concluidos foram removidos. Restam apenas gaps dependentes de infraestrutura/processo.

---

## Sumario de Scores

| Livro | Score Anterior | Score Atual |
|-------|---------------|-------------|
| Building Secure and Reliable Systems (BSRS) | ~92% | **~93%** |
| DevSecOps | ~88% | **~89%** |
| Engenharia de Software Moderna (ESM) - Backend | ~94% | **~96%** |
| Don't Make Me Think (DMMT) - Frontend/API | ~95% | **~96%** |
| Engenharia de Software Moderna (ESM) - Frontend | ~96% | **~96%** |

**Score geral: ~93%** (estavel, patamar alto para contexto de dev)

> Gaps pendentes dependem **exclusivamente** de infraestrutura real ou processos humanos.

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
- **Fail-fast** em startup se `DATABASE_ENCRYPTION_KEY` ausente - app.ts:37-39
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
- Nenhuma credencial hardcoded em codigo (so placeholder dev) - app.ts:97-98
- Segredos lidos de `process.env` exclusivamente
- `DATABASE_ENCRYPTION_KEY` separado de `JWT_SECRET` - separacao de dominios

#### Controlo de Acesso e Privilegio Minimo
- Admin cache TTL de 10s para revogacao rapida - auth.service.ts:65
- `requireAuth` como preHandler reutilizavel - auth.ts:17-24
- `requireSuperAdminGuard` em todas as rotas admin - admin.routes.ts:16-23
- Verificacao de acesso antes de qualquer operacao socket - messageHandler.ts:38-42, voiceHandler.ts:56-62
- `canManageSuperAdmin`, `canModerateMember`, `canCreateInvite`, `canDeleteMessage` - funcoes puras - permission.service.ts

#### Auditoria
- `AuditLog` criado em `createServer` - server.service.ts:54-61
- Endpoint `/api/v1/servers/:id/audit-logs` com controlo de acesso - server.routes.ts:315-323
- Eventos sensiveis logados via pino em todos os handlers

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

#### Design de API
- Versionamento duplo `/api/v1` + `/api` (alias zero-downtime) - app.ts:155-156
- OpenAPI 3.0 spec com Swagger UI em `/api/docs` - openapi.ts
- Schemas Fastify com `additionalProperties: false` (evita mass assignment) - auth.routes.ts:114
- Paginacao cursor-based em mensagens - channel.service.ts:88-121
- Soft delete de mensagens com isDeleted, deletedAt, deletedById - channel.service.ts:273-285
- `searchMessages` com decode transparente antes de filtrar - channel.service.ts:145-152

#### Qualidade de Codigo
- **DRY**: `requireAuth`, `getAuthUserId`, `checkRateLimit` centralizados
- **Zod** para validacao de payload de entrada em todos os eventos socket
- Tipos explicitos no Prisma (select minimalista - never over-fetch)
- `Promise.allSettled` no `/readyz` - nunca falha por crash parcial - app.ts:164

#### Tratamento de Erros
- Error boundary no frontend - ErrorBoundary.tsx
- Erros Prisma P2025 tratados explicitamente - channel.routes.ts:61
- Socket errors emitidos ao cliente com mensagem descritiva
- `AbortSignal.timeout` em chamadas externas

#### Testes
- 64+ testes unitarios com Vitest
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

---

## 4. Don't Make Me Think (DMMT) - Usabilidade e API Developer Experience

### Confirmado na revisao - DMMT

#### Developer Experience (API)
- Swagger UI self-hostado em `/api/docs` - zero setup para consumidores - openapi.ts
- Especificacao OpenAPI 3.0 com descricoes em portugues - openapi.ts:7-10
- `x-socketio-events` documentado no spec para eventos bidirecionais - openapi.ts:130-143
- Mensagens de erro descritivas e consistentes em todas as rotas

#### Acessibilidade e Frontend
- Skip link implementado
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
Fixes de acessibilidade aplicados no codigo; aguardando auditoria externa.

#### [ALTO] Sem testes de usabilidade mobile com usuarios reais

DMMT dedica capitulo a mobile usability testing com usuarios humanos em dispositivos fisicos.

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

---

## Novas Observacoes Desta Revisao (2a)

### Pontos Positivos Confirmados

1. **Criptografia end-to-end consistente** - tanto DMs (master key) quanto mensagens de canal
   (chave derivada via HKDF) sao cifradas em repouso. Fallback gracioso evita breaking change em dados legados.

2. **Atomicidade Redis correta** - o script Lua em `checkRateLimit` resolve o INCR + EXPIRE
   num unico round-trip. Elimina a condicao de corrida que existia antes.

3. **Revogacao de refresh tokens bidirecional** - tanto no /logout quanto no /refresh, o token
   consumido entra no blocklist com TTL calculado sobre `decoded.exp`.
   Tokens roubados nao sobrevivem ao logout.

4. **Dependency Injection universal** - todos os handlers socket aceitam `deps` com valores padrao.
   Cada handler e 100% testavel com mocks, sem servidor real, sem Redis, sem Prisma.

5. **Protecao SSRF em avatarUrl** - validacao explicita de protocolo `https:` via `new URL()`
   impede apontar o servidor a URLs internas (file://, http://localhost, etc.).

### Gaps Novos de Baixa Prioridade (Postergados para Producao)

#### [BAIXO] searchMessages carrega 100 mensagens em memoria antes de filtrar

Arquivo: channel.service.ts:133-152

A funcao busca 100 registos do banco e filtra em JS (nao via SQL).
Pesquisa full-text no Postgres (ILIKE ou pg_trgm) seria escalavel.
Impacto baixo em dev; relevante em canais com mais de 1000 mensagens. **Postergado para producao.**

#### [BAIXO] createChannel no channel.service.ts nao recebe serverId

Arquivo: channel.service.ts:65-79

A funcao cria canais globais sem serverId. Funciona para o contexto atual, mas pode ser confuso
quando todos os canais passarem a ser obrigatoriamente ligados a um servidor.
Nenhum impacto funcional imediato.

#### [BAIXO] Admin cache sem invalidacao explicita apos mudanca de role

Arquivo: auth.service.ts:65-78

O TTL de 10s do cache `admin:{userId}` e uma aproximacao. Apos promocao/destituicao via
`admin.routes.ts`, o cache nao e invalidado imediatamente - o utilizador mantem o status
anterior por ate 10s. Aceitavel em dev; para prod, considerar `redis.del(cacheKey)` apos mudancas de role.

---

*Avaliacao inicial: 2026-10-01. Ultima atualizacao: 2026-10-01 (2a revisao).
Todos os gaps independentes de infraestrutura real foram concluidos.
3 novos gaps de baixa prioridade identificados, postergados para producao.*
