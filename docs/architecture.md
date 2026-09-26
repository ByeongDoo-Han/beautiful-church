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
| POST `/api/login` | `{username, password}` | `{ok:true}` + HttpOnly 쿠키 | Origin, 고정 관리자 계정 검증; 400/401/403/503 |
| POST `/api/logout` | 없음 | `{ok:true}` + 쿠키 만료 | Origin 확인; PC 파일은 유지 |
| GET `/api/files` | 세션 쿠키, 선택 `cursor` | `{files: [{pathname, name, kind, size, uploadedAt, registered}], nextCursor}` | 관리자 인증, 실제 Blob 100개 단위 조회; 예배 설정 파일 제외; 400/401/503 |
| GET `/api/manifest` | 세션 쿠키 | `{manifest, etag}` | 관리자 인증; no-store; 없으면 빈 manifest |
| PUT `/api/manifest` | `{manifest, etag: string|null}` | 새 `{manifest, etag}` | 관리자/Origin, 256KiB 본문 제한, 참조 파일 확인, 409 경합 |
| POST `/api/upload` | `@vercel/blob/client`의 `HandleUploadBody` | SDK client token 또는 callback 응답 | 토큰 발급 시 관리자/Origin/경로/저장량 확인. 완료 callback은 SDK 서명 검증 |
| GET `/api/signed-url?id=...` | manifest에 등록된 자료 ID | `{url, expiresAt}` | 관리자 인증 후 저장본에 등록된 파일만 허용. 임의 URL/경로 서명 불가 |

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
- Service Worker: `/login`의 공개 앱 shell + Next.js chunks + PDF.js 로컬 자원. 서명 URL, API 응답, 세션 쿠키는 Cache Storage에 넣지 않습니다.
- 예배 자료 다운로드는 순서가 참조하는 모든 MP3/PPTX/PDF를 먼저 저장한 후 렌더러 및 app shell 캐시 완료를 확인합니다. 중간 실패 시 성공했다고 표시하지 않습니다.
- 저장 완료 여부는 이 브라우저 프로필 기준입니다. OS 저장공간 부족·브라우저 데이터 삭제/퇴거는 막을 수 없습니다. `navigator.storage.persist()`를 요청하지만 승인을 보장하지 않습니다.

## 의도한 범위

계정별 다중 교회, 실시간 다중 운영자 공동편집, 애니메이션 타임라인, 원격 기기 프로젝터 제어, PowerPoint 원본과의 픽셀 일치, 자동 PPTX→PDF 변환, Blob 자동 삭제는 포함하지 않습니다. 공유 manifest 동시 저장 충돌은 방지하지만 두 운영자가 같은 예배를 동시에 지휘하는 기능은 제공하지 않습니다.

## 유튜브 재생

카드의 선택 필드 `audioSource: 'mp3' | 'youtube'`와 `youtube: {videoId, startSeconds}`를 manifest에 저장합니다. 기존 카드에서 `audioSource`가 없으면 MP3 모드로 동작합니다. 허용된 YouTube URL의 11자 videoId와 시작 위치만 저장하며 임의 iframe 주소를 받지 않습니다. `YouTubePlayer`는 운영자 Console에만 생성됩니다. Output으로 전송되는 Snapshot에는 유튜브 설정이 없고 기존 프레젠테이션 Asset과 슬라이드 상태만 전달됩니다. MP3와 YouTube 컴포넌트는 조건부로 하나만 마운트하며 카드 ID로 수명을 분리합니다.

## 카드별 PPTX 편집

`Item.presentationEdit`는 원본 assetId, UUID version, 1~1,000개 슬라이드 인스턴스(id/source/texts)를 저장합니다. 복사는 원본 장 인덱스를 공유하고 새 인스턴스 ID와 독립 텍스트 오버라이드를 갖습니다. 삭제는 인스턴스 목록에서만 제거하며 Blob 원본은 유지합니다. 카드의 presentationId 변경 시 편집 필드를 지웁니다. 기존 version 1 manifest에는 선택 필드이므로 이전 데이터와 호환됩니다.

렌더러가 lazy sourceXml을 소비하기 전에 XML을 Deck 캐시에 보관합니다. 변경된 장은 별도 XML 문서에서 txBody를 수정하고 fresh SlideData로 다시 파싱합니다. 공유 PresentationData의 슬라이드를 수정하지 않습니다. 변경한 문단은 첫 run의 rPr와 문단 pPr를 유지하며, 문자열은 textContent로 넣어 XML 특수문자를 이스케이프합니다. 그룹·표 내부 txBody도 동일하게 처리합니다. 원본 마스터, 이미지 및 차트는 편집 대상에서 제외합니다.

편집창은 독립 초안과 200ms 지연 미리보기를 사용합니다. 적용 시에만 manifest 및 Snapshot의 presentationEdit를 함께 바꿉니다. 출력 확인 키에 edit version을 포함해 같은 장 문구 변경도 새 렌더로 확인합니다. PDF 대체에는 편집을 적용하지 않습니다. 전체 manifest UTF-8 크기 1,500KiB와 API 요청 2MiB 제한, 문구별 10,000자 제한을 둡니다. 기존 ETag 충돌 제어와 관리자 인증은 동일하게 적용합니다.

## 예배 순서별 슬라이드 유지 구간

