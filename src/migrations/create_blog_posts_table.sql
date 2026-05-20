-- Supabase / PostgreSQL table for blog posts used by the Workers backend

create table if not exists blog_posts (
  slug text primary key,
  title text not null,
  summary text not null,
  date text not null,
  author text not null,
  reading_time text not null,
  tags text[] not null default '{}',
  sections jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_blog_posts_date on blog_posts (date desc);
