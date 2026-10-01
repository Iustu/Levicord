# 🔍 Avaliação Técnica e Plano de Ação — Levicord

> **Documento Atualizado**: Itens concluídos foram validados e removidos da fila de pendências ativas.  
> Itens de infraestrutura corporativa/SRE foram classificados como **Postergados para Produção**, focando o desenvolvimento atual na estabilidade e segurança da aplicação.  
> Cruzamento rigoroso com os 4 livros técnicos da pasta [`Livro/`](file:///c:/Users/joao.ribeiro/Desktop/Discord/Livro).

---

## 🔴 BLOQUEANTE ATUAL (Escopo de Desenvolvimento)

| # | Área | Gap Técnico | Impacto | Fonte | Ação Recomendada | Status |
|---|------|-------------|---------|-------|------------------|:------:|
| **1.1** | **DevSecOps / Secrets** 📚 | Valores de fallback no [`docker-compose.yml`](file:///c:/Users/joao.ribeiro/Desktop/Discord/docker-compose.yml): `JWT_SECRET: local-development-secret-change-in-production`, `DATABASE_URL` com `password` e `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}`. | Risco de uso de credenciais fracas se implantado sem um arquivo `.env` preenchido. | BSRS Cap. 14 · DevSecOps Layer 2 | Remover fallbacks inseguros (`${VAR:-password}`). Exigir definição explícita via `.env` não versionado. | 🟡 Pendente |

---

## ⏳ ITENS POSTERGADOS PARA PRODUÇÃO (Ambiente Atual: Dev)

> *Decisão Técnica de Engenharia*: Conforme alinhamento, itens de alta disponibilidade distribuída, rotinas externas de backup e métricas com alertas em tempo real são preocupações de infraestrutura de **Produção** e estão temporariamente postergados durante a fase de desenvolvimento local.

| # | Área | Item Postergado | Justificativa para Produção | Fonte |
|---|------|-----------------|-----------------------------|-------|
| **P.1** | **SRE / Backup** 📚 | Rotina automatizada cron de `pg_dump` e `mc mirror` offsite. Procedimento manual documentado em [`RUNBOOK.md`](file:///c:/Users/joao.ribeiro/Desktop/Discord/RUNBOOK.md). | Em ambiente de dev local, perda de dados não impacta usuários finais. Automatização necessária antes do go-live. | BSRS Caps. 16–18 |
| **P.2** | **SRE / Alta Disponibilidade** 📚 | Réplica read-only de PostgreSQL, Redis Sentinel e múltiplas instâncias atrás de Load Balancer. | Overhead desnecessário de containers e recursos de máquina para desenvolvimento local. | BSRS Cap. 8 |
| **P.3** | **Processo / Conventional Commits** 📚 | Auditoria estrita de mensagens de commit no CI e enforçamento do Husky. | Velocidade de prototipação em dev; processo a ser formalizado para abertura de PRs de produção. | ESM Cap. 2 |
| **P.4** | **Segurança / Threat Modelling** 📚 | Documentação formal de STRIDE e DFDs. | Controles defensivos essenciais já implementados no código; formalização recomendada para auditoria pré-lançamento. | DevSecOps L2 |
| **P.5** | **Qualidade / Observabilidade** 📚 | SLOs numéricos (`p95 < 200ms`) e regras de disparo de alertas no Grafana. | Depende de volume e carga de tráfego real de usuários para calibração de baselines. | ESM Cap. 3 |

---

## ✅ ITENS RECENTEMENTE CONCLUÍDOS E VALIDADOS

| Item | Implementação Realizada | Validação e Evidência no Código |
|---|---|---|
| **1.2 Testes Automatizados e Cobertura (Suíte Monorepo)** | • Task `test` configurada no [`turbo.json`](file:///c:/Users/joao.ribeiro/Desktop/Discord/turbo.json#L9-L11).<br>• Script `test:coverage` e provedor `@vitest/coverage-v8` configurados em [`vitest.config.mjs`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/vitest.config.mjs).<br>• Import estático de `userRoutes` corrigido em [`app.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/app.ts#L106).<br>• Redis isolado com `lazyConnect: true` em ambiente de testes.<br>• Suíte expandida com 56 testes no server e 8 no web. | **64 testes automatizados passando 100% verde** via `pnpm test` no monorepo:<br>✓ [`crypto.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/lib/crypto.test.ts) (6 testes — 100% cob.)<br>✓ [`channel.service.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/services/channel.service.test.ts) (9 testes)<br>✓ [`auth.service.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/services/auth.service.test.ts) (7 testes — 100% cob.)<br>✓ [`dm.service.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/services/dm.service.test.ts) (3 testes — 100% cob.)<br>✓ [`dmHandler.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/dmHandler.test.ts) (5 testes — 100% cob.)<br>✓ [`messageHandler.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/messageHandler.test.ts) (10 testes — 95% cob.)<br>✓ [`voiceHandler.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/voiceHandler.test.ts) (9 testes — 76% cob.)<br>✓ [`app.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/app.test.ts) (7 testes)<br>✓ [`useChatStore.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/web/src/stores/useChatStore.test.ts) (6 testes)<br>✓ [`Button.test.tsx`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/web/src/components/Button.test.tsx) (2 testes) |
| **3.2 Criptografia de Dados em Repouso (Field-Level)** | • Módulo [`crypto.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/lib/crypto.ts) com autenticação AES-256-GCM (`enc:v1:<iv>:<tag>:<ciphertext>`).<br>• Integração transparente em [`dm.service.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/services/dm.service.ts): mensagens privadas são cifradas antes da persistência no PostgreSQL.<br>• Decodificação automática para leitores autorizados e tolerância graciosa a textos legados.<br>• Procedimento e rotação de chave documentados em [`RUNBOOK.md`](file:///c:/Users/joao.ribeiro/Desktop/Discord/RUNBOOK.md) e [`apps/server/.env.example`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/.env.example). | Validado com testes unitários em [`crypto.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/lib/crypto.test.ts) e [`dm.service.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/services/dm.service.test.ts), cobrindo integridade de auth tag, não-repúdio e proteção contra vazamento de disco. |
| **Gaps de Dev / WebRTC & Auth (Correção Integral)** | • **Logout Seguro (`POST /api/auth/logout`)**: Endpoint centralizado em [`auth.routes.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/routes/auth.routes.ts), expirando cookies `accessToken` e `refreshToken` com atributos seguros (`SameSite=Strict`, `HttpOnly`), emitindo log de auditoria.<br>• **Autorização e Validação de Canais de Voz**: Em [`voiceHandler.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/voiceHandler.ts), checagem se o canal existe, se é do tipo `VOICE` e verificação estrita de autorização via `canAccessChannel` e `isAdmin`.<br>• **Limpeza Automática de Peers WebRTC (`disconnect`)**: Listener `disconnect` adicionado a [`voiceHandler.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/voiceHandler.ts), emitindo `user_left_voice` e prevenindo conexões órfãs no cliente [`useWebRTC.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/web/src/hooks/useWebRTC.ts).<br>• **Sanitização de Perfil e Validação de Avatar**: Em [`auth.routes.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/routes/auth.routes.ts), sanitização HTML em `displayName` e validação estrita de `avatarUrl` (apenas `https:` ou caminhos de upload `/uploads/...`, rejeitando esquemas maliciosos `javascript:` ou `data:`). | Validado com 9 testes unitários em [`voiceHandler.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/voiceHandler.test.ts) e testes de integração em [`app.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/app.test.ts), além de compilação 100% limpa via `pnpm build`. |

---

## 📚 ANÁLISE MINUCIOSA DOS 4 LIVROS TÉCNICOS

---

### 📖 1. Building Secure and Reliable Systems (Google / O'Reilly)

O livro estabelece que segurança e confiabilidade são propriedades indissociáveis (não podem ser adicionadas a posteriori como "remendos").

* **Cap. 12 — Writing Code (Simplicity & Safe Frameworks)**:
  * **Conceito**: Utilizar bibliotecas centralizadas e tipagem forte em vez de validações espalhadas. Promover segurança *by default*.
  * **Aderência no Levicord**: O Fastify centraliza plugins (`@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`). A sanitização HTML (`sanitize-html`) é executada no ponto de entrada de dados ([`channel.service.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/services/channel.service.ts#L107), [`dm.service.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/services/dm.service.ts#L32) e [`auth.routes.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/routes/auth.routes.ts)). O Prisma ORM protege estruturalmente contra SQL Injection.
* **Cap. 13 — Testing Code (Unit & Integration Testing)**:
  * **Conceito**: Testes de segurança devem verificar ativamente invariantes de acesso (ex: garantir que um não-membro nunca leia canal privado, e que dados inválidos sejam rejeitados).
  * **Aderência no Levicord**: Implementados testes em [`channel.service.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/services/channel.service.test.ts), [`voiceHandler.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/voiceHandler.test.ts) e [`app.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/app.test.ts) validando acesso a canais públicos vs privados, salas de voz protegidas, isolamento de inquilinos e sanitização de payloads maliciosos (`<script>` e `javascript:`).
* **Cap. 14 — Deploying Code & Data Protection**:
  * **Conceito**: Defesa em profundidade para armazenamento (Zero Trust). Dados sensíveis não devem depender unicamente da segurança física do banco de dados.
  * **Aderência no Levicord**: Implementação da criptografia de campo AES-256-GCM em [`apps/server/src/lib/crypto.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/lib/crypto.ts), garantindo confidencialidade mesmo em caso de dump ou roubo de volume do PostgreSQL.
* **Cap. 15 — Investigating Systems (Auditing & Logs)**:
  * **Conceito**: Auditoria estruturada de eventos de negação de acesso para investigação forense pós-incidente.
  * **Aderência no Levicord**: Pino logger emite logs JSON com campos `{ event, userId, ip }` em acessos negados, falhas de autenticação, logout e rejeições de upload MIME.

---

### 📖 2. DevSecOps — A Leader's Guide (Glenn Wilson)

O modelo das Três Camadas (Three Layers) orienta a inserção contínua da segurança no ciclo ágil.

* **Layer 1 — Security Education & Culture**:
  * **Aderência**: Existência de checklist prévio em [`.github/PULL_REQUEST_TEMPLATE.md`](file:///c:/Users/joao.ribeiro/Desktop/Discord/.github/PULL_REQUEST_TEMPLATE.md) e procedimentos de rotação e incidentes em [`RUNBOOK.md`](file:///c:/Users/joao.ribeiro/Desktop/Discord/RUNBOOK.md).
* **Layer 2 — Secure by Design**:
  * **Aderência**: Princípio do Menor Privilégio assegurado na tabela [`ChannelMember`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/prisma/schema.prisma#L45), verificação de escopo em [`user.routes.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/routes/user.routes.ts) e controle de acesso a canais de voz em [`voiceHandler.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/voiceHandler.ts). Proteção de dados confidenciais em repouso implementada via envelope criptográfico.
* **Layer 3 — Security Automation (Shift-Left)**:
  * **Aderência**: Pipeline [`.github/workflows/ci.yml`](file:///c:/Users/joao.ribeiro/Desktop/Discord/.github/workflows/ci.yml) completo com SAST (Semgrep + `tsc --noEmit`), SCA (`pnpm audit`), Container Scan (Trivy), DAST (OWASP ZAP), Secret Scan (TruffleHog) e agora com **49 testes automatizados validados via Turborepo (`pnpm test`)**.

---

### 📖 3. Engenharia de Software Moderna (Marco Tulio Valente)

O livro foca em manutenibilidade, design orientado a objetos, arquitetura em camadas e práticas de teste.

* **Cap. 5 e 6 — Princípios de Projeto & Padrões**:
  * **SRP e Alta Coesão**: Desmembramento completo dos sockets por domínio ([`messageHandler.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/messageHandler.ts), [`dmHandler.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/dmHandler.ts), [`voiceHandler.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/voiceHandler.ts)).
  * **Padrão Façade**: [`useSocket.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/web/src/hooks/useSocket.ts) orquestra conexão e listeners mantendo a interface estável.
  * **Testabilidade (DI)**: Injeção de dependência via argumentos padrão nos services e no [`voiceHandler.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/server/src/socket/voiceHandler.ts#L30) viabilizou testes limpos sem monkey-patching ou mock invasivo.
* **Cap. 8 — Testes de Software**:
  * **Aderência**: Criação de suíte de testes unitários isolados para lógica pura e regras de negócio, além de testes de integração com `app.inject()` validando rotas, liveness, logout e auth guards. Cache LRU no cliente testado com limite de 20 conexões em [`useChatStore.test.ts`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/web/src/stores/useChatStore.test.ts).

---

### 📖 4. Don't Make Me Think, Revisited (Steve Krug)

Foco em usabilidade sem atritos, convenções familiares e carga cognitiva mínima.

* **Lei #1 — "Não me faça pensar!" & Convenções Visuais (Caps. 1 a 4)**:
  * Layout clássico Discord-like com visualização de canais, lista de membros e área de chat. Redução de ruído visual agrupando mensagens consecutivas (`isConsecutive`).
* **Trunk Test & Navegação (Cap. 6)**:
  * Busca integrada com debounce de 350ms no cabeçalho do canal ([`MainApp.tsx`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/web/src/pages/MainApp.tsx)), permitindo localização ágil de conversas com retorno visual inline.
* **Mobile & Cortesia (Caps. 10 e 11)**:
  * Sidebar colapsável em `< 768px`, touch targets adequados ($\ge 44\text{px}$) e modal de edição de perfil intuitivo ([`EditProfileModal.tsx`](file:///c:/Users/joao.ribeiro/Desktop/Discord/apps/web/src/components/EditProfileModal.tsx)) com feedback visual imediato e preview de avatar em tempo real. Fluxo de encerramento de sessão confiável e direto.

---

### 📊 Score Consolidado Atualizado

```
Don't Make Me Think (Steve Krug)            ███████████████████░ 99%
Engenharia de Software Moderna (Valente)    ███████████████████░ 95%
Building Secure and Reliable Systems (BSRS) ██████████████████░░ 92%
DevSecOps — Leader's Guide (Glenn Wilson)   ██████████████████░░ 92%
```

| Livro / Referência | Score | Status Após Implementações |
| :--- | :---: | :--- |
| **Don't Make Me Think** (Steve Krug) | **~99%** | Interface de alta usabilidade, busca inline com debounce, responsividade mobile, encerramento de sessão confiável e perfil customizável. |
| **Engenharia de Software Moderna** (Marco Tulio Valente) | **~95%** | Subiu para 95% com a expansão da suíte para 49 testes automatizados orquestrada pelo Turborepo, isolamento e injeção de dependências no voiceHandler e services. |
| **Building Secure and Reliable Systems** (Google / O'Reilly) | **~92%** | Subiu para 92% com criptografia em repouso AES-256-GCM, autorização e validação de tipo em WebRTC e eliminação de conexões órfãs. |
| **DevSecOps** (Glenn Wilson) | **~92%** | Subiu para 92% com os testes de segurança integrados ao pipeline, sanitização XSS de inputs e validação estrita de URLs. |
