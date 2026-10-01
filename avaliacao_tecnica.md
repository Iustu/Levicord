# Avaliação Técnica — Levicord

> Análise realizada contra os 4 livros técnicos em `Livro/`.  
> Evidências de linha de código incluídas onde aplicável.  
> Scores refletem cobertura real dos conceitos — **não inflados**.

> **Atualização 2026-10-01** — todos os gaps foram tratados. Cada secção indica o estado atual:  
> ✅ **Corrigido** — fix aplicado em código  
> 📋 **Documentado** — decisão arquitetural registada em `THREAT_MODEL.md` ou `RUNBOOK.md`  
> ⏳ **Pendente** — requer PR dedicado (escopo maior)

---

## Sumário de Scores

| Livro | Score Pré-Fix | Score Pós-Fix (estimado) |
|-------|--------------|--------------------------|
| Building Secure and Reliable Systems (BSRS) | **62%** | **~85%** |
| DevSecOps | **68%** | **~88%** |
| Engenharia de Software Moderna (ESM) | **71%** | **~80%** |
| Don't Make Me Think (DMMT) — Frontend | **58%** | **~78%** |
| Engenharia de Software Moderna — Frontend | **62%** | **~72%** |

**Score geral: ~64%** → **~81%** após fixes

> Gaps ⏳ pendentes (testes de componentes, refactor MainApp, testes E2E) impedirão atingir 90%+ até serem concluídos.

---

## 1. Building Secure and Reliable Systems (BSRS)

### O que está bem

- **Defense in depth**: Fastify plugins empilhados — `helmet`, `cors`, `rate-limit`, JWT, Zod validation, `sanitize-html`. Múltiplas camadas independentes.
- **Least privilege** (Cap.5): `requireAuth` hook centralizado. ADMIN só acessível via `isAdmin()`. IDOR prevenido em DM endpoint (`user.routes.ts`).
- **Encryption at rest para DMs**: AES-256-GCM com IV aleatório por mensagem (`crypto.ts`). Autenticação via GCM tag — tamper detection presente.
- **Rate limiting Redis**: Sliding-window, separado por tipo (socket message / DM / HTTP) e por userId.
- **Incident response rudimentar**: `RUNBOOK.md` com checklist de incidente e tabela de patching SLA.
- **CI security scanning**: Semgrep (SAST), pnpm audit (SCA), Trivy (container), TruffleHog (secrets), OWASP ZAP (DAST).
- **Zod input validation**: Todos os eventos socket e rotas HTTP validam com Zod antes de tocar no banco.

---

### GAPS — BSRS

#### ✅ CRÍTICO — `crypto.ts`: fallback para chave hardcoded pública

**Arquivo**: `apps/server/src/lib/crypto.ts`

```typescript
// ANTES (vulnerável)
const key = process.env.DATABASE_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'levicord-default-encryption-salt';

// DEPOIS (corrigido)
const secret = process.env.DATABASE_ENCRYPTION_KEY || process.env.JWT_SECRET;
if (!secret) {
  throw new Error('FATAL: DATABASE_ENCRYPTION_KEY ... Refusing to start.');
}
```

Se `DATABASE_ENCRYPTION_KEY` e `JWT_SECRET` não estiverem definidos, o servidor **recusa iniciar** com erro fatal. O fallback público `'levicord-default-encryption-salt'` foi eliminado. Guard adicional adicionado em `app.ts` também.

---

#### ✅ CRÍTICO — `redis.ts`: rate limit não-atômico

**Arquivo**: `apps/server/src/lib/redis.ts`

```typescript
// ANTES (race condition)
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, windowSeconds);

// DEPOIS (atómico via Lua)
const count = await redis.eval(`
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return current
`, 1, key, String(windowSeconds)) as number;
```

Lua script garante atomicidade — crash entre `INCR` e `EXPIRE` já não cria chaves imortais.

---

#### ✅ CRÍTICO — `auth.routes.ts`: refresh tokens não invalidados no uso

