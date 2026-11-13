-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

create table if not exists public.seo_documents (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  primary_keyphrase text,
  source_text text,
  optimized_markdown text,
  google_score integer,
  bing_score integer,
  harmony_score integer,
  fact_lock_score integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.seo_documents enable row level security;

-- Allow public read, insert & delete (can be customized for authenticated users)
create policy "Allow public read seo_documents"
  on public.seo_documents for select
  using (true);

create policy "Allow public insert seo_documents"
  on public.seo_documents for insert
  with check (true);

create policy "Allow public delete seo_documents"
  on public.seo_documents for delete
  using (true);
