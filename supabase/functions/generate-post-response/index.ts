// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.1.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const googleApiKey = Deno.env.get('GOOGLE_API_KEY')!

const supabase = createClient(supabaseUrl, serviceRoleKey)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { post } = await req.json()
    
    // document_transcriptionsから該当箇所のテキストを取得
    const { data: transcriptions, error: transcriptionError } = await supabase
      .from('document_transcriptions')
      .select('page, transcription')
      .eq('document_id', post.document_id)
      .gte('page', post.start_page)
      .lte('page', post.end_page)
      .order('page')
    
    if (transcriptionError) {
      throw transcriptionError
    }

    // コンテキストの作成
    const context = transcriptions
      .map(t => `[ページ${t.page}]\n${t.transcription}`)
      .join('\n\n')

    // ユーザーのコメント
    const userComment = post.comment

    // Gemini APIの呼び出し
    const genAI = new GoogleGenerativeAI(googleApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const chat = model.startChat()
    const result = await chat.sendMessage(`以下は教科書の内容です：

${context}

ユーザーのコメント：
${userComment}

上記の教科書の内容に関するユーザーのコメントについて、以下の点を踏まえて返信してください：
1. 教科書の内容を参照しながら、具体的に説明する
2. ユーザーの理解を深めるような質問や補足を含める
3. 友好的で励ましになるような口調を使用する
4. 必要に応じて、教科書の特定の箇所を引用する
5. 返信は300-500文字程度に収める`)

    const response = await result.response
    const aiMessage = response.text()

    // AIの返信をデータベースに保存
    const { error: insertError } = await supabase
      .from('post_messages_to_ai')
      .insert({
        post_id: post.id,
        content: aiMessage,
        role: 'assistant'
      })

    if (insertError) {
      throw insertError
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-post-response' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
