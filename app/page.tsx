'use client';

import { useState, useEffect, useRef } from 'react';
import { auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { isAdmin } from '@/lib/admin';
import { useRouter } from 'next/navigation';
import { syncUserProfile } from '@/lib/userProfile';

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [authInProgress, setAuthInProgress] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [settings, setSettings] = useState({
    contentFontSize: 62,
    numberFontSize: 41,
    numberContentSpacing: 55,
    lineSpacing: 70,
  });
  const lastTrackedUserRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      lastTrackedUserRef.current = null;
      return;
    }

    if (lastTrackedUserRef.current === user.uid) {
      return;
    }

    lastTrackedUserRef.current = user.uid;

    syncUserProfile(user).catch((error) => {
      console.error('사용자 정보 업데이트 실패:', error);
    });
  }, [user]);

  const handleGoogleLogin = async () => {
    if (authInProgress) {
      console.debug('로그인 요청이 이미 진행 중입니다.');
      return;
    }

    setAuthInProgress(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const firebaseError = error as { code?: string };

      if (firebaseError?.code === 'auth/cancelled-popup-request') {
        console.warn('동일한 로그인 요청이 감지되어 팝업이 취소되었습니다.');
      } else {
        console.error('로그인 에러:', error);
        alert('로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setAuthInProgress(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('로그아웃 에러:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const processFile = async () => {
    if (!file) return;

    setProcessing(true);
    setImages([]);

    try {
      const text = await file.text();
      const sections = text.split(/[-]{20,}/).filter(s => s.trim());

      const generatedImages: string[] = [];

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const imageData = await generateImage(section, i + 1, settings);
        generatedImages.push(imageData);
      }

      setImages(generatedImages);
    } catch (error) {
      console.error('처리 중 오류:', error);
      alert('파일 처리 중 오류가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const generateImage = async (section: string, index: number, currentSettings: typeof settings): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d')!;

      // 투명 배경
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 폰트 설정
      ctx.textBaseline = 'top';

      // 텍스트 처리
      const lines = section.split('\n').filter(l => l.trim());
      const wrappedLines: string[] = [];
      lines.forEach(line => {
        if (line.trim()) {
          const words = line.split('');
          let currentLine = '';
          words.forEach(char => {
            const testLine = currentLine + char;
            if (testLine.length > 25) {
              wrappedLines.push(currentLine);
              currentLine = char;
            } else {
              currentLine = testLine;
            }
          });
          if (currentLine) wrappedLines.push(currentLine);
        }
      });

      // 제목과 내용 분리
      let title = '';
      const contentLines: string[] = [];
      wrappedLines.forEach(line => {
        if (line.includes('창세기 1장') && line.includes('절')) {
          title = line.replace('창세기 1장 ', '').replace('절', '').trim();
        } else if (line.trim()) {
          contentLines.push(line.trim());
        }
      });

      // 절 번호 그리기
      let yPos = 200;
      if (title) {
        const xPos = 190;
        ctx.font = `${currentSettings.numberFontSize}px Arial`;

        // 흰색 테두리
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 6;
        ctx.strokeText(title, xPos, yPos);

        // 검은색 본문
        ctx.fillStyle = 'black';
        for (let i = 0; i < 5; i++) {
          ctx.fillText(title, xPos, yPos);
        }
      }

      // 내용 그리기
      yPos = 200 + currentSettings.numberContentSpacing;
      contentLines.forEach(line => {
        const xPos = 190;
        ctx.font = `${currentSettings.contentFontSize}px Arial`;

        // 흰색 테두리
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 6;
        ctx.strokeText(line, xPos, yPos);

        // 검은색 본문
        ctx.fillStyle = 'black';
        for (let i = 0; i < 5; i++) {
          ctx.fillText(line, xPos, yPos);
        }

        yPos += currentSettings.lineSpacing;
      });

      resolve(canvas.toDataURL('image/png'));
    });
  };

  const downloadImage = (imageData: string, index: number) => {
    const link = document.createElement('a');
    link.download = `${String(index).padStart(2, '0')}.png`;
    link.href = imageData;
    link.click();
  };

  const downloadAll = () => {
    images.forEach((img, idx) => {
      setTimeout(() => downloadImage(img, idx + 1), idx * 100);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-2xl text-indigo-900">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
        <div className="bg-white rounded-lg shadow-2xl p-12 max-w-md w-full text-center">
          <h1 className="text-4xl font-bold mb-6 text-indigo-900">
            성경 자막 이미지 생성기
          </h1>
          <p className="text-gray-600 mb-8">
            서비스를 이용하려면 로그인이 필요합니다
          </p>
          <button
            onClick={handleGoogleLogin}
            disabled={authInProgress}
            className={`w-full border-2 border-gray-300 py-3 px-6 rounded-lg font-semibold transition flex items-center justify-center gap-3 ${
              authInProgress
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {authInProgress ? '로그인 중...' : 'Google로 로그인'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <img src="/logo.svg" alt="TP Logo" className="h-10" />
            <h1 className="text-4xl font-bold text-indigo-900">
              성경 자막 이미지 생성기
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg">
              <img src={user.photoURL || ''} alt="profile" className="w-8 h-8 rounded-full" />
              <span className="text-gray-700">{user.displayName}</span>
            </div>
            {isAdmin(user.email) && (
              <button
                onClick={() => router.push('/admin')}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                관리자 대시보드
              </button>
            )}
            <button
              onClick={handleLogout}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition"
            >
              로그아웃
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">설정</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                내용 글자 크기
              </label>
              <input
                type="number"
                value={settings.contentFontSize}
                onChange={(e) => setSettings({ ...settings, contentFontSize: parseInt(e.target.value) || 62 })}
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 text-lg font-semibold text-gray-700 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                숫자 크기
              </label>
              <input
                type="number"
                value={settings.numberFontSize}
                onChange={(e) => setSettings({ ...settings, numberFontSize: parseInt(e.target.value) || 41 })}
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 text-lg font-semibold text-gray-700 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                숫자-내용 간격
              </label>
              <input
                type="number"
                value={settings.numberContentSpacing}
                onChange={(e) => setSettings({ ...settings, numberContentSpacing: parseInt(e.target.value) || 55 })}
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 text-lg font-semibold text-gray-700 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                줄 간격
              </label>
              <input
                type="number"
                value={settings.lineSpacing}
                onChange={(e) => setSettings({ ...settings, lineSpacing: parseInt(e.target.value) || 70 })}
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 text-lg font-semibold text-gray-700 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".txt"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer inline-block bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition"
            >
              텍스트 파일 선택
            </label>
            {file && <p className="mt-4 text-gray-600">선택된 파일: {file.name}</p>}

            <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4 text-left">
              <p className="text-sm font-semibold text-gray-700 mb-2">📝 텍스트 파일 형식 예시:</p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">
{`창세기 1장 1절
태초에 하나님이
하늘과 땅을 창조하셨습니다.
--------------------
창세기 1장 2절
땅은 형태가 없고 비어 있었으며
어둠이 깊은 물 위에 있었고
하나님의 영은 수면 위에
움직이고 계셨습니다.
--------------------`}
              </pre>
              <p className="text-xs text-gray-500 mt-2">💡 각 절은 20개 이상의 하이픈(-)으로 구분합니다</p>
            </div>
          </div>

          <button
            onClick={processFile}
            disabled={!file || processing}
            className="mt-6 w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {processing ? '처리 중...' : '이미지 생성'}
          </button>
        </div>

        {images.length > 0 && (
          <div className="bg-white rounded-lg shadow-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-800">
                생성된 이미지 ({images.length}개)
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={processFile}
                  disabled={processing}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition disabled:bg-gray-400"
                >
                  재생성
                </button>
                <button
                  onClick={downloadAll}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  전체 다운로드
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {images.map((img, idx) => (
                <div key={idx} className="border rounded-lg overflow-hidden">
                  <img src={img} alt={`절 ${idx + 1}`} className="w-full" />
                  <button
                    onClick={() => downloadImage(img, idx + 1)}
                    className="w-full bg-indigo-600 text-white py-2 hover:bg-indigo-700 transition"
                  >
                    다운로드
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <footer className="text-center py-6 text-gray-600">
        © 2025 CGN AI Innovation Team. All rights reserved.
      </footer>
    </div>
  );
}
