# Threat Model — Levicord (STRIDE)

> (DevSecOps Layer 1 + Layer 2 — Security Education & Secure by Design)  
> Versão: 2026-10-01

---

## Âmbito

Sistema de chat em tempo real com autenticação OAuth (Google), mensagens de canal (texto), mensagens diretas cifradas (AES-256-GCM), canais de voz (WebRTC P2P), e upload de ficheiros.

**Componentes em âmbito:**
- `apps/server` — API Fastify + Socket.io
- `apps/web` — React SPA
- PostgreSQL (dados), Redis (sessões/rate-limit), MinIO (uploads)

---

## Data Flow Diagram (DFD)

```
[Browser] ──HTTPS──► [Fastify API] ──► [PostgreSQL]
                         │
                         ├──► [Redis]   (rate limit, token blocklist)
                         └──► [MinIO]   (upload de ficheiros)

[Browser] ──WSS──► [Socket.io] ──► [Fastify/Redis]

[Browser A] ──WebRTC (peer-to-peer)──► [Browser B]
            (sinalização via Socket.io)
```

---

## Análise STRIDE

### S — Spoofing (Falsificação de identidade)

| # | Ameaça | Probabilidade | Impacto | Controlo Existente | Gap |
|---|--------|--------------|---------|-------------------|-----|
| S1 | Atacante forja JWT para autenticar como outro utilizador | Baixa | Crítico | `JWT_SECRET` obrigatório; `fastify-jwt` verifica assinatura | Nenhum |
| S2 | Refresh token roubado reutilizado após logout | Média | Alto | Redis blocklist (single-use tokens) | ~~Ausente~~ → **corrigido** |
| S3 | CSRF em endpoints de mutação | Baixa | Médio | `sameSite: strict` nos cookies | Sem CSRF token para não-cookie flows |

**Mitigações adicionais recomendadas:**
- S3: adicionar `fastify-csrf-protection` se houver endpoints que aceitam JSON sem cookie.

---

### T — Tampering (Adulteração)

| # | Ameaça | Probabilidade | Impacto | Controlo Existente | Gap |
|---|--------|--------------|---------|-------------------|-----|
| T1 | Adulteração de mensagens DM em trânsito | Baixa | Alto | TLS obrigatório em produção | Nenhum |
| T2 | Adulteração de DMs em repouso (base de dados comprometida) | Baixa | Crítico | AES-256-GCM com tag de autenticação; chave externa | Chave deve estar em HSM/secret manager em produção |
| T3 | Upload de ficheiros maliciosos (execução server-side) | Média | Crítico | MinIO serve ficheiros sem execução; tipo verificado por mimeType | Sem validação de magic bytes |

**Mitigações adicionais recomendadas:**
- T2: migrar `DATABASE_ENCRYPTION_KEY` para Vault/AWS Secrets Manager.
- T3: adicionar validação de magic bytes (e.g., `file-type` npm package) antes de aceitar upload.

---

### R — Repudiation (Repúdio)

| # | Ameaça | Probabilidade | Impacto | Controlo Existente | Gap |
|---|--------|--------------|---------|-------------------|-----|
| R1 | Utilizador nega ter enviado mensagem | Baixa | Médio | `authorId` imutável por mensagem; `createdAt` | Sem assinatura digital de mensagens |
| R2 | Admin nega ter modificado permissões | Baixa | Alto | Logs pino com `event: auth_*` | Sem audit log dedicado em tabela |

**Mitigações adicionais recomendadas:**
- R2: criar tabela `AuditLog` no Prisma para ações sensíveis de admin.

---

### I — Information Disclosure (Divulgação de informação)

| # | Ameaça | Probabilidade | Impacto | Controlo Existente | Gap |
|---|--------|--------------|---------|-------------------|-----|
| I1 | Stack traces expostos em respostas de erro | Baixa | Médio | Fastify não expõe stack por omissão em produção | Verificar `NODE_ENV=production` |
| I2 | DMs legíveis se DB comprometida | Baixa | Crítico | AES-256-GCM com chave externa | Ver T2 |
| I3 | Mensagens de canal em claro no DB | Média | Alto | Ausente | ~~Gap ALTO~~ — sem cifra de canal |
| I4 | Logs expõem dados pessoais | Baixa | Médio | pino em JSON em produção; `ignore: pid,hostname` | Verificar que `content` de mensagens não é logado |

**Mitigações adicionais recomendadas:**
- I3: classificar formalmente mensagens de canal como "dados sensíveis" → cifrar ou documentar decisão de não cifrar.

---

### D — Denial of Service (Negação de serviço)

| # | Ameaça | Probabilidade | Impacto | Controlo Existente | Gap |
|---|--------|--------------|---------|-------------------|-----|
| D1 | Flood de mensagens via Socket.io | Média | Alto | Rate limit Redis por userId (Lua atómico) | ~~Race condition~~ → **corrigido** |
| D2 | Flood de conexões WebRTC num canal de voz | Alta | Alto | Limite de 25 participantes por canal | ~~Ausente~~ → **corrigido** |
| D3 | Uploads grandes saturando MinIO | Média | Médio | `@fastify/multipart` com limites de tamanho | Verificar limite configurado |
| D4 | Flood de requests HTTP | Média | Médio | `@fastify/rate-limit` global (100 req/min) | Sem rate limit por endpoint sensível |

---

### E — Elevation of Privilege (Elevação de privilégio)

| # | Ameaça | Probabilidade | Impacto | Controlo Existente | Gap |
|---|--------|--------------|---------|-------------------|-----|
| E1 | Utilizador acede a canal privado sem membro | Baixa | Alto | `canAccessChannel` verifica membros | Testes de integração ausentes |
| E2 | IDOR: aceder a DMs de outro utilizador | Baixa | Crítico | Endpoint `/api/users/:id/dms` verifica userId via JWT | ~~Verificado~~ |
| E3 | Admin cache stale permite acesso após revogação | Média | Alto | TTL reduzido para 10s | ~~60s~~ → **corrigido** |
| E4 | SQL Injection via Prisma queries | Baixa | Crítico | Prisma usa prepared statements por omissão | Nenhum (Prisma protege) |

---

## Decisões de Segurança Documentadas

| Decisão | Justificação |
|---------|-------------|
| Mensagens de canal **não cifradas** em repouso | Canal público/semipúblico; cifra adicionaria latência sem proporcionar benefício equivalente ao das DMs privadas. A rever se forem implementados canais privados por organização. |
| Refresh tokens **single-use** (blocklist Redis) | Tokens JWT stateless não têm revogação nativa; blocklist Redis com TTL igual à vida restante do token é o padrão BSRS. |
| `sameSite: strict` em vez de CSRF tokens | Suficiente para o modelo de ameaça atual (SPA no mesmo domínio). Se houver endpoints públicos, reconsiderar. |

---

*Última revisão: 2026-10-01. Rever após qualquer mudança de arquitetura significativa.*
