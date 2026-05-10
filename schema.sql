-- SaaS Schema for DB Diff Fixer

-- 1. Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role INT DEFAULT 1, -- 1: Individual/Member, 2: Team Lead, 5: Superadmin
  subscription_tier TEXT DEFAULT 'free', -- 'free', 'individual', 'team'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Teams table
CREATE TABLE public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- 3. Team Members
CREATE TABLE public.team_members (
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role INT DEFAULT 1, -- 1: Member, 2: Lead
  PRIMARY KEY (team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 4. Targets (Stored DB Connections)
CREATE TABLE public.targets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  db_type TEXT NOT NULL DEFAULT 'postgres', -- 'postgres', 'mysql'
  host TEXT NOT NULL,
  port INT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL, -- Encrypted or plain for now as per plan
  database_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles: Users can read all (for team lookup), but update only their own
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Teams: Only members can view
CREATE POLICY "Teams are viewable by members" ON public.teams 
  FOR SELECT USING (
    auth.uid() = owner_id OR 
    EXISTS (SELECT 1 FROM public.team_members WHERE team_id = teams.id AND user_id = auth.uid())
  );

-- Targets: Only owner or team members can view
CREATE POLICY "Targets viewable by owner" ON public.targets 
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Targets viewable by team" ON public.targets 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.team_members WHERE team_id = targets.team_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can create targets" ON public.targets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own targets" ON public.targets FOR UPDATE USING (auth.uid() = user_id);

-- Triggers for Auth
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
