/**
 * Header Component
 * 
 * 기획:
 * - 상단 고정 헤더
 * - 좌측: Nubabel 로고
 * - 중앙: 조직 전환 드롭다운 (OrganizationSwitcher)
 * - 우측: 사용자 정보 + 로그아웃 버튼
 * - 높이: 64px (4rem)
 * - 배경: 흰색, 하단 border
 * 
 * 구조:
 * Header
 * ├── Logo (좌측)
 * ├── OrganizationSwitcher (중앙)
 * └── UserMenu (우측)
 *     ├── UserAvatar + Name
 *     └── LogoutButton
 */

import OrganizationSwitcher from '../OrganizationSwitcher';

interface User {
  name: string;
  email: string;
  picture?: string;
}

interface HeaderProps {
  user?: User;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-50">
      <div className="h-full px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-indigo-600">Nubabel</h1>
        </div>

        <OrganizationSwitcher />

        {user && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">{user.name}</span>
                <span className="text-xs text-gray-500">{user.email}</span>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
