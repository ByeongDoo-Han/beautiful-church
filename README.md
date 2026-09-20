# 아름다운 교회 · 예배 운영 MVP

Next.js + TypeScript 기반의 실행 가능한 예배 콘솔입니다. 기존 Vercel Hobby 설계를 바탕으로 실제 브라우저 렌더링, 운영자 콘솔, 출력창 동기화와 오프라인 동작을 구현했습니다.

## 빠른 실행

```sh
git clone https://github.com/ByeongDoo-Han/beautiful-church.git
cd beautiful-church
```

Node.js 22.13 이상을 사용합니다. 의존성 버전은 `package-lock.json`에 고정되어 있습니다.

```sh
npm ci
npm run dev
```

브라우저에서 [운영자 콘솔](http://127.0.0.1:3000/admin)을 엽니다. 환경변수가 없으면 **로컬 파일 모드**로 시작하며 서버 인증을 우회하지 않습니다. 샘플 PPTX 3장, PDF 3쪽, 직접 생성한 18초 테스트 음원이 포함되어 있습니다. 실제 찬양 음원은 사용자가 불러옵니다.

오프라인까지 시험할 때는 개발 서버 대신 아래 명령을 사용합니다.

```sh
npm run build
npm start -- --port 3100
```

[프로덕션 모드 콘솔](http://127.0.0.1:3100/admin)에서 **예배 자료 다운로드**를 누르고 완료 안내를 확인하세요. 그다음 인터넷을 끊고 새로고침하거나 출력창을 다시 열어 검증할 수 있습니다. `npm run build`는 PDF.js Worker/폰트/CMap/WASM과 Next.js 정적 파일의 캐시 목록도 생성합니다.

## 예배 진행

1. **예배 순서 · 자료 편집**에서 PPTX, PDF, MP3를 불러옵니다. 파일은 SHA-256 ID로 이 PC의 IndexedDB에 저장됩니다. 같은 파일은 재사용합니다.
2. 각 순서에 MP3, 프레젠테이션, 필요하면 대체 PDF를 연결합니다. 제목과 순서를 수정할 수 있습니다. 곡 선택 시 이전 곡은 정지하며 다음 곡을 자동 재생하지 않습니다.
3. **예배 자료 다운로드**로 필요한 모든 음원/슬라이드/대체 PDF 및 앱 파일을 준비합니다. 온라인에서 한 번 완료해야 오프라인 재실행이 가능합니다.
4. 지원 브라우저에서는 **두 번째 화면 자동 선택**을 눌러 화면 접근 권한을 허용합니다. 현재 운영자 화면과 다른 외부 화면을 우선 선택하며, 직접 화면을 선택할 수도 있습니다.
5. **출력창 열기**를 누릅니다. 선택한 화면이 있으면 해당 좌표에 배치를 요청합니다. 미지원·권한 거절·단일 화면이면 출력창을 직접 이동합니다. 팝업 차단 시 허용 후 같은 버튼을 다시 누릅니다.
6. 출력창의 **전체화면 시작** 또는 콘솔의 **전체화면 요청**을 누릅니다. 거절되면 출력창에서 직접 클릭합니다. 전체화면 중에는 슬라이드만 보이고 제어 안내가 사라집니다.
7. 콘솔에서 이전/다음, 현재/다음 미리보기, 화면 가리기, 전체화면 해제·창 닫기, 음원 재생/일시정지/볼륨/탐색을 제어합니다. 음원은 운영자 PC의 기본 오디오 출력 장치로 나갑니다.

단축키: 콘솔 `←` / `→` / `Space` 슬라이드 이동, `B` 화면 가리기. 출력창 `←` / `→` / `Space` 이동, `F` 전체화면, `Esc` 전체화면 해제 및 안내 표시, 더블클릭 안내 토글. 입력창과 볼륨/진행바에서는 해당 입력의 기본 키보드 동작을 유지합니다.

## 브라우저 제약

- **임의의 두 번째 모니터에 강제로 전체화면을 띄우는 보장은 없습니다.** 화면 탐색과 배치는 권한, 브라우저 지원, OS 창 정책에 영향을 받습니다. 화면 복제 모드에서는 두 모니터가 독립 화면으로 보이지 않을 수 있습니다.
- Window Management는 HTTPS/localhost에서 기능을 감지합니다. `getScreenDetails()` 권한 요청과 `window.open()`을 별도 클릭으로 나누어 권한 응답을 기다리다가 팝업 사용자 활성화를 잃지 않도록 했습니다.
- `requestFullscreen({ screen })`을 사용할 수 있으면 선택 화면을 전달합니다. 일반 요청은 현재 출력창의 화면을 사용합니다. 요청 성공 여부는 Promise와 실제 `fullscreenchange`로 판단합니다.
- BroadcastChannel/postMessage는 사용자 클릭 권한을 만들지 않습니다. 콘솔의 직접 요청 또는 메시지 요청이 거절되면 출력창 자체에서 클릭하도록 안내합니다. 요청만 했다고 전체화면 성공으로 표시하지 않습니다.
- **운영 콘솔 한 개와 해당 출력창 한 개**가 기본 사용 단위입니다. 다른 기기 간 원격 제어, 브라우저 프로필 간 통신은 포함하지 않습니다. 탭 복제는 세션 저장소까지 복제할 수 있으므로 콘솔을 동시에 복제해 운영하지 마세요.
- PPTX는 PowerPoint의 모든 기능을 재현하지 않습니다. 애니메이션, 일부 도형/미디어/폰트는 다르게 보일 수 있습니다. 예배 전 실제 파일로 리허설하고, 필요하면 PowerPoint에서 내보낸 PDF를 연결해 **PDF로 전환**합니다. PDF.js는 사용자가 제공한 PDF를 렌더링하며 PPTX를 자동으로 PDF로 바꾸지 않습니다.
- 샘플 PDF는 독립적으로 만든 영문 테스트 자료입니다. 샘플 PPTX를 정확하게 변환한 PDF라고 가정하지 마세요.

## Vercel 연결

1. GitHub의 `ByeongDoo-Han/beautiful-church` 저장소를 Vercel에 Import하고 Root Directory를 저장소 루트(`./`)로 설정합니다. Node.js 22 이상을 선택합니다. Build Command는 `npm run build`입니다.
2. **Private Blob store**를 생성하고 프로젝트에 연결합니다. 읽기/쓰기 토큰은 서버 전용 `BLOB_READ_WRITE_TOKEN`으로 설정합니다.
3. `npm run password`로 관리자 비밀번호의 scrypt 해시를 생성해 `ADMIN_PASSWORD_HASH`에 입력합니다. 생성 도구 입력은 터미널에 표시되므로 개인 터미널에서 사용합니다. 예측 불가능한 32자 이상의 `SESSION_SECRET`을 추가합니다. 로컬 개발은 `.env.example`을 `.env.local`로 복사해 값을 채웁니다.
4. 배포 후 `/login`으로 로그인합니다. 자료를 불러와 편집하고 **서버 저장**을 누릅니다. 브라우저가 Blob에 직접 업로드하고, 완료된 파일 정보만 manifest API에 전송합니다. MP3/PPTX 파일 전체를 Vercel Function에 전송하지 않습니다.
5. 다른 PC에서는 로그인 후 **서버 자료 다시 불러오기** 및 **예배 자료 다운로드**를 실행합니다. 저장 충돌 시 임의로 덮어쓰지 않고 서버 자료를 다시 읽도록 안내합니다. 다시 불러오기는 로컬 편집을 교체하므로 확인 UI가 있습니다.

서버 환경변수가 없거나 세션이 없으면 모든 클라우드 자료/업로드/서명 API는 차단됩니다. 공개 페이지에는 앱 UI만 있으며 서버의 예배 데이터는 인증 API로만 받습니다. 세션 쿠키는 HttpOnly, SameSite=Strict, HTTPS에서 Secure, 12시간 만료입니다.

**Hobby 무료 한도 내 운용을 목표로 한 구조이며 무조건 월 0원을 보장하지 않습니다.** 계정의 Hobby 이용 조건과 현재 저장·전송·요청 한도는 Vercel 대시보드에서 확인하세요. 파일당 MP3 15MiB, PPTX/PDF 20MiB, 업로드 전 저장량 약 800MiB 보호 검사가 있습니다. 이 검사는 동시 업로드 예약을 원자적으로 합산하지 않으므로 엄격한 전체 용량 제한이나 과금 차단 장치가 아닙니다.

## 데이터·코드 위치

| 위치 | 역할 |
| --- | --- |
| `src/app/admin/page.tsx`, `src/app/worship/page.tsx` | 운영자 콘솔 진입 |
| `src/app/output/page.tsx` | 출력 전용 창. 세션 UUID는 URL hash로 전달 |
| `src/app/login/page.tsx` | 공유 관리자 비밀번호 로그인 |
| `src/components/Console.tsx` | 선택 항목, 현재 슬라이드, 화면 가림, 출력 상태, 화면 선택 |
| `src/components/AudioPlayer.tsx` | 유일한 audio 요소. Blob URL 수명/곡 전환/재생 제어 |
| `src/components/SlideView.tsx`, `src/lib/decks.ts` | PPTX 파싱·단일 장 렌더, PDF.js canvas, 크기 맞춤, 리소스 정리 |
| `src/components/LibraryEditor.tsx` | 파일 읽기, 순서 편집, 음원·슬라이드·대체 PDF 연결 |
| `src/lib/model.ts` | Zod 검증과 Manifest/Asset/Item/Snapshot 타입 |
| `src/lib/sync.ts` | BroadcastChannel + postMessage, 세션 분리, 중복 메시지 제거 |
| `src/lib/screens.ts` | 현재 화면 제외 자동 선택, 팝업 좌표, 전체화면 요청 |
| `src/lib/client-storage.ts` | 콘텐츠 해시, IndexedDB, 직접 업로드, 다운로드, 오프라인 준비 |
| `src/lib/blob-store.ts` | Private manifest 읽기, 파일 참조 확인, ETag 조건부 쓰기 |
| `src/lib/auth.ts` | scrypt 검증, 서명 세션, Origin 검사, 요청 크기 제한 |
| `scripts/sw-template.js`, `scripts/precache.mjs` | 앱 파일 캐시. API·서명 URL은 캐시 제외 |

상세 [구조 및 API 계약](docs/architecture.md), [검증 결과와 남은 확인 항목](docs/verification.md)을 참고하세요.

## 검증 명령

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

브라우저 테스트는 설치된 Google Chrome을 새 테스트 프로필로 실행하며 3100 포트를 사용합니다. Chrome이 없는 환경은 Playwright의 브라우저를 설치하고 `playwright.config.ts`의 `channel`을 환경에 맞게 변경합니다. fixtures 재생성은 `npm run fixtures`입니다. 배포용 런타임에는 샘플 생성 도구를 사용하지 않습니다.

## 운영 범위

- 실제 Vercel 계정 연결·업로드·배포, 실물 두 모니터/프로젝터 배치는 이 작업에서 검증하지 않았습니다. SDK 호출 계약과 로컬 브라우저 동작은 테스트했습니다.
- 비밀번호 기반 단일 관리자 MVP입니다. 공개 인터넷 운영 시 Vercel Firewall에서 `/api/login`의 요청 제한을 설정하고 강한 비밀번호를 사용하세요. MFA·다중 계정·감사 로그·중앙 세션 폐기는 아직 없습니다.
- 오프라인 자료는 로그인 쿠키가 만료되어도 해당 PC에 남아 재생됩니다. 공유 PC에서는 출력창을 닫고 **이 PC 저장 자료 지우기**를 실행하세요. 이는 서버 파일을 삭제하지 않습니다. 브라우저 저장소 삭제/퇴거, 시크릿 모드, 처음 방문하는 PC에는 오프라인 자료가 없습니다.
- 순서에서 항목을 제거해도 원본 Blob은 삭제하지 않습니다. 원본 정리는 현재 Vercel 대시보드에서 수동으로 수행합니다. 자동 삭제/백업·보존 정책은 포함하지 않습니다.
- 서비스를 배포하거나 렌더러를 업데이트한 뒤에는 온라인에서 다시 **예배 자료 다운로드**를 완료하고 리허설하세요.

구현 시 확인한 1차 자료: [Vercel Client Upload](https://vercel.com/docs/vercel-blob/client-upload), [Signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls), [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), [Window Management](https://developer.chrome.com/docs/capabilities/web-apis/window-management), [PPTX renderer](https://github.com/aiden0z/pptx-renderer), [PDF.js](https://mozilla.github.io/pdf.js/examples/).
