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

    const { request_id, rejection_reason } = await req.json();

    if (!request_id) {
       return new Response(JSON.stringify({ error: "Missing request_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!rejection_reason) {
       return new Response(JSON.stringify({ error: "Missing rejection_reason" }), {
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

    if (requestRecord.approved_at || requestRecord.rejected_at) {
       return new Response(JSON.stringify({ error: "Game request is already processed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Mark request as rejected
    const { error: updateError } = await supabase
      .from('game_requests')
      .update({ 
        rejected_at: new Date().toISOString(),
        rejection_reason: rejection_reason
      })
      .eq('id', request_id);

    if (updateError) {
      throw new Error(`Failed to reject game request: ${updateError.message}`);
    }

    // 3. Send email notification to developer
    if (requestRecord.developer_email) {
      const emailHtml = `
        <h2>Sua solicitação sofreu uma recusa ⚠️</h2>
        <p>A solicitação de publicação do jogo <strong>${requestRecord.game_name}</strong> (versão ${requestRecord.version}) não pôde ser aprovada neste momento.</p>
        <br/>
        <h3>Motivo:</h3>
        <blockquote>${rejection_reason}</blockquote>
        <br/>
        <p>Por favor, corrija os apontamentos e envie uma nova solicitação.</p>
        <br/>
        <p>Atenciosamente,</p>
        <p>Equipe Brick Engine</p>
      `;
      await resendEmail(requestRecord.developer_email, `[Brick Engine] ⚠️ Jogo Recusado: ${requestRecord.game_name}`, emailHtml);
    }

    return new Response(
      JSON.stringify({ 
        message: `Game request ${request_id} rejected successfully.`
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