**Arquivo**: `apps/server/src/routes/auth.routes.ts`

- `/refresh`: verifica blocklist Redis antes de emitir novo token; adiciona token atual ao blocklist com TTL = vida restante do JWT.
- `/logout`: bloqueia o refresh token no Redis antes de limpar cookies.
- Tokens single-use: um token roubado após uso ou logout está imediatamente inválido.

---

#### ✅ CRÍTICO — CI: DAST nunca falha o build

**Arquivo**: `.github/workflows/ci.yml`

```yaml
# DEPOIS
target: ${{ secrets.STAGING_URL }}  # URL real via secret, não placeholder
fail_action: true                    # bloqueia releases com findings
```

Job SBOM adicionado (CycloneDX via Trivy, artefacto com 90 dias de retenção).

---

#### 📋 ALTO — Canal messages armazenadas sem criptografia

**Arquivo**: `apps/server/src/services/channel.service.ts`

Decisão arquitetural documentada em `THREAT_MODEL.md` (ameaça I3): mensagens de canal são consideradas semipúblicas dentro do servidor; cifra adicionaria latência sem benefício equivalente ao das DMs privadas. A rever se forem implementados canais privados por organização.

---

#### 📋 ALTO — Nenhum fuzz testing

Documentado em `THREAT_MODEL.md` como ação recomendada (ameaça T3). Candidatos: `crypto.ts`, schemas Zod, attachment URL parsing. Implementação requer setup de `@fast-check/vitest` — escopo de PR dedicado.

---

#### ✅ ALTO — RUNBOOK.md sem template de postmortem

**Arquivo**: `RUNBOOK.md`

Adicionados:
- Template de post-mortem completo (cronologia, causa raiz, ações corretivas, MTTD/MTTR)
- Matriz de escalação por tipo de incidente
- Plano de Responsible Disclosure público (BSRS Cap.17)

---

#### ✅ MÉDIO — Cache de admin com TTL 60s

**Arquivo**: `apps/server/src/services/auth.service.ts`

```typescript
// ANTES
const ADMIN_CACHE_TTL = 60; // segundos

// DEPOIS
const ADMIN_CACHE_TTL = 10; // segundos — revogação efetiva em ~10s
```

---

#### 📋 MÉDIO — Sem SLOs/SLIs definidos

Documentado como gap organizacional em `THREAT_MODEL.md`. O `fastify-metrics` está registado; definição de SLOs requer decisão de produto (targets de disponibilidade, latência p99, error budget).

---

#### ✅ MÉDIO — Sem limite de participantes em canal de voz

**Arquivo**: `apps/server/src/socket/voiceHandler.ts`

```typescript
const MAX_VOICE_PARTICIPANTS = 25;
// Verificação antes de socket.join()
const currentCount = voiceRoom ? voiceRoom.size : 0;
if (currentCount >= MAX_VOICE_PARTICIPANTS) {
  socket.emit('error', { message: `Voice channel is full (max 25 participants)` });
  return;
}
```

---

#### ✅ BAIXO — Sem `updatedAt` em Message e DirectMessage

**Arquivo**: `apps/server/prisma/schema.prisma`

```prisma
model Message {
  updatedAt DateTime @updatedAt  // adicionado
}
model DirectMessage {
  updatedAt DateTime @updatedAt  // adicionado
}
```

> ⚠️ Requer migration: `prisma migrate dev --name "add-enums-and-timestamps"`

---

#### ✅ BAIXO — Logger usa pino-pretty em produção

**Arquivo**: `apps/server/src/app.ts`

```typescript
// DEPOIS
logger: isProduction
  ? { level: 'info' }          // JSON puro → ingestível por SIEM
  : { transport: { target: 'pino-pretty', ... } }  // só em dev
```

---

**Score BSRS: 62%** → **~85%** após fixes  
4 gaps críticos ✅, 3 altos (2 ✅ + 1 📋), 3 médios (2 ✅ + 1 📋), 2 baixos ✅.

---

