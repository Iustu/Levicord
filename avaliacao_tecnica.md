# Avaliação Técnica — Levicord

> Análise realizada contra os 4 livros técnicos em `Livro/`.  
> Evidências de linha de código incluídas onde aplicável.  
> Scores refletem cobertura real dos conceitos — **não inflados**.

> **Atualização 2026-10-01** — gaps concluídos removidos deste documento.  
> Apenas os itens ⏳ **Pendente** e 📋 **Documentado** (decisão arquitetural / gap organizacional) permanecem.

---

## Sumário de Scores

| Livro | Score Pré-Fix | Score Pós-Fix |
|-------|--------------|---------------|
| Building Secure and Reliable Systems (BSRS) | **62%** | **~85%** |
| DevSecOps | **68%** | **~88%** |
| Engenharia de Software Moderna (ESM) | **71%** | **~88%** |
| Don't Make Me Think (DMMT) — Frontend | **58%** | **~84%** |
| Engenharia de Software Moderna — Frontend | **62%** | **~86%** |

**Score geral: ~64%** → **~86%** após fixes

> Gaps ⏳ pendentes (testes de integração Postgres real, testes E2E, WebRTC tests) impedirão atingir 95%+ até serem concluídos.

---

## ⚠️ Ação Pendente: Migration Prisma

As alterações ao `schema.prisma` requerem migration antes do próximo deploy:

```bash
pnpm --filter server exec prisma migrate dev --name "add-enums-and-timestamps"
```

Alterações incluídas:
- `updatedAt DateTime @updatedAt` em `Message` e `DirectMessage`
- Enum `AttachmentType { IMAGE VIDEO FILE }` + `Attachment.type` usa enum
- Enum `ChannelMemberRole { OWNER MODERATOR MEMBER }` + `ChannelMember.role`

---

## 1. Building Secure and Reliable Systems (BSRS)

### GAPS Pendentes — BSRS

#### 📋 ALTO — Canal messages armazenadas sem criptografia

**Arquivo**: `apps/server/src/services/channel.service.ts`

Decisão arquitetural documentada em `THREAT_MODEL.md` (ameaça I3): mensagens de canal são consideradas semipúblicas dentro do servidor; cifra adicionaria latência sem benefício equivalente ao das DMs privadas. **A rever se forem implementados canais privados por organização.**

---

#### 📋 ALTO — Nenhum fuzz testing

Candidatos: `crypto.ts`, schemas Zod, attachment URL parsing. Implementação requer setup de `@fast-check/vitest` — escopo de PR dedicado.

---

#### 📋 MÉDIO — Sem SLOs/SLIs definidos

O `fastify-metrics` está registado; definição de SLOs requer decisão de produto (targets de disponibilidade, latência p99, error budget).

---

## 2. DevSecOps

### GAPS Pendentes — DevSecOps

#### 📋 ALTO — Sem Security Champions program

Gap organizacional. Não resolvível via código — requer processo de equipa (designação, treinamento, code review focado em segurança).

---

#### 📋 MÉDIO — Sem rotação automática de chaves

Rotação zero-downtime automática requer integração com Vault/AWS Secrets Manager — escopo de infraestrutura externo ao código. Processo manual documentado em `RUNBOOK.md`.

---

## 3. Engenharia de Software Moderna (ESM) — Backend

### GAPS Pendentes — ESM Backend

#### ⏳ ALTO — Nenhum teste de integração real (tudo mockado)

Requer setup de banco Postgres de teste (ex: `testcontainers` ou DB dedicado em CI). Escopo de PR dedicado.

---

#### ⏳ ALTO — Sem testes E2E

Requer setup de Playwright/Supertest com servidor real. Escopo de PR dedicado.

---

#### ⏳ ALTO — Sem testes de mutação

Requer configuração de Stryker. Dependente de cobertura de testes estável primeiro.

---

#### 📋 MÉDIO — Sem API versioning

Adicionar prefixo `/api/v1/` implica alterar todos os clientes — PR dedicado com breaking change controlado.

---

## 4. Don't Make Me Think (DMMT) — API/Backend

### GAPS Pendentes — DMMT

#### 📋 ALTO — Sem auditoria de acessibilidade documentada

WCAG 2.1 AA requerem conformidade para plataformas de comunicação. Fixes de acessibilidade aplicados no frontend (skip link, label/id, alt text) mas sem auditoria formal completa.

---

#### 📋 ALTO — Sem testes de usabilidade mobile

DMMT dedica capítulo a mobile usability. Sem evidência de testes em dispositivos móveis. Gap organizacional.

---

#### 📋 MÉDIO — Sem documentação da API pública

