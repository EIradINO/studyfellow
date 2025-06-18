import { NextResponse } from 'next/server';
// import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";

// 型定義
interface AnalyzeUserRequest {
  type: string;
  id: string;
  user_id: string;
}

// Post interface removed (post functionality deleted)

// Supabaseクライアント初期化
function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabaseの認証情報が設定されていません');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

// Geminiクライアント初期化
function getGeminiClient() {
  const googleApiKey = process.env.GOOGLE_API_KEY;
  if (!googleApiKey) {
    throw new Error('GOOGLE_API_KEYが設定されていません');
  }
  return new GoogleGenAI({ apiKey: googleApiKey });
}

// post関連の関数は削除済み

// インスタントレポートの取得または作成
async function getOrCreateInstantReport(supabase: SupabaseClient, user_id: string): Promise<string> {
  const { data: report, error } = await supabase
    .from('user_instant_reports')
    .select('content')
    .eq('user_id', user_id)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116はレコードが見つからないエラー
    throw error;
  }

  if (!report) {
    // レポートが存在しない場合は新規作成
    const { error: insertError } = await supabase
      .from('user_instant_reports')
      .insert({
        user_id: user_id,
        content: ''
      });
    if (insertError) throw insertError;
    return '';
  }

  return report.content;
}

// インスタントレポートの更新
async function updateInstantReport(supabase: SupabaseClient, user_id: string, content: string) {
  const { error } = await supabase
    .from('user_instant_reports')
    .update({ content: content })
    .eq('user_id', user_id);
  if (error) throw error;
}

// メインAPI
export async function POST(req: Request) {
  try {
    const body: AnalyzeUserRequest = await req.json();
    if (!body.type || !body.id) {
      return NextResponse.json({ error: 'typeとidは必須です' }, { status: 400 });
    }

    if (body.type === 'messages') {
      const supabase = getSupabaseClient();
      const genAI = getGeminiClient();

      // room_idでmessages履歴を取得
      const { data: messages, error } = await supabase
        .from('messages')
        .select('content, role, created_at')
        .eq('room_id', body.id)
        .order('created_at', { ascending: true });
      if (error) {
        return NextResponse.json({ error: 'メッセージ履歴の取得に失敗しました' }, { status: 500 });
      }
      const history = (messages as { content: string; role: string }[]).map(m => ({
        role: m.role,
        content: m.content
      }));

      // 現在のレポート内容を取得
      const currentReport = await getOrCreateInstantReport(supabase, body.user_id);

      // プロンプト生成
      const analysisPrompt = `
この会話履歴をもとに、ユーザーの学習状況を、前回の分析内容に付け足してください。
前回の分析内容：
${currentReport}
`;

      // Geminiで分析
      const chat = genAI.chats.create({
        model: "gemini-2.0-flash",
        config: { temperature: 0.7 },
        history: history.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] }))
      });
      const response = await chat.sendMessage({ message: analysisPrompt });
      if (!response.text) throw new Error('Geminiの応答が空です');

      // レポート更新
      await updateInstantReport(supabase, body.user_id, response.text);

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: '未対応のtypeです' }, { status: 400 });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}