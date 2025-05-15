'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';

// 更新された DocumentMetadata インターフェース
interface DocumentMetadata {
  id: string;
  file_name: string;
  bucket: string;
  title: string | null; // title は nullable の可能性も考慮
  total_pages: number | null;
  file_size: number | null;
  created_at: string;
  status: string | null;
}

export default function NewRoomPage() {
  const [title, setTitle] = useState('');
  const [interactive, setInteractive] = useState(false);
  const [internetSearch, setInternetSearch] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // --- メッセージ入力関連のstate --- (ChatWindow.tsx より)
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DocumentMetadata | null>(null);
  const [startPage, setStartPage] = useState('');
  const [endPage, setEndPage] = useState('');
  // ---------------------------------

  useEffect(() => {
    const fetchInitialData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        try {
          const { data: userDocs, error: docsError } = await supabase
            .from('document_metadata')
            .select('id, file_name, bucket, title, total_pages, file_size, created_at, status')
            .order('created_at', { ascending: false });
          if (docsError) {
            console.error('ドキュメントの取得に失敗しました:', docsError, JSON.stringify(docsError));
            setError('引用可能なドキュメントの読み込みに失敗しました: ' + (docsError.message || JSON.stringify(docsError)));
            setDocuments([]);
          } else if (userDocs) {
            setDocuments(userDocs);
          }
        } catch (docError: unknown) {
          console.error('ドキュメントの取得処理中にエラー:', docError, JSON.stringify(docError));
          setError('引用可能なドキュメントの読み込み中に予期せぬエラーが発生しました: ' + (docError instanceof Error ? docError.message : JSON.stringify(docError)));
          setDocuments([]);
        }
      } else {
        router.push('/login');
      }
    };
    fetchInitialData();
  }, [router]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setSelectedDocument(null); // ファイル選択時はドキュメント選択を解除
    } else {
      setFile(null);
    }
  };

  const handleCreateRoomAndSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('ルームタイトルを入力してください。');
      return;
    }
    if (!user) {
      setError('ユーザー情報が取得できませんでした。再度お試しください。');
      return;
    }
    // メッセージ内容のバリデーション (任意)
    if (!newMessage.trim() && !file && !selectedDocument) {
        setError('最初のメッセージを入力するか、ファイルを添付、またはドキュメントを引用してください。');
        return;
    }
    if (selectedDocument && 
        (!startPage || !endPage || 
         parseInt(startPage) <= 0 || 
         parseInt(endPage) < parseInt(startPage) || 
         (selectedDocument.total_pages && parseInt(endPage) > selectedDocument.total_pages))) {
        setError('有効なページ範囲を指定してください。開始ページは1以上、終了ページは開始ページ以上で、総ページ数を超えないようにしてください。');
        return;
    }

    setIsLoading(true);
    let newRoomId: string | null = null;

    try {
      // 1. ルームを作成
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert({
          title: title.trim(),
          user_id: user.id,
          interactive: interactive,
          internet_search: internetSearch,
        })
        .select('id')
        .single();

      if (roomError) throw roomError;
      if (!roomData?.id) throw new Error('ルームIDの取得に失敗しました。');
      newRoomId = roomData.id;

      // 2. メッセージを作成・送信
      let messageContent = newMessage.trim();
      let messageType: 'text' | 'image' | 'pdf' | 'context' = 'text';
      let fileUrl: string | null = null;
      let fileName: string | null = null;

      if (file) {
        messageType = file.type.startsWith('image/') ? 'image' : 'pdf';
        fileName = file.name;
        const filePath = `${user.id}/${newRoomId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-files')
          .upload(filePath, file);
        if (uploadError) throw new Error(`ファイルアップロードエラー: ${uploadError.message}`);
        const { data: publicUrlData } = supabase.storage
          .from('chat-files')
          .getPublicUrl(filePath);
        fileUrl = publicUrlData?.publicUrl || null;
        if (!messageContent) messageContent = fileName;
      } else if (selectedDocument) {
        messageType = 'context';
        fileName = selectedDocument.title || selectedDocument.file_name;
      }

      const { error: messageError } = await supabase.from('messages').insert({
        room_id: newRoomId,
        user_id: user.id,
        role: 'user',
        content: messageContent,
        type: messageType,
        file_url: fileUrl,
        file_name: fileName,
        start_page: selectedDocument ? parseInt(startPage) : null,
        end_page: selectedDocument ? parseInt(endPage) : null,
      });
      if (messageError) throw messageError;

      // 3. ルームページへリダイレクト
      router.push(`/rooms/${newRoomId}`);

      // 4. generate-response API呼び出し（awaitしない）
      fetch('/api/generate-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: newRoomId,
          interactive: interactive,
          internet_search: internetSearch,
        }),
      });

    } catch (err: unknown) {
      console.error('処理中にエラーが発生しました:', err);
      setError(err instanceof Error ? err.message : 'ルームとメッセージの作成中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user && !isLoading) {
    return <div className="flex-1 flex items-center justify-center"><p>読み込み中...</p></div>;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-start bg-gray-100 dark:bg-gray-900 min-h-screen overflow-y-auto">
      {/* エラー表示 */}
      {error && (
        <div className="text-red-600 bg-red-100 dark:bg-red-900/40 rounded mb-4 max-w-2xl w-full text-center break-all">
          {error}
        </div>
      )}
      <div className="w-full max-w-6xl bg-white dark:bg-gray-800 shadow-xl rounded-lg p-6 md:p-10 mx-0">
        <h1 className="text-2xl md:text-3xl font-bold text-center text-gray-800 dark:text-white mb-6">
          新しいチャットを開始
        </h1>
        <form onSubmit={handleCreateRoomAndSendMessage} className="flex flex-col md:flex-row gap-6">
          {/* 左カラム */}
          <div className="flex-1 flex flex-col gap-6">
            {/* メッセージ本文 */}
            <div className="bg-gray-50 dark:bg-gray-850 p-4 md:p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
              <label htmlFor="newMessage" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                メッセージ本文
              </label>
              <textarea
                id="newMessage"
                rows={6}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="こんにちは！最初のメッセージをどうぞ..."
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700"
              />
            </div>
            {/* ドキュメント引用 */}
            <div className="bg-gray-50 dark:bg-gray-850 p-4 md:p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ドキュメントを引用する (任意)</label>
              {documents.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg mb-2">
                    {documents.map((doc) => (
                      <button
                        type="button"
                        key={doc.id}
                        onClick={() => {
                          setSelectedDocument(selectedDocument?.id === doc.id ? null : doc);
                          setFile(null); 
                          setStartPage('');
                          setEndPage('');  
                        }}
                        className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${selectedDocument?.id === doc.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-indigo-100 dark:bg-indigo-800/70 text-indigo-700 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-700'}
                          ${file ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={!!file}
                      >
                        {doc.title || doc.file_name}
                      </button>
                    ))}
                  </div>
                  {selectedDocument && (
                    <div className="flex flex-wrap gap-2 items-center p-2.5 bg-gray-100 dark:bg-gray-700/50 rounded-md text-xs">
                      <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">ページ範囲 (必須):</span>
                      <input type="number" min="1" max={selectedDocument?.total_pages || undefined} value={startPage} onChange={(e) => setStartPage(e.target.value)} placeholder="開始" className="w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-600 dark:text-white text-xs" required={!!selectedDocument} />
                      <span>-</span>
                      <input type="number" min={startPage || "1"} max={selectedDocument?.total_pages || undefined} value={endPage} onChange={(e) => setEndPage(e.target.value)} placeholder="終了" className="w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-600 dark:text-white text-xs" required={!!selectedDocument} />
                      {selectedDocument?.total_pages && <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">(全{selectedDocument.total_pages}ページ)</span>}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 p-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                  引用可能なドキュメントはありません。
                </p>
              )}
            </div>
          </div>
          {/* 右カラム */}
          <div className="w-full md:w-72 flex flex-col gap-6 justify-between">
            {/* モード選択 */}
            <div className="bg-gray-50 dark:bg-gray-850 p-4 md:p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">探究学習モード</span>
                <button type="button" onClick={() => setInteractive(!interactive)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${interactive ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500'}`}>{interactive ? 'オン' : 'オフ'}</button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">インターネット検索</span>
                <button type="button" onClick={() => setInternetSearch(!internetSearch)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${internetSearch ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500'}`}>{internetSearch ? '利用する' : '利用しない'}</button>
              </div>
              {/* ファイル添付 */}
              <div className="flex items-center gap-2 mt-2">
                <label htmlFor="file-upload" className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center gap-2 ${selectedDocument ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500'}`}>ファイルを添付</label>
                <input
                  id="file-upload"
                  type="file"
                  onChange={onFileChange}
                  className="hidden"
                  disabled={!!selectedDocument}
                  accept=".jpg,.jpeg,.png,.gif,.heic,.heif,.webp,.pdf,image/*"
                />
                {file && (
                  <span className="text-xs text-gray-600 dark:text-gray-400">{file.name} <button type="button" onClick={() => setFile(null)} className="text-red-500 hover:text-red-700 ml-1">(削除)</button></span>
                )}
              </div>
            </div>
            {/* 送信ボタン */}
            <div className="flex-1 flex flex-col justify-end">
              <button
                type="submit"
                disabled={isLoading || !title.trim() || (!newMessage.trim() && !file && !selectedDocument)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-4 rounded-lg shadow-lg transition-colors text-base disabled:opacity-60 disabled:cursor-not-allowed mt-4"
              >
                {isLoading ? '作成中...' : 'ルームを作成してメッセージを送信'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
} 