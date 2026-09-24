# 🔍 Plano de Ação Priorizado — Levicord (Backlog de Gaps Técnicos)

> Esta avaliação técnica foi reestruturada para refletir **a ordem de criticidade** de resolução. O projeto já passou por pesadas refatorações (IDOR, WebRTC Seguro, Refresh Tokens, SRP e Paginação), eliminando a esmagadora maioria dos bugs críticos de código. 
> 
> O que resta agora forma o **Backlog** para as próximas fases.

---

## 🔴 PRIORIDADE 1: CRÍTICA (Bloqueantes para Produção)
*Problemas graves de gestão, vazamento de credenciais ou ausência total de garantias de qualidade contínua. Resolvê-los é mandatório antes de qualquer lançamento público real.*

| # | Área | Gap Técnico | Impacto | Ação Recomendada |
|---|------|-------------|---------|------------------|
| **1.1** | **DevSecOps** | Segredos Hardcoded no Docker: `JWT_SECRET` e `DATABASE_URL` estão com valores explícitos no `docker-compose.yml` que vai para o repositório. | Invasão direta ao banco de dados e falsificação de tokens JWT caso o repositório seja lido. | Substituir as chaves no YAML por variáveis de ambiente (`${JWT_SECRET}`) injetadas via `.env` externo ou Secret Manager na CI. |
| **1.2** | **Testes** | Ausência absoluta de testes automatizados (`app.test.ts` está vazio e frontend não possui setup). | Toda nova feature inserida (como os recentes tokens) corre enorme risco de quebrar regras antigas de negócio silenciosamente. | Implementar testes Unitários com Vitest (para Services) e Integração com Supertest (para Routes). |
| **1.3** | **Infraestrutura** | O serviço do `MinIO` (S3 clone) está ativado consumindo RAM no Docker Compose, mas o backend faz upload de arquivos diretamente no disco local. | Desperdício de recursos de nuvem, complexidade inútil e risco de disco cheio no servidor de aplicação. | Ou remover o MinIO do `docker-compose` ou atualizar o upload no Fastify para enviar os streams para o bucket S3 do MinIO. |

---

## 🟠 PRIORIDADE 2: ALTA (Débito Técnico e Performance Estrutural)
*Gaps arquiteturais que, embora não quebrem a aplicação imediatamente, vão causar lentidão extrema, exaustão de memória ou acoplamentos severos no médio prazo.*

| # | Área | Gap Técnico | Impacto | Ação Recomendada |
|---|------|-------------|---------|------------------|
| **2.1** | **Gestão de Estado** | O estado `dms` do Zustand não possui limite lógico. Se o usuário abrir muitos chats, a RAM do navegador estourará. | Vazamento de memória clássico de SPA (*Memory Leak* no client). | Implementar LRU Cache no store do Zustand, mantendo apenas as N últimas conversas ativas na memória principal. |
| **2.2** | **Otimização** | `getChannels` e `getUsers` buscam todos os registros da base sem paginação (`limit`/`offset`). | *Full Table Scans* farão as rotas caírem por timeout quando o Discord tiver centenas de usuários. | Inserir paginação por cursor (como já feito nas mensagens) ou, no mínimo, paginação por offset. |
| **2.3** | **Segurança / UX** | Anexos sendo servidos abertamente pelo `@fastify/static`. Não há verificação se o usuário que acessa a imagem/arquivo possui leitura àquele canal de DMs. | Quebra de privacidade de arquivos trocados em mensagem direta. | Passar os estáticos por um guard de autenticação via stream de leitura invés de via pasta pública direta do plugin. |
| **2.4** | **Arquitetura** | Hook `useSocket` continua muito central. Ele gerencia conexão, binds de eventos, state de stores e métodos imperativos. | Viola SRP. Dificulta muito a criação de testes de mock para WebSocket. | Quebrar em `useSocketConnection`, `useSocketListeners` e funções de API puras. |
| **2.5** | **SRE** | Ausência de *Graceful Shutdown*. Se o servidor reinicia, conexões web socket morrem subitamente. | Perda de mensagens em trânsito e timeouts secos pro usuário. | Interceptar `SIGTERM/SIGINT`, parar de receber novas requisições HTTP, fechar conexões Socket abertas suavemente, depois encerrar DB. |
| **2.6** | **Otimização DB** | Função middleware de admin (`isAdmin`) realiza query no SQL em toda e qualquer rota de administração, sem cache. | Sobrecarga I/O desnecessária ao PostgreSQL para dados frios. | Guardar os perfis admin ativos no Redis com TTL curto. |

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
