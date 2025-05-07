import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const googleApiKey = process.env.GOOGLE_API_KEY!

const supabase = createClient(supabaseUrl, serviceRoleKey)

export async function POST(req: Request) {
  try {
    const { post } = await req.json()
    
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

    const userComment = post.comment

    const genAI = new GoogleGenerativeAI(googleApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const postPrompt = `以下は教科書の内容です：
    ${context}

    ユーザーのコメント：
    ${userComment}
    
    上記の教科書の内容に関するユーザーのコメントについて、以下の点を踏まえて返信してください：
    1. 教科書の内容を参照しながら、具体的に説明する
    2. ユーザーの理解を深めるような質問や補足を含める
    3. 友好的で励ましになるような口調を使用する
    4. 必要に応じて、教科書の特定の箇所を引用する
    5. 返信は300-500文字程度に収める`

    const result = await model.generateContent(postPrompt)
    const response = await result.response.text()

    const { error: insertError } = await supabase
      .from('post_messages_to_ai')
      .insert({
        post_id: post.id,
        content: response,
        role: 'model'
      })

    if (insertError) {
      throw insertError
    }

    // サーバーサイドでfetchする場合は絶対URLが必要
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
      'http://localhost:3000';
    console.log('[generate-post-response] baseUrl', { baseUrl });

    const analyzeResponse = await fetch(`${baseUrl}/api/analyze-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'post_messages',
        id: post.id,
        user_id: post.user_id,
      }),
    });

    if (!analyzeResponse.ok) {
      console.error('ユーザー分析の処理に失敗しました');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: '投稿の生成中にエラーが発生しました' },
      { status: 500 }
    );
  }
} 