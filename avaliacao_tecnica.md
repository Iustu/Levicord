# 🔍 Avaliação Técnica Completa — Levicord

> Análise baseada na leitura **de todos os arquivos** do projeto. Honesta, sem suavizações.

## Legenda
🟢 Forte · 🟡 Adequado com ressalva · 🔴 Problema real · ⬛ Ausente / Inexistente

---

# PARTE 1 — SEGURANÇA

## 1.1 Autenticação e Tokens

**`auth.routes.ts` / `auth.service.ts`**

| # | Ponto | Status |
|---|-------|--------|
| 1 | JWT em cookie `httpOnly: true` — XSS não rouba o token | 🟢 |
| 2 | `secure: process.env.NODE_ENV === 'production'` — cookie só vai em HTTPS em prod | 🟢 |
| 3 | `sameSite: 'lax'` — protege contra CSRF em navegação cross-site | 🟡 Deveria ser `'strict'` pois o app não depende de links externos |
| 4 | Token expira em **15 minutos** — minimiza janela de ataque se vazado | 🟢 |
| 5 | **Sem Refresh Token implementado** — linha 78 está comentada. Usuário precisa relogar a cada 15 min ou a sessão "fica viva" de outra forma não documentada | 🔴 |
| 6 | `useAuth.ts` mantém token como `'__cookie__'` — gambiarra para dizer "já está autenticado". Se o cookie expirar silenciosamente, o frontend continua acreditando estar logado até a próxima requisição HTTP falhar | 🔴 |
| 7 | `logout()` faz POST para limpar o cookie mas não aguarda resposta — `void fetch(...)` — se a requisição falhar, o cookie persiste no servidor mas o estado local some | 🟡 |
| 8 | `verified_email === false` bloqueia usuários com email não verificado no Google | 🟢 |

## 1.2 Autorização

| # | Ponto | Status |
|---|-------|--------|
| 9 | Rotas de admin verificam `role: ADMIN` via `isAdmin(userId)` que consulta o banco | 🟢 |
| 10 | `isAdmin` faz **uma query SQL por request administrativo** — deveria ser cacheado no Redis dado o perfil de leitura intensivo | 🟡 |
| 11 | `user.routes.ts` — rota `GET /:id/dms` **não verifica se o `id` da URL pertence ao usuário logado**. Qualquer usuário autenticado pode passar o ID de outro e ler suas mensagens com um terceiro | 🔴 **IDOR (Insecure Direct Object Reference)** |
| 12 | WebRTC signaling (`webrtc_offer`, `webrtc_answer`) — server faz relay sem verificar se o `targetSocketId` pertence a alguém realmente no mesmo canal de voz | 🔴 |
| 13 | `join_voice` no socket não valida se `channelId` é um canal de voz válido (CUID, existência no banco) | 🔴 |

## 1.3 Upload de Arquivos

| # | Ponto | Status |
|---|-------|--------|
| 14 | Sem `limits: { fileSize: N }` no `@fastify/multipart` — qualquer tamanho passa | 🔴 |
| 15 | `data.filename` do usuário usado diretamente na construção do caminho físico: `${Date.now()}-${data.filename}` — um filename com `../../../etc/passwd` pode ser sufocado pelo `Date.now()` mas ainda é perigoso sem sanitização explícita | 🔴 Path Traversal |
| 16 | O tipo do arquivo é inferido pelo `mimetype` declarado pelo **cliente** — cliente pode enviar `.js` com `Content-Type: image/png` e o servidor salva como imagem | 🔴 |
| 17 | Arquivos servidos publicamente sem autenticação pelo `@fastify/static` — URLs adivinháveis (`${Date.now()}-nome.jpg`) | 🟡 Para um app fechado pode ser aceitável, mas não é documentado |
| 18 | Sem antivírus/escaneamento de conteúdo | 🟡 Aceitável para escopo small-scale |

## 1.4 Socket.io

| # | Ponto | Status |
|---|-------|--------|
| 19 | Autenticação no `io.use` middleware antes de qualquer `connection` | 🟢 |
| 20 | Rate limit por socket para mensagens e DMs usando Redis | 🟢 |
| 21 | `send_message` verifica se o socket está na room antes de persistir | 🟢 |
| 22 | `getCookieValue()` faz parse manual de cookie — pode ter edge cases com cookies especialmente formatados | 🟡 |
| 23 | Schemas Zod validam payload de entrada | 🟢 |
| 24 | `attachmentSchema` aceita qualquer `url` string — um usuário malicioso pode enviar URLs externas falsas e injetar conteúdo de qualquer origem no chat | 🔴 |

