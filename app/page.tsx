'use client';

import Image from "next/image";
import { supabase } from '@/utils/supabase';
import { useState, useEffect } from 'react';

type UserProfile = {
  display_name: string;
  user_name: string;
} | null;

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile>(null);

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
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUserProfile(null);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <header className="container mx-auto px-6 py-8">
        <nav className="flex justify-between items-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">StudyFellow</div>
          <div className="space-x-6">
            <a href="#features" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">特徴</a>
            <a href="#pricing" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">料金</a>
            {loading ? (
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            ) : userProfile ? (
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
            ) : (
              <button
                onClick={handleGoogleLogin}
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
            )}
          </div>
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
          {!userProfile && (
            <div className="space-x-4">
              <button
                onClick={handleGoogleLogin}
                className="bg-blue-600 text-white px-8 py-3 rounded-full text-lg hover:bg-blue-700"
              >
                無料で始める
              </button>
              <a href="#features" className="border-2 border-blue-600 text-blue-600 px-8 py-3 rounded-full text-lg hover:bg-blue-50 inline-block">
                詳しく見る
              </a>
            </div>
          )}
        </section>

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
