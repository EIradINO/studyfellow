"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from "recharts";

// 日付ごとの勉強記録型
type StudyRecord = {
  date: string; // yyyy-mm-dd
  totalMinutes: number;
};

export default function Home() {
  const [data, setData] = useState<StudyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeeklyReport();
  }, []);

  const fetchWeeklyReport = async () => {
    setLoading(true);
    try {
      // 今日から過去6日分の日付リストを作成
      const today = new Date();
      const days = [...Array(7)].map((_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        return d.toISOString().slice(0, 10);
      });

      // 1週間分のpostsを取得
      const { data: posts, error } = await supabase
        .from("posts")
        .select("created_at, duration")
        .gte("created_at", days[0] + "T00:00:00")
        .lte("created_at", days[6] + "T23:59:59");

      if (error) throw error;

      // 日付ごとにduration合計を集計
      const daily: { [date: string]: number } = {};
      days.forEach((d) => (daily[d] = 0));
      (posts || []).forEach((post) => {
        const date = post.created_at.slice(0, 10);
        if (daily[date] !== undefined && post.duration != null) {
          daily[date] += post.duration;
        }
      });
      setData(days.map((d) => ({ date: d, totalMinutes: daily[d] })));
    } catch {
      alert("データ取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="container mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5).replace("-", "/")} />
              <YAxis label={{ value: "分", angle: -90, position: "insideLeft" }} />
              <Bar dataKey="totalMinutes" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </main>
    </div>
  );
}
