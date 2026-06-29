# Deploy MokiTalk Backend a Cloudflare Workers

## Opción A — Cloudflare Dashboard (más fácil, sin instalar nada)

1. Ve a https://dash.cloudflare.com → Workers & Pages → Create → "Hello World" Worker
2. Nómbralo: `mokitalk-backend`
3. Pega el contenido de `src/index.js` en el editor online
4. Guarda y haz deploy
5. Ve a Settings → Variables and Secrets → agrega:
   - `CLAUDE_KEY`    → tu Anthropic API key (tipo: Secret)
   - `ELEVEN_KEY`    → tu ElevenLabs API key (tipo: Secret)
   - `ELEVEN_VOICE`  → `NGuczaxV7CJACyG07XxA` (tipo: Variable, no Secret)
6. Copia la URL del Worker (ej: `https://mokitalk-backend.r11sebas.workers.dev`)
7. Pégala en `index.html` donde dice `var BACKEND = '...'`

## Opción B — Wrangler CLI (desde la carpeta `worker/`)

```bash
# Instalar Wrangler
npm install

# Login a Cloudflare
npx wrangler login

# Agregar secrets
npx wrangler secret put CLAUDE_KEY
# (pega el key cuando te lo pida)

npx wrangler secret put ELEVEN_KEY
# (pega el key cuando te lo pida)

# Deploy
npm run deploy
```

La URL saldrá al final del deploy. Actualiza `var BACKEND` en `index.html` con esa URL.

## Keys que necesitas

| Variable     | Valor                                      | Dónde conseguirlo             |
|--------------|--------------------------------------------|-------------------------------|
| CLAUDE_KEY   | sk-ant-api03-...                           | console.anthropic.com         |
| ELEVEN_KEY   | sk_...                                     | elevenlabs.io → Profile → API |
| ELEVEN_VOICE | NGuczaxV7CJACyG07XxA                       | Ya está configurado           |
