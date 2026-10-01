/**
 * OpenAPI 3.0 specification definition for Levicord REST API & WebSocket Events.
 * (Don't Make Me Think — Self-documenting API & Developer Experience)
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Levicord API',
    version: '1.0.0',
    description: 'REST API e especificações de WebSocket para a plataforma Levicord.',
  },
  servers: [
    { url: '/api/v1', description: 'API v1 (Recomendado)' },
    { url: '/api', description: 'Legacy API alias' },
  ],
  paths: {
    '/auth/session': {
      get: {
        summary: 'Obter dados da sessão atual',
        description: 'Retorna os dados do utilizador autenticado a partir dos cookies httpOnly de sessão.',
        responses: {
          '200': {
            description: 'Sessão válida',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    authenticated: { type: 'boolean', example: true },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        displayName: { type: 'string' },
                        email: { type: 'string' },
                        avatarUrl: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Renovar access token',
        description: 'Usa o refreshToken (cookie httpOnly) com rotação e verificação de blocklist no Redis.',
        responses: {
          '200': { description: 'Token renovado' },
          '401': { description: 'Refresh token inválido ou revogado' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Encerrar sessão',
        description: 'Revoga o refresh token no Redis e limpa os cookies accessToken e refreshToken.',
        responses: {
          '200': { description: 'Sessão encerrada com sucesso' },
        },
      },
    },
    '/channels': {
      get: {
        summary: 'Listar canais',
        description: 'Retorna todos os canais de texto e voz acessíveis pelo utilizador.',
        responses: {
          '200': { description: 'Lista de canais' },
          '401': { description: 'Não autorizado' },
        },
      },
      post: {
        summary: 'Criar canal',
        description: 'Cria um novo canal de texto ou voz.',
        responses: {
          '201': { description: 'Canal criado' },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Não autorizado' },
        },
      },
    },
    '/channels/{id}/messages': {
      get: {
        summary: 'Listar mensagens do canal com cursor',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: {
          '200': { description: 'Mensagens paginadas' },
          '401': { description: 'Não autorizado' },
        },
      },
    },
    '/users': {
      get: {
        summary: 'Listar utilizadores',
        responses: {
          '200': { description: 'Lista de utilizadores' },
          '401': { description: 'Não autorizado' },
        },
      },
    },
    '/upload': {
      post: {
        summary: 'Upload de arquivo / anexo',
        description: 'Faz upload de imagem, vídeo ou documento para o MinIO com validação de tipo e tamanho.',
        responses: {
          '200': { description: 'Metadados do anexo criado' },
          '400': { description: 'Arquivo inválido ou excede o tamanho máximo' },
          '401': { description: 'Não autorizado' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'accessToken',
      },
    },
  },
  'x-socketio-events': {
    client_to_server: [
      { event: 'send_message', payload: { channelId: 'string', content: 'string?', attachments: 'array?' } },
      { event: 'send_dm', payload: { receiverId: 'string', content: 'string?', attachments: 'array?' } },
      { event: 'typing_start', payload: { channelId: 'string' } },
      { event: 'typing_stop', payload: { channelId: 'string' } },
    ],
    server_to_client: [
      { event: 'new_message', payload: 'Message object' },
      { event: 'new_dm', payload: 'DirectMessage object (AES-256 decrypted in transit)' },
      { event: 'user_status', payload: { userId: 'string', status: 'online | offline' } },
      { event: 'user_typing', payload: { channelId: 'string', userId: 'string' } },
    ],
  },
};
