import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from 'next/server';

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
function validateRequestBody(body: { room_id: string }) {
  if (!body.room_id) {
    throw new Error('room_idが必要です');
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

// 画像をBase64で取得する関数
async function fetchImageAsBase64(supabase: SupabaseClient, filePath: string): Promise<{base64: string, mimeType: string}> {
  // 署名付きURLを生成
  const { data, error } = await supabase.storage.from('chat-files').createSignedUrl(filePath, 60 * 5);
  if (error || !data?.signedUrl) throw new Error(`画像の署名付きURL生成に失敗: ${filePath}`);
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`画像の取得に失敗: ${filePath}`);
  const contentType = res.headers.get('content-type') || '';
  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return { base64, mimeType: contentType };
}

// PDFファイルをBase64で取得する関数
async function fetchPdfAsBase64(supabase: SupabaseClient, filePath: string): Promise<{base64: string, mimeType: string}> {
  // 署名付きURLを生成
  const { data, error } = await supabase.storage.from('chat-files').createSignedUrl(filePath, 60 * 5);
  if (error || !data?.signedUrl) throw new Error(`PDFの署名付きURL生成に失敗: ${filePath}`);
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`PDFの取得に失敗: ${filePath}`);
  const contentType = res.headers.get('content-type') || 'application/pdf';
  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return { base64, mimeType: contentType };
}

// --- メインAPIエンドポイント ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('[generate-response] Request body:', body);

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
      console.error('[generate-response] Room error:', roomError);
      throw new Error('roomのuser_idが特定できませんでした');
    }

    const user_id = room.user_id;
    console.log('[generate-response] User ID:', user_id);

    // システムプロンプトの生成
    const instantReport = await fetchUserInstantReport(supabase, user_id);
    const chatSettings = await fetchUserChatSettings(supabase, user_id);
    const systemInstruction = `${instantReport}\n${chatSettings}`;
    console.log('[generate-response] System instruction:', systemInstruction);

    // --- ここから新しいhistory構成 ---
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', body.room_id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('[generate-response] Messages fetch error:', messagesError);
      throw messagesError;
    }

    // 画像とPDFメッセージを抽出
    const mediaMessages = messages.filter((msg: any) => 
      (msg.type === 'image' || msg.type === 'pdf') && msg.file_url
    );
    
    // メディアデータをBase64で取得
    const mediaParts = [];
    for (const mediaMsg of mediaMessages) {
      try {
        const { base64, mimeType } = mediaMsg.type === 'pdf' 
          ? await fetchPdfAsBase64(supabase, mediaMsg.file_url)
          : await fetchImageAsBase64(supabase, mediaMsg.file_url);
        mediaParts.push({
          inlineData: {
            mimeType,
            data: base64,
          }
        });
      } catch (e) {
        console.error(`[generate-response] メディア取得失敗: ${mediaMsg.file_url}`, e);
      }
    }

    // --- テキスト・コンテキスト履歴の構築（最後のメッセージを除く） ---
    const history = [];
    const lastMessage = messages[messages.length - 1];
    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];
      if (msg.type === 'text') {
        history.push({
          role: msg.role,
          parts: [{ text: msg.content }]
        });
      } else if (msg.type === 'context') {
        let contextText = '';
        if (msg.file_name && msg.start_page != null && msg.end_page != null) {
          const { data: transcriptions, error: transError } = await supabase
            .from('document_transcriptions')
            .select('transcription, page')
            .eq('file_name', msg.file_name)
            .gte('page', msg.start_page)
            .lte('page', msg.end_page)
            .order('page', { ascending: true });
          if (transError) {
            console.error('[generate-response] Transcription fetch error:', transError);
            throw transError;
          }
          if (transcriptions && transcriptions.length > 0) {
            contextText = transcriptions.map((t: any) => t.transcription).join('\n');
          }
        }
        history.push({
          role: msg.role,
          parts: [{ text: `${contextText}\n---\n${msg.content}` }]
        });
      }
    }

    // --- 最後のメッセージの処理 ---
    let finalMessage = lastMessage.content;
    if (lastMessage.type === 'context') {
      let contextText = '';
      if (lastMessage.file_name && lastMessage.start_page != null && lastMessage.end_page != null) {
        const { data: transcriptions, error: transError } = await supabase
          .from('document_transcriptions')
          .select('transcription, page')
          .eq('file_name', lastMessage.file_name)
          .gte('page', lastMessage.start_page)
          .lte('page', lastMessage.end_page)
          .order('page', { ascending: true });
        if (transError) {
          console.error('[generate-response] Last message transcription fetch error:', transError);
          throw transError;
        }
        if (transcriptions && transcriptions.length > 0) {
          contextText = transcriptions.map((t: any) => t.transcription).join('\n');
        }
      }
      finalMessage = `${contextText}\n---\n${lastMessage.content}`;
    }

    // historyを文字列化
    function stringifyHistory(history: {role: string, parts: {text: string}[]}[]): string {
      return history.map((h: {role: string, parts: {text: string}[]}) => {
        return `${h.role}: ${h.parts?.[0]?.text ?? ''}`;
      }).join('\n');
    }

    if (mediaMessages.length > 0) {
      const historyText = stringifyHistory(history);
      const contents = [
        ...mediaParts,
        { text: `[履歴]\n${historyText}` },
        { text: `[ユーザーの入力]\n${finalMessage}` }
      ];

      // Gemini API呼び出し（メディアあり: generateContent）
      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: contents,
      });

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

      if (assistantMessageError) {
        console.error('[generate-response] Assistant message save error:', assistantMessageError);
        throw assistantMessageError;
      }

      console.log('[generate-response] Successfully saved assistant message:', assistantMessage);
      return NextResponse.json({ success: true });
    } else {
      // Gemini API呼び出し（画像なし: chats.create + sendMessage）
      const chat = genAI.chats.create({
        model: "gemini-2.0-flash",
        history: history,
      });
      const response = await chat.sendMessage({ message: finalMessage });

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

      if (assistantMessageError) {
        console.error('[generate-response] Assistant message save error:', assistantMessageError);
        throw assistantMessageError;
      }

      console.log('[generate-response] Successfully saved assistant message:', assistantMessage);
      return NextResponse.json({ success: true });
    }
  } catch (error: unknown) {
    console.error('[generate-response] Error:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 