import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from 'next/server';

export const config = {
  maxDuration: 60,
};

// --- 型定義 ---
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

interface MediaPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

interface Transcription {
  transcription: string;
  page: number;
}

interface MediaMessage {
  id: string;
  type: 'image' | 'pdf';
  file_url: string;
  content: string;
}

// --- ユーティリティ関数 ---
const handleError = (error: unknown, message: string) => {
  console.error(message, error);
  throw new Error(message);
};

// --- クライアント初期化関数 ---
function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabaseの認証情報が設定されていません');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

function getGeminiClient() {
  const googleApiKey = process.env.GOOGLE_API_KEY;
  if (!googleApiKey) {
    throw new Error('GOOGLE_API_KEYが設定されていません');
  }
  return new GoogleGenAI({apiKey: googleApiKey});
}

// --- データ取得関数 ---
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

  const typedSettings = settings as ChatSetting[];
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

// --- メディア処理関数 ---
async function fetchImageAsBase64(supabase: SupabaseClient, filePath: string): Promise<{base64: string, mimeType: string}> {
  const { data, error } = await supabase.storage.from('chat-files').createSignedUrl(filePath, 60 * 5);
  if (error || !data?.signedUrl) throw new Error(`画像の署名付きURL生成に失敗: ${filePath}`);
  
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`画像の取得に失敗: ${filePath}`);
  
  const contentType = res.headers.get('content-type') || '';
  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return { base64, mimeType: contentType };
}

async function fetchPdfAsBase64(supabase: SupabaseClient, filePath: string): Promise<{base64: string, mimeType: string}> {
  const { data, error } = await supabase.storage.from('chat-files').createSignedUrl(filePath, 60 * 5);
  if (error || !data?.signedUrl) throw new Error(`PDFの署名付きURL生成に失敗: ${filePath}`);
  
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`PDFの取得に失敗: ${filePath}`);
  
  const contentType = res.headers.get('content-type') || 'application/pdf';
  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return { base64, mimeType: contentType };
}

// --- メッセージ処理関数 ---
async function fetchDocumentTranscriptions(
  supabase: SupabaseClient,
  file_name: string,
  start_page: number,
  end_page: number
): Promise<string> {
  const { data: transcriptions, error: transError } = await supabase
    .from('document_transcriptions')
    .select('transcription, page')
    .eq('file_name', file_name)
    .gte('page', start_page)
    .lte('page', end_page)
    .order('page', { ascending: true });

  if (transError) {
    handleError(transError, 'ドキュメントの取得に失敗しました');
  }

  if (transcriptions && transcriptions.length > 0) {
    return transcriptions.map((t: Transcription) => t.transcription).join('\n');
  }
  return '';
}

interface HistoryItem {
  role: string;
  parts: {text: string}[];
}

function stringifyHistory(history: HistoryItem[]): string {
  const formattedHistory = history.map((h: HistoryItem) => {
    const role = h.role === 'user' ? 'ユーザー' : 'アシスタント';
    return {
      role: role,
      content: h.parts?.[0]?.text ?? ''
    };
  });
  return JSON.stringify(formattedHistory, null, 2);
}

