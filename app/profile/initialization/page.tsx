'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabase';

const SUBJECTS = {
  liberal: {
    name: '文系科目',
    subjects: [
      { name: '現代文', fields: ['評論', '小説', '随筆', '詩歌'] },
      { name: '古文', fields: ['文法', '読解 (物語・説話・日記・随筆など)', '和歌', '文学史'] },
      { name: '漢文', fields: ['句法 (訓読・書き下し文)', '読解 (思想・歴史・詩など)', '漢詩'] },
      { name: '英語', fields: ['長文読解', '文法・語法', '英作文', 'リスニング', 'コミュニケーション (スピーキング含む)'] },
      { name: '地理', fields: ['自然環境 (地形・気候など)', '資源と産業', '人口と都市・村落', '生活文化', '地誌 (各地域)', '地図と地理情報システム'] },
      { name: '地理総合', fields: ['地図と地理情報システム', '国際理解と国際協力', '持続可能な地域づくりと私たち', '自然環境と防災'] },
      { name: '歴史', fields: ['時代区分ごとの通史', 'テーマ史 (政治史・経済史・社会史・文化史など)'] },
      { name: '歴史総合', fields: ['近代化と私たち', '国際秩序の変化や大衆化と私たち', 'グローバル化と私たち'] },
      { name: '世界史', fields: ['先史・古代オリエント', 'ギリシア・ローマ', 'アジア諸地域の形成と発展', 'イスラーム世界の形成と発展', 'ヨーロッパ世界の形成と発展', 'アジア諸地域の変動', '欧米諸国の発展と国際秩序の変化', '二つの世界大戦', '冷戦と現代の世界'] },
      { name: '日本史', fields: ['原始・古代', '中世', '近世', '近代', '現代'] },
      { name: '現代社会', fields: ['青年期と自己の課題', '現代社会の特質と課題', '現代の民主政治と政治参加', '現代の経済社会と経済活動', '国際社会の動向と日本の役割'] },
      { name: '公共', fields: ['公共的な空間における人間と社会', '法や政治・経済の仕組みと役割', '現代の諸課題の探究'] },
      { name: '倫理', fields: ['源流思想 (ギリシア思想・諸子百家など)', '宗教 (仏教・キリスト教・イスラーム教など)', '日本の思想', '近現代の西洋思想', '現代の諸課題と倫理'] },
      { name: '政治・経済', fields: ['民主政治の基本原理', '日本国憲法と人権', '現代の政治機構', '国際政治', '市場経済のしくみ', '国民経済と政府の役割', '労働問題と社会保障', '国際経済'] },
      { name: '情報', fields: ['情報社会の問題解決', 'コミュニケーションと情報デザイン', 'コンピュータとプログラミング', '情報通信ネットワークとデータの活用', '情報システムとデータサイエンス (情報Ⅱ)', '情報セキュリティ'] },
    ]
  },
  science: {
    name: '理系科目',
    subjects: [
      { name: '数学Ⅰ', fields: ['数と式', '図形と計量', '二次関数', 'データの分析'] },
      { name: '数学A', fields: ['場合の数と確率', '図形の性質', '整数の性質 (または 数学と人間の活動)'] },
      { name: '数学Ⅱ', fields: ['いろいろな式 (式と証明・複素数と方程式)', '図形と方程式', '指数関数・対数関数', '三角関数', '微分法・積分法の考え'] },
      { name: '数学B', fields: ['数列', '統計的な推測', 'ベクトル (または 数学と社会生活)'] },
      { name: '数学Ⅲ', fields: ['極限', '微分法', '積分法', '複素数平面', '式と曲線'] },
      { name: '数学C', fields: ['ベクトル', '平面上の曲線と複素数平面', '数学的な表現の工夫 (行列などを含む場合あり)', '統計的な推測 (発展)'] },
      { name: '物理', fields: ['力学 (運動とエネルギー・円運動と単振動・万有引力)', '熱力学', '波動 (波の性質・音・光)', '電磁気学 (電場と電位・電流と磁場・電磁誘導・交流)', '原子'] },
      { name: '物理基礎', fields: ['運動とエネルギー', '様々な物理現象とエネルギーの利用 (熱・波・電気)'] },
      { name: '化学', fields: ['物質の状態と平衡', '物質の変化と平衡', '無機物質の性質と利用', '有機化合物の性質と利用', '高分子化合物の性質と利用'] },
      { name: '化学基礎', fields: ['化学と人間生活', '物質の構成', '物質の変化'] },
      { name: '生物', fields: ['生命現象と物質 (細胞・代謝・遺伝情報)', '生殖と発生', '生物の環境応答', '生態と環境', '生物の進化と系統'] },
      { name: '生物基礎', fields: ['生物の多様性と共通性', '生命現象と物質 (遺伝情報とその発現)', '生物の体内環境の維持', '植生の多様性と生態系'] },
      { name: '地学', fields: ['宇宙の構造と進化', '地球の活動と変動', '地球の環境と歴史', '日本の自然と防災'] },
      { name: '地学基礎', fields: ['宇宙の構造', '地球の構成と活動', '大気と海洋の構造と運動', '自然環境の成り立ちと人間生活'] },
    ]
  }
};

