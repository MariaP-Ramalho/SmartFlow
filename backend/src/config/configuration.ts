export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),

  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/resolve-to-close',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default-dev-secret',
  },

  clickup: {
    apiKey: process.env.CLICKUP_API_KEY,
    teamId: process.env.CLICKUP_TEAM_ID,
    listId: process.env.CLICKUP_LIST_ID,
  },

  llm: {
    defaultProvider: process.env.DEFAULT_LLM_PROVIDER || 'openai',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    chatModel: process.env.CHAT_MODEL || 'gpt-4o',

    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },

    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
    },

    azure: {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    },
  },
});
