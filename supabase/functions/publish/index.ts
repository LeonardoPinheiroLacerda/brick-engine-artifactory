import { createClient } from "jsr:@supabase/supabase-js@2";
import { resendEmail } from "../_shared/email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization');
    
    // We only initialize the client using ANON key. We rely on RLS and Auth tokens for security.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader ?? "" } } }
    );

    // Ensure we are receiving a FormData (multipart/form-data) request
    const formData = await req.formData();
    
    const gameId = formData.get('game_id') as string;
    const gameName = formData.get('game_name') as string;
    const version = formData.get('version') as string;
    const bundleFile = formData.get('bundle') as File;
    const developerEmail = formData.get('developer_email') as string | null;

    if (!gameId || !gameName || !version || !bundleFile) {
      return new Response(JSON.stringify({ error: "Missing required fields (game_id, game_name, version, bundle)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (bundleFile.name !== 'game.bundle.js') {
      return new Response(JSON.stringify({ error: "The uploaded file must be named 'game.bundle.js'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Prepare storage path: {game_id}/{version}/game.bundle.js
    const filePath = `${gameId}/${version}/game.bundle.js`;

    // 1. Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('game_bundles')
      .upload(filePath, bundleFile, {
        contentType: 'application/javascript',
        upsert: true
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      
      if (uploadError.message.includes('row-level security') || uploadError.message.includes('rls')) {
        return new Response(JSON.stringify({ error: `Version ${version} of the game '${gameName}' already exists. Please update the version in your package.json before publishing.` }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      throw new Error(`Failed to upload bundle: ${uploadError.message}`);
    }

    // 2. Get Public URL
    const { data: publicUrlData } = supabase
      .storage
      .from('game_bundles')
      .getPublicUrl(filePath);

    const externalSupabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
    const bundleUrl = publicUrlData.publicUrl.replace("http://kong:8000", externalSupabaseUrl);

    // 3. Create Game Request entry
    const { data: requestRecord, error: dbError } = await supabase
      .from('game_requests')
      .insert([
        { 
          game_id: gameId, 
          game_name: gameName, 
          version: version,
          bundle_url: bundleUrl,
          developer_email: developerEmail
        }
      ])
      .select()
      .single();

    if (dbError) {
      console.error("DB Insert error:", dbError);
      // Attempt cleanup of storage file if DB insert fails
      await supabase.storage.from('game_bundles').remove([filePath]);

      if (dbError.code === '23505') {
        return new Response(JSON.stringify({ error: `Version ${version} of the game '${gameName}' has already been published or is under review. Please update the version in your package.json before trying again.` }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      throw new Error(`Failed to save game request: ${dbError.message}`);
    }



    // 4. Send email notification to admin
    const adminEmail = Deno.env.get("ADMIN_EMAIL");

    console.log(adminEmail)
    if (adminEmail) {
      const emailHtml = `
        <h2>Nova Solicitação de Jogo!</h2>
        <p><strong>Jogo:</strong> ${gameName} (ID: ${gameId})</p>
        <p><strong>Versão:</strong> ${version}</p>
        <p><strong>E-mail do Desenvolvedor:</strong> ${developerEmail || "Não informado"}</p>
        <p><strong>Request ID:</strong> ${requestRecord.id}</p>
        <p>Por favor, analise a requisição para aprovar ou reprovar a publicação.</p>
      `;
      await resendEmail(adminEmail, `[Brick Engine] Nova solicitação de jogo: ${gameName}`, emailHtml);
    }

    return new Response(
      JSON.stringify({ 
        message: `Successfully uploaded ${gameName} v${version} for review.`,
        request: requestRecord 
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
