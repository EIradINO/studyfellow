import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from 'next/server';

// 型定義
interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface DocumentInfo {
  file_name: string;
  start_page: number;
  end_page: number;
}

// --- バリデーション関数 ---
function validateRequestBody(body: any) {
  if (!body.message) {
    throw new Error('メッセージが必要です');
  }
  if (body.document) {
    const doc = body.document;
    if (!doc.file_name) {
      throw new Error('ドキュメントのファイル名が必要です');
    }
    if (typeof doc.start_page !== 'number' || typeof doc.end_page !== 'number') {
      throw new Error('ページ範囲（start_page, end_page）は数値で指定してください');
    }
    if (doc.start_page > doc.end_page) {
      throw new Error('開始ページは終了ページ以下である必要があります');
    }
  }
}

// --- Supabaseクライアント初期化 ---
function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabaseの認証情報が設定されていません');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

// --- Geminiクライアント初期化 ---
function getGeminiClient() {
  const googleApiKey = process.env.GOOGLE_API_KEY;
  if (!googleApiKey) {
    throw new Error('GOOGLE_API_KEYが設定されていません');
  }
  return new GoogleGenAI({apiKey: googleApiKey});
}

// --- ユーザーの学習状況取得 ---
async function fetchUserDailyReport(supabase: SupabaseClient): Promise<string> {
  const { data: dailyReports, error } = await supabase
    .from('user_daily_reports')
    .select('daily_report')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error('学習状況の取得に失敗しました');
  if (dailyReports && dailyReports.length > 0) {
    return `以下のユーザーの学習状況を考慮して、適切なレベルの回答を提供してください：\n${dailyReports[0].daily_report}\n\n回答の際は以下の点に注意してください：\n1. ユーザーの現在の理解度に合わせた説明を心がける\n2. 必要に応じて基礎的な概念から説明する\n3. 専門用語は適切に説明を加える\n4. ユーザーの学習進捗に合わせた難易度で回答する\n`;
  }
  return '';
}

// --- ドキュメントの文脈取得 ---
async function fetchDocumentContext(supabase: SupabaseClient, document: DocumentInfo): Promise<string> {
  const { data: transcriptions, error } = await supabase
    .from('document_transcriptions')
    .select('page, transcription')
    .eq('file_name', document.file_name)
    .gte('page', document.start_page)
    .lte('page', document.end_page)
    .order('page');
  if (error) throw new Error('ドキュメントの取得に失敗しました');
  if (!transcriptions || transcriptions.length === 0) {
    throw new Error(`${document.file_name} の ${document.start_page}〜${document.end_page} ページのトランスクリプションが見つかりません`);
  }
  return `以下は${document.file_name}の${document.start_page}ページから${document.end_page}ページまでの内容です：\n\n` +
    transcriptions.map((t: any) => `[ページ${t.page}]\n${t.transcription}`).join('\n\n') +
    '\n\n上記の内容に基づいて、以下の質問に答えてください。\n\n';
}

// --- メインAPIエンドポイント ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    validateRequestBody(body);

    const supabase = getSupabaseClient();
    const genAI = getGeminiClient();

    // システムプロンプト
    const systemInstruction = await fetchUserDailyReport(supabase);
    // ドキュメント文脈
    let context = '';
    if (body.document) {
      context = await fetchDocumentContext(supabase, body.document);
    }

    const chat = genAI.chats.create({
        model: "gemini-1.5-flash",
        config: {
            systemInstruction: systemInstruction,
        },
        history: body.history?.map((msg: ChatMessage) => ({
            role: msg.role,
            parts: [{ text: msg.content }]
        })),
    })
    const response = await chat.sendMessage({message: context + body.message});
    const text = response.text;
    return NextResponse.json({ content: text });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 