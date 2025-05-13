'use client';

import { supabase } from '@/utils/supabase';
import { useState, useEffect } from 'react';
import Header from '@/app/components/Header'
import RoomList from '@/app/components/RoomList';
import ChatWindow from '@/app/components/ChatWindow';

type UserProfile = {
  display_name: string;
  user_name: string;
} | null;

type Room = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  interactive: boolean;
  internet_search: boolean;
};

type Message = {
  id?: string;
  room_id: string;
  role: 'user' | 'model';
  content: string;
  created_at?: string;
  type?: 'text' | 'image' | 'pdf' | 'file';
  file_url?: string | null;
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

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
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

  useEffect(() => {
    if (currentRoom) {
      setInteractive(currentRoom.interactive);
      setInternetSearch(currentRoom.internet_search);
    } else {
      setInteractive(false);
      setInternetSearch(false);
    }
  }, [currentRoom]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (session?.user) {
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('display_name, user_name')
            .eq('user_id', session.user.id)
            .single();

          if (profileError) throw profileError;
          setUserProfile(profile);
          fetchRooms();
          fetchDocuments();
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  const fetchRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setRooms(data || []);
      if (currentRoom) {
        const currentRoomData = data?.find(room => room.id === currentRoom.id);
        if (currentRoomData) {
          setInteractive(currentRoomData.interactive);
          setInternetSearch(currentRoomData.internet_search);
        }
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('document_metadata')
        .select('id, file_name')
        .order('file_name');

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const fetchMessages = async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const createNewRoom = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('rooms')
        .insert([{ 
          title: '新しいチャット',
          user_id: session.user.id,
          interactive: false,
          internet_search: false
        }])
        .select()
        .single();

      if (error) throw error;
      setRooms([data, ...rooms]);
      setCurrentRoom(data);
      setMessages([]);
      setInteractive(false);
      setInternetSearch(false);
    } catch (error) {
      console.error('Error creating room:', error);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type.startsWith("image/") && !SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        alert("この画像形式はサポートされていません。PNG, JPEG, WEBP, HEIC, HEIFのみアップロード可能です。");
        e.target.value = ""; // ファイル選択をリセット
        return;
      }
      setFile(file);
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

    try {
      setIsGenerating(true);

      // 1. コンテキストメッセージの処理
      let contextProcessed = false;
      if (selectedDocument && startPage && endPage && currentRoom) {
        const contextContent = newMessage; // テキストフィールドの内容をそのまま保存
        const { data: contextMsg, error: contextMsgError } = await supabase
          .from('messages')
          .insert([{
            room_id: currentRoom.id,
            role: 'user',
            content: contextContent, // newMessage を含める
            type: 'context',
            file_name: selectedDocument.file_name,
            start_page: parseInt(startPage),
            end_page: parseInt(endPage),
          }])
          .select()
          .single();

        if (contextMsgError) {
          console.error('Error saving context message:', contextMsgError);
          alert('コンテキストメッセージの保存に失敗しました。');
          setIsGenerating(false);
          return;
        }
        if (contextMsg) {
          setMessages(prev => [...prev, contextMsg]);
        }
        setNewMessage(''); // newMessage もクリア
        setSelectedDocument(null);
        setStartPage('');
        setEndPage('');
        contextProcessed = true;
      }

      // 2. ファイルメッセージの処理
      let fileProcessed = false;
      if (file) {
        let messageTypeForFile = 'file';
        if (file.type.startsWith('image/')) {
          messageTypeForFile = 'image';
        } else if (file.type === 'application/pdf') {
          messageTypeForFile = 'pdf';
        }

        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) {
          alert('ユーザー情報が取得できません');
          setIsGenerating(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', userId);

        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const result = await res.json();

        if (res.status !== 200 || !result.filePath) {
          alert('アップロード失敗、またはファイルパスが取得できません: ' + (result.error || 'Unknown error'));
          setIsGenerating(false);
          return;
        }
        
        const { data: fileMsg, error: fileMsgError } = await supabase
          .from('messages')
          .insert([{
            room_id: currentRoom.id,
            role: 'user',
            content: result.fileName, // ファイル名
            type: messageTypeForFile,
            file_url: result.filePath,
          }])
          .select()
          .single();

        if (fileMsgError) {
          console.error('Error saving file message:', fileMsgError);
          alert('ファイルメッセージの保存に失敗しました。');
          setIsGenerating(false);
          return;
        }
        if (fileMsg) {
          setMessages(prev => [...prev, fileMsg]);
        }
        setFile(null);
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        fileProcessed = true;
      }

      // 3. 通常のテキストメッセージの処理 (ファイルが処理されなかった場合、かつcontextでない場合のみ)
      if (!fileProcessed && !contextProcessed && newMessage.trim()) {
        const { data: textMsg, error: textMsgError } = await supabase
          .from('messages')
          .insert([{
            room_id: currentRoom.id,
            role: 'user',
            content: newMessage, // newMessage の内容
            type: 'text',
          }])
          .select()
          .single();

        if (textMsgError) {
          console.error('Error saving text message:', textMsgError);
          alert('テキストメッセージの保存に失敗しました。');
          setIsGenerating(false);
          return;
        }
        if (textMsg) {
          setMessages(prev => [...prev, textMsg]);
        }
      }

      // generate-response API を発火
      if (contextProcessed || (!fileProcessed && newMessage.trim())) {
        try {
          await fetch('/api/generate-response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              room_id: currentRoom.id,
              interactive: interactive,
              internet_search: internet_search,
            }),
          });
        } catch (err) {
          console.error('generate-response API error:', err);
        }
      }

      // 4. 最終的なクリア処理
      setNewMessage(''); // 全ての処理が終わったのでクリア

      await fetchMessages(currentRoom.id);

    } catch (error) {
      console.error('Error sending message:', error);
      alert('メッセージの送信中にエラーが発生しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUserProfile(null);
      setRooms([]);
      setCurrentRoom(null);
      setMessages([]);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleInteractiveToggle = async (newValue: boolean) => {
    if (!currentRoom) return;
    
    // 先にUIを更新
    setInteractive(newValue);
    
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ interactive: newValue })
        .eq('id', currentRoom.id);

      if (error) {
        // エラーが発生した場合は元の状態に戻す
        setInteractive(!newValue);
        throw error;
      }
    } catch (error) {
      console.error('Error updating interactive mode:', error);
      alert('対話モードの更新に失敗しました。');
    }
  };

  const handleInternetSearchToggle = async (newValue: boolean) => {
    if (!currentRoom) return;
    
    // 先にUIを更新
    setInternetSearch(newValue);
    
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ internet_search: newValue })
        .eq('id', currentRoom.id);

      if (error) {
        // エラーが発生した場合は元の状態に戻す
        setInternetSearch(!newValue);
        throw error;
      }
    } catch (error) {
      console.error('Error updating internet search mode:', error);
      alert('検索モードの更新に失敗しました。');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button
          onClick={() => supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          })}
          className="bg-blue-600 text-white px-6 py-3 rounded-full text-lg hover:bg-blue-700"
        >
          Googleでログイン
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header userProfile={userProfile} handleLogout={handleLogout} />
      <main className="container mx-auto px-6 py-8">
        <div className="flex gap-8">
          <RoomList
            rooms={rooms}
            currentRoom={currentRoom}
            setCurrentRoom={setCurrentRoom}
            fetchMessages={fetchMessages}
            createNewRoom={createNewRoom}
          />
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
            setFile={setFile}
            onFileChange={onFileChange}
            interactive={interactive}
            setInteractive={handleInteractiveToggle}
            internet_search={internet_search}
            setInternetSearch={handleInternetSearchToggle}
          />
        </div>
      </main>
    </div>
  );
}
