'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

export default function ProfileInitialization() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState({
    display_name: '',
    user_name: '',
  });

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // セッションの確認
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          router.push(`/error?message=${encodeURIComponent('セッションの取得に失敗しました。再度ログインしてください。')}`);
          return;
        }

        // ユーザー情報の取得
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('display_name, user_name')
          .eq('user_id', session.user.id)
          .single();

        if (userError) {
          router.push(`/error?message=${encodeURIComponent('ユーザー情報の取得に失敗しました。')}`);
          return;
        }

        if (userData) {
          setUserData({
            display_name: userData.display_name || '',
            user_name: userData.user_name || '',
          });
        }
      } catch (error) {
        console.error('Error:', error);
        router.push(`/error?message=${encodeURIComponent('予期せぬエラーが発生しました。')}`);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        router.push(`/error?message=${encodeURIComponent('セッションの取得に失敗しました。再度ログインしてください。')}`);
        return;
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({
          display_name: userData.display_name,
          user_name: userData.user_name,
        })
        .eq('user_id', session.user.id);

      if (updateError) {
        if (updateError.code === '23505') { // unique_violation
          alert('このユーザー名は既に使用されています。');
          return;
        }
        throw updateError;
      }

      router.push('/'); // 更新成功後はホームページへ
    } catch (error) {
      console.error('Error:', error);
      router.push(`/error?message=${encodeURIComponent('プロフィールの更新に失敗しました。')}`);
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            プロフィール設定
          </h1>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                表示名
              </label>
              <input
                type="text"
                id="display_name"
                value={userData.display_name}
                onChange={(e) => setUserData({ ...userData, display_name: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                placeholder="表示名を入力"
                required
              />
            </div>
            <div>
              <label htmlFor="user_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ユーザー名
              </label>
              <input
                type="text"
                id="user_name"
                value={userData.user_name}
                onChange={(e) => setUserData({ ...userData, user_name: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                placeholder="ユーザー名を入力"
                required
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                ユーザー名は一意である必要があります
              </p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
} 