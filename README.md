# Levicord

Um aplicativo de comunicação em tempo real inspirado no Discord, projetado para equipes pequenas (até 20 usuários) e totalmente auto-hospedado. O Levicord suporta canais de texto organizados, mensagens privadas (DMs), upload de mídias e compartilhamento de tela com múltiplos usuários.

---

## 📚 Fundamentação Teórica e Arquitetural

Este projeto foi desenhado e implementado seguindo estritamente as diretrizes da bibliografia base fornecida:

### 1. Engenharia de Software Moderna (Marco Tulio Valente)
*   **Arquitetura Limpa e Baixo Acoplamento:** Utilização de um **Monorepo** (Turborepo) separando claramente o Frontend (React) do Backend (Fastify), com um pacote de tipagens compartilhado (`packages/shared`).
*   **Clean Code e Tipagem Forte:** Uso massivo de TypeScript em todas as camadas para garantir contratos claros e evitar erros em tempo de execução.
*   **Desenvolvimento Ágil:** O projeto é construído em ciclos iterativos (Sprints), focando em entregar valor funcional e testável a cada etapa.

### 2. Building Secure & Reliable Systems (Google O'Reilly)
*   **Defense in Depth (Defesa em Profundidade):** Não dependemos de uma única camada de segurança. Usamos validações no Frontend, validações rigorosas no Backend (via Zod e Prisma), e controle de acesso estrito.
*   **Confiabilidade Operacional:** A infraestrutura é conteinerizada (Docker Compose) garantindo que o ambiente de desenvolvimento seja idêntico ao de produção. Ferramentas como Redis gerenciam estados voláteis (presença) para não sobrecarregar o banco principal (PostgreSQL).
*   **Tráfego Seguro:** Uso do Cloudflare Tunnel (ou Nginx no futuro) para forçar HTTPS e criptografar os dados em trânsito.

### 3. DevSecOps (Glenn Wilson)
*   **Secure by Design:** A segurança não é uma reflexão tardia. A autenticação baseia-se no padrão da indústria (Google OAuth2) atrelado a tokens JWT de curta duração com Refresh Tokens.
*   **Pipeline e Automação Prevista:** O setup do projeto suporta verificações estáticas (Oxlint, TypeScript) antes do deploy.

### 4. Don't Make Me Think (Steve Krug)
*   **Usabilidade:** Foco na simplicidade da interface do usuário (UI). Fluxos de configuração de perfil e navegação baseiam-se em padrões já familiares aos usuários de aplicativos de comunicação.

---

## 🛠️ Stack Tecnológica

### Frontend
*   **React 19 + Vite** (Alta performance e Hot Module Replacement)
*   **TypeScript** (Tipagem estática)
*   **Zustand** (Gerenciamento de estado global)
*   **React Router Dom** (Roteamento da SPA)

### Backend
*   **Node.js 20+**
*   **Fastify** (Web framework rápido e seguro)
*   **Prisma ORM** (Acesso seguro ao banco PostgreSQL)
*   **Socket.io** (WebSockets para chat em tempo real)
*   **@fastify/oauth2 & @fastify/jwt** (Autenticação)

### Infraestrutura & Dados
*   **PostgreSQL** (Banco de Dados Relacional principal)
*   **Redis** (Pub/Sub e cache de sessão)
*   **MinIO** (Object Storage local para imagens e vídeos)
*   **Mediasoup** (Servidor SFU para WebRTC / Screen Share)
*   **Docker & Docker Compose**

---

## 🚀 Como Rodar o Projeto (Desenvolvimento Local)

### Pré-requisitos
*   Node.js (v20+)
*   pnpm (v8+)
*   Docker & Docker Compose
*   Conta no Google Cloud (para obter as credenciais OAuth2)

### 1. Clonar o Repositório
```bash
git clone https://github.com/Iustu/Levicord.git
cd Levicord
```

### 2. Instalar as Dependências
Na raiz do monorepo, instale todas as dependências:
```bash
pnpm install
```

### 3. Configurar Variáveis de Ambiente
No diretório `apps/server`, crie o arquivo `.env` baseado nas credenciais necessárias:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/discord?schema=public"
GOOGLE_CLIENT_ID="seu_client_id_aqui"
GOOGLE_CLIENT_SECRET="seu_client_secret_aqui"
JWT_SECRET="um_segredo_muito_forte_aqui"
FRONTEND_URL="http://localhost:5173"
ADMIN_EMAILS="admin@example.com"
```

### 4. Subir a Infraestrutura (Docker)
Inicie o PostgreSQL, Redis e MinIO:
```bash
docker-compose up -d
```

### 5. Configurar o Banco de Dados
Gere os clientes do Prisma e sincronize o banco de dados:
```bash
cd apps/server
npx prisma db push
npx prisma generate
```

### 6. Iniciar a Aplicação
Volte para a raiz do projeto e inicie os servidores de frontend e backend paralelamente:
```bash
cd ../../
pnpm run dev
```

*   **Frontend:** `http://localhost:5173`
*   **Backend:** `http://localhost:3000`
