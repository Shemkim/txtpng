'use client';

import { useState, useEffect, useMemo } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { isAdmin } from '@/lib/admin';
import { useRouter } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';

interface UserLog {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  lastLogin?: Timestamp | Date | null;
  loginCount?: number;
  createdAt?: Timestamp | Date | null;
}

const parseDateValue = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'object') {
    const maybeTimestamp = value as { seconds?: number; nanoseconds?: number };
    if (typeof maybeTimestamp?.seconds === 'number') {
      const milliseconds = maybeTimestamp.seconds * 1000 + (maybeTimestamp.nanoseconds ?? 0) / 1_000_000;
      return new Date(milliseconds);
    }
  }

  return null;
};

const formatKoreanDateTime = (value: unknown): string => {
  const date = parseDateValue(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserLog[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      // 관리자가 아니면 메인 페이지로 리다이렉트
      if (currentUser && !isAdmin(currentUser.email)) {
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user || !isAdmin(user.email)) {
      setUsers([]);
      return;
    }

    const usersQuery = query(collection(db, 'users'), orderBy('lastLogin', 'desc'));
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const mappedUsers = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            uid: docSnap.id,
            email: typeof data.email === 'string' ? data.email : '',
            displayName:
              typeof data.displayName === 'string'
                ? data.displayName
                : typeof data.name === 'string'
                  ? data.name
                  : 'Unknown',
            photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
            lastLogin: data.lastLogin ?? null,
            loginCount: typeof data.loginCount === 'number' ? data.loginCount : 0,
            createdAt: data.createdAt ?? null,
          } satisfies UserLog;
        });

        setUsers(mappedUsers);
        setErrorMessage(null);
      },
      (error) => {
        console.error('사용자 목록 구독 실패:', error);

        if (error instanceof FirebaseError && error.code === 'permission-denied') {
          setErrorMessage(
            'Firestore 사용자 데이터를 가져올 권한이 없습니다. Firestore 보안 규칙에서 관리자 계정을 허용하도록 설정해주세요.'
          );
        } else {
          setErrorMessage('사용자 목록을 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
        }

        setUsers([]);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const totalUsers = users.length;

  const todayVisitors = useMemo(() => {
    const now = new Date();
    return users.reduce((count, current) => {
      const loginDate = parseDateValue(current.lastLogin);
      if (!loginDate) {
        return count;
      }

      const isSameDay =
        loginDate.getFullYear() === now.getFullYear() &&
        loginDate.getMonth() === now.getMonth() &&
        loginDate.getDate() === now.getDate();

      return isSameDay ? count + 1 : count;
    }, 0);
  }, [users]);

  const totalLogins = useMemo(() => {
    return users.reduce((sum, current) => sum + (current.loginCount ?? 0), 0);
  }, [users]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-2xl text-indigo-900">로딩 중...</div>
      </div>
    );
  }

  if (!user || !isAdmin(user.email)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-2xl p-12 max-w-md w-full text-center">
          <h1 className="text-4xl font-bold mb-6 text-red-600">접근 거부</h1>
          <p className="text-gray-600 mb-8">관리자 권한이 필요합니다.</p>
          <button
            onClick={() => router.push('/')}
            className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition"
          >
            메인으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <img src="/logo.svg" alt="TP Logo" className="h-10" />
            <h1 className="text-4xl font-bold text-indigo-900">관리자 대시보드</h1>
          </div>
          <button
            onClick={() => router.push('/')}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            메인으로
          </button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-gray-500 text-sm font-semibold mb-2">총 사용자</h3>
            <p className="text-4xl font-bold text-indigo-600">{totalUsers}</p>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-gray-500 text-sm font-semibold mb-2">오늘 방문자</h3>
            <p className="text-4xl font-bold text-green-600">{todayVisitors}</p>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-gray-500 text-sm font-semibold mb-2">총 로그인</h3>
            <p className="text-4xl font-bold text-blue-600">
              {totalLogins}
            </p>
          </div>
        </div>

        {/* 사용자 목록 */}
        <div className="bg-white rounded-lg shadow-xl p-6">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800">사용자 목록</h2>
          {errorMessage && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 text-gray-600 font-semibold">프로필</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-semibold">이름</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-semibold">이메일</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-semibold">마지막 로그인</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-semibold">로그인 횟수</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-semibold">권한</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-500">
                      아직 수집된 사용자 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isUserAdmin = isAdmin(u.email);
                    return (
                      <tr key={u.uid} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <img
                            src={u.photoURL || '/logo.svg'}
                            alt={u.displayName || '사용자 프로필'}
                            className="w-10 h-10 rounded-full object-cover border border-gray-200"
                            onError={(event) => {
                              event.currentTarget.onerror = null;
                              event.currentTarget.src = '/logo.svg';
                            }}
                          />
                        </td>
                        <td className="py-3 px-4 text-gray-800 font-medium">{u.displayName || '이름 없음'}</td>
                        <td className="py-3 px-4 text-gray-600">{u.email}</td>
                        <td className="py-3 px-4 text-gray-600">{formatKoreanDateTime(u.lastLogin)}</td>
                        <td className="py-3 px-4 text-gray-600 text-center">{u.loginCount ?? 0}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              isUserAdmin ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {isUserAdmin ? '관리자' : '일반 사용자'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 시스템 정보 */}
        <div className="mt-8 bg-white rounded-lg shadow-xl p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">시스템 정보</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border-l-4 border-indigo-500 pl-4">
              <p className="text-gray-500 text-sm">Firebase 프로젝트</p>
              <p className="text-gray-800 font-semibold">txt-png</p>
            </div>
            <div className="border-l-4 border-green-500 pl-4">
              <p className="text-gray-500 text-sm">호스팅 URL</p>
              <p className="text-gray-800 font-semibold">txt-png.web.app</p>
            </div>
            <div className="border-l-4 border-blue-500 pl-4">
              <p className="text-gray-500 text-sm">인증 방식</p>
              <p className="text-gray-800 font-semibold">Google OAuth</p>
            </div>
            <div className="border-l-4 border-purple-500 pl-4">
              <p className="text-gray-500 text-sm">배포 상태</p>
              <p className="text-green-600 font-semibold">✓ 활성</p>
            </div>
          </div>
        </div>
      </div>
      <footer className="text-center py-6 text-gray-600">
        © 2025 CGN AI Innovation Team. All rights reserved.
      </footer>
    </div>
  );
}
