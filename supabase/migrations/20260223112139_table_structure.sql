CREATE TABLE public.game_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    developer_email TEXT,
    game_id TEXT NOT NULL,
    game_name TEXT NOT NULL,
    version TEXT NOT NULL,
    bundle_url TEXT NOT NULL
);

CREATE TABLE public.games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    game_id TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    bundle_url TEXT NOT NULL
);

-- Set up the public storage bucket for game bundles
INSERT INTO storage.buckets (id, name, public)
VALUES ('game_bundles', 'game_bundles', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies: Allow anyone to read existing bundles
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'game_bundles');

-- Storage RLS Policies: Allow authenticated users to upload new bundles
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'game_bundles');
