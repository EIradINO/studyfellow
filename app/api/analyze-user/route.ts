import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";

// 型定義
interface AnalyzeUserRequest {
  type: string;
  id: string;
  user_id: string;
}

interface Post {
  document_id: string;
  start_page: number;
  end_page: number;
  comment: string;
}

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

// ドキュメントの文脈取得
async function fetchDocumentContext(supabase: SupabaseClient, post: Post): Promise<string> {
  const { data: transcriptions, error } = await supabase
    .from('document_transcriptions')
    .select('page, transcription')
    .eq('document_id', post.document_id)
    .gte('page', post.start_page)
    .lte('page', post.end_page)
    .order('page');
  if (error) throw new Error('ドキュメントの取得に失敗しました');
  if (!transcriptions || transcriptions.length === 0) {
    throw new Error(`ドキュメントのトランスクリプションが見つかりません`);
  }
  return (transcriptions as { page: number; transcription: string }[])
    .map(t => `[ページ${t.page}]\n${t.transcription}`)
    .join('\n\n');
}

// 会話履歴をhistory配列として返す
async function fetchConversationHistory(supabase: SupabaseClient, post_id: string): Promise<{ role: string; content: string }[]> {
  const { data: messages, error } = await supabase
    .from('post_messages_to_ai')
    .select('content, role, created_at')
    .eq('post_id', post_id)
    .order('created_at', { ascending: true });
  if (error) throw new Error('会話履歴の取得に失敗しました');
  return (messages as { content: string; role: string }[]).map(m => ({
    role: m.role,
    content: m.content
  }));
}

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

    if (body.type === 'post_messages') {
      const supabase = getSupabaseClient();
      const genAI = getGeminiClient();

      // post取得
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('*')
        .eq('id', body.id)
        .single();
      if (postError || !post) {
        return NextResponse.json({ error: '該当するpostが見つかりません' }, { status: 404 });
      }

      // 文脈取得
      const context = await fetchDocumentContext(supabase, post);

      // 会話履歴をhistory配列で取得
      const history = await fetchConversationHistory(supabase, body.id);
      // postのcommentをhistoryの最初に追加
      history.unshift({ role: 'user', content: post.comment });

      // 現在のレポート内容を取得
      const currentReport = await getOrCreateInstantReport(supabase, body.user_id);

      // プロンプト生成
      const analysisPrompt = `
以下は教科書の内容です：
${context}

この会話と教科書内容をもとに、以下の観点から詳細な分析を行って前回の分析内容に付け足してください：
1. 学習内容の要約
2. 知識の定着度分析
3. 課題点と改善提案
4. 学習姿勢の評価
5. 今後の学習計画への提案

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
    } else if (body.type === 'messages') {
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