-- ====================================================================
-- SCRIPT DE CRIAÇÃO DA TABELA HISTORICO_SEGUIDORES NO SUPABASE
-- Execute este script no SQL Editor do painel do seu projeto Supabase:
-- https://supabase.com/dashboard/project/_/sql
-- ====================================================================

-- 1. Criação da Tabela Historico_Seguidores (Passo 1)
CREATE TABLE IF NOT EXISTS public.historico_seguidores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_handle TEXT NOT NULL,                  -- Ex: @seu_concorrente ou @sua_pagina
    profile_name TEXT,                             -- Nome legível do perfil
    date DATE NOT NULL,                            -- Data da foto diária (YYYY-MM-DD)
    followers_count BIGINT NOT NULL DEFAULT 0,     -- Total de seguidores no dia
    type TEXT NOT NULL DEFAULT 'Minha Página' CHECK (type IN ('Minha Página', 'Concorrente')),
    page_id TEXT,                                  -- Identificador interno / ID da Meta
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- Data/hora do registro
    
    -- Garante que haja apenas uma foto por perfil por dia (evita duplicações)
    CONSTRAINT unique_profile_date UNIQUE (profile_handle, date)
);

-- 2. Tabela de Páginas Monitoradas (Opcional para sincronizar catálogo de páginas)
CREATE TABLE IF NOT EXISTS public.paginas_monitoradas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    handle TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'instagram',
    is_competitor BOOLEAN NOT NULL DEFAULT false,
    followers_count BIGINT NOT NULL DEFAULT 0,
    posts_count INT DEFAULT 0,
    avatar_url TEXT,
    biography TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_page_platform_handle UNIQUE (platform, handle)
);

-- 3. Índices para buscas ultra-rápidas no cálculo do Passo 4 (Data Inicial e Data Final)
CREATE INDEX IF NOT EXISTS idx_historico_seguidores_handle 
    ON public.historico_seguidores (profile_handle);

CREATE INDEX IF NOT EXISTS idx_historico_seguidores_date 
    ON public.historico_seguidores (date);

CREATE INDEX IF NOT EXISTS idx_historico_seguidores_handle_date 
    ON public.historico_seguidores (profile_handle, date);

-- 4. Configuração de Políticas de Segurança (Row Level Security - RLS)
-- Permite leitura e escrita seguras pela chave pública Anon Key
ALTER TABLE public.historico_seguidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paginas_monitoradas ENABLE ROW LEVEL SECURITY;

-- Política de Acesso para Historico_Seguidores
DROP POLICY IF EXISTS "Acesso Total Historico Seguidores" ON public.historico_seguidores;
CREATE POLICY "Acesso Total Historico Seguidores" 
    ON public.historico_seguidores 
    FOR ALL 
    TO public 
    USING (true) 
    WITH CHECK (true);

-- Política de Acesso para Páginas Monitoradas
DROP POLICY IF EXISTS "Acesso Total Paginas Monitoradas" ON public.paginas_monitoradas;
CREATE POLICY "Acesso Total Paginas Monitoradas" 
    ON public.paginas_monitoradas 
    FOR ALL 
    TO public 
    USING (true) 
    WITH CHECK (true);

-- Notificação de sucesso
COMMENT ON TABLE public.historico_seguidores IS 'Tabela de fotos diárias de seguidores integrada ao Anti Gravity Studio';
