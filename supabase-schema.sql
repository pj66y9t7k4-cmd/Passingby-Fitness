-- Run this in Supabase Dashboard > SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (users)
create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  telegram_id text unique not null,
  username text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Exercises (synced from Wger)
create table if not exists exercises (
  id uuid primary key default uuid_generate_v4(),
  wger_id integer unique not null,
  name text not null,
  description text,
  muscle_name text not null,
  equipment_name text not null,
  default_sets integer default 3,
  default_reps integer default 10,
  default_weight numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Workouts
create table if not exists workouts (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  date timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Workout exercises (junction)
create table if not exists workout_exercises (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid references workouts(id) on delete cascade not null,
  exercise_id uuid references exercises(id) not null,
  "order" integer not null,
  target_sets integer not null,
  target_reps integer not null,
  target_weight numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Exercise logs (per set)
create table if not exists exercise_logs (
  id uuid primary key default uuid_generate_v4(),
  workout_exercise_id uuid references workout_exercises(id) on delete cascade not null,
  set_number integer not null,
  reps_completed integer not null,
  weight_used numeric not null,
  completed boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Personal records
create table if not exists personal_records (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade not null,
  exercise_id uuid references exercises(id) not null,
  max_weight numeric not null,
  max_reps_at_weight integer not null,
  estimated_1rm numeric not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(profile_id, exercise_id)
);

-- Indexes
create index if not exists idx_workouts_profile on workouts(profile_id);
create index if not exists idx_workout_exercises_workout on workout_exercises(workout_id);
create index if not exists idx_exercise_logs_workout_exercise on exercise_logs(workout_exercise_id);
create index if not exists idx_personal_records_profile on personal_records(profile_id);