Sem OpenAPI/Swagger, sem documentação de eventos Socket.io. Requer `fastify-swagger` — escopo de PR dedicado.

---

## 5. Frontend — Don't Make Me Think (DMMT)

### GAPS Pendentes — DMMT Frontend

#### 📋 ALTO — Sem breadcrumbs ou "You are here" no chat header

**Arquivo**: `apps/web/src/pages/MainApp.tsx:324-346`

Canal ativo tem classe `active` na lista lateral, mas no chat header não há indicador de caminho. Em mobile (sidebar fechada) o contexto perde-se. Fix requer redesenho do chat header mobile.

---

#### ⏳ ALTO — WebRTC sem nenhum teste

**Arquivo**: `apps/web/src/hooks/useWebRTC.ts`, `apps/web/src/components/WebRTCGrid.tsx`

Testes de WebRTC requerem mocks de `navigator.mediaDevices` e `RTCPeerConnection` — setup complexo. Escopo de PR dedicado.

---

#### 📋 MÉDIO — Sem confirmação antes de logout

**Arquivo**: `apps/web/src/hooks/useAuth.ts:62-72`

O `logout()` já tem `try/catch` com toast de erro em falha de rede. Confirmação modal antes de logout é melhoria UX pendente.

---

## 6. Frontend — Engenharia de Software Moderna (ESM)

### GAPS Pendentes — ESM Frontend

#### ⏳ ALTO — `useAuth.ts` mistura autenticação, sessão E navegação

**Arquivo**: `apps/web/src/hooks/useAuth.ts:1-75`

Refatoração segura requer extrair `useSession` (sessão + store) de `useAuth` (redirect + loginWithGoogle) — escopo de PR dedicado.

---

#### ⏳ ALTO — Acoplamento direto de `useSocketListeners` com `useChatStore`

**Arquivo**: `apps/web/src/hooks/useSocketListeners.ts:18-21`

Fix requer injeção de dependência via contexto ou parâmetro de função — escopo de PR dedicado.

---

#### 📋 MÉDIO — `ChatInput.tsx` usa XHR em vez de `fetch`

Migração para `fetch` + `ReadableStream` para progress events — escopo de PR isolado.

---

#### 📋 MÉDIO — `apiFetch` não cancela refresh em andamento se componente desmonta

Fix requer `AbortController` no `refreshPromise` — escopo de PR isolado.

---

#### 📋 MÉDIO — Prop drilling de `token` desnecessário

Remoção segura requer verificar todos os callers de `ChatInput` — escopo de PR isolado.

---

## Backlog de Próximas Sprints

| # | Gap | Área | Severidade | Tipo |
|---|-----|------|-----------|------|
| 1 | Testes de integração com Postgres real | ESM Backend | ALTO | ⏳ PR dedicado |
| 2 | Testes E2E (Playwright) | ESM Backend | ALTO | ⏳ PR dedicado |
| 3 | WebRTC sem testes | DMMT Frontend | ALTO | ⏳ PR dedicado |
| 4 | `useAuth.ts` SRP | ESM Frontend | ALTO | ⏳ PR dedicado |
| 5 | `useSocketListeners` acoplado ao store | ESM Frontend | ALTO | ⏳ PR dedicado |
| 6 | Fuzz testing | BSRS | ALTO | 📋 PR dedicado |
| 7 | Breadcrumbs no chat header mobile | DMMT Frontend | ALTO | 📋 UX redesign |
| 8 | Security Champions program | DevSecOps | ALTO | 📋 Organizacional |
| 9 | Testes de mutação (Stryker) | ESM Backend | ALTO | ⏳ Após cobertura estável |
| 10 | Confirmação antes de logout | DMMT Frontend | MÉDIO | 📋 UX PR |
| 11 | API versioning `/api/v1/` | ESM Backend | MÉDIO | 📋 Breaking change |
| 12 | `ChatInput.tsx` XHR → fetch | ESM Frontend | MÉDIO | 📋 PR isolado |
| 13 | `apiFetch` sem AbortController | ESM Frontend | MÉDIO | 📋 PR isolado |
| 14 | Prop drilling de `token` desnecessário | ESM Frontend | MÉDIO | 📋 PR isolado |
| 15 | SLOs/SLIs definidos | BSRS | MÉDIO | 📋 Decisão produto |
| 16 | Rotação automática de chaves | DevSecOps | MÉDIO | 📋 Infra externa |
| 17 | Documentação OpenAPI/Swagger | DMMT | MÉDIO | 📋 PR dedicado |

---

*Avaliação inicial: 2026-10-01. Última atualização: 2026-10-01 — gaps concluídos removidos.*