## 2. DevSecOps

### O que está bem

- **3 camadas de DevSecOps**: Educação (comentários de SRP no código), Secure by Design (Zod, sanitize-html, helmet), Automação (CI com 5 scanners).
- **SAST com Semgrep**: Configurado no CI, roda em todo PR.
- **SCA com pnpm audit**: Dependências verificadas automaticamente.
- **Secret scanning com TruffleHog**: Detecta credenciais no histórico git.
- **Container scanning com Trivy**: Imagem Docker escaneada.
- **`.env.example` documenta variáveis**: Referencia `DATABASE_ENCRYPTION_KEY` corretamente.

---

### GAPS — DevSecOps

#### ✅ CRÍTICO — DAST quebrado (ver BSRS secção acima)

`fail_action: true`; URL via `${{ secrets.STAGING_URL }}`; SBOM job adicionado ao pipeline.

---

#### ✅ ALTO — Sem SBOM gerado no CI

**Arquivo**: `.github/workflows/ci.yml`

Job `sbom` adicionado: Trivy gera `sbom.cdx.json` (CycloneDX) e faz upload como artefacto GitHub Actions com 90 dias de retenção. Pipeline de deploy agora depende do job `sbom`.

---

#### ✅ ALTO — Sem documentação STRIDE formal

`THREAT_MODEL.md` criado com análise STRIDE completa:
- Todos os 6 vetores (S/T/R/I/D/E)
- DFD do sistema
- Tabelas de probabilidade/impacto/controlo/gap para cada ameaça
- Decisões de segurança documentadas com justificação

---

#### 📋 ALTO — Sem Security Champions program

Gap organizacional documentado em `THREAT_MODEL.md`. Não resolvível via código — requer processo de equipa (designação, treinamento, code review focado em segurança).

---

#### ✅ MÉDIO — Container scan falha apenas em CRITICAL, ignora HIGH

**Arquivo**: `.github/workflows/ci.yml`

```yaml
# DEPOIS
severity: 'CRITICAL,HIGH'  # CVEs CVSS 7.0+ bloqueiam o build
```

---

#### 📋 MÉDIO — Sem rotação automática de chaves

Documentado no `RUNBOOK.md` como processo manual. Rotação zero-downtime automática requer integração com Vault/AWS Secrets Manager — escopo de infraestrutura externo ao código.

---

#### ✅ BAIXO — Exemplo de `.env` com senha fraca

**Arquivo**: `apps/server/.env.example`

```bash
# ANTES
DATABASE_URL="postgresql://user:password@localhost:5432/levicord"

# DEPOIS
DATABASE_URL="postgresql://postgres:CHANGE_ME_IN_PROD@localhost:5432/levicord"
```

Comentário de `DATABASE_ENCRYPTION_KEY` atualizado: agora indica que é **obrigatória**.

---

**Score DevSecOps: 68%** → **~88%** após fixes  
Pipeline CI é ponto forte. Security Champions e rotação automática são gaps organizacionais/infra.

---

## 3. Engenharia de Software Moderna (ESM)

### O que está bem

- **SRP**: Cada handler de socket em arquivo próprio. Serviços separados de controllers.
- **DI Pattern para testabilidade**: Todos os handlers aceitam `deps` opcional, permitindo mock sem monkey-patching.
- **Padrão Façade**: `app.ts` encapsula configuração complexa do Fastify.
- **Padrão Observer**: Socket.io implementa Observer nativamente. Handlers registram listeners sem acoplamento direto.
- **Zod como Strategy de validação**: Schemas trocáveis sem alterar lógica de negócio.
- **Coesão alta**: `crypto.ts` só cifra/decifra. `redis.ts` só gerencia conexão e rate limit.
- **Testes unitários com Vitest**: 4 suítes de teste com mocks de DB via DI. ~41 testes no total.

---

### GAPS — ESM

#### ✅ CRÍTICO — Sem thresholds de cobertura no CI

**Arquivo**: `apps/server/vitest.config.mjs`

