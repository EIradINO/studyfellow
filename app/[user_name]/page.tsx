'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

type UserProfile = {
  user_id: string;
  display_name: string;
  user_name: string;
  created_at: string;
} | null;

export default function UserProfile() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCurrentUser, setIsCurrentUser] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // 現在のセッションを取得
        const { data: { session } } = await supabase.auth.getSession();
        
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('user_name', params.user_name)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            setError('ユーザーが見つかりませんでした。');
          } else {
            throw error;
          }
          return;
        }

        setProfile(data);
        // 現在のユーザーかどうかを確認
        setIsCurrentUser(session?.user?.id === data.user_id);
      } catch (error) {
        console.error('Error:', error);
        setError('プロフィールの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [params.user_name]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <div className="text-red-500 mb-6">
              <svg
                className="w-16 h-16 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {error}
            </h1>
            <button
              onClick={() => router.push('/')}
              className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700"
            >
              ホームに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="p-8">
              <div className="text-center">
                <div className="h-24 w-24 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl text-blue-600 dark:text-blue-400">
                    {profile?.display_name?.[0]?.toUpperCase()}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {profile?.display_name}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  @{profile?.user_name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  登録日: {profile?.created_at && new Date(profile.created_at).toLocaleDateString('ja-JP')}
                </p>
                {isCurrentUser && (
                  <button
                    onClick={() => router.push('/profile/edit')}
                    className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700"
                  >
                    プロフィールを編集
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 