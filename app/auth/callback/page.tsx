'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error:', error);
          router.push(`/error?message=${encodeURIComponent('認証に失敗しました。もう一度お試しください。')}`);
          return;
        }

        if (!session) {
          router.push(`/error?message=${encodeURIComponent('セッションの取得に失敗しました。')}`);
          return;
        }

        // ユーザーのメタデータから新規ユーザーかどうかを判定
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          router.push(`/error?message=${encodeURIComponent('ユーザー情報の確認に失敗しました。')}`);
          return;
        }

        if (!user.created_at || !user.last_sign_in_at) {
          router.push(`/error?message=${encodeURIComponent('ユーザー情報が不完全です。')}`);
          return;
        }

        // created_atとlast_sign_in_atが同じ（数秒以内）なら新規ユーザー
        const createdAt = new Date(user.created_at).getTime();
        const lastSignInAt = new Date(user.last_sign_in_at).getTime();
        const isNewUser = Math.abs(createdAt - lastSignInAt) < 5000; // 5秒以内なら新規ユーザー

        if (isNewUser) {
          router.push('/profile/initialization');
        } else {
          router.push('/');
        }
      } catch (error) {
        console.error('Error:', error);
        router.push(`/error?message=${encodeURIComponent('予期せぬエラーが発生しました。')}`);
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">認証中...</p>
      </div>
    </div>
  );
} 