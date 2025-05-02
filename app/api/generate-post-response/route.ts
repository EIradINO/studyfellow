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
        role: 'assistant'
      })

    if (insertError) {
      throw insertError
    }

    const analysisPrompt = `
    ユーザーの学習記録やコメントをもとに、以下の観点から学力を多角的に分析してください：
    - 知識の定着度
    - 応用力
    - 課題点や今後の伸びしろ
    - 学習姿勢やモチベーション
    - その他気づいた点

    300〜500文字程度で、具体的かつ前向きなフィードバックをお願いします。

    【ユーザーのコメント】
    ${userComment}

    【教科書の内容】
    ${context}
    `

    const analysisResult = await model.generateContent(analysisPrompt)
    const analysisResponse = await analysisResult.response.text()

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { data: dailyReportData } = await supabase
      .from('user_daily_reports')
      .select('id, daily_report')
      .eq('user_id', post.user_id)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())
      .maybeSingle()

    if (!dailyReportData) {
      const { error: insertDailyError } = await supabase
        .from('user_daily_reports')
        .insert({
          user_id: post.user_id,
          daily_report: [analysisResponse]
        })
  
      if (insertDailyError) {
        throw insertDailyError
      }
    } else {
      const { error: updateError } = await supabase
        .from('user_daily_reports')
        .update({ daily_report: [...dailyReportData.daily_report, analysisResponse] })
        .eq('id', dailyReportData.id)

      if (updateError) {
        throw updateError
      }
    }

    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
} 