// --- メインAPIエンドポイント ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('[generate-response] Request body:', body);

    const supabase = getSupabaseClient();
    const genAI = getGeminiClient();

    // type分岐
    if (body.type === 'post') {
      if (!body.post_id) {
        throw new Error('post_idが必要です');
      }
      // post取得
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('*')
        .eq('id', body.post_id)
        .single();
      if (postError || !post) {
        throw new Error('該当するpostが見つかりません');
      }
      // ドキュメントの該当ページ範囲のテキスト取得
      const { data: transcriptions, error: transcriptionError } = await supabase
        .from('document_transcriptions')
        .select('page, transcription')
        .eq('document_id', post.document_id)
        .gte('page', post.start_page)
        .lte('page', post.end_page)
        .order('page');
      if (transcriptionError) {
        throw new Error('ドキュメントの取得に失敗しました');
      }
      const context = (transcriptions || [])
        .map((t: any) => `[ページ${t.page}]\n${t.transcription}`)
        .join('\n\n');
      // 最初の履歴（ユーザーのコメント）
      const history = [
        { role: 'user', parts: [{ text: `${context}\n---\n${post.comment}` }] }
      ];
      // post_messages_to_aiから履歴を取得
      const { data: aiMessages, error: aiMessagesError } = await supabase
        .from('post_messages_to_ai')
        .select('content, role, created_at')
        .eq('post_id', body.post_id)
        .order('created_at', { ascending: true });
      if (aiMessagesError) {
        throw new Error('AIメッセージ履歴の取得に失敗しました');
      }
      for (const msg of aiMessages || []) {
        history.push({ role: msg.role, parts: [{ text: msg.content }] });
      }
      // Gemini API呼び出し
      const chat = genAI.chats.create({
        model: 'gemini-2.0-flash',
        history: history,
      });
      const response = await chat.sendMessage({ message: post.comment });
      // AI応答を保存
      const { error: insertError } = await supabase
        .from('post_messages_to_ai')
        .insert({
          post_id: body.post_id,
          content: response.text,
          role: 'model',
        });
      if (insertError) {
        throw new Error('AI応答の保存に失敗しました');
      }
      return NextResponse.json({ success: true });
    }

    // --- 既存のroom処理 ---
    if (!body.room_id) {
      throw new Error('room_idが必要です');
    }

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

    // メッセージ履歴の取得
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', body.room_id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('[generate-response] Messages fetch error:', messagesError);
      throw messagesError;
    }

    // メディアメッセージの処理
    const mediaMessages = messages.filter((msg): msg is MediaMessage => 
      (msg.type === 'image' || msg.type === 'pdf') && msg.file_url !== null
    );
    
    const mediaParts: MediaPart[] = [];
    const mediaMessageMap = new Map<number, { type: string, content: string }>();

    for (let i = 0; i < mediaMessages.length; i++) {
      const mediaMsg = mediaMessages[i];
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
        mediaMessageMap.set(i, {
          type: mediaMsg.type,
          content: mediaMsg.content
        });
      } catch (e) {
        console.error(`[generate-response] メディア取得失敗: ${mediaMsg.file_url}`, e);
      }
    }

    // テキスト・コンテキスト履歴の構築
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
          contextText = await fetchDocumentTranscriptions(
            supabase,
            msg.file_name,
            msg.start_page,
            msg.end_page
          );
        }
        history.push({
          role: msg.role,
          parts: [{ text: `${contextText}\n---\n${msg.content}` }]
        });
      } else if (msg.type === 'image' || msg.type === 'pdf') {
        const mediaIndex = mediaMessages.findIndex(m => m.id === msg.id);
        if (mediaIndex !== -1) {
          const mediaType = msg.type === 'image' ? '画像' : 'PDF';
          history.push({
            role: msg.role,
            parts: [{ text: `[添付${mediaType}${mediaIndex + 1}]\n${msg.content}` }]
          });
        }
      }
    }

    // 最後のメッセージの処理
    let finalMessage = lastMessage.content;
    if (lastMessage.type === 'context') {
      let contextText = '';
      if (lastMessage.file_name && lastMessage.start_page != null && lastMessage.end_page != null) {
        contextText = await fetchDocumentTranscriptions(
          supabase,
          lastMessage.file_name,
          lastMessage.start_page,
          lastMessage.end_page
        );
      }
      finalMessage = `${contextText}\n---\n${lastMessage.content}`;
    } else if (lastMessage.type === 'image' || lastMessage.type === 'pdf') {
      const mediaIndex = mediaMessages.findIndex(m => m.id === lastMessage.id);
      if (mediaIndex !== -1) {
        const mediaType = lastMessage.type === 'image' ? '画像' : 'PDF';
        finalMessage = `[添付${mediaType}${mediaIndex + 1}]\n${lastMessage.content}`;
      }
    }

    // Gemini API呼び出し
    if (mediaMessages.length > 0) {
      const historyText = stringifyHistory(history);
      const contents = [
        ...mediaParts,
        { text: `[会話履歴]\n${historyText}\n\n[ユーザーの入力]\n${finalMessage}` }
      ];

      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: contents,
      });

      // アシスタントのメッセージを保存
      const { data: assistantMessage, error: assistantMessageError } = await supabase
        .from('messages')
        .insert([{
          room_id: body.room_id,
          user_id: user_id,
          role: 'model',
          content: response.text
        }])
        .select()
        .single();

      if (assistantMessageError) {
        throw assistantMessageError;
      }

      console.log('[generate-response] Successfully saved assistant message:', assistantMessage);
      return NextResponse.json({ success: true });
    } else {
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
          user_id: user_id,
          role: 'model',
          content: response.text
        }])
        .select()
        .single();

      if (assistantMessageError) {
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