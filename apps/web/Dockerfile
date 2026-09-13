FROM node:20-alpine as build

WORKDIR /app

COPY package.json pnpm-lock.yaml .
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY pnpm-workspace.yaml ./
COPY turbo.json ./

RUN corepack enable && corepack prepare pnpm@8.9.0 --activate && pnpm install --frozen-lockfile

COPY . .

WORKDIR /app
RUN pnpm --filter @discord-clone/shared build
WORKDIR /app/apps/web
ARG VITE_API_URL=https://levicord.uk
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
