// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resendEmail } from "../_shared/email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization');

    if(!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { request_id } = await req.json();

    if (!request_id) {
       return new Response(JSON.stringify({ error: "Missing request_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Check if the request exists and is pending
    const { data: requestRecord, error: fetchError } = await supabase
      .from('game_requests')
      .select('*')
      .eq('id', request_id)
      .single();
      
    if (fetchError || !requestRecord) {
      return new Response(JSON.stringify({ error: "Game request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (requestRecord.approved_at) {
       return new Response(JSON.stringify({ error: "Game request is already approved" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Insert into final 'games' table
    const { data: gameRecord, error: insertError } = await supabase
      .from('games')
      .insert([
        { 
          game_id: requestRecord.game_id, 
          name: requestRecord.game_name, 
          version: requestRecord.version,
          bundle_url: requestRecord.bundle_url 
        }
      ])
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to approve game: ${insertError.message}`);
    }

    // 3. Mark request as approved
    const { error: updateError } = await supabase
      .from('game_requests')
      .update({ approved_at: new Date().toISOString() })
      .eq('id', request_id);

    if (updateError) {
       console.error("Failed to mark request as approved, but game was inserted:", updateError);
    }

    // 4. Send email notification to developer
    if (requestRecord.developer_email) {
      const emailHtml = `
        <h2>Seu jogo foi aprovado! 🎉</h2>
        <p>A solicitação de publicação do jogo <strong>${requestRecord.game_name}</strong> (versão ${requestRecord.version}) foi aprovada.</p>
        <p>Ele já está disponível no catálogo público.</p>
        <br/>
        <p>Atenciosamente,</p>
        <p>Equipe Brick Engine</p>
      `;
      await resendEmail(requestRecord.developer_email, `[Brick Engine] 🎉 Jogo Aprovado: ${requestRecord.game_name}`, emailHtml);
    }

    return new Response(
      JSON.stringify({ 
        message: `Game request ${request_id} approved successfully!`,
        game: gameRecord 
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
