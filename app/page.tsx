'use client';

import { supabase } from '@/utils/supabase';
import { useState, useEffect } from 'react';

type UserProfile = {
  display_name: string;
  user_name: string;
} | null;

type Room = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type Message = {
  id?: string;
  room_id: string;
  role: 'user' | 'model';
  content: string;
  created_at?: string;
};

type DocumentMetadata = {
  id: string;
  file_name: string;
};

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
          user_id: session.user.id
        }])
        .select()
        .single();

      if (error) throw error;
      setRooms([data, ...rooms]);
      setCurrentRoom(data);
      setMessages([]);
    } catch (error) {
      console.error('Error creating room:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentRoom || isGenerating) return;
    if (selectedDocument && (!startPage || !endPage)) {
      alert('ファイルを選択した場合は、ページ範囲を指定してください。');
      return;
    }

    try {
      setIsGenerating(true);

      // ユーザーメッセージを保存
      const { data: userMessage, error: messageError } = await supabase
        .from('messages')
        .insert([{
          room_id: currentRoom.id,
          role: 'user',
          content: newMessage
        }])
        .select()
        .single();

      if (messageError) throw messageError;

      setMessages(prev => [...prev, userMessage]);
      setNewMessage('');

      // チャット履歴を含めてGeminiの応答を生成
      const response = await fetch('/api/generate-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: newMessage,
          history: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          document: selectedDocument ? {
            file_name: selectedDocument.file_name,
            start_page: parseInt(startPage),
            end_page: parseInt(endPage)
          } : null
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate response');
      }

      const data = await response.json() as { content: string };
      const { content } = data;

      // アシスタントのメッセージを保存
      const { data: assistantMessage, error: assistantError } = await supabase
        .from('messages')
        .insert([{
          room_id: currentRoom.id,
          role: 'model',
          content: content
        }])
        .select()
        .single();

      if (assistantError) throw assistantError;

      setMessages(prev => [...prev, assistantMessage]);

      // 送信後にドキュメント選択と範囲をリセット
      setSelectedDocument(null);
      setStartPage('');
      setEndPage('');
    } catch (error) {
      console.error('Error sending message:', error);
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
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <nav className="flex justify-between items-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">StudyFellow</div>
            <div className="flex items-center gap-4">
              <div className="text-sm">
                <p className="font-medium text-gray-900 dark:text-white">{userProfile.display_name}</p>
                <p className="text-gray-500 dark:text-gray-400">@{userProfile.user_name}</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-full hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                ログアウト
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="flex gap-8">
          <div className="w-64 flex-shrink-0">
            <button
              onClick={createNewRoom}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 mb-4"
            >
              新しいチャット
            </button>
            <div className="space-y-2">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => {
                    setCurrentRoom(room);
                    fetchMessages(room.id);
                  }}
                  className={`w-full text-left px-4 py-2 rounded-lg ${
                    currentRoom?.id === room.id
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {room.title}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            {currentRoom ? (
              <>
                <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-4 py-2 ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}
                  {isGenerating && (
                    <div className="flex justify-start">
                      <div className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    {documents.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocument(selectedDocument?.id === doc.id ? null : doc)}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          selectedDocument?.id === doc.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
                        }`}
                      >
                        {doc.file_name}
                      </button>
                    ))}
                  </div>
                  {selectedDocument && (
                    <div className="flex gap-2 items-center bg-gray-50 dark:bg-gray-800 p-2 rounded">
                      <span className="text-sm text-gray-600 dark:text-gray-400">ページ範囲（必須）:</span>
                      <input
                        type="number"
                        min="1"
                        required
                        value={startPage}
                        onChange={(e) => {
                          const value = e.target.value;
                          setStartPage(value);
                          if (endPage && parseInt(value) > parseInt(endPage)) {
                            setEndPage(value);
                          }
                        }}
                        placeholder="開始"
                        className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                      />
                      <span>-</span>
                      <input
                        type="number"
                        min="1"
                        required
                        value={endPage}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEndPage(value);
                          if (startPage && parseInt(value) < parseInt(startPage)) {
                            setStartPage(value);
                          }
                        }}
                        placeholder="終了"
                        className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                      />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder={selectedDocument 
                        ? `${selectedDocument.file_name}について質問...`
                        : "メッセージを入力..."}
                      className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() || isGenerating}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      送信
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
                チャットを選択するか、新しいチャットを開始してください
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
