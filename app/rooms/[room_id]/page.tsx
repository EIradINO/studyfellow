'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/app/auth/AuthProvider';
import { db } from '@/utils/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import Image from 'next/image';

// 図の型定義
interface Figure {
  type: "matplotlib" | "canvas" | "svg";
  title: string;
  description: string;
  code?: string;
  imageUrl?: string;
}

// 型定義
interface Message {
  id: string;
  content: string;
  role: 'user' | 'model';
  type?: 'text' | 'text_with_figures';
  figures?: Figure[];
  created_at: Timestamp;
}

interface Room {
  id: string;
  title: string;
}

// 図のタイプに応じた表示コンポーネント
const renderFigure = (figure: Figure) => {
  switch (figure.type) {
    case 'matplotlib':
      return (
        <div className="bg-white p-4 rounded">
          <h3 className="text-lg font-semibold mb-2">{figure.title}</h3>
          {figure.imageUrl ? (
            <div className="flex justify-center mb-4">
              <Image 
                src={figure.imageUrl} 
                alt={figure.title}
                width={800}
                height={600}
                className="max-w-full h-auto border rounded shadow-sm"
                style={{ width: 'auto', height: 'auto' }}
              />
            </div>
          ) : (
            <div className="bg-gray-100 p-4 rounded">
              <pre className="text-sm overflow-auto max-h-96">
                <code>{figure.code}</code>
              </pre>
            </div>
          )}
        </div>
      );
    case 'svg':
      return (
        <div className="bg-white p-4 rounded">
          <h3 className="text-lg font-semibold mb-2">{figure.title}</h3>
          <div className="flex justify-center">
            {figure.code?.trim().startsWith('<svg') ? (
              <div 
                className="w-full max-w-2xl"
                dangerouslySetInnerHTML={{ __html: figure.code }}
              />
            ) : (
              <div className="w-full max-w-2xl p-4 bg-gray-100 rounded text-sm">
                <pre>{figure.code}</pre>
              </div>
            )}
          </div>
        </div>
      );
    case 'canvas':
      return (
        <div className="bg-white p-4 rounded">
          <h3 className="text-lg font-semibold mb-2">{figure.title}</h3>
          <iframe
            srcDoc={`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <style>
                  body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
                  canvas { border: 1px solid #ddd; display: block; margin: 0 auto; }
                </style>
              </head>
              <body>
                ${figure.code || ''}
              </body>
              </html>
            `}
            className="w-full h-96 border rounded"
            title={figure.title}
            sandbox="allow-scripts"
          />
        </div>
      );
    default:
      return <div>サポートされていない図のタイプです</div>;
  }
};

