// MokiTalk Backend — Cloudflare Worker
// Secrets: CLAUDE_KEY, ELEVEN_KEY  |  Var: ELEVEN_VOICE

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    let body;
    try { body = await request.json(); }
    catch { return jsonError('Invalid JSON body', 400); }

    try {
      if (body.tipo === 'tts') return await handleTTS(body, env);
      return await handleClaude(body, env);
    } catch (e) {
      return jsonError(e.message || 'Internal error', 500);
    }
  },
};

// ─── AUDIO GENERATION ────────────────────────────────────────────────────────

async function generateAudio(text, env) {
  const voiceId = env.ELEVEN_VOICE || 'NGuczaxV7CJACyG07XxA';
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': env.ELEVEN_KEY },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    let msg = 'ElevenLabs ' + res.status;
    try { const j = JSON.parse(err); msg += ': ' + (j.detail?.message || j.detail || err); }
    catch { msg += ': ' + err.slice(0, 200); }
    throw new Error(msg);
  }

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Chunked apply avoids O(n²) string concat — critical for long episode audio (1-3 MB)
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ─── TTS ENDPOINT (direct, still used for translator playback) ───────────────

async function handleTTS(body, env) {
  const text = (body.texto || '').trim();
  if (!text) return jsonError('Empty text', 400);
  try {
    const audio = await generateAudio(text, env);
    return jsonOk({ audio });
  } catch (e) {
    return jsonError(e.message, 502);
  }
}

// ─── CLAUDE + TTS COMBINED ───────────────────────────────────────────────────

async function handleClaude(body, env) {
  const { tipo, perfil = {}, historial = [], tema = '', situacion = '', modo = '', texto = '', deLang = 'es', aLang = 'en' } = body;

  const systemPrompt = buildSystemPrompt(tipo, { perfil, tema, situacion, modo, deLang, aLang });

  let messages;
  const SINGLE_SHOT = ['intro', 'primer_mensaje', 'traduccion'];
  if (SINGLE_SHOT.includes(tipo)) {
    const trigger =
      tipo === 'traduccion' ? texto :
      tipo === 'intro'      ? `Genera la introducción para: ${tema}` :
                              'Empieza la sesión';
    messages = [{ role: 'user', content: trigger }];
  } else {
    messages = historial.length > 0 ? historial : [{ role: 'user', content: 'Hola' }];
  }

  const maxTokens =
    tipo === 'intro'          ? 200  :
    tipo === 'primer_mensaje' ? 500  :
    tipo === 'traduccion'     ? 300  :
    tipo === 'gramatica'      ? 900  :
    tipo === 'onboarding'     ? 700  :
                                650;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system: systemPrompt, messages }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Claude error: ' + err);
  }

  const data = await res.json();
  const resultado = data.content[0].text;

  // Generate TTS alongside text in one round-trip (fixes iOS autoplay window)
  const ttsLang = getTTSLang(tipo, modo);
  let audio = null;
  let audioError = null;
  if (ttsLang) {
    let ttsText = resultado;
    if (tipo === 'onboarding') {
      const mIdx = resultado.indexOf('ONBOARDING_COMPLETO:');
      if (mIdx !== -1) ttsText = resultado.substring(0, mIdx).trim();
    }
    if (ttsText) {
      try { audio = await generateAudio(ttsText, env); }
      catch (e) { audioError = e.message; }
    }
  }

  return jsonOk({ resultado, audio, audioError });
}

function getTTSLang(tipo, modo) {
  if (tipo === 'traduccion' || tipo === 'intro') return null;
  if (tipo === 'onboarding' || tipo === 'gramatica') return 'es';
  if (tipo === 'primer_mensaje' && modo === 'gramatica_inicio') return 'es';
  return 'en';
}

// ─── SYSTEM PROMPTS ──────────────────────────────────────────────────────────

