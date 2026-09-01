# Plano de Implementação — App tipo Discord

## Resumo

App de comunicação interno para até 20 usuários, auto-hospedado em Linux via Docker.
- Canais de texto organizados em abas/categorias
- Mensagens privadas (DMs)
- Upload de mídia (fotos, vídeos, arquivos)
- Transmissão de tela simultânea por múltiplos usuários (WebRTC SFU)
- Autenticação via Google OAuth2 com perfil customizável

---

## Decisões Técnicas Baseadas nas Respostas

### Sem Domínio → Cloudflare Tunnel (gratuito)
> [!IMPORTANT]
> **Google OAuth exige uma URL pública válida** — não aceita IP puro.
> A solução é usar **Cloudflare Tunnel** (`cloudflared`), que cria um URL público seguro (ex: `https://xyz.trycloudflare.com`) apontando para o servidor interno. É gratuito, não precisa de domínio e já fornece HTTPS. Quando o servidor tiver um domínio, basta trocar a configuração.

### Google OAuth + Perfil Customizável
O fluxo será:
1. Usuário faz login com Google → recebe nome + foto do Google
2. Na primeira entrada, é redirecionado para uma tela de "Configurar Perfil" onde pode editar nome e trocar foto
3. A foto customizada vai para o MinIO (ou mantém a foto do Google)

### Múltiplos Screen Shares Simultâneos
**mediasoup** como SFU (Selective Forwarding Unit) gerencia múltiplos "Producers" (transmissores) e "Consumers" (espectadores) ao mesmo tempo por sala/canal.

---

## Stack Final

| Camada | Tecnologia | Versão |
|---|---|---|
| **Frontend** | React 18 + Vite + TypeScript | Latest |
| **Estado** | Zustand + TanStack Query | Latest |
| **UI** | Vanilla CSS + CSS Modules | — |
| **Tempo real** | Socket.io Client | v4 |
| **Screen Share** | WebRTC + mediasoup-client | v3 |
| **Backend API** | Node.js + Fastify + TypeScript | Node 20 LTS |
| **WebSockets** | Socket.io | v4 |
| **Auth** | @fastify/oauth2 (Google) + JWT | — |
| **Media Server** | mediasoup | v3 |
| **ORM** | Prisma | v5 |
| **Banco principal** | PostgreSQL | v16 |
| **Cache/Pub-Sub** | Redis | v7 |
| **Object Storage** | MinIO | Latest |
| **Reverse Proxy** | Nginx | Latest |
| **Túnel HTTPS** | Cloudflare Tunnel (cloudflared) | Latest |
| **Infra** | Docker + Docker Compose | Latest |

---

## Arquitetura Detalhada

```
                    INTERNET
                       │
           ┌───────────▼──────────────┐
           │   Cloudflare Tunnel      │
           │  (HTTPS gratuito sem     │
           │   domínio próprio)       │
           └───────────┬──────────────┘
                       │
           ┌───────────▼──────────────┐
           │         NGINX            │
           │  Reverse proxy + certs   │
           │  /api/*  → Fastify:3000  │
           │  /socket/* → Socket.io   │
           │  /*      → React (SPA)   │
           │  /media/* → MinIO:9000   │
           └──┬────────┬──────────────┘
              │        │
   ┌──────────▼──┐  ┌──▼────────────────────┐
   │  Fastify    │  │   Socket.io Server    │
   │  REST API   │  │  (Chat + Presença     │
   │  + OAuth    │  │   + Screen Share SFU) │
   └──┬───┬──────┘  └─────────┬─────────────┘
      │   │                   │
 ┌────▼─┐ │ ┌───────────┐  ┌──▼──────────────┐
 │ PG   │ │ │   Redis   │  │   mediasoup     │
 │ SQL  │ └►│ pub/sub   │  │  (SFU WebRTC)   │
 └──────┘   │ sessions  │  │  Múltiplos      │
            └───────────┘  │  screen shares  │
                           └─────────────────┘
           ┌───────────────────┐
           │      MinIO        │
           │  fotos, vídeos,   │
           │  arquivos, avatars│
           └───────────────────┘
```

---

## Estrutura do Projeto (Monorepo)

```
discord-clone/
├── apps/
│   ├── web/                    # React + Vite
│   │   ├── src/
│   │   │   ├── components/     # UI components
│   │   │   ├── pages/          # Rotas (canais, DMs, etc)
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── hooks/          # Custom hooks
│   │   │   └── lib/            # socket.io client, webrtc
│   │   └── vite.config.ts
│   │
│   └── server/                 # Fastify + Node.js
│       ├── src/
│       │   ├── routes/         # REST endpoints
│       │   ├── plugins/        # Fastify plugins (auth, cors...)
│       │   ├── socket/         # Socket.io handlers
│       │   ├── mediasoup/      # SFU logic
│       │   ├── services/       # Business logic
│       │   └── prisma/         # Schema + migrations
│       └── Dockerfile
│
├── packages/
│   └── shared/                 # Tipos TypeScript compartilhados
│       └── src/
│           ├── types.ts        # User, Message, Channel...
│           └── events.ts       # Socket.io event names
│
├── docker/
│   ├── nginx/
│   │   └── nginx.conf
│   └── cloudflared/
│       └── config.yml
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
└── turbo.json                  # Turborepo (monorepo tooling)
```