export default function RoomPage() {
  const { room_id } = useParams<{ room_id: string }>();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedFigures, setSelectedFigures] = useState<Figure[] | null>(null);
  const [currentFigureIndex, setCurrentFigureIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // メッセージリストの最下部に自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ルーム情報の取得
  useEffect(() => {
    if (!room_id) return;
    const getRoomData = async () => {
      const roomDocRef = doc(db, 'rooms', room_id);
      const roomSnap = await getDoc(roomDocRef);
      if (roomSnap.exists()) {
        setRoom({ id: roomSnap.id, ...roomSnap.data() } as Room);
      } else {
        console.error("Room not found");
        // ここで404ページにリダイレクトするなどの処理も可能
      }
    };
    getRoomData();
  }, [room_id]);

  // メッセージのリアルタイム取得
  useEffect(() => {
    if (!room_id) return;

    const messagesCol = collection(db, 'messages');
    const q = query(
      messagesCol,
      where('room_id', '==', room_id),
      orderBy('created_at', 'asc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const msgs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Message));
      setMessages(msgs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [room_id]);

  // メッセージの送信処理
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim()) return;

    const content = newMessage.trim();
    setNewMessage('');

    // ユーザーのメッセージをFirestoreに追加
    await addDoc(collection(db, 'messages'), {
      content: content,
      role: 'user',
      type: 'text',
      user_id: user.uid,
      room_id: room_id,
      created_at: serverTimestamp(),
    });

    // AIの返信をストリーミングで受け取る準備
    // AI応答用のプレースホルダーをUIに即時反映
    setStreamingMessage({
      id: 'ai-streaming-response',
      content: '...', // ローディングインジケーターなどを表示
      role: 'model',
      created_at: new Timestamp(Date.now() / 1000, 0), // 仮のタイムスタンプ
    });

    try {
      const projectId = "studyfellow-42d35";
      const region = "asia-northeast1";
      const functionName = "generateResponseWeb";
      const url = `https://${region}-${projectId}.cloudfunctions.net/${functionName}`;
      // const url = `http://127.0.0.1:5001/${projectId}/${region}/${functionName}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ room_id: room_id }),
      });

      if (!response.ok) {
        throw new Error('Failed to trigger AI response.');
      }
      
      if (!response.body) {
        return;
      }

      // ストリームを読み取る
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';

      // AIメッセージのプレースホルダーを空のコンテントに更新
      setStreamingMessage((prev) => (prev ? { ...prev, content: '' } : null));
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // ストリームが完了したら、ストリーミング用stateをクリア
          setStreamingMessage(null);
          break;
        }
        streamedContent += decoder.decode(value, { stream: true });
        
        // UIをストリーミングされた内容で更新
        setStreamingMessage((prev) =>
          prev ? { ...prev, content: streamedContent } : null
        );
      }

    } catch (error) {
      console.error("Error sending message or streaming AI response:", error);
      // エラー発生時にプレースホルダーをエラーメッセージに置き換える
      setStreamingMessage((prev) =>
        prev ? { ...prev, content: 'エラーが発生しました。' } : null
      );
    }
  };

  // 図のリンククリック処理
  const handleFigureLink = (figureIndex: number, figures: Figure[]) => {
    setSelectedFigures(figures);
    setCurrentFigureIndex(figureIndex);
  };

  // 図のナビゲーション
  const nextFigure = () => {
    if (selectedFigures) {
      setCurrentFigureIndex((prev) => (prev + 1) % selectedFigures.length);
    }
  };

  const prevFigure = () => {
    if (selectedFigures) {
      setCurrentFigureIndex((prev) => (prev - 1 + selectedFigures.length) % selectedFigures.length);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="flex h-screen">
      {/* 左半分：チャット画面 */}
      <div className="flex flex-col w-1/2 border-r">
        <header className="p-4 border-b">
          <h1 className="text-xl font-bold">{room?.title || 'Chat'}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="flex justify-start">
              <div 
                className={`px-4 py-2 rounded-lg max-w-lg ${
                  msg.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : msg.type === 'text_with_figures'
                      ? 'bg-green-200 text-gray-800'
                      : 'bg-gray-200 text-gray-800'
                }`}
              >
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    a: ({ href, children, ...props }) => {
                      // data-figure-index属性があるリンクの場合
                      const figureIndex = props['data-figure-index' as keyof typeof props] as string;
                      if (figureIndex !== undefined && msg.figures) {
                        return (
                          <a
                            {...props}
                            href={href}
                            className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFigureLink(parseInt(figureIndex), msg.figures!);
                            }}
                          >
                            {children}
                          </a>
                        );
                      }
                      // 通常のリンクの場合
                      return (
                        <a {...props} href={href} className="text-blue-600 hover:text-blue-800 underline">
                          {children}
                        </a>
                      );
                    },
                  } as Components}
                >
                  {msg.content}
                </ReactMarkdown>
                {msg.type === 'text_with_figures' && msg.figures && (
                  <div className="text-xs mt-2 opacity-75">
                    📊 図 {msg.figures.length}個 - 図のリンクをクリックして表示
                  </div>
                )}
              </div>
            </div>
          ))}
          {streamingMessage && (
            <div key={streamingMessage.id} className="flex justify-start">
              <div className="px-4 py-2 rounded-lg max-w-lg bg-gray-200 text-gray-800">
                <ReactMarkdown rehypePlugins={[rehypeRaw]}>{streamingMessage.content}</ReactMarkdown>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>
        <footer className="p-4 border-t">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="メッセージを入力..."
              className="flex-grow p-2 border rounded-md"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400"
            >
              送信
            </button>
          </form>
        </footer>
      </div>

      {/* 右半分：図表示エリア */}
      <div className="w-1/2 bg-gray-50">
        {selectedFigures && selectedFigures.length > 0 ? (
          <div className="h-full flex flex-col">
            <div className="flex justify-between items-center p-4 border-b bg-white">
              <h2 className="text-xl font-bold">({currentFigureIndex + 1}/{selectedFigures.length})</h2>
              <button
                onClick={() => setSelectedFigures(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {renderFigure(selectedFigures[currentFigureIndex])}
            </div>
            
            {selectedFigures.length > 1 && (
              <div className="flex justify-between items-center p-4 border-t bg-white">
                <button
                  onClick={prevFigure}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                >
                  前へ
                </button>
                <span className="text-sm text-gray-600">
                  {selectedFigures.map((_, index) => (
                    <span
                      key={index}
                      className={`inline-block w-2 h-2 rounded-full mx-1 ${
                        index === currentFigureIndex ? 'bg-blue-500' : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </span>
                <button
                  onClick={nextFigure}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                >
                  次へ
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            図を含むメッセージをクリックして表示
          </div>
        )}
      </div>
    </div>
  );
} 