-- ═══════════════════════════════════════════════════════════
--  FINCLIENT PRO — SUPABASE DATABASE SETUP
--  Copy and paste this ENTIRE script into Supabase SQL Editor
--  supabase.com → Your Project → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════

-- 1. PROFILES TABLE (users & roles)
create table if not exists profiles (
  id uuid references auth.users primary key,
  name text,
  email text,
  role text default 'employee',
  created_at timestamptz default now()
);

-- 2. CLIENTS TABLE (full client details)
create table if not exists clients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  father_name text,
  mother_name text,
  dob date,
  client_type text default 'individual',
  status text default 'active',
  email text,
  phone text,
  phone2 text,
  address text,
  city text,
  state text,
  pin_code text,
  country text default 'India',
  aadhaar_no text,
  pan_no text,
  balance numeric default 0,
  bank_name text,
  account_no text,
  notes text,
  photo_url text,
  assigned_to uuid references profiles(id),
  owner_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- 3. PAYMENTS TABLE
create table if not exists payments (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade,
  amount numeric not null,
  type text default 'credit',  -- 'credit' = received, 'debit' = paid
  description text,
  date date default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- 4. INVOICES TABLE
create table if not exists invoices (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade,
  description text,
  amount numeric not null,
  status text default 'pending',  -- pending, paid, overdue
  due_date date,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS) — Protects your data
-- ═══════════════════════════════════════════════════════════

alter table profiles enable row level security;
alter table clients enable row level security;
alter table payments enable row level security;
alter table invoices enable row level security;

-- PROFILES policies
create policy "profiles_read_all" on profiles for select using (true);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- CLIENTS policies
create policy "clients_select" on clients for select using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  or assigned_to = auth.uid()
);
create policy "clients_insert" on clients for insert with check (auth.uid() is not null);
create policy "clients_update" on clients for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  or assigned_to = auth.uid()
);
create policy "clients_delete" on clients for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  or assigned_to = auth.uid()
);

-- PAYMENTS policies
create policy "payments_select" on payments for select using (
  exists (
    select 1 from clients c
    where c.id = payments.client_id
    and (
      exists (select 1 from profiles where id = auth.uid() and role = 'admin')
      or c.assigned_to = auth.uid()
    )
  )
);
create policy "payments_insert" on payments for insert with check (auth.uid() is not null);
create policy "payments_delete" on payments for delete using (created_by = auth.uid());

-- INVOICES policies
create policy "invoices_select" on invoices for select using (
  exists (
    select 1 from clients c
    where c.id = invoices.client_id
    and (
      exists (select 1 from profiles where id = auth.uid() and role = 'admin')
      or c.assigned_to = auth.uid()
    )
  )
);
create policy "invoices_insert" on invoices for insert with check (auth.uid() is not null);
create policy "invoices_update" on invoices for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  or created_by = auth.uid()
);

-- ═══════════════════════════════════════════════════════════
--  STORAGE BUCKET for photos/documents
--  Go to: Storage → New Bucket → Name: client-photos → Public: YES
-- ═══════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('client-photos', 'client-photos', true)
on conflict do nothing;

create policy "photos_upload" on storage.objects for insert
with check (bucket_id = 'client-photos' and auth.uid() is not null);

create policy "photos_read" on storage.objects for select
using (bucket_id = 'client-photos');

create policy "photos_delete" on storage.objects for delete
using (bucket_id = 'client-photos' and auth.uid() is not null);

-- ═══════════════════════════════════════════════════════════
--  DONE! Your database is ready.
--  Now add your Supabase URL and Key to app.js
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
--  NEW COLUMNS UPDATE — Run this in SQL Editor
-- ═══════════════════════════════════════════════════════════

ALTER TABLE clients ADD COLUMN IF NOT EXISTS husband_wife_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS marital_status TEXT DEFAULT 'unmarried';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address2 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS interest_amount NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS loan_amount NUMERIC DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS finance_company TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS aadhaar_photo TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pan_photo TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_approved_by UUID REFERENCES profiles(id);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS login_password TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;

-- GPS columns
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gps_lat NUMERIC;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gps_lng NUMERIC;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gps_captured_at TIMESTAMPTZ;

-- Center & Loan Cycle columns
ALTER TABLE clients ADD COLUMN IF NOT EXISTS center_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS center_code TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS center_leader TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS meeting_day TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS loan_cycle TEXT DEFAULT '1st';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS loan_purpose TEXT;

-- New fields from passbook format
ALTER TABLE clients ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS member_no TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS guarantor_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS membership_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS loan_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_emi_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS card_issue_date DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS emi_amount NUMERIC DEFAULT 0;
