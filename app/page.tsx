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
  role: 'user' | 'assistant';
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
      const { data: response, error: functionError } = await supabase.functions.invoke('generate-response', {
        body: { 
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
        }
      });

      if (functionError) throw functionError;

      // アシスタントのメッセージを保存
      const { data: assistantMessage, error: assistantError } = await supabase
        .from('messages')
        .insert([{
          room_id: currentRoom.id,
          role: 'assistant',
          content: response.content
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
      <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <header className="container mx-auto px-6 py-8">
          <nav className="flex justify-between items-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">StudyFellow</div>
            <button
              onClick={() => supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: `${window.location.origin}/auth/callback`,
                },
              })}
              className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                />
              </svg>
              Googleでログイン
            </button>
          </nav>
        </header>

        <main className="container mx-auto px-6 py-16">
          <section className="text-center mb-20">
            <h1 className="text-5xl font-bold mb-6 text-gray-800 dark:text-white">
              あなたの学びを、<br />
              最高のパートナーと
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
              StudyFellowは、個別指導に特化した家庭教師サービスです。
              一人ひとりの目標と学習スタイルに合わせた、最適な学習環境を提供します。
            </p>
            <div className="space-x-4">
              <button
                onClick={() => supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                  },
                })}
                className="bg-blue-600 text-white px-8 py-3 rounded-full text-lg hover:bg-blue-700"
              >
                無料で始める
              </button>
              <a href="#features" className="border-2 border-blue-600 text-blue-600 px-8 py-3 rounded-full text-lg hover:bg-blue-50 inline-block">
                詳しく見る
              </a>
            </div>
          </section>

          {!userProfile && (
            <>
              <section id="features" className="grid md:grid-cols-3 gap-8 mb-20">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
                  <div className="text-blue-600 text-4xl mb-4">🎯</div>
                  <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">個別カリキュラム</h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    生徒一人ひとりの目標と学習状況に合わせた、完全オーダーメイドのカリキュラムを提供します。
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
                  <div className="text-blue-600 text-4xl mb-4">👨‍🏫</div>
                  <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">優秀な講師陣</h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    厳選された経験豊富な講師が、生徒の理解度に合わせて丁寧に指導します。
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
                  <div className="text-blue-600 text-4xl mb-4">📱</div>
                  <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">オンライン対応</h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    対面・オンラインどちらでも受講可能。場所を選ばず、効率的な学習を実現します。
                  </p>
                </div>
              </section>

              <section id="pricing" className="text-center mb-20">
                <h2 className="text-3xl font-bold mb-12 text-gray-800 dark:text-white">料金プラン</h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
                    <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">スタンダード</h3>
                    <p className="text-3xl font-bold mb-4 text-blue-600">¥5,000<span className="text-sm">/月</span></p>
                    <ul className="text-left space-y-2 mb-6">
                      <li>週1回60分の個別指導</li>
                      <li>学習計画の作成</li>
                      <li>メールサポート</li>
                    </ul>
                    <a href="#contact" className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700">
                      申し込む
                    </a>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border-2 border-blue-600">
                    <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">プレミアム</h3>
                    <p className="text-3xl font-bold mb-4 text-blue-600">¥8,000<span className="text-sm">/月</span></p>
                    <ul className="text-left space-y-2 mb-6">
                      <li>週2回60分の個別指導</li>
                      <li>学習計画の作成</li>
                      <li>24時間サポート</li>
                      <li>定期テスト対策</li>
                    </ul>
                    <a href="#contact" className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700">
                      申し込む
                    </a>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
                    <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">エンタープライズ</h3>
                    <p className="text-3xl font-bold mb-4 text-blue-600">¥12,000<span className="text-sm">/月</span></p>
                    <ul className="text-left space-y-2 mb-6">
                      <li>週3回60分の個別指導</li>
                      <li>学習計画の作成</li>
                      <li>24時間サポート</li>
                      <li>定期テスト対策</li>
                      <li>進路相談</li>
                    </ul>
                    <a href="#contact" className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700">
                      申し込む
                    </a>
                  </div>
                </div>
              </section>

              <section id="contact" className="max-w-2xl mx-auto text-center">
                <h2 className="text-3xl font-bold mb-8 text-gray-800 dark:text-white">無料相談のお申し込み</h2>
                <form className="space-y-4">
                  <input
                    type="text"
                    placeholder="お名前"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                  />
                  <input
                    type="email"
                    placeholder="メールアドレス"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                  />
                  <textarea
                    placeholder="ご質問やご要望"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 h-32"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-8 py-3 rounded-full text-lg hover:bg-blue-700 w-full"
                  >
                    送信する
                  </button>
                </form>
              </section>
            </>
          )}
        </main>

        <footer className="bg-gray-100 dark:bg-gray-900 py-8">
          <div className="container mx-auto px-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              © 2024 StudyFellow. All rights reserved.
            </p>
          </div>
        </footer>
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
