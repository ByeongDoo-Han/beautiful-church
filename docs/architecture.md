# 구조 및 API 계약

## 데이터 흐름

```mermaid
flowchart LR
  A[운영자 콘솔 /admin] -->|토큰 요청: 로그인 확인| U[/api/upload]
  A -->|파일 직접 업로드| B[Vercel Private Blob]
  A -->|메타데이터 + ETag| M[/api/manifest]
  M -->|조건부 쓰기| J[data/manifest.json]
  A -->|자료 ID| S[/api/signed-url]
  S -->|GET 한정 5분 URL| A
  B -->|브라우저 직접 다운로드| I[IndexedDB]
  A -->|snapshot + command| O[출력창 /output]
  O -->|hello + 실제 상태| A
  I --> A
  I --> O
  W[Service Worker 앱 캐시] --> A
  W --> O
```

추가 DB, 변환 서버, 제3자 클라우드는 없습니다. 음원은 운영자 창의 `audio` 하나에서만 재생됩니다. 출력창은 동일 출처 IndexedDB에서 프레젠테이션 원본을 읽고 자체 렌더링하므로 매 장마다 이미지나 대용량 파일을 통신하지 않습니다.

## 상태

```ts
type Asset = {
  id: string;                 // 실제 파일은 SHA-256. 파일 바뀌면 ID/경로도 바뀜
  name: string;
  kind: 'mp3' | 'pptx' | 'pdf';
  size: number;
  pathname?: string;         // media/{sha256}.{extension}; 클라우드 저장된 자료
  demoPath?: string;         // 허용된 샘플 파일 3개만
};
type Item = {
  id: string;
  title: string;
  audioId?: string;
  presentationId?: string;
  fallbackPdfId?: string;
};
type Manifest = {
  version: 1;
  title: string;
  assets: Asset[];
  items: Item[];              // 배열 순서 = 예배 순서
};
type Snapshot = {
  revision: number;           // 운영자 권위, 단조 증가
  asset: Asset | null;
  slide: number;              // 0-based
  count: number;
  blackout: boolean;
  title: string;
};
```

`ManifestEnvelope = { manifest, etag }`입니다. 서버는 Zod로 중복 ID·종류가 틀린 참조·경로 변조·제한 초과를 거절합니다. 최초 manifest 쓰기는 overwrite=false, 이후에는 SDK `ifMatch: etag`로 경합을 확인합니다. read→write 간 경쟁도 Blob 조건부 쓰기가 최종적으로 차단합니다. 최신 manifest는 `get(..., { access: 'private', useCache: false })`로 읽습니다.

## 라우트

| 라우트 | 요청 | 성공 응답 | 인증/오류 |
| --- | --- | --- | --- |
| GET `/api/config` | 없음 | `{cloud, authenticated}` | 비밀 값은 포함하지 않음 |
| POST `/api/login` | `{password}` | `{ok:true}` + HttpOnly 쿠키 | Origin, 비밀번호 검증; 400/401/403/503 |
| POST `/api/logout` | 없음 | `{ok:true}` + 쿠키 만료 | Origin 확인; PC 파일은 유지 |
| GET `/api/manifest` | 세션 쿠키 | `{manifest, etag}` | 관리자 인증; 없으면 빈 manifest |
| PUT `/api/manifest` | `{manifest, etag: string|null}` | 새 `{manifest, etag}` | 관리자/Origin, 256KiB 본문 제한, 참조 파일 확인, 409 경합 |
| POST `/api/upload` | `@vercel/blob/client`의 `HandleUploadBody` | SDK client token 또는 callback 응답 | 토큰 발급 시 관리자/Origin/경로/저장량 확인. 완료 callback은 SDK 서명 검증 |
| GET `/api/signed-url?id=...` | manifest에 등록된 자료 ID | `{url, expiresAt}` | 관리자 인증. 임의 URL/경로 서명 불가 |

모든 API 응답은 `Cache-Control: no-store`입니다. 일반 오류 응답은 `{error:string}`이며 내부 예외나 자격증명은 응답에 노출하지 않습니다.

### 직접 업로드와 서명 URL

```ts
// 브라우저: 원본 파일이 Function을 통과하지 않는다.
await upload(pathname, blob, {
  access: 'private', handleUploadUrl: '/api/upload', multipart: true,
  contentType: MIME[kind], onUploadProgress,
});

// 서버: 읽기 권한을 파일 하나에 한정. clientSigningToken은 반환하지 않는다.
const validUntil = Date.now() + 300_000;
const signed = await issueSignedToken({
  pathname, operations: ['get'], validUntil,
});
const { presignedUrl } = await presignUrl(signed, {
  pathname, operation: 'get', access: 'private', validUntil,
});
```

