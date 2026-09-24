create table if not exists public.article_documents (
  slug text primary key check (slug <> '' and char_length(slug) <= 120),
  content_html text not null default '',
  notes jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.article_documents enable row level security;
revoke all on table public.article_documents from anon, authenticated;
revoke all on table public.article_documents from public;
