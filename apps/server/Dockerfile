FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml .
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY pnpm-workspace.yaml ./
COPY turbo.json ./

RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl \
	&& rm -rf /var/lib/apt/lists/* \
	&& corepack enable \
	&& corepack prepare pnpm@8.9.0 --activate \
	&& pnpm install --frozen-lockfile

COPY . .

WORKDIR /app
RUN pnpm --filter @discord-clone/shared build
WORKDIR /app/apps/server
RUN pnpm build && pnpm exec prisma generate

EXPOSE 3000

CMD ["pnpm", "start"]