SDK 2.8.0의 `presignUrl()`은 문자열 대신 `{presignedUrl}`을 반환합니다. 성공한 업로드는 manifest 저장 전 PC에 기록하여 저장 실패를 재시도할 수 있습니다. 완료 webhook은 manifest를 수정하지 않으므로 지연 callback이 운영자의 편집을 덮어쓰지 않습니다. 로컬 callback 수신용 터널은 이 설계의 manifest 확정 과정에 필요하지 않습니다.

## 창 동기화

- `worship:{sessionUUID}` BroadcastChannel과 동일 출처 `postMessage`를 함께 사용하고 메시지 UUID로 중복 제거합니다.
- 모든 envelope는 `{app:'worship-v1',session,sender,id,message}` 형식으로 검증합니다. 다른 세션, 자기 메시지, 잘못된 형식은 무시합니다.
- postMessage는 `targetOrigin=location.origin`을 명시하며 수신 시 origin과 source 창을 확인합니다. 운영자 새로고침 후에는 동일 출처·출력창 이름·`/output` 경로·`source.opener===window`가 맞는 hello만 재연결에 사용합니다.
- `state`: 운영자의 전체 Snapshot. 이미 받은 revision 이하이면 무시합니다. 큰 파일, 인증 토큰, 서명 URL, 음원 재생 명령은 포함하지 않습니다.
- `hello`: 출력창이 처음 열릴 때와 2초마다 요청합니다. 운영자는 가장 최신 전체 상태를 응답하여 새로고침/초기 메시지 유실을 복구합니다.
- `status`: 실제 `fullscreen`, `visible`, `renderedKey`(파일 ID+장 번호), 렌더/권한 오류를 보고합니다. 완료 보고가 현재 장과 일치해야 ‘동기화됨’으로 표시합니다. 6.5초 무응답이면 연결 끊김으로 봅니다. 백그라운드 탭 타이머 제한으로 일시적으로 끊김 표시가 나올 수 있습니다.
- `navigate`: 출력창 키보드 입력을 운영자에게 전달합니다. 출력창이 슬라이드 상태를 독립적으로 바꾸지 않습니다.
- `command`: fullscreen / exit-fullscreen / close. fullscreen 실패는 실제 출력창에 클릭 안내를 표시합니다.
- `bye`: pagehide 시 종료를 알립니다. 새로고침 후 hello로 다시 연결됩니다.

## 브라우저 렌더링

PPTX는 `parseZipLazyMedia(buffer, RECOMMENDED_ZIP_LIMITS)` → `buildPresentation(...,{lazySlides:true})` → 현재/다음 장의 `renderSlide()` 흐름입니다. 파일을 서버에서 변환하지 않습니다. PDF.js는 제공된 PDF를 canvas로 그리며 Worker, CMap, 표준 폰트, WASM은 앱과 같은 출처에서 제공합니다.

ResizeObserver로 비율을 유지해 확대/축소합니다. PDF 래스터를 2560×1440 이내로 제한합니다. 완료·취소·파일 전환 시 slide handle/canvas/render task/worker/Blob URL을 정리합니다. 같은 파일의 미리보기는 파싱 결과를 공유하고 참조가 사라지면 정리합니다. 내장 오디오·비디오 자동 재생 및 링크 이동은 운영 흐름으로 사용하지 않습니다.

## 오프라인

- IndexedDB `beautiful-church-v1`: `files`에 원본 Blob, `metadata`에 local/cloud별 manifest와 ETag.
- 파일 불러오기/다운로드 시 저장하며 서버 파일은 크기와 SHA-256도 확인합니다. 만료된 URL로 401/403을 받으면 새 URL을 요청합니다. 캐시에 있으면 서버 요청 없이 읽습니다.
- Service Worker: `/admin`, `/worship`, `/output`, `/login`의 공개 앱 shell + Next.js chunks + PDF.js 로컬 자원. 서명 URL, API 응답, 세션 쿠키는 Cache Storage에 넣지 않습니다.
- 예배 자료 다운로드는 순서가 참조하는 모든 MP3/PPTX/PDF를 먼저 저장한 후 렌더러 및 app shell 캐시 완료를 확인합니다. 중간 실패 시 성공했다고 표시하지 않습니다.
- 저장 완료 여부는 이 브라우저 프로필 기준입니다. OS 저장공간 부족·브라우저 데이터 삭제/퇴거는 막을 수 없습니다. `navigator.storage.persist()`를 요청하지만 승인을 보장하지 않습니다.

## 의도한 범위

계정별 다중 교회, 실시간 다중 운영자 공동편집, 애니메이션 타임라인, 원격 기기 프로젝터 제어, PowerPoint 원본과의 픽셀 일치, 자동 PPTX→PDF 변환, Blob 자동 삭제는 포함하지 않습니다. 공유 manifest 동시 저장 충돌은 방지하지만 두 운영자가 같은 예배를 동시에 지휘하는 기능은 제공하지 않습니다.
