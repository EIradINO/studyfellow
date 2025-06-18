'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/auth/AuthProvider';
import { db } from '@/utils/firebase';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import Image from 'next/image';

interface Room {
  id: string;
  title: string;
}

interface UserData {
  display_name: string;
  photo_url: string;
  user_name: string;
}

const ChevronIcon = ({ isCollapsed }: { isCollapsed: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`transition-transform duration-300 ${
      isCollapsed ? 'rotate-180' : ''
    }`}
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const NewChatIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default function Navigation() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    if (user) {
      const roomsCollection = collection(db, 'rooms');
      const q = query(
        roomsCollection,
        where('user_id', '==', user.uid),
        orderBy('created_at', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const userRooms = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Room[];
        setRooms(userRooms);
      });
      return () => unsubscribe();
    } else {
      setRooms([]);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      const fetchUserData = async () => {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUserData(userDocSnap.data() as UserData);
        } else {
          console.log('No such document!');
        }
      };
      fetchUserData();
    }
  }, [user]);

  return (
    <nav
      className={`fixed top-0 left-0 flex h-screen flex-col bg-gray-200 p-4 shadow-md transition-all duration-300 ease-in-out dark:bg-gray-800 ${
        isCollapsed ? 'w-[80px]' : 'w-[240px]'
      }`}
    >
      <div className="mb-6">
        <Link
          href="/"
          className={`transition-opacity hover:opacity-80 ${
            isCollapsed ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            StudyFellow
          </h1>
        </Link>
      </div>

      <div className="flex flex-grow flex-col gap-4">
        <div className="mt-2 flex flex-col gap-1 overflow-y-auto max-h-[500px]">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className="flex items-center rounded-md p-2 text-gray-800 hover:bg-gray-300 dark:text-gray-200 dark:hover:bg-gray-700"
              title={room.title}
            >
              <span className="truncate">{room.title}</span>
            </Link>
          ))}
        </div>
        <Link
          href="/rooms/new"
          className={`flex items-center justify-center font-bold text-white shadow transition-all duration-300 ease-in-out hover:bg-blue-700 ${
            isCollapsed
              ? 'h-12 w-12 self-center rounded-full bg-blue-600'
              : 'w-full rounded-full bg-blue-600 py-3 text-lg'
          }`}
          title="質問する"
        >
          {isCollapsed ? <NewChatIcon /> : '質問する'}
        </Link>
      </div>

      <div className="mt-4 flex flex-col gap-4 border-t border-gray-300 pt-4 dark:border-gray-700">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-center rounded-md p-2 hover:bg-gray-300 dark:hover:bg-gray-700"
          title={isCollapsed ? '展開' : '折りたたむ'}
        >
          <ChevronIcon isCollapsed={isCollapsed} />
        </button>

        {user && userData && (
          <div className="flex items-center gap-3">
            <Image
              src={userData.photo_url}
              alt={userData.display_name}
              width={40}
              height={40}
              className="rounded-full"
            />
            <div
              className={`flex flex-col transition-opacity ${
                isCollapsed ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {userData.display_name}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                @{userData.user_name}
              </span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
} 