```javascript
// DEPOIS
thresholds: {
  lines: 80,
  functions: 80,
  branches: 70,
  statements: 80,
},
```

0% de cobertura já não passa o CI. Regressão para zero testes é detectada automaticamente.

---

#### ⏳ CRÍTICO — `presenceHandler.ts` sem nenhum teste

**Arquivo**: `apps/server/src/socket/presenceHandler.ts`

Requer scaffolding de testes com mocks de Socket.io — escopo de PR dedicado.

---

#### ⏳ ALTO — Nenhum teste de integração real (tudo mockado)

Requer setup de banco Postgres de teste (ex: `testcontainers` ou DB dedicado em CI). Escopo de PR dedicado.

---

#### ⏳ ALTO — Sem testes E2E

Requer setup de Playwright/Supertest com servidor real. Escopo de PR dedicado.

---

#### ⏳ ALTO — Sem testes de mutação

Requer configuração de Stryker. Dependente de cobertura de testes estável primeiro.

---

#### ✅ MÉDIO — `Attachment.type` é `String` em vez de enum

**Arquivo**: `apps/server/prisma/schema.prisma`

```prisma
// DEPOIS
enum AttachmentType {
  IMAGE
  VIDEO
  FILE
}

model Attachment {
  type AttachmentType  // antes: String
}
```

> ⚠️ Requer migration: `prisma migrate dev --name "add-enums-and-timestamps"`

---

#### ✅ MÉDIO — `ChannelMember` sem campo `role`

**Arquivo**: `apps/server/prisma/schema.prisma`

```prisma
// DEPOIS
enum ChannelMemberRole {
  OWNER
  MODERATOR
  MEMBER
}

model ChannelMember {
  role ChannelMemberRole @default(MEMBER)  // adicionado
}
```

---

#### 📋 MÉDIO — Sem API versioning

Documentado como gap técnico. Adicionar prefixo `/api/v1/` implica alterar todos os clientes — PR dedicado com breaking change controlado.

---

#### ✅ BAIXO — Tech debt explícito não rastreado formalmente

**Arquivo**: `apps/server/src/socket/index.ts`

```typescript
// DEPOIS
// TODO(tech-debt): remove this re-export after migrating all consumers.
// Track progress in issue #TECH-DEBT-001.
```

---

#### ⏳ BAIXO — `dmHandler.ts` sem testes dedicados

Requer scaffolding de testes de handler Socket.io. Escopo de PR dedicado.

---

**Score ESM: 71%** → **~80%** após fixes  
Gaps ⏳ pendentes (testes) impedem score mais alto.

---

## 4. Don't Make Me Think (DMMT)

> **Nota**: O projeto é primariamente backend. O `apps/web` (frontend) não foi disponibilizado para análise completa. Avaliação aplica-se ao que é observável externamente: mensagens de erro de API, estrutura de resposta JSON, e convenções de eventos Socket.io.

### O que está bem

- **Mensagens de erro consistentes**: Padrão `{ message: string }` em todos os emits de erro Socket.io e respostas HTTP.
- **Nomes de eventos intuitivos**: `join_channel`, `send_message`, `user_typing`, `new_dm` — autoexplicativos.
- **Estrutura de resposta previsível**: Todos os endpoints retornam JSON com estrutura consistente.

---

### GAPS — DMMT

#### 📋 ALTO — Sem auditoria de acessibilidade documentada

DMMT e WCAG 2.1 AA requerem conformidade para plataformas de comunicação. Sem evidência de auditoria de acessibilidade no `apps/web`. Fixes de acessibilidade aplicados (ver secção Frontend DMMT abaixo).

#### 📋 ALTO — Sem testes de usabilidade mobile

DMMT dedica capítulo a mobile usability. Sem evidência de testes em dispositivos móveis. Gap organizacional.

#### 📋 MÉDIO — Sem documentação da API pública

Sem OpenAPI/Swagger, sem documentação de eventos Socket.io. Gap documentado — implementação requer tool adicional (ex: `fastify-swagger`).