`Item.slideHoldCount?: number`는 현재 순서를 포함한 1~100개 개수입니다. 필드가 없으면 1입니다. `presentationRange`는 목록 처음부터 겹치지 않는 구간을 계산하며 프레젠테이션이 없는 시작 카드는 구간을 확장하지 않습니다. 선택 클릭 이력에 의존하지 않으므로 중간 카드 직접 선택과 재접속이 일치합니다. 구간 안의 별도 유지 설정은 상위 구간을 확장하지 않습니다.

Console은 선택 카드(active)의 음원과 구간 시작 카드(presentationOwner)의 자료를 분리합니다. PPTX 편집, PDF 대체, 슬라이드 편집 저장 대상은 시작 카드에서 가져옵니다. Snapshot의 선택적 presentationOwnerId로 구간 경계를 판별하여 같은 파일이라도 새 구간에 진입하면 첫 장을 보여주고, 구간 안에서는 현재 장을 유지합니다. 이전 Snapshot에는 이 필드가 없으므로 최초 복원 시 기존 페이지를 유지합니다.

## 명시적 PPT 섹션 (2026-09-21)

`Manifest.sections?: PresentationSection[]`에 id, presentationId, fallbackPdfId, presentationEdit, itemIds를 저장합니다. 순서 카드의 음원과 섹션의 프레젠테이션을 분리합니다. 섹션을 순서대로 펼친 itemIds는 manifest.items의 ID 순서와 정확히 일치해야 하며 서버 Zod 검증에서 누락·중복·알 수 없는 참조·순서 불일치·잘못된 파일 종류를 거부합니다. 최대 100개 섹션/100개 카드입니다.

`withSections`는 기존 숫자 범위를 한 번만 명시적 섹션으로 변환하고 원래 카드 필드도 유지합니다. 이미 sections가 있으면 레거시 범위를 다시 계산하지 않습니다. 예전 첫 카드 ID를 섹션 ID로 사용하므로 기존 출력 snapshot의 소유자 ID와 일치합니다. 새로 만든 섹션은 별도 UUID를 사용합니다. 실제 표시/편집은 섹션 메타데이터를 따르며 첫 카드 이동/삭제로 섹션 편집이 사라지지 않습니다.

`moveCard`는 한 번에 원래 섹션에서 제거하고 대상 위치에 삽입한 뒤 items의 전체 순서를 재구성합니다. 섹션 내 이동은 현재 페이지를 유지하고 다른 섹션으로 활성 카드를 옮기면 해당 섹션의 첫 장을 표시합니다. 빈 섹션도 유지합니다. 네이티브 drag-and-drop은 이 목록에서 시작한 카드만 받으며, 메뉴/섹션 선택으로 키보드와 터치 이동도 가능합니다. 포인터를 누른 카드 ID를 기록하고 focus({preventScroll:true})를 사용해 포커스에 의한 스크롤 중 잘못된 카드가 드래그되지 않도록 합니다.

서버는 ETag 검증 외에 기존 sections가 있는 문서를 sections 없이 저장하려는 구버전 앱 요청을 409로 거부합니다. 예전 브라우저 탭이 알 수 없는 필드를 제거해 배치를 덮어쓰는 것을 방지합니다. 오프라인 준비 파일 목록은 섹션의 PPT/PDF 참조도 포함합니다.


## 로그인 경계와 편집본 캐시

`AuthenticatedPage`가 `/admin`, `/worship`, `/output`의 세션 쿠키를 서버에서 검증하고 비로그인 요청을 `/login`으로 보냅니다. `SessionGate`는 새 문서에서 서버 세션 확인 후에만 자료 컴포넌트를 마운트합니다. 포커스·온라인 복구·60초 간격으로 세션을 재확인하고, 다른 탭의 로그아웃에도 로그인 화면으로 이동합니다. 모든 자료 API는 요청마다 서버 인증을 수행합니다. Service Worker는 보호된 페이지 HTML을 저장하지 않으며, 오프라인 문서 요청은 로그인 화면으로 보냅니다. 이미 인증된 열린 화면에서는 캐시한 자료로 운영을 계속할 수 있습니다.

클라우드 관리자 초안은 `cloud-draft`, 로그인 후 사용하는 서버 저장본 캐시는 `cloud-published`에 보관합니다. 인증된 클라우드 화면이 온라인 진입 시 서버 GET을 우선하고 실패 시 서버 저장본 캐시만 표시합니다. 기존 `cloud` 관리자 캐시는 현재 서버 저장본과 다를 때 복구용 초안으로 이관하고 기본 표시에는 사용하지 않습니다. 파일 Blob 캐시는 내용 해시 기준으로 공유합니다. 순서 삭제는 manifest의 카드 및 섹션 멤버십만 갱신하며 Blob 파일 삭제를 호출하지 않습니다.


서버 저장본 표시 중에는 관리자도 포커스/온라인/주기 갱신을 받습니다. 편집 콜백이 dirty ref를 즉시 설정하고 초안 쓰기를 직렬화합니다. 이미 시작한 GET도 완료 시 dirty/편집창 상태를 재검사하여 작업을 덮어쓰지 않습니다. 초안 복구 시 원래 ETag를 유지하므로 오래된 초안을 서버에 저장하면 409 검사를 통과할 수 없습니다. 서버 PUT 성공 후에는 표시 상태를 서버 저장본으로 전환하고 PC 캐시/초안을 정리합니다. 미저장 상태에서 예배 자료 다운로드를 실행해도 서버 저장본 캐시를 편집본으로 바꾸지 않습니다.