export default function ProfileInitialization() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [_saving, _setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [userData, setUserData] = useState({
    display_name: '',
    user_name: '',
  });
  const [selectedSubjects, setSelectedSubjects] = useState<{ [key: string]: boolean }>({});
  const [subjectComments, setSubjectComments] = useState<{ [key: string]: string }>({});
  const [subjectComprehensions, setSubjectComprehensions] = useState<{ [key: string]: number }>({});
  const [fieldComprehensions, setFieldComprehensions] = useState<{ [key: string]: { [field: string]: number } }>({});
  const [fieldComments, setFieldComments] = useState<{ [key: string]: { [field: string]: string } }>({});
  const [currentSubjectIndex, setCurrentSubjectIndex] = useState(0);
  const [expandedFields, setExpandedFields] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          router.push(`/error?message=${encodeURIComponent('セッションの取得に失敗しました。再度ログインしてください。')}`);
          return;
        }

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

  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubjects(prev => ({
      ...prev,
      [subjectId]: !prev[subjectId]
    }));
  };

  const handleCommentChange = (subjectId: string, comment: string) => {
    setSubjectComments(prev => ({
      ...prev,
      [subjectId]: comment
    }));
  };

  const handleComprehensionChange = (subjectId: string, value: number) => {
    setSubjectComprehensions(prev => ({
      ...prev,
      [subjectId]: value
    }));
  };

  const handleFieldComprehensionChange = (subjectName: string, field: string, value: number) => {
    setFieldComprehensions(prev => ({
      ...prev,
      [subjectName]: {
        ...prev[subjectName],
        [field]: value
      }
    }));
  };

  const handleFieldCommentChange = (subjectName: string, field: string, comment: string) => {
    setFieldComments(prev => ({
      ...prev,
      [subjectName]: {
        ...prev[subjectName],
        [field]: comment
      }
    }));
  };

  const handleNextSubject = () => {
    const selectedSubjectNames = Object.entries(selectedSubjects)
      .filter(([, selected]) => selected)
      .map(([name]) => name);
    
    if (currentSubjectIndex < selectedSubjectNames.length - 1) {
      setCurrentSubjectIndex(prev => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrevSubject = () => {
    if (currentSubjectIndex > 0) {
      setCurrentSubjectIndex(prev => prev - 1);
    } else {
      setStep(1);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      _setSaving(true);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        router.push(`/error?message=${encodeURIComponent('セッションの取得に失敗しました。再度ログインしてください。')}`);
        return;
      }

      // ユーザー情報の更新
      const { error: updateError } = await supabase
        .from('users')
        .update({
          display_name: userData.display_name,
          user_name: userData.user_name,
        })
        .eq('user_id', session.user.id);

      if (updateError) {
        if (updateError.code === '23505') {
          alert('このユーザー名は既に使用されています。');
          return;
        }
        throw updateError;
      }

      // 選択された科目の設定データを挿入
      const selectedSubjectNames = Object.entries(selectedSubjects)
        .filter(([, selected]) => selected)
        .map(([name]) => name);

      for (const subjectName of selectedSubjectNames) {
        // 科目の設定を挿入
        const { data: insertedSetting, error: settingError } = await supabase
          .from('user_chat_settings')
          .insert({
            user_id: session.user.id,
            subject: subjectName,
            level: subjectComprehensions[subjectName] ?? 1,
            explanation: subjectComments[subjectName] || ''
          })
          .select()
          .single();

        if (settingError) {
          throw settingError;
        }

        // 分野ごとの設定を挿入
        const category = Object.values(SUBJECTS).find(cat => cat.subjects.some(s => s.name === subjectName));
        const subjectObj = category?.subjects.find(s => s.name === subjectName);
        if (subjectObj && subjectObj.fields) {
          const subSettingsData = subjectObj.fields.map(field => ({
            setting_id: insertedSetting.id,
            field: field,
            level: fieldComprehensions[subjectName]?.[field] ?? 1,
            explanation: fieldComments[subjectName]?.[field] || ''
          }));

          const { error: subError } = await supabase
            .from('user_chat_settings_sub')
            .insert(subSettingsData);

          if (subError) {
            throw subError;
          }
        }
      }

      router.push('/');
    } catch (error) {
      console.error('Error:', error);
      router.push(`/error?message=${encodeURIComponent('プロフィールの更新に失敗しました。')}`);
    } finally {
      _setSaving(false);
    }
  };

  const toggleFieldExpansion = (subjectName: string, field: string) => {
    const key = `${subjectName}-${field}`;
    setExpandedFields(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
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
        <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            プロフィール設定
          </h1>
          <form onSubmit={handleSubmit} className="space-y-6">
            {step === 1 ? (
              <>
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
                <div>
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">科目選択</h2>
                  {Object.entries(SUBJECTS).map(([category, { name, subjects }]) => (
                    <div key={category} className="mb-6">
                      <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-3">{name}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {subjects.map(({ name }) => (
                          <label key={name} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={selectedSubjects[name] || false}
                              onChange={() => handleSubjectChange(name)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700"
                >
                  次へ
                </button>
              </>
            ) : (
              <>
                {(() => {
                  const selectedSubjectNames = Object.entries(selectedSubjects)
                    .filter(([, selected]) => selected)
                    .map(([name]) => name);
                  const currentSubject = selectedSubjectNames[currentSubjectIndex];
                  const category = Object.values(SUBJECTS).find(cat => cat.subjects.some(s => s.name === currentSubject));
                  const subjectObj = category?.subjects.find(s => s.name === currentSubject);

                  return (
                    <div>
                      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                        {currentSubject}の設定
                      </h2>
                      
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          総合的な理解度
                        </label>
                        <div className="flex items-center space-x-4">
                          <input
                            type="range"
                            min={1}
                            max={5}
                            step={1}
                            value={subjectComprehensions[currentSubject] ?? 1}
                            onChange={e => handleComprehensionChange(currentSubject, Number(e.target.value))}
                            className="w-2/3"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300 w-10 text-center">
                            {subjectComprehensions[currentSubject] ?? 1}
                          </span>
                        </div>
                        <textarea
                          value={subjectComments[currentSubject] || ''}
                          onChange={(e) => handleCommentChange(currentSubject, e.target.value)}
                          className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                          placeholder="この科目についてのコメントを入力（任意）"
                          rows={2}
                        />
                      </div>

                      <div className="mb-6">
                        <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-3">
                          分野ごとの理解度
                        </h3>
                        {subjectObj?.fields.map(field => (
                          <div key={field} className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <button
                              type="button"
                              onClick={() => toggleFieldExpansion(currentSubject, field)}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{field}</span>
                              <svg
                                className={`w-5 h-5 text-gray-500 transform transition-transform ${
                                  expandedFields[`${currentSubject}-${field}`] ? 'rotate-180' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {expandedFields[`${currentSubject}-${field}`] && (
                              <div className="px-4 pb-4">
                                <div className="flex items-center space-x-4">
                                  <input
                                    type="range"
                                    min={1}
                                    max={5}
                                    step={1}
                                    value={fieldComprehensions[currentSubject]?.[field] ?? 1}
                                    onChange={e => handleFieldComprehensionChange(currentSubject, field, Number(e.target.value))}
                                    className="w-2/3"
                                  />
                                  <span className="text-sm text-gray-700 dark:text-gray-300 w-10 text-center">
                                    {fieldComprehensions[currentSubject]?.[field] ?? 1}
                                  </span>
                                </div>
                                <textarea
                                  value={fieldComments[currentSubject]?.[field] || ''}
                                  onChange={(e) => handleFieldCommentChange(currentSubject, field, e.target.value)}
                                  className="mt-2 w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                                  placeholder="この分野についてのコメントを入力（任意）"
                                  rows={2}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex space-x-4">
                        <button
                          type="button"
                          onClick={handlePrevSubject}
                          className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-full hover:bg-gray-700 disabled:opacity-50"
                          disabled={_saving}
                        >
                          戻る
                        </button>
                        <button
                          type="button"
                          onClick={handleNextSubject}
                          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50"
                          disabled={_saving}
                        >
                          {currentSubjectIndex < selectedSubjectNames.length - 1 ? '次の科目へ' : '保存'}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
} 