import React from 'react';

type UserProfile = {
  display_name: string;
  user_name: string;
} | null;

interface HeaderProps {
  userProfile: UserProfile;
  handleLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ userProfile, handleLogout }) => {
  if (!userProfile) return null;
  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm">
      <div className="container mx-auto px-6 py-4">
        <nav className="flex justify-between items-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">StudyFellow</div>
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
        </nav>
      </div>
    </header>
  );
};

export default Header; 