---

## Modelos de Dados (PostgreSQL via Prisma)

```prisma
model User {
  id          String    @id @default(cuid())
  googleId    String    @unique
  email       String    @unique
  displayName String
  avatarUrl   String?
  createdAt   DateTime  @default(now())
  messages    Message[]
  dmsSent     DirectMessage[] @relation("sender")
  dmsReceived DirectMessage[] @relation("receiver")
}

model Channel {
  id          String    @id @default(cuid())
  name        String
  description String?
  order       Int       @default(0)
  messages    Message[]
}

model Message {
  id          String    @id @default(cuid())
  content     String?
  authorId    String
  channelId   String
  attachments Attachment[]
  createdAt   DateTime  @default(now())
  author      User      @relation(fields: [authorId], references: [id])
  channel     Channel   @relation(fields: [channelId], references: [id])
}

model DirectMessage {
  id         String   @id @default(cuid())
  content    String?
  senderId   String
  receiverId String
  attachments Attachment[]
  createdAt  DateTime @default(now())
  sender     User     @relation("sender", fields: [senderId], references: [id])
  receiver   User     @relation("receiver", fields: [receiverId], references: [id])
}

model Attachment {
  id        String  @id @default(cuid())
  url       String
  type      String  // image | video | file
  fileName  String
  fileSize  Int
  mimeType  String
  messageId String?
  dmId      String?
}
```

---

## Segurança Aplicada (DevSecOps + Building Secure Systems)

| Caminho de ataque | Contramedida |
|---|---|
| Acesso não autenticado | JWT em todas as rotas + middleware de verificação |
| Tokens vazados | JWT de curta duração (1h) + refresh token em httpOnly cookie |
| Upload malicioso | Validação de MIME type real (magic bytes), limite de tamanho, antivírus ClamAV opcional |
| XSS em mensagens | Sanitização de HTML no servidor antes de salvar |
| CSRF | Tokens CSRF + SameSite cookies |
| Enumeração de usuários | Respostas genéricas nos erros de auth |
| DDoS / abuso | Rate limiting por IP e por usuário (fastify-rate-limit) |
| Dados em trânsito | HTTPS obrigatório via Cloudflare Tunnel |
| Dados em repouso | Backups automáticos do PostgreSQL e MinIO |
| Secrets expostos | `.env` nunca commitado, `.env.example` no repo |
| Logs de auditoria | Pino logger com eventos de login, upload, screen share |

---

## Plano de Sprints (Engenharia de Software Moderna — desenvolvimento ágil)

### Sprint 1 — Fundação (3–4 dias)
- [ ] Setup monorepo (Turborepo + pnpm workspaces)
- [ ] Docker Compose: Postgres, Redis, MinIO, Nginx
- [ ] Cloudflare Tunnel configurado
- [ ] Autenticação Google OAuth2 (login + callback)
- [ ] Tela de configuração de perfil (nome + foto)
- [ ] JWT + refresh tokens

### Sprint 2 — Canais de Texto (3–4 dias)
- [ ] CRUD de canais (admin cria/edita)
- [ ] Chat em tempo real via Socket.io (rooms por canal)
- [ ] Histórico de mensagens (paginação infinita)
- [ ] Presença de usuários (online/offline/ausente)

### Sprint 3 — Mensagens Privadas (2–3 dias)
- [ ] Lista de usuários para iniciar DM
- [ ] Chat privado bilateral via Socket.io
- [ ] Notificações de novas mensagens (badge)

### Sprint 4 — Mídia (3–4 dias)
- [ ] Upload de imagens (preview inline)
- [ ] Upload de vídeos (player inline + thumbnail)
- [ ] Upload de arquivos genéricos (ícone + download)
- [ ] Limite de tamanho e validação de tipo

### Sprint 5 — Screen Share (4–5 dias)
- [ ] mediasoup SFU no servidor
- [ ] Captura de tela com `getDisplayMedia()`
- [ ] Múltiplos transmissores simultâneos
- [ ] Grade de streams no frontend

### Sprint 6 — Polimento e Segurança (3–4 dias)
- [ ] Testes de integração (Vitest + Supertest)
- [ ] Hardening: rate limit, sanitização, headers de segurança
- [ ] Backup automático do banco + MinIO
- [ ] Documentação de deploy

---

## Questões Abertas Resolvidas

| Questão | Decisão |
|---|---|
| Sem domínio | Cloudflare Tunnel gratuito |
| Auth | Google OAuth2 + perfil customizável |
| Servidor | Linux + Docker Compose |
| Screen share | Múltiplos simultâneos via mediasoup SFU |

> **Nota:** Quando o servidor ganhar um domínio próprio, basta: (1) apontar DNS para o IP do servidor, (2) trocar Cloudflare Tunnel por Nginx + Certbot (Let's Encrypt). Nenhuma mudança no código da aplicação.
