'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Room {
  id: string;
  title: string;
}

// User profile type removed (profile functionality deleted)

export default function Navigation() {
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    const fetchRooms = async () => {
      // const { data: roomsData, error: roomsError } = await supabase
      //   .from('rooms')
      //   .select('id, title')
      //   .order('created_at', { ascending: false });
      // if (!roomsError && roomsData) setRooms(roomsData);
    };
    fetchRooms();
  }, []);

  return (
    <nav className="fixed top-0 left-0 flex flex-col h-screen min-w-[240px] bg-gray-200 dark:bg-gray-800 shadow-md p-4">
      <div className="mb-6">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">StudyFellow</h1>
        </Link>
      </div>

      <div className="flex-grow flex flex-col gap-4">
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
          href="/rooms/new"
          className="block w-full text-center font-bold rounded-full py-3 bg-blue-600 text-white shadow hover:bg-blue-700 transition-colors text-lg"
        >
          質問する
        </Link>

      </div>


    </nav>
  );
} 