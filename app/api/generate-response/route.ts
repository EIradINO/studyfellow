import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from "@google/genai";
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

interface RequestBody {
  message: string;
  document?: DocumentInfo;
  history?: ChatMessage[];
  room_id: string;
}

// チャット設定の型定義
interface ChatSettingSub {
  field: string;
  level: number;
  explanation: string;
}

interface ChatSetting {
  subject: string;
  level: number;
  explanation: string;
  user_chat_settings_sub: ChatSettingSub[];
}

// --- バリデーション関数 ---
function validateRequestBody(body: RequestBody) {
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
async function fetchUserInstantReport(supabase: SupabaseClient, user_id: string): Promise<string> {
  const { data: report, error } = await supabase
    .from('user_instant_reports')
    .select('content')
    .eq('user_id', user_id)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error('学習状況の取得に失敗しました');
  }

  if (report?.content) {
    return `以下のユーザーの学習状況を考慮して、適切なレベルの回答を提供してください：\n${report.content}\n\n回答の際は以下の点に注意してください：\n1. ユーザーの現在の理解度に合わせた説明を心がける\n2. 必要に応じて基礎的な概念から説明する\n3. 専門用語は適切に説明を加える\n4. ユーザーの学習進捗に合わせた難易度で回答する\n`;
  }
  return '';
}

// --- ユーザーのチャット設定取得 ---
async function fetchUserChatSettings(supabase: SupabaseClient, user_id: string): Promise<string> {
  const { data: settings, error: settingsError } = await supabase
    .from('user_chat_settings')
    .select(`
      subject,
      level,
      explanation,
      user_chat_settings_sub (
        field,
        level,
        explanation
      )
    `)
    .eq('user_id', user_id);

  if (settingsError) {
    throw new Error('チャット設定の取得に失敗しました');
  }

  if (!settings || settings.length === 0) {
    return '';
  }

  // 型アサーションを使用して型を保証
  const typedSettings = settings as ChatSetting[];
  
  // 設定を整形してJSONに変換
  const formattedSettings = typedSettings.map(setting => ({
    subject: setting.subject,
    level: setting.level,
    explanation: setting.explanation,
    fields: setting.user_chat_settings_sub.map(sub => ({
      field: sub.field,
      level: sub.level,
      explanation: sub.explanation
    }))
  }));

  const settingsJson = JSON.stringify(formattedSettings, null, 2);
  return `以下のユーザーの学習設定を考慮して回答してください：\n${settingsJson}`;
}

// --- ドキュメントの文脈取得 ---
type Transcription = { page: number; transcription: string };

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
    (transcriptions as Transcription[]).map((t: Transcription) => `[ページ${t.page}]\n${t.transcription}`).join('\n\n') +
    '\n\n上記の内容に基づいて、以下の質問に答えてください。\n\n';
}

// --- ツール定義 ---
const similarQuestionFunctionDeclaration = {
  name: 'generate_similar_question',
  description: 'ユーザーの質問に基づいて類題を生成します。',
  parameters: {
    type: Type.OBJECT,
    properties: {
      question: {
        type: Type.STRING,
        description: 'ユーザーの質問内容',
      },
      answer: {
        type: Type.STRING,
        description: 'ユーザーの質問に対する解答・解説',
      },
    },
    required: ['question', 'answer'],
  },
};

// --- ツール実行関数 ---
async function generateSimilarQuestion(question: string, answer: string): Promise<{ question: string; answer: string }> {
  const genAI = getGeminiClient();
  const chat = genAI.chats.create({
    model: "gemini-2.0-flash",
    config: {
      temperature: 0.7,
    },
  });

  const prompt = `以下の問題と解答を参考に、同じ分野・難易度の類題を1つ作成してください。
問題は、元の問題と似た構造や考え方を使うものにしてください。
解答には、考え方や解法のポイントも含めてください。

【元の問題】
${question}

【解答】
${answer}

以下の形式で出力してください：
問題：
[類題の内容]

解答：
[解答と解説]`;

  const response = await chat.sendMessage({ message: prompt });
  if (!response.text) {
    throw new Error('類題の生成に失敗しました');
  }

  // 問題と解答を分離
  const questionMatch = response.text.match(/問題：\n([\s\S]*?)\n\n解答：/);
  const answerMatch = response.text.match(/解答：\n([\s\S]*?)$/);

  if (!questionMatch || !answerMatch) {
    throw new Error('類題の生成に失敗しました');
  }

  return {
    question: questionMatch[1].trim(),
    answer: answerMatch[1].trim()
  };
}

// --- メインAPIエンドポイント ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    validateRequestBody(body);

    const supabase = getSupabaseClient();
    const genAI = getGeminiClient();

    // room_idからuser_idを取得
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('user_id')
      .eq('id', body.room_id)
      .single();

    if (roomError || !room?.user_id) {
      throw new Error('roomのuser_idが特定できませんでした');
    }

    const user_id = room.user_id;

    // システムプロンプトの生成
    const instantReport = await fetchUserInstantReport(supabase, user_id);
    const chatSettings = await fetchUserChatSettings(supabase, user_id);
    const systemInstruction = `${instantReport}\n${chatSettings}`;

    // ドキュメント文脈
    let context = '';
    if (body.document) {
      context = await fetchDocumentContext(supabase, body.document);
    }

    const chat = genAI.chats.create({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: systemInstruction,
        tools: [{
          functionDeclarations: [similarQuestionFunctionDeclaration]
        }],
      },
      history: body.history?.map((msg: ChatMessage) => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      })),
    });

    const response = await chat.sendMessage({ message: context + body.message });
    
    // アシスタントのメッセージを保存
    const { data: assistantMessage, error: assistantMessageError } = await supabase
      .from('messages')
      .insert([{
        room_id: body.room_id,
        role: 'model',
        content: response.text
      }])
      .select()
      .single();

    if (assistantMessageError) throw assistantMessageError;

    let similarQuestion = null;
    // ツール呼び出しの処理（類題生成）
    if (response.functionCalls && response.functionCalls.length > 0) {
      const functionCall = response.functionCalls[0];
      if (functionCall.name === 'generate_similar_question' && 
          functionCall.args && 
          typeof functionCall.args === 'object' && 
          'question' in functionCall.args && 
          'answer' in functionCall.args) {
        similarQuestion = await generateSimilarQuestion(
          functionCall.args.question as string,
          functionCall.args.answer as string
        );

        // 類題のメッセージを保存
        const { data: similarQuestionMessage, error: similarQuestionError } = await supabase
          .from('messages')
          .insert([{
            room_id: body.room_id,
            role: 'model',
            content: `類題：\n${similarQuestion.question}\n\n解答：\n${similarQuestion.answer}`
          }])
          .select()
          .single();

        if (similarQuestionError) throw similarQuestionError;
      }
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
      'http://localhost:3000';

    await fetch(`${baseUrl}/api/analyze-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'messages',
        id: body.room_id,
        user_id
      })
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 