## 1.5 Docker / Infraestrutura

| # | Ponto | Status |
|---|-------|--------|
| 25 | `docker-compose.yml` linha 56: `JWT_SECRET: local-development-secret-change-in-production` hardcoded no arquivo que vai para o Git | 🔴 **Segredo em repositório** |
| 26 | `DATABASE_URL` com senha `password` hardcoded na linha 54 do `docker-compose.yml` | 🔴 |
| 27 | PostgreSQL e Redis expostos apenas em `127.0.0.1` — não acessíveis externamente | 🟢 |
| 28 | Healthchecks no PostgreSQL e Redis com `depends_on: condition: service_healthy` | 🟢 |
| 29 | MinIO no `docker-compose.yml` mas **nunca usado no código** — o upload ainda usa disco local | 🔴 Dead code de infraestrutura; confunde sobre qual é a estratégia real |
| 30 | Sem `read_only: true` nos containers, sem `user: node` para rodar como não-root | 🟡 |
| 31 | Sem `memory` e `cpu` limits nos serviços Docker | 🟡 |

## 1.6 CI/CD (`ci.yml`)

| # | Ponto | Status |
|---|-------|--------|
| 32 | `pnpm audit --audit-level high` na pipeline — vulnerabilidades críticas bloqueiam o merge | 🟢 |
| 33 | `pnpm --filter web test` na pipeline — mas **não há testes no frontend** | 🔴 Pipeline vai falhar ou o comando não faz nada |
| 34 | Sem etapa de lint (`eslint`) na pipeline | 🟡 |
| 35 | Sem scan de secrets (ex: `truffleHog`, `gitleaks`) na pipeline | 🟡 |
| 36 | Deploy não automatizado — não há step de CD | 🟡 Aceitável para o escopo |

---

# PARTE 2 — ENGENHARIA DE SOFTWARE

## 2.1 Coesão e Acoplamento

| # | Ponto | Status |
|---|-------|--------|
| 37 | Camada de serviços bem definida: `auth.service`, `channel.service`, `dm.service`, `user.service` | 🟢 |
| 38 | Routes apenas orquestram — sem lógica de negócio diretamente nos handlers | 🟢 |
| 39 | `socket/index.ts` com **207 linhas** — mistura sinalização WebRTC, presença, DMs e mensagens em um único arquivo. Viola SRP — deveria ser dividido em handlers separados | 🔴 |
| 40 | `MainApp.tsx` com ~370 linhas — mistura fetch de canais, fetch de DMs, upload, WebRTC state e toda a renderização. Um componente fazendo 6 coisas diferentes | 🔴 |
| 41 | `useSocket.ts` — hook que cria a conexão, ouve eventos E expõe métodos de envio — três responsabilidades | 🟡 |
| 42 | Tipos compartilhados em `@discord-clone/shared` evitam duplicação entre apps | 🟢 |
| 43 | `(request.user as any).sub` em 2 rotas diferentes — casting `any` que deveria ser um tipo utilitário compartilhado | 🟡 |

## 2.2 Tipagem TypeScript

| # | Ponto | Status |
|---|-------|--------|
| 44 | `handleOffer`, `handleAnswer`, `handleCandidate`, `handleUserLeft` em `useWebRTC.ts` usam `any` explicitamente | 🔴 |
| 45 | `sendMessage` e `sendDm` em `useSocket.ts` recebem `attachments?: any[]` | 🔴 |
| 46 | `(error: any)` no catch do `CreateChannelModal` | 🟡 Melhor seria `error instanceof Error` |
| 47 | `prisma.$transaction(async (transaction: any)` — o tipo correto seria `Prisma.TransactionClient` | 🟡 |
| 48 | `channel as any` em `MainApp.tsx` para acessar `type` — o tipo `Channel` do shared já tem `type`, mas o cast indica que algo no flow de tipos não está batendo | 🟡 |

## 2.3 Repetição de Código (DRY)

