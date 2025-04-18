import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <header className="container mx-auto px-6 py-8">
        <nav className="flex justify-between items-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">StudyFellow</div>
          <div className="space-x-6">
            <a href="#features" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">特徴</a>
            <a href="#pricing" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">料金</a>
            <a href="#contact" className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700">無料相談</a>
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
          <div className="space-x-4">
            <a href="#contact" className="bg-blue-600 text-white px-8 py-3 rounded-full text-lg hover:bg-blue-700">
              無料体験を始める
            </a>
            <a href="#features" className="border-2 border-blue-600 text-blue-600 px-8 py-3 rounded-full text-lg hover:bg-blue-50">
              詳しく見る
            </a>
          </div>
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
