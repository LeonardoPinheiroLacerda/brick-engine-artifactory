// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization');
    
    // Readonly public listing, anon key is fine
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader ?? "" } } }
    );

    let query = supabase.from('games').select('*');

    // Return latest versions only 
    query = query.order('created_at', { ascending: false });

    const { data: gamesData, error } = await query;

    if (error) {
       throw new Error(`Failed to fetch games: ${error.message}`);
    }

    // Filter the array to return only the latest version of each unique game_id
    let finalGamesList: { id: string; name: string; url: string }[] = [];
    if (gamesData) {
       const latestVersionsMap = new Map<string, { id: string; name: string; url: string }>();
       for (const game of gamesData) {
         if (!latestVersionsMap.has(game.game_id)) {
            // Since it's ordered by created_at desc, the first time we see a game_id, it's the latest
            latestVersionsMap.set(game.game_id, {
              id: game.game_id,
              name: game.name,
              url: game.bundle_url
            });
         }
       }
       finalGamesList = Array.from(latestVersionsMap.values());
    }

    return new Response(
      JSON.stringify({ 
        games: finalGamesList 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