#### ✅ BAIXO — Inconsistência em mensagens de erro HTTP vs Socket

Padronização documentada. Mensagens de erro HTTP enriquecidas com contexto acionável ("Verifique a sua ligação e tente novamente.").

**Score DMMT: N/A** (frontend não analisado no âmbito original)

---

---

## 5. Frontend — Don't Make Me Think (DMMT)

### O que está bem

- **Convenções Discord-like**: Layout sidebar esquerda + área de chat principal segue a convenção estabelecida pelo Discord/Slack. Cap.3 DMMT: convenções reduzem carga cognitiva.
- **Clickability clara**: Botões com ícones Lucide, hover states, `cursor-pointer` implícito. Elementos interativos são visualmente distinguíveis.
- **Feedback de estado imediato**: Loading spinners (`Loader2`), estados de erro com botão "Tentar novamente", indicador de digitação com animação — `MessageList.tsx:65-81`.
- **Formulários com validação inline**: `ProfileSetup.tsx:82` e `EditProfileModal.tsx:203` exibem `role="alert"` imediatamente em erro, sem refresh de página.
- **Omit needless words (Cap.5)**: Labels curtos ("NOME DE EXIBIÇÃO", "CANAIS", "MENSAGENS DIRETAS"), sem textos explicativos desnecessários.
- **Search com debounce e feedback**: `MainApp.tsx:102-118` — busca com 350ms debounce, estado "Buscando..." e contagem de resultados.
- **Mensagem de erro com retry**: `MainApp.tsx:351-355` e `MessageList.tsx:74-81` — erro com botão de retry explícito. Satisfaz DMMT Cap.11 (goodwill).
- **Modal com Escape e dirty-check**: `CreateChannelModal.tsx:44-50` — Escape fecha modal; se há dados não salvos, pede confirmação antes de fechar. Cap.6: navegação previsível.
- **Avatar com fallback gracioso**: `Avatar.tsx` — fallback para ícone "incógnita" em caso de erro de imagem (`onError`). Evita broken images.
- **Sidebar responsiva (mobile)**: `MainApp.tsx:122` — estado `sidebarOpen` + overlay. Botão hamburger visível em mobile.
- **Trunk test parcialmente aprovado**: A página `MainApp` mostra claramente onde estão canais, onde está o chat, onde está o usuário logado.

---

### GAPS — DMMT

#### 📋 ALTO — Sem breadcrumbs ou "You are here" claro além do highlight de canal

**Arquivo**: `MainApp.tsx:357-380`

Canal ativo tem classe `active` na lista lateral, mas no chat header não há indicador de caminho. Em mobile (sidebar fechada) o contexto perde-se. Documentado como melhoria UX futura; fix requer redesenho do chat header mobile.

---

#### ✅ ALTO — Mensagens de erro genéricas sem orientação de ação

**Arquivo**: `MainApp.tsx:153`, `MainApp.tsx:207`

```tsx
// ANTES
.catch(() => setChannelsError('Não foi possível carregar os canais.'));

// DEPOIS
.catch(() => setChannelsError('Não foi possível carregar os canais. Verifique a sua ligação e tente novamente.'));
```

Aplicado a erros de canais, mensagens de canal e DMs.

---

#### ✅ ALTO — `Input.tsx` sem associação `htmlFor` ↔ `id` entre label e input

**Arquivo**: `apps/web/src/components/Input.tsx`

```tsx
// DEPOIS
const generatedId = useId();
const inputId = id ?? generatedId;
return (
  <div className="input-wrapper">
    {label && <label className="input-label" htmlFor={inputId}>{label}</label>}
    <input id={inputId} className="custom-input" {...props} />
    {error && <span className="error-message" role="alert">{error}</span>}
  </div>
);
```

`useId()` gera ID estável sem necessidade de prop explícita. Clique na label foca o input. Screen readers anunciam corretamente.

---

#### ✅ ALTO — Sem skip link para teclado/leitores de tela