| # | Ponto | Status |
|---|-------|--------|
| 49 | Bloco de autenticação JWT repetido como `addHook('onRequest')` em **3 routes diferentes** (`channel.routes`, `user.routes`, `upload.routes`) — deveria ser um plugin ou decorator de Fastify | 🔴 |
| 50 | `rateLimitKey` + `redis.incr` + `redis.expire` duplicado identicamente em `send_message` e `send_dm` — candidato a função `checkRateLimit(key, limit, window)` | 🔴 |
| 51 | `select: { id: true, displayName: true, avatarUrl: true }` repetido em 4 queries do Prisma | 🟡 |
| 52 | Tipo do input de anexo `{ url: string; type: ...; fileName: string; fileSize: number; mimeType: string }` declarado inline em `createMessage` e `createDirectMessage` — deveria ser um tipo nomeado | 🟡 |

## 2.4 Tratamento de Erros

| # | Ponto | Status |
|---|-------|--------|
| 53 | `socket.on('disconnect')` — `redis.decr` pode retornar valor negativo se o Redis foi reiniciado. Sem proteção contra underflow | 🟡 |
| 54 | `useWebRTC.ts` — `getUserMedia` failure só faz `console.error` sem nenhum feedback visual ao usuário | 🔴 |
| 55 | `useAuth.ts` — `logout()` usa `void fetch(...)` — erros de rede são silenciosamente ignorados | 🟡 |
| 56 | Em `loadOlderMessages` no `MainApp.tsx`, o erro genérico não distingue erro de rede de 404 ou 500 | 🟡 |
| 57 | `app.test.ts` — testa apenas healthcheck e autenticação básica. **Nenhum teste de serviço, nenhum teste de socket, nenhum teste de upload** | 🔴 |

## 2.5 Gestão de Estado no Frontend

| # | Ponto | Status |
|---|-------|--------|
| 58 | `useChatStore` deduplicação de mensagens com `Set` de IDs — evita duplicatas ao reconectar | 🟢 |
| 59 | `useSocket.ts` retorna `socket: socketRef.current` — valor **não reativo**. `useWebRTC` recebe `null` na primeira renderização mesmo após conexão estabelecida | 🔴 Bug real |
| 60 | `useAuth` re-executa o fetch de sessão a cada mudança de `location` (URL) — bom para revalidar após redirect, mas pode gerar requests desnecessários em SPAs | 🟡 |
| 61 | Estado de `activeVoiceChannelId` separado de `activeChannelId` — cria possibilidade de estados inconsistentes (canal ativo ≠ canal de voz ativo) | 🟡 |
| 62 | `dms` no store cresce indefinidamente — sem limite de tamanho ou limpeza de conversas antigas na memória | 🟡 |

---

# PARTE 3 — UX / UI

## 3.1 Feedback e Estados

| # | Ponto | Status |
|---|-------|--------|
| 63 | Loading, error e empty states em todos os fluxos de chat | 🟢 |
| 64 | Botão "Tentar novamente" nos erros de canal e mensagens | 🟢 |
| 65 | Preview do arquivo antes de enviar, com botão de cancelar | 🟢 |
| 66 | Câmera e microfone solicitados sem nenhum aviso prévio ao usuário — viola princípio de consentimento informado | 🔴 |
| 67 | Falha no `getUserMedia` (câmera negada) = **tela em branco silenciosa** | 🔴 |
| 68 | Upload sem barra de progresso — para arquivos >1MB o spinner aparece por tempo indeterminado | 🟡 |
| 69 | Token de 15 minutos expirando durante uso → próxima requisição falha com 401 → **sem tratamento no frontend**. Usuário vê uma mensagem de erro genérica sem ser redirecionado ao login | 🔴 |

## 3.2 Acessibilidade

| # | Ponto | Status |
|---|-------|--------|
| 70 | Botões com `aria-label` e `title` nos ícones sem texto | 🟢 |
| 71 | `role="dialog"` e `aria-modal`, `aria-labelledby` no modal | 🟢 |
| 72 | Mensagens de erro com `role="alert"` | 🟢 |
| 73 | Foco não é movido para dentro do modal ao abrir — usuário de teclado não sabe que o modal apareceu | 🔴 |
| 74 | Ao fechar o modal, foco não retorna ao elemento que o abriu | 🟡 |
| 75 | Lista de canais e DMs sem navegação por teclado (setas) | 🟡 |
| 76 | Contraste de cores não testado formalmente — a paleta é baseada no Discord que tem problemas conhecidos de contraste em texto secundário (#8e9297 sobre #2f3136 ≈ 3.8:1 — abaixo do WCAG AA para texto normal) | 🔴 |
| 77 | `<img>` avatares com `alt=""` correto para imagens decorativas | 🟢 |
| 78 | Vídeos remotos no WebRTCGrid sem legenda/identificação do speaker | 🔴 |

## 3.3 Experiência Geral

| # | Ponto | Status |
|---|-------|--------|
| 79 | Design fiel ao Discord — convenções familiares (*Don't Make Me Think*) | 🟢 |
| 80 | Sem notificação visual de nova DM enquanto em outro canal | 🔴 |
| 81 | Sem indicador de "digitando..." (typing indicator) | 🟡 Não estava no escopo mas é esperado em apps de chat |
| 82 | Sidebar sem scroll — com muitos canais a lista transborda | 🟡 |
| 83 | Nenhum feedback de confirmação ao enviar arquivo com sucesso | 🟡 |
| 84 | Mensagens sem formatação Markdown (negrito, código, links clicáveis) | 🟡 |
| 85 | Nome de usuário nos vídeos remotos exibe "Usuário" genérico | 🔴 |

---

# PARTE 4 — OTIMIZAÇÃO

## 4.1 Backend

| # | Ponto | Status |
|---|-------|--------|
| 86 | Paginação por cursor em `getChannelMessages` — O(log n) com índice composto | 🟢 |
| 87 | `getDirectMessages` sem paginação por cursor — retorna até 50 e inverte no servidor (`.reverse()`) | 🔴 |
| 88 | `isAdmin` consulta o banco a cada request administrativo sem cache | 🟡 |
| 89 | `getChannels` retorna todos os canais sem limit — aceitável para 20 usuários, não escalável | 🟡 |
| 90 | `getUsers` sem paginação — retorna todos os usuários de uma vez | 🟡 |
| 91 | `processGoogleUser` chama `configuredAdminEmails()` que re-processa `ADMIN_EMAILS` a cada login — deveria ser memoizado na inicialização | 🟡 |

## 4.2 Frontend

| # | Ponto | Status |
|---|-------|--------|
| 92 | `AbortController` em carregamentos de mensagens antigas — cancela requests obsoletos ao trocar de canal | 🟢 |
| 93 | Zustand com selectors pontuais evita re-renders globais | 🟢 |
| 94 | `prependMessages` com deduplicação por Set de IDs | 🟢 |
| 95 | `useWebRTC` recria `createPeer` em cada render sem `useCallback` — pode criar closures stale com stream desatualizada | 🔴 |
| 96 | `remoteStreams` atualizado com spread `{ ...prev, [key]: value }` a cada candidato ICE — pode causar re-renders excessivos | 🟡 |
| 97 | Imagens de anexo sem lazy loading — muitas imagens em canal ativo carregam todas ao mesmo tempo | 🟡 |
| 98 | `console.log('Connected to socket server')` em produção | 🟡 Remover antes de deploy |

## 4.3 Banco de Dados / Prisma

| # | Ponto | Status |
|---|-------|--------|
| 99 | Índice composto `@@index([channelId, createdAt, id])` cobre a query de paginação | 🟢 |
| 100 | Sem índice em `DirectMessage` para `(senderId, receiverId, createdAt)` — a query `OR` de DMs faz full scan | 🔴 |
| 101 | `Attachment` sem índice em `messageId` ou `dmId` | 🟡 |

---

# PARTE 5 — ALINHAMENTO BIBLIOGRÁFICO

## *Engenharia de Software Moderna* (Marco Tulio Valente)

| Princípio | Situação Real |
|-----------|--------------|
| **SRP** | 🟡 Bem aplicado nos *services*. Violado em `socket/index.ts` (207 linhas, 4 domínios) e `MainApp.tsx` (370 linhas, 6 responsabilidades) |
| **Separação de camadas** | 🟢 Routes → Services → Prisma consistente |
| **Coesão** | 🟡 Alta nos services, baixa nos arquivos centrais |
| **Acoplamento** | 🟡 `useSocket` acoplado ao `useChatStore` diretamente — quebra inversão de dependência |
| **DRY** | 🔴 Bloco de auth JWT em 3 lugares, bloco de rate limit duplicado, select do Prisma repetido |
| **Testes** | 🔴 3 testes de integração de servidor, 0 testes de serviço unitário, 0 testes de frontend |
| **Refactoring contínuo** | 🟡 Feito entre sprints, mas `MainApp.tsx` cresceu sem extração de componentes |

## *Building Secure and Reliable Systems* (Google SRE)

| Princípio | Situação Real |
|-----------|--------------|
| **Defense in Depth** | 🟢 Helmet, CORS, JWT, Zod, Rate Limit em camadas |
| **Least Privilege** | 🔴 Bug de IDOR no `GET /:id/dms` quebra isso — qualquer user lê DMs de outros |
| **Fail Fast** | 🟢 Guards de inicialização presentes |
| **Graceful Shutdown** | ⬛ Não implementado — SIGTERM encerra conexões abruptamente |
| **Observability** | 🟡 Logs Pino presentes. Sem métricas de aplicação, sem tracing |
| **Secrets management** | 🔴 JWT_SECRET e DATABASE_URL hardcoded no `docker-compose.yml` |

## *DevSecOps* (Hüttermann)

| Prática | Situação Real |
|---------|--------------|
| **Secrets fora do repo** | 🔴 Contraditório: `.env` correto, mas `docker-compose.yml` com secrets hardcoded |
| **Pipeline com security gate** | 🟢 `pnpm audit` na CI bloqueia vulnerabilidades altas |
| **Shift-left security** | 🟡 Validação Zod é shift-left. Sem análise estática de segurança (SAST) |
| **Imagem mínima** | ⬛ Dockerfile dos apps não foi verificado nesta avaliação |
| **`.env.example`** | ⬛ Não existe — dificulta onboarding e documentação |

## *Don't Make Me Think* (Steve Krug)

| Princípio | Situação Real |
|-----------|--------------|
| **Convenções familiares** | 🟢 Layout Discord — usuários já sabem usar |
| **Feedback imediato** | 🟡 Bom em chat. Ausente em falha de WebRTC |
| **Prevenção de erro** | 🟡 Validação de nome de canal no cliente. Sem confirmação antes de fechar modal com conteúdo |
| **Foco e navegação** | 🔴 Modal sem gestão de foco — falha básica de acessibilidade que afeta usabilidade |
| **Hierarquia visual** | 🟢 Canal ativo destacado, separação visual Canais/DMs |

---

# RESUMO EXECUTIVO

## Contagem Real de Problemas

| Severidade | Quantidade |
|-----------|-----------|
| 🔴 Problema real | **22** |
| 🟡 Adequado com ressalva | **28** |
| ⬛ Ausente | **5** |
| 🟢 Forte | **30** |

## Top 5 — Prioridade Máxima (Antes do Deploy)

1. 🔴 **IDOR em `GET /api/users/:id/dms`** — qualquer usuário lê DMs de outros
2. 🔴 **Secrets hardcoded no `docker-compose.yml`** — JWT_SECRET e senha do banco no Git
3. 🔴 **Upload sem validação de tamanho e sem sanitização de nome de arquivo** — DoS + Path Traversal
4. 🔴 **Token de 15min expira silenciosamente** — sem renovação e sem redirect ao login no frontend
5. 🔴 **WebRTC sem feedback de erro** — câmera negada = tela branca sem mensagem

## Top 5 — Dívida Técnica (Próxima Iteração)

1. 🔴 **Bloco `onRequest` JWT duplicado em 3 rotas** — extrair para plugin Fastify
2. 🔴 **Bloco de rate limit duplicado** — extrair para função `checkRateLimit()`
3. 🔴 **`socket/index.ts` monolítico** — separar em `voiceSignaling.ts`, `presenceHandler.ts`, `messageHandler.ts`
4. 🔴 **`MainApp.tsx` monolítico** — extrair `<MessageList>`, `<ChatInput>`, `<VoiceScreen>`
5. 🔴 **Índice ausente em `DirectMessage`** — queries de DM fazem full scan

## Nota Final por Dimensão

| Dimensão | Nota | Justificativa |
|----------|------|--------------|
| Segurança | **5.5/10** | Fundações sólidas, mas IDOR e secrets em repo são críticos |
| Eng. de Software | **6.5/10** | Bom nos services, mal nos arquivos centrais |
| UI/UX | **6.5/10** | Visual premium, mas WebRTC e acessibilidade com falhas graves |
| Otimização | **7/10** | Backend bem pensado; frontend com bugs de reatividade |
| Alinhamento Bibliográfico | **6/10** | Conceitos aplicados, mas DRY e testes sistematicamente negligenciados |
