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

// 型定義
interface Message {
  id: string;
  content: string;
  role: 'user' | 'model';
  created_at: Timestamp;
}

interface Room {
  id: string;
  title: string;
}

export default function RoomPage() {
  const { room_id } = useParams<{ room_id: string }>();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
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

    await addDoc(collection(db, 'messages'), {
      content: content,
      role: 'user',
      type: 'text',
      user_id: user.uid,
      room_id: room_id,
      created_at: serverTimestamp(),
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="p-4 border-b">
        <h1 className="text-xl font-bold">{room?.title || 'Chat'}</h1>
      </header>
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`px-4 py-2 rounded-lg max-w-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
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
  );
} 