function buildSystemPrompt(tipo, ctx) {
  const { perfil, tema, situacion, modo, deLang, aLang } = ctx;
  const nivel = perfil.confianza || 'intermedio';
  const intereses = perfil.intereses || '';
  const meta = perfil.meta || '';

  switch (tipo) {
    case 'onboarding':
      return `Eres Moki, un simpático mono virtual que ayuda a colombianos a aprender inglés sin presión ni juicios.
Tu misión: hacer el onboarding conociendo al usuario de forma natural y amigable.
Habla principalmente en español (mezcla algo de inglés para ambientarlo).
Sé cálido, curioso, divertido — nunca formal ni robótico.

Descubre conversacionalmente:
1. Sus intereses y hobbies
2. Su nivel de confianza actual en inglés
3. Por qué quiere aprender inglés ahora
4. Qué meta específica tiene (trabajo, viajes, estudios, etc.)

Después de 3-5 mensajes del usuario, cuando tengas suficiente info, cierra con una respuesta normal Y agrega EXACTAMENTE al final:
ONBOARDING_COMPLETO:{"motivacion":"...","confianza":"basico|intermedio|avanzado","intereses":"tema1, tema2, tema3","meta":"..."}

No repitas preguntas. Sé espontáneo y genuino.`;

    case 'intro':
      return `Eres Moki, tutor de inglés entusiasta.
Genera una introducción corta (2-3 oraciones) y emocionante para una sesión de práctica sobre: "${tema}".
Habla en español. Sé específico y motivador. Sin listas, solo texto fluido.`;

    case 'primer_mensaje':
      if (modo === 'situacion_inicio') {
        if (situacion.length > 200) return situacion;
        return `${situacion}\n\nEmpieza la escena naturalmente en 1-2 oraciones. Quédate en el personaje. Solo inglés.`;
      }
      if (modo === 'gramatica_inicio') {
        return `Eres Moki iniciando una sesión de gramática inglesa.
Saluda brevemente en español y pregunta qué aspecto del inglés le gustaría practicar hoy.
Amigable, sin presión. Máximo 2-3 oraciones.`;
      }
      return `You are Moki, a fun and encouraging English tutor.
Start a conversation about: "${tema}"
User level: ${nivel}. Their interests: ${intereses}.
Open with ONE warm, engaging question about ${tema} that fits their ${nivel} level.
Keep it SHORT (1-2 sentences max). Make them want to talk!`;

    case 'leccion':
      return `You are Moki, a friendly English conversation tutor for a Colombian learner.
Topic: ${tema} | Level: ${nivel} | Interests: ${intereses} | Goal: ${meta}

Rules:
- SHORT responses (2-4 sentences max)
- Speak in English; use Spanish only to clarify something complex
- Correct grammar naturally: "By the way, we say X instead of Y :)"
- Always end with a follow-up question
- Be encouraging and fun
- Match vocabulary complexity to ${nivel} level`;

    case 'situacion':
      return `You are roleplaying this situation: ${situacion}

Rules:
- Stay fully in character — you ARE that person
- English only (your character doesn't speak Spanish)
- If the user writes in Spanish, say "Sorry, I don't understand Spanish" and continue in English
- SHORT natural responses (2-3 sentences)
- React realistically, make it feel like a real interaction`;

    case 'gramatica':
      return `Eres Moki explicando gramática inglesa de forma amigable.
Habla en español para las explicaciones.
Usa ejemplos concretos y simples, preferiblemente de lo que el usuario acaba de practicar.
Sé conciso: máximo 4-5 oraciones + 2 ejemplos.
Termina con una frase de ánimo.
Nunca uses términos gramaticales complejos sin explicarlos.`;

    case 'traduccion':
      if (deLang === 'es') {
        return `You are an expert translator specializing in Colombian Spanish to American English.
Translate naturally and colloquially — how a native American English speaker would actually say it.
NEVER translate word-for-word.

Examples:
- "Qué pena con usted" → "I'm so sorry to bother you"
- "Estar mamado" → "To be wiped out / exhausted"
- "¿Qué más?" → "What's up?"
- "Parce" → "Buddy / bro"
- "Hacer conejo" → "To ditch / skip out on"

Respond ONLY with valid JSON (no backticks):
{"traduccion":"the natural American English translation","nota":"one-line note, or empty string"}`;
      }
      return `Eres un experto en traducción de inglés americano al español colombiano coloquial.
Traduce de forma natural, como lo diría un colombiano en conversación casual.
NUNCA traduzcas palabra por palabra.

Ejemplos:
- "What's up?" → "¿Qué más?" o "¿Quiubo?"
- "I'm beat" → "Estoy muerto / reventado"
- "It's a long shot" → "Es muy difícil que funcione"
- "Ghosting" → "Dejar en visto / desaparecer"

Responde SOLO con JSON válido (sin backticks):
{"traduccion":"la traducción natural en español colombiano","nota":"nota de una línea, o cadena vacía"}`;

    default:
      return `You are Moki, a friendly English tutor. Help the user practice English. Keep responses short and encouraging.`;
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function jsonOk(data) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function jsonError(msg, status = 500) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
