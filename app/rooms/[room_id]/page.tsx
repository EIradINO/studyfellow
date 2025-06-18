'use client';

// import { supabase } from '@/utils/supabase';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ChatWindow from '@/app/components/ChatWindow';

// app/page.tsx から持ってきた型定義
type Room = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  interactive: boolean;
  internet_search: boolean;
  // user_id もあると良いかもしれない (権限チェック用)
};

type Message = {
  id?: string;
  room_id: string;
  role: 'user' | 'model';
  content: string;
  created_at?: string;
  type?: 'text' | 'image' | 'pdf' | 'context';
  file_url?: string | null;
  // user_id もあると良いかもしれない
  // app/page.tsx にはなかった file_name, start_page, end_page を追加
  file_name?: string;
  start_page?: number;
  end_page?: number;
};

type DocumentMetadata = {
  id: string;
  file_name: string;
};

const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif"
];

const handleError = (error: unknown, message: string) => {
  console.error(message, error);
  alert(message);
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.room_id as string;

  const [loading, setLoading] = useState(true);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DocumentMetadata | null>(null);
  const [startPage, setStartPage] = useState<string>('');
  const [endPage, setEndPage] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [internet_search, setInternetSearch] = useState(false);

  const fetchMessages = useCallback(async (rId: string) => {
    if (!rId) return;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', rId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      handleError(error, 'メッセージの取得に失敗しました');
    }
  }, []);

  const fetchDocuments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('document_metadata')
        .select('id, file_name')
        .order('file_name');
      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      handleError(error, 'ドキュメントの取得に失敗しました');
    }
  }, []);

  const fetchCurrentRoomData = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (session?.user) {
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .single();

        if (roomError) throw roomError; // ルーム取得エラーは致命的
        if (!roomData) {
          alert('ルームが見つかりません。ホームページに戻ります。');
          router.push('/');
          return;
        }
        setCurrentRoom(roomData);
        setInteractive(roomData.interactive);
        setInternetSearch(roomData.internet_search);

        await Promise.all([fetchMessages(roomId), fetchDocuments()]);
      } else {
        alert('ログインが必要です。ホームページに戻ります。');
        router.push('/');
      }
    } catch (error) {
      handleError(error, `ルームデータ(${roomId})の取得に失敗しました`);
      router.push('/');
    } finally {
      setLoading(false);
    }
  }, [roomId, router, fetchMessages, fetchDocuments]);

  useEffect(() => {
    if (roomId) {
      fetchCurrentRoomData();
    }
  }, [roomId, fetchCurrentRoomData]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type.startsWith("image/") && !SUPPORTED_IMAGE_TYPES.includes(selectedFile.type)) {
        alert("この画像形式はサポートされていません。PNG, JPEG, WEBP, HEIC, HEIFのみアップロード可能です。");
        e.target.value = "";
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSendMessage = async () => {
    if (!currentRoom || isGenerating || (!newMessage.trim() && !file && !selectedDocument)) {
      return;
    }
    if (selectedDocument && (!startPage || !endPage)) {
      alert('ファイルを選択した場合は、ページ範囲を指定してください。');
      return;
    }
     if (file && !newMessage.trim()) {
      alert('画像を送信する場合は、テキストメッセージも入力してください。');
      return;
    }

    try {
      setIsGenerating(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('ユーザー情報が取得できません');

      let contextProcessed = false;
      if (selectedDocument && startPage && endPage && currentRoom) {
        const { data: contextMsg, error: contextMsgError } = await supabase
          .from('messages')
          .insert([{
            room_id: currentRoom.id,
            user_id: userId,
            role: 'user',
            content: newMessage,
            type: 'context',
            file_name: selectedDocument.file_name,
            start_page: parseInt(startPage),
            end_page: parseInt(endPage),
          }])
          .select()
          .single();

        if (contextMsgError) throw contextMsgError;
        if (contextMsg) {
          setMessages(prev => [...prev, contextMsg]);
        }
        setSelectedDocument(null);
        setStartPage('');
        setEndPage('');
        contextProcessed = true;
      }

      let fileProcessed = false;
      if (file && newMessage.trim() && currentRoom) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', userId);

        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const result = await res.json();

        if (res.status !== 200 || !result.filePath) {
          throw new Error('アップロード失敗、またはファイルパスが取得できません: ' + (result.error || 'Unknown error'));
        }
        
        const messageType = file.type.startsWith('image/') ? 'image' : 'pdf';
        
        const { data: fileMsg, error: fileMsgError } = await supabase
          .from('messages')
          .insert([{
            room_id: currentRoom.id,
            user_id: userId,
            role: 'user',
            content: newMessage,
            type: messageType,
            file_url: result.filePath,
          }])
          .select()
          .single();

        if (fileMsgError) throw fileMsgError;
        if (fileMsg) {
          setMessages(prev => [...prev, fileMsg]);
        }
        setFile(null);
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        fileProcessed = true;
      }
      
      if (!fileProcessed && !contextProcessed && newMessage.trim() && currentRoom) {
         const { data: textMsg, error: textMsgError } = await supabase
          .from('messages')
          .insert([{
            room_id: currentRoom.id,
            user_id: userId,
            role: 'user',
            content: newMessage,
            type: 'text',
          }])
          .select()
          .single();
        if (textMsgError) throw textMsgError;
        if (textMsg) {
          setMessages(prev => [...prev, textMsg]);
        }
      }
      
      if ((contextProcessed || fileProcessed || newMessage.trim()) && currentRoom) {
        try {
          await fetch('/api/generate-response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              room_id: currentRoom.id,
              interactive: interactive,
              internet_search: internet_search,
              type: 'room',
            }),
          });
        } catch (err) {
          console.error('generate-response API error:', err);
        }
      }
      
      setNewMessage('');
      if (currentRoom) {
        await fetchMessages(currentRoom.id);
      }

    } catch (error) {
      handleError(error, 'メッセージの送信中にエラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInteractiveToggle = async (newValue: boolean) => {
    if (!currentRoom) return;
    setInteractive(newValue);
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ interactive: newValue })
        .eq('id', currentRoom.id);
      if (error) {
        setInteractive(!newValue);
        throw error;
      }
      const { error: messageError } = await supabase
        .from('messages')
        .insert([{
          room_id: currentRoom.id,
          role: 'model',
          content: newValue ? '探究学習モードをonにしました' : '探究学習モードをoffにしました',
          type: 'text'
        }]);
      if (messageError) throw messageError;
      await fetchMessages(currentRoom.id);
    } catch (error) {
      handleError(error, '対話モードの更新に失敗しました');
    }
  };

  const handleInternetSearchToggle = async (newValue: boolean) => {
    if (!currentRoom) return;
    setInternetSearch(newValue);
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ internet_search: newValue })
        .eq('id', currentRoom.id);
      if (error) {
        setInternetSearch(!newValue);
        throw error;
      }
    } catch (error) {
      handleError(error, '検索モードの更新に失敗しました');
    }
  };
  
  // ログアウト処理はヘッダーなどに移管するため、ここでは一旦コメントアウトまたは削除
  // const handleLogout = async () => { ... };

  if (loading || !currentRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

          // 未ログインの場合の処理は fetchCurrentRoomData 内で router.push('/') により処理される想定

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <main className="flex-grow">
        <ChatWindow
          currentRoom={currentRoom}
          messages={messages}
          isGenerating={isGenerating}
          documents={documents}
          selectedDocument={selectedDocument}
          setSelectedDocument={setSelectedDocument}
          startPage={startPage}
          setStartPage={setStartPage}
          endPage={endPage}
          setEndPage={setEndPage}
          newMessage={newMessage}
          setNewMessage={setNewMessage}
          handleSendMessage={handleSendMessage}
          file={file}
          onFileChange={onFileChange}
          interactive={interactive}
          setInteractive={handleInteractiveToggle}
          internet_search={internet_search}
          setInternetSearch={handleInternetSearchToggle}
        />
      </main>
    </div>
  );
} 