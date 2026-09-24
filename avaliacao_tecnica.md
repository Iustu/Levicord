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

| # | Área | Gap Técnico | Impacto | Ação Recomendada |
|---|------|-------------|---------|------------------|
| **3.1** | **UX / Errors** | `logout()` do frontend faz um `fetch` assíncrono não aguardado (void). Ignora falhas de rede. | Usuário pensa que saiu, mas cookie continua válido caso caia a internet no exato momento. | Fazer `await` com `try/catch` e notificar em Toast de erro. |
| **3.2** | **CI / CD** | Ausência de verificação de Lint (ESLint), formatação (Prettier) e secret scan na pipeline (GitHub Actions). | Código pode acumular lixo sem padrão ou vazar chaves sem alerta automático. | Adicionar `pnpm lint` e `trufflehog` ao Action. Configurar limits no Docker. |
| **3.3** | **Acessibilidade** | Lista de canais sem rolagem apropriada, sem navegação puramente via teclado, foco perdido ao fechar modals e botões faltantes para o modal de criar canal. | Viola parte fina da especificação WCAG AA para navegação de leitores de tela. | Ajustes pontuais nos componentes React usando bibliotecas headless (Radix UI). |
| **3.4** | **TypeScript** | `(error: any)` usados em blocos catch e tipagens `any` para models soltos no frontend e no Prisma `$transaction`. | Perda da segurança de tipo no compilador e no LSP da IDE. | Refatorar para `unknown` e usar checagem de tipo explícita (ex: `if (error instanceof Error)`). |
| **3.5** | **Segurança** | O cookie JWT usa `sameSite: 'lax'`. | Uma margem minúscula de ataque cross-site. | Como o app consome própria API sem redirecionamentos externos complexos, alterar para `'strict'`. |
| **3.6** | **Performance UI** | Renderização sem `Lazy Load` das imagens e atualizações não reativas usando Spread Operator excessivo no array do WebRTC. | Ligeira degradação de FPS no frontend ao rolar chat cheio de imagens. | Usar `loading="lazy"` nas imagens e melhorar a mutabilidade do Zustand/SetState. |
| **3.7** | **Banco de Dados** | A entidade `Attachment` está sem índices para `messageId` e `dmId`. | Se a tabela inchar, buscar todos os anexos de uma mensagem pode ficar N+1 lento. | Adicionar `@@index` nas FKs. |

---

## 🟢 PRIORIDADE 4: BAIXA ("Nice to Have")
*Features e polimentos que diferenciam a aplicação, mas não causam danos de negócio se ausentes.*

| # | Área | Gap Técnico | Impacto | Ação Recomendada |
|---|------|-------------|---------|------------------|
| **4.1** | **UX / Features** | Chat sem indicador de *"Digitando..."* e sem suporte a formatação *Markdown* visual (negrito, itálico, code blocks). | Diminui o valor percebido de "clone do Discord". | Usar Socket para eventos `typing_start`/`stop`. Usar `react-markdown`. |
| **4.2** | **UX** | Upload de arquivo é feito de forma binária e direta, sem barra de progresso no frontend e sem mensagem visual pós-sucesso. | Usuário pode pensar que a tela travou em uploads maiores que 5MB. | Implementar barra atrelada ao evento `onUploadProgress` do Axios/Fetch. |
| **4.3** | **Prevenção de Erros** | O modal de Criação de Canal ou Upload pode ser fechado acidentalmente perdendo o texto já digitado. | Frustração do usuário (viola preceitos do *Don't Make Me Think*). | Alerta do navegador "Você tem dados não salvos, certeza?" se tentar fechar e o estado estiver dirty. |
| **4.4** | **Observabilidade** | Ausência de métricas APM (Application Performance Monitoring). | Só o log existe; não há como ver gráficos de uso de CPU do app. | Instalar Prometheus/Grafana basic bundle no Docker e exportar endpoint `/metrics` no Fastify. |
| **4.5** | **Limpeza** | `console.log('Connected')` vazando no cliente em ambiente de Produção. | Ruído. | Remover do `useSocket`. |
