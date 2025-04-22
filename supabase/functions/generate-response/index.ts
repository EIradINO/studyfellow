// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.1.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

console.log('Starting generate-response function');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, history, document } = await req.json();
    if (!message) {
      throw new Error('Message is required');
    }

    if (document) {
      if (!document.file_name) {
        throw new Error('Document file_name is required');
      }
      if (typeof document.start_page !== 'number' || typeof document.end_page !== 'number') {
        throw new Error('Page range must be specified when document is provided');
      }
      if (document.start_page > document.end_page) {
        throw new Error('Start page must be less than or equal to end page');
      }
    }

    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!googleApiKey) {
      throw new Error('GOOGLE_API_KEY is not set');
    }

    // Supabaseクライアントの初期化（service_role）
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Supabase credentials are not set');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    let context = '';
    if (document) {
      // document_transcriptionsからトランスクリプションを取得
      const { data: transcriptions, error } = await supabase
        .from('document_transcriptions')
        .select('page, transcription')
        .eq('file_name', document.file_name)
        .gte('page', document.start_page)
        .lte('page', document.end_page)
        .order('page');

      if (error) {
        throw error;
      }

      if (!transcriptions || transcriptions.length === 0) {
        throw new Error(`No transcriptions found for ${document.file_name} between pages ${document.start_page} and ${document.end_page}`);
      }

      context = `以下は${document.file_name}の${document.start_page}ページから${document.end_page}ページまでの内容です：\n\n` + 
        transcriptions.map(t => `[ページ${t.page}]\n${t.transcription}`).join('\n\n') +
        '\n\n上記の内容に基づいて、以下の質問に答えてください。\n\n';
    }

    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const chat = model.startChat({
      history: history?.map((msg: ChatMessage) => ({
        role: msg.role,
        parts: msg.content,
      })) || [],
    });

    const result = await chat.sendMessage(context + message);
    const response = await result.response;
    const text = response.text();

    return new Response(
      JSON.stringify({ content: text }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-response' \
    --header 'Authorization: Bearer ' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
