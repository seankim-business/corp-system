/**
 * OrganizationSwitcher Component
 * 
 * 기획:
 * - 현재 조직 표시 버튼
 * - 클릭 시 드롭다운 메뉴
 * - 조직 목록 표시 (사용자가 속한 모든 조직)
 * - 조직 선택 → POST /auth/switch-org → 페이지 리로드
 * 
 * 구조:
 * OrganizationSwitcher
 * ├── CurrentOrgButton (클릭 가능)
 * │   ├── OrgName
 * │   └── DownArrow
 * └── Dropdown (isOpen일 때만 표시)
 *     └── OrgList
 *         └── OrgItem (각 조직)
 * 
 * 상태:
 * - 드롭다운 열림/닫힘
 * - 현재 조직 하이라이트
 */

import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';

export default function OrganizationSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const { currentOrganization, organizations, switchOrganization } = useAuthStore();

  if (!currentOrganization || organizations.length <= 1) {
    return null;
  }

  const handleSwitch = async (orgId: string) => {
    setIsOpen(false);
    await switchOrganization(orgId);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
      >
        <span className="text-sm font-medium text-gray-900">
          {currentOrganization.name}
        </span>
        <svg
          className={`w-4 h-4 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                Switch Organization
              </div>
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSwitch(org.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    org.id === currentOrganization.id
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <div className="font-medium">{org.name}</div>
                  <div className="text-xs text-gray-500">{org.domain}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
