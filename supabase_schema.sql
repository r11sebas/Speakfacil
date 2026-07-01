-- MokiTalk — Schema inicial
-- Corre esto en Supabase Dashboard → SQL Editor → New query

-- 1. Perfiles de usuario
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre      TEXT NOT NULL,
  nivel       TEXT DEFAULT 'intermedio',   -- basico | intermedio | avanzado
  intereses   TEXT DEFAULT '',
  meta        TEXT DEFAULT '',
  motivacion  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Rachas diarias
CREATE TABLE IF NOT EXISTS streaks (
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  count       INTEGER DEFAULT 1,
  last_date   DATE DEFAULT CURRENT_DATE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Progreso de episodios
CREATE TABLE IF NOT EXISTS progress (
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  serie_id      TEXT NOT NULL,
  ep_num        INTEGER NOT NULL,
  completed_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, serie_id, ep_num)
);

-- 4. Uso diario (para freemium)
CREATE TABLE IF NOT EXISTS daily_usage (
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  episodes_opened  INTEGER DEFAULT 0,
  messages_sent    INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- 5. Suscripciones (para Wompi — Fase 3)
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  plan                  TEXT DEFAULT 'free',   -- free | premium
  valid_until           TIMESTAMPTZ,
  wompi_subscription_id TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security: cada usuario solo ve sus propios datos
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress     ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profile"      ON profiles      FOR ALL USING (auth.uid() = id);
CREATE POLICY "own_streaks"      ON streaks       FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_progress"     ON progress      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_daily_usage"  ON daily_usage   FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_subscription" ON subscriptions FOR ALL USING (auth.uid() = user_id);
