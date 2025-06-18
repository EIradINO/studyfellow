'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/auth/AuthProvider';
import { db } from '@/utils/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function NewRoomPage() {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const handleCreateRoomAndSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !message.trim()) {
      alert('メッセージを入力するか、ログインしてください。');
      return;
    }

    setIsLoading(true);

    try {
      // 1. 新しいルームを 'rooms' コレクションに作成
      const roomRef = await addDoc(collection(db, 'rooms'), {
        title: message.trim().slice(0, 30), // メッセージの先頭30文字をタイトルに
        user_id: user.uid,
        created_at: serverTimestamp(),
      });

      // 2. 最初のメッセージを 'messages' コレクションに作成
      await addDoc(collection(db, 'messages'), {
        content: message.trim(),
        role: 'user',
        type: 'text',
        user_id: user.uid,
        room_id: roomRef.id,
        created_at: serverTimestamp(),
      });

      // 3. 作成したルームページに遷移
      router.push(`/rooms/${roomRef.id}`);
    } catch (error) {
      console.error("ルームの作成に失敗しました:", error);
      alert('エラーが発生しました。もう一度お試しください。');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-6 text-center">新しいチャットを開始</h1>
        <form onSubmit={handleCreateRoomAndSendMessage} className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="最初のメッセージを入力..."
            disabled={isLoading}
            className="flex-grow p-3 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={isLoading || !message.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? '作成中...' : '送信'}
          </button>
        </form>
        {!user && <p className="text-red-500 mt-4 text-center">チャットを開始するにはログインが必要です。</p>}
      </div>
    </div>
  );
} 