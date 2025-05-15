'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { UserCircle } from 'lucide-react';

interface Room {
  id: string;
  title: string;
}

type UserProfile = {
  display_name: string;
  user_name: string;
  avatar_url?: string;
} | null;

export default function Navigation() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>(null);

  useEffect(() => {
    const fetchRoomsAndProfile = async () => {
      const { data: roomsData, error: roomsError } = await supabase
        .from('rooms')
        .select('id, title')
        .order('created_at', { ascending: false });
      if (!roomsError && roomsData) setRooms(roomsData);

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (session?.user) {
          const { data: profile, error: profileError } = await supabase
            .from('users')
            // 'avatar_url' を一時的にコメントアウト
            .select('display_name, user_name') 
            // .select('display_name, user_name, avatar_url') 
            .eq('user_id', session.user.id)
            .single();

          if (profileError) throw profileError;
          setUserProfile(profile);
        }
      } catch (error) {
        console.error('ユーザープロファイルの取得中にエラーが発生しました', error);
      }
    };
    fetchRoomsAndProfile();
  }, []);

  return (
    <nav className="fixed top-0 left-0 flex flex-col h-screen min-w-[240px] bg-gray-200 dark:bg-gray-800 shadow-md p-4">
      <div className="mb-6">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">StudyFellow</h1>
        </Link>
      </div>

      <div className="flex-grow flex flex-col gap-4">
        <Link href="/" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">ホーム</Link>
        <Link
          href="/rooms/new"
          className="block w-full text-center font-bold rounded-full py-3 bg-blue-600 text-white shadow hover:bg-blue-700 transition-colors text-lg"
        >
          新しいチャット
        </Link>
        <div className="mt-2 flex flex-col gap-2 overflow-y-auto">
          {rooms.map(room => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className="text-gray-800 dark:text-gray-200 truncate hover:underline"
            >
              {room.title}
            </Link>
          ))}
        </div>
        <Link
          href="/post"
          className="block w-full text-center font-bold rounded-full py-3 bg-white text-gray-900 dark:bg-gray-900 dark:text-white shadow hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-lg mt-auto"
        >
          投稿する
        </Link>
      </div>

      {userProfile && (
        <div className="mt-6 pt-4 border-t border-gray-300 dark:border-gray-700">
          <Link href={`/${userProfile.user_name}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
            {userProfile.avatar_url ? (
              <img src={userProfile.avatar_url} alt={userProfile.display_name} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <UserCircle className="w-10 h-10 text-gray-600 dark:text-gray-400" />
            )}
            <div className="flex flex-col">
              <span className="font-semibold text-gray-800 dark:text-gray-200">{userProfile.display_name}</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">@{userProfile.user_name}</span>
            </div>
          </Link>
        </div>
      )}
    </nav>
  );
} 