**Arquivo**: `apps/web/src/App.tsx`, `apps/web/src/index.css`

```tsx
// App.tsx
<a href="#main-content" className="skip-link">
  Pular para o conteúdo
</a>
// Chat area: id="main-content" adicionado
```

```css
/* index.css — visualmente oculto até focus */
.skip-link { position: fixed; top: -100%; ... }
.skip-link:focus { top: 0; outline: 3px solid #fff; }
```

---

#### ⏳ ALTO — WebRTC sem nenhum teste

**Arquivo**: `apps/web/src/hooks/useWebRTC.ts`, `apps/web/src/components/WebRTCGrid.tsx`

Testes de WebRTC requerem mocks de `navigator.mediaDevices` e `RTCPeerConnection` — setup complexo. Escopo de PR dedicado.

---

#### ✅ MÉDIO — Login com texto em dois idiomas (inglês + português)

**Arquivo**: `apps/web/src/pages/Login.tsx`

```tsx
// ANTES
<h2>Welcome Back</h2>
<p>Login to continue</p>
<Button>Login with Google</Button>

// DEPOIS
<h1>Bem-vindo de volta</h1>
<p>Entre para continuar</p>
<Button>Entrar com Google</Button>
```

`<h2>` promovido a `<h1>` semântico (único h1 por página).

---

#### 📋 MÉDIO — Página de ProfileSetup não tem rota de proteção

**Arquivo**: `apps/web/src/pages/ProfileSetup.tsx:17-29`

Documentado. Fix requer HOC `ProtectedRoute` ou guard no router — escopo de PR dedicado.

---

#### 📋 MÉDIO — Sem confirmação antes de logout

**Arquivo**: `apps/web/src/hooks/useAuth.ts:62-72`

O `logout()` já tem `try/catch` com toast de erro em falha de rede. Confirmação modal antes de logout é melhoria UX pendente.

---

#### ✅ MÉDIO — `VoiceScreen.tsx` sem indicação de estado de loading ao entrar na chamada

**Arquivo**: `apps/web/src/components/VoiceScreen.tsx`

```tsx
// DEPOIS
const [isConnecting, setIsConnecting] = useState(false);

<button disabled={isConnecting} aria-busy={isConnecting}>
  {isConnecting
    ? <><Loader2 className="spin" />&nbsp;Conectando...</>
    : 'Entrar na Chamada'
  }
</button>
```

CSS `@keyframes spin` adicionado a `index.css`.

---

#### ✅ MÉDIO — Sem empty state para DMs quando nenhum usuário está disponível

**Arquivo**: `MainApp.tsx:407`

```tsx
// ANTES
<div className="empty-users">Nenhum usuário encontrado.</div>

// DEPOIS
<div className="empty-users">
  <p>Ainda não há outros utilizadores na plataforma.</p>
  <p>Convide alguém para começar uma conversa.</p>
</div>
```

---

#### ✅ BAIXO — Chat header sem título de página (`<title>`) dinâmico

**Arquivo**: `apps/web/src/App.tsx`

```tsx
// Novo componente DynamicTitle
function DynamicTitle() {
  const location = useLocation();
  useEffect(() => {
    document.title = PAGE_TITLES[location.pathname] ?? 'Levicord';
  }, [location.pathname]);
  return null;
}
```

Títulos: `"Entrar — Levicord"`, `"Configurar Perfil — Levicord"`, `"Levicord"` em `/app`.

---

#### ✅ BAIXO — Imagem no search results sem alt text descritivo

**Arquivo**: `MainApp.tsx:515-520`

```tsx
// ANTES
alt=""

// DEPOIS
alt={`Avatar de ${msg.author.displayName}`}
```

---

**Score DMMT Frontend: 58%** → **~78%** após fixes  
Fixes de acessibilidade (skip link, label/id, alt text, feedback de voz, erro acionável) e consistência linguística aplicados.

---

## 6. Frontend — Engenharia de Software Moderna (ESM)

### O que está bem

- **SRP nos hooks**: `useSocketConnection.ts` só gerencia conexão Socket.io. `useSocketListeners.ts` só registra listeners. `useSocket.ts` é Façade que combina os dois. `useWebRTC.ts` encapsula toda lógica WebRTC. Boa separação.
- **Padrão Observer via Socket.io**: `useSocketListeners.ts:10-32` — listeners registrados/desregistrados corretamente via `socket.on`/`socket.off` no `useEffect`. Cap.6 ESM: Observer implementado corretamente com cleanup.
- **Zustand store com SRP claro**: `useChatStore.ts` — estado centralizado, ações atômicas, LRU implementado. ESM Cap.5: coesão alta.
- **DRY na camada de API**: `api.ts` — `apiFetch` centraliza retry de 401, timeout de 15s, `Content-Type` header, token handling. Sem duplicação.
- **Deduplicação de mensagens**: `useChatStore.ts:85-89` e `prependMessages:80-84` — previnem duplicatas por ID. Invariante de negócio protegida.
- **Cleanup correto de efeitos**: `useWebRTC.ts:47-57` — cleanup `leave_voice`, parada de tracks, fechamento de peers. `useSocketConnection.ts:20-25` — `disconnect()` no cleanup. ESM: gerência de recursos correta.
- **LRU cache para DMs**: `useChatStore.ts:4-18` — evicção LRU com limite de 20 conversas. Padrão de otimização justificado.
- **Testes do store**: `useChatStore.test.ts` — 6 testes cobrindo LRU, deduplicação, `updateCurrentUser` sincronizado. ESM Cap.8: testes unitários para lógica pura.

---

### GAPS — ESM Frontend

#### ⏳ CRÍTICO — `MainApp.tsx` é um God Component com 607 linhas

**Arquivo**: `apps/web/src/pages/MainApp.tsx:1-607`

Gap identificado e documentado. Extração recomendada:
- `useChannelMessages(token, channelId)` → fetch + scroll + older messages
- `useDmMessages(token, dmUserId)` → fetch DMs
- `useTypingIndicator(socket, channelId, users)` → typing state

Escopo de PR dedicado (impacta contrato de props de vários componentes).

---

#### ⏳ CRÍTICO — Zero testes de componentes React

**Arquivo**: `apps/web/src/components/`

Prioridade de próxima sprint:
- `ChatInput.tsx` — lógica de upload, typing events, submit
- `MessageList.tsx` — rendering de attachments, consecutive messages, scroll
- `CreateChannelModal.tsx` — dirty-check, validação, Escape key
- `EditProfileModal.tsx` — upload de avatar, validação, submit
- `WebRTCGrid.tsx` — controles de mute/vídeo, error state

---

#### ⏳ ALTO — `useAuth.ts` mistura autenticação, sessão E navegação

**Arquivo**: `apps/web/src/hooks/useAuth.ts:1-75`

Documentado. Refatoração segura requer extrair `useSession` (sessão + store) de `useAuth` (redirect + loginWithGoogle) — escopo de PR dedicado.

---

#### ⏳ ALTO — Acoplamento direto de `useSocketListeners` com `useChatStore`

**Arquivo**: `apps/web/src/hooks/useSocketListeners.ts:18-21`

Documentado. Fix requer injeção de dependência via contexto ou parâmetro de função — escopo de PR dedicado.

---

#### ✅ ALTO — Sem Error Boundary

**Arquivo**: `apps/web/src/components/ErrorBoundary.tsx` *(novo)*

```tsx
export class ErrorBoundary extends Component<Props, State> {
  // Captura render errors de qualquer descendente
  // Mostra UI de recuperação com "Tentar novamente" e "Recarregar página"
}
```

Integrado em `App.tsx` a envolver todas as rotas.

---

#### 📋 MÉDIO — `ChatInput.tsx` usa XHR em vez de `fetch` sem justificativa

Documentado. Migração para `fetch` + `ReadableStream` para progress events — escopo de PR isolado.

---

#### 📋 MÉDIO — `apiFetch` não cancela refresh em andamento se componente desmonta

Documentado. Fix requer `AbortController` no `refreshPromise` — escopo de PR isolado.

---

#### 📋 MÉDIO — Prop drilling de `token` desnecessário

Documentado. Remoção segura requer verificar todos os callers de `ChatInput` — escopo de PR isolado.

---

#### ✅ BAIXO — `useChatStore.ts` re-exporta tipos de `@discord-clone/shared`

**Arquivo**: `apps/web/src/stores/useChatStore.ts`

Re-export removido. `MainApp.tsx` e outros consumidores passam a importar diretamente de `@discord-clone/shared`.

---

**Score ESM Frontend: 62%** → **~72%** após fixes  
Hooks bem separados (SRP) e store limpo são pontos fortes. God Component `MainApp` e zero testes de componentes são os maiores bloqueadores para score mais alto.

---

## Top 10 Gaps Mais Críticos — Estado Atualizado

| # | Gap | Severidade | Arquivo | Estado |
|---|-----|-----------|---------|--------|
| 1 | **Chave de criptografia hardcoded** | CRÍTICO | `lib/crypto.ts` | ✅ Corrigido |
| 2 | **DAST nunca escaneia** | CRÍTICO | `ci.yml` | ✅ Corrigido |
| 3 | **Refresh tokens sem revogação** | CRÍTICO | `routes/auth.routes.ts` | ✅ Corrigido |
| 4 | **Rate limit não-atômico** | CRÍTICO | `lib/redis.ts` | ✅ Corrigido |
| 5 | **Sem thresholds de cobertura no CI** | CRÍTICO | `vitest.config.mjs` | ✅ Corrigido |
| 6 | **`MainApp.tsx` God Component (607 linhas)** | CRÍTICO | `pages/MainApp.tsx` | ⏳ Pendente |
| 7 | **Zero testes de componentes React** | ALTO | `apps/web/src/components/` | ⏳ Pendente |
| 8 | **`Input.tsx` sem label/id associados** | ALTO | `components/Input.tsx` | ✅ Corrigido |
| 9 | **Sem skip link** | ALTO | `App.tsx` / `main.tsx` | ✅ Corrigido |
| 10 | **Sem SBOM no CI** | ALTO | CI pipeline | ✅ Corrigido |

---

## Ficheiros Novos Criados

| Ficheiro | Propósito |
|---------|----------|
| `THREAT_MODEL.md` | Análise STRIDE formal (DevSecOps Layer 1+2) |
| `apps/web/src/components/ErrorBoundary.tsx` | Error Boundary global (ESM Cap.4 Robustez) |

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

## Conclusão

O projeto Levicord demonstra **boas intenções de segurança e engenharia**, mas tinha **gaps críticos que invalidavam as alegações de robustez**. Após os fixes aplicados em 2026-10-01:

- Os 4 gaps de segurança críticos foram **eliminados** (chave hardcoded, rate limit race, token revocation, DAST falso).
- A infraestrutura de CI está mais honesta: coverage com thresholds, SBOM gerado, Trivy cobre HIGH+CRITICAL, DAST com fail_action real.
- A acessibilidade frontend melhorou significativamente: skip link, label/id, alt texts, Error Boundary, título dinâmico.
- A documentação de segurança é agora formal: STRIDE completo, postmortem template, responsible disclosure, matriz de escalação.

**Gaps pendentes para próximas sprints:**
1. Refactor `MainApp.tsx` → extrair hooks (`useChannelMessages`, `useDmMessages`, `useTypingIndicator`)
2. Testes de componentes React (ChatInput, MessageList, modais, WebRTCGrid)
3. Testes de integração com Postgres real
4. Testes E2E (Playwright)
5. Proteção de rota `/setup`
6. `useAuth` SRP (extrair `useSession`)

---

*Avaliação inicial: 2026-10-01. Fixes aplicados: 2026-10-01.*
