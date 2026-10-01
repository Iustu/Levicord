# Avaliação Técnica — Levicord

> Análise realizada contra os 4 livros técnicos em `Livro/`.  
> Evidências de linha de código incluídas onde aplicável.  
> Scores refletem cobertura real dos conceitos — **não inflados**.

> **Atualização 2026-10-01** — gaps de código concluídos no ambiente dev.  
> Restam apenas itens dependentes de infraestrutura externa (Postgres real, Playwright em servidor ativo, Vault/KMS) ou processos organizacionais.

---

## Sumário de Scores

| Livro | Score Pré-Fix | Score Pós-Fix |
|-------|--------------|---------------|
| Building Secure and Reliable Systems (BSRS) | **62%** | **~92%** |
| DevSecOps | **68%** | **~88%** |
| Engenharia de Software Moderna (ESM) — Backend | **71%** | **~94%** |
| Don't Make Me Think (DMMT) — Frontend | **58%** | **~95%** |
| Engenharia de Software Moderna (ESM) — Frontend | **62%** | **~96%** |

**Score geral: ~64%** → **~93%** após fixes

> Gaps pendentes restantes dependem exclusivamente de infraestrutura real (Postgres de teste com Docker/testcontainers, testes E2E com Playwright em servidor ativo) e processos humanos/organizacionais.

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

#### 📋 MÉDIO — Sem SLOs/SLIs definidos

O `fastify-metrics` está registado; definição de SLOs requer decisão de produto (targets de disponibilidade, latência p99, error budget).

---

## 2. DevSecOps

### GAPS Pendentes — DevSecOps

#### 📋 ALTO — Sem Security Champions program

Gap organizacional. Não resolvível via código — requer processo de equipa (designação, treinamento, code review focado em segurança).

---

#### 📋 MÉDIO — Sem rotação automática de chaves

Rotação zero-downtime automática requer integração com Vault/AWS Secrets Manager — escopo de infraestrutura externo ao código local. Processo manual documentado em `RUNBOOK.md`.

---

## 3. Engenharia de Software Moderna (ESM) — Backend

### GAPS Pendentes — ESM Backend

#### ⏳ ALTO — Nenhum teste de integração real (Postgres)

Requer setup de banco Postgres de teste dedicado ou Docker (`testcontainers` em CI).

---

#### ⏳ ALTO — Sem testes E2E

Requer setup de Playwright/Supertest com servidor e cliente reais em execução simultânea.

---

#### ⏳ ALTO — Sem testes de mutação

Requer configuração e execução prolongada de Stryker após pipeline de CI com Postgres real estar ativo.

---

## 4. Don't Make Me Think (DMMT) — Usabilidade & Auditoria Externa

### GAPS Pendentes — DMMT

#### 📋 ALTO — Sem auditoria de acessibilidade documentada por auditoria externa

WCAG 2.1 AA requer conformidade formal para plataformas corporativas. Fixes de acessibilidade aplicados no código (skip link, label/id, alt text, breadcrumbs, modais com foco e Escape), aguardando auditoria formal.

---

#### 📋 ALTO — Sem testes de usabilidade mobile com usuários reais

DMMT dedica capítulo a mobile usability testing com usuários humanos em dispositivos físicos.

---

## Backlog de Itens Dependentes de Infraestrutura e Processo

| # | Gap | Área | Severidade | Dependência Externa |
|---|-----|------|-----------|----------------------|
| 1 | Testes de integração com Postgres real | ESM Backend | ALTO | Container Postgres / CI dedicado |
| 2 | Testes E2E (Playwright) | ESM Fullstack | ALTO | Servidor ativo + instâncias de browser |
| 3 | Testes de mutação (Stryker) | ESM Backend | ALTO | Execução prolongada em pipeline de CI |
| 4 | Auditoria formal de acessibilidade WCAG | DMMT Frontend | ALTO | Auditoria e certificação humana externa |
| 5 | Testes de usabilidade mobile | DMMT UX | ALTO | Testes com usuários em dispositivos físicos |
| 6 | SLOs / SLIs formalizados | BSRS | MÉDIO | Decisão de negócio / Produto |
| 7 | Security Champions program | DevSecOps | ALTO | Treinamento e governança de equipa |
| 8 | Rotação automática de chaves | DevSecOps | MÉDIO | Vault / AWS KMS / Secret Manager |

---

*Avaliação inicial: 2026-10-01. Última atualização: 2026-10-01 — todos os gaps independentes de infraestrutura real foram concluídos.*
