# Space Atlas · 우주 아틀라스

5~12세를 위한 어린이 우주 도감입니다. **태양계 탐험**에서 태양과 행성, 위성 사이를 여행하고 **천체 도감**에서 종류별 특징을 읽습니다. 사진과 짧은 설명에서 시작해 `숫자로 더 알아보기`에서 출처가 있는 수치를 확인합니다.

## PC에서 열기

Python 3이 있는 Windows에서 `start-space-atlas.cmd`를 실행하거나 PowerShell에서 아래 명령을 실행합니다. 소스에서 도감 데이터를 새로 빌드할 때는 Node.js가 필요합니다.

```powershell
.\start-space-atlas.ps1
```

기본 주소는 `http://127.0.0.1:8767/`입니다. 포트가 이미 사용 중이면 `-Port 8768`을 전달합니다. 같은 네트워크의 iPad에서 레이아웃을 미리 보려면 `-Lan`을 사용하고 iPad에서 표시된 PC 주소를 엽니다. LAN의 일반 HTTP는 브라우저 미리보기 용도입니다. 설치 앱에서 오프라인 도감을 쓰려면 HTTPS 주소를 사용하세요.

서버 없이 화면을 볼 때는 `space-atlas-preview.html`을 브라우저에서 엽니다. 최신 파일은 빌드 후 `node scripts/make-preview.mjs`로 생성합니다. 도감 데이터와 로컬 이미지를 HTML 안에 포함하며, 온라인 전용 이미지는 인터넷 연결이 필요합니다. 사진을 불러올 수 없으면 구분 표시가 붙은 개념 그림이 표시됩니다. iPad 설치는 배포된 HTTPS 주소에서 진행합니다.

인터넷에 연결된 PC에 Node.js가 있다면 `start-space-atlas.cmd -PrepareImages`로 이용 조건을 확인한 사진을 내려받고 도감과 `space-atlas-preview.html`을 갱신한 뒤 로컬에서 열 수 있습니다. 내려받기에 실패한 사진은 온라인 주소를 유지합니다.

## iPad에 설치

1. Safari에서 배포한 HTTPS 주소를 엽니다.
2. **공유 → 홈 화면에 추가 → 웹 앱으로 열기 → 추가**를 선택합니다.
3. 인터넷이 연결된 상태로 홈 화면 아이콘에서 처음 실행합니다.
4. 오프라인 준비 표시를 확인합니다. 앱을 종료하고 비행기 모드에서 다시 열어 보세요.

도감 본문과 태양계 지도, 검색, 천체 사이의 이동, 즐겨찾기, 기기에 저장되는 대표 사진을 오프라인에서 볼 수 있습니다. 기관 출처 페이지, 고화질 원본과 온라인 전용 이미지는 인터넷 연결이 필요합니다. iPadOS가 저장 공간을 정리해 도감 캐시를 지운 경우 인터넷을 연결하고 앱을 열어 다시 준비합니다. [Apple iPad 안내](https://support.apple.com/ko-kr/guide/ipad/ipad8f1f7a29/27/ipados/27) · [WebKit 저장소 정책](https://webkit.org/blog/14403/updates-to-storage-policy/)

호스팅 환경을 바꾸는 경우 **`dist/`만** HTTPS 정적 웹 경로에 배포합니다. 하위 경로를 사용해도 매니페스트와 서비스 워커 범위를 그 경로 안에 둡니다. 접근 제한을 사용할 경우 인증 뒤에 앱 파일·아이콘·서비스 워커를 모두 받을 수 있는지 iPad에서 확인합니다.

## 개인 GitHub 계정에 배포

프로젝트 루트에서 빌드와 커밋을 준비합니다. `git status --short`로 올릴 파일을 확인한 다음 커밋하세요.

```powershell
node scripts/build.mjs
git status --short
git add .
git commit -m "Build Space Atlas"
```

개인 계정으로 인증한 GitHub CLI에서 새 공개 저장소를 만드는 경우 아래 명령을 사용합니다. 공개 저장소의 소스와 Pages 사이트는 누구나 열람할 수 있습니다. 저장소가 이미 있다면 생성 명령을 건너뜁니다. `origin`이 없으면 아래 주소로 추가합니다.

```powershell
gh auth status
gh repo create JJapShe/space-atlas --public
# origin이 없는 경우에만 실행
# git remote add origin https://github.com/JJapShe/space-atlas.git
git push -u origin main
```

GitHub 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다. 첫 푸시가 이 설정보다 앞섰다면 **Actions → Deploy Space Atlas to Pages → Run workflow**에서 `main`을 선택해 실행합니다. 완료 후 배포 작업이 표시한 HTTPS 주소에서 도감과 iPad 설치를 확인하세요. 이후 `main`에 푸시하면 자동으로 다시 배포합니다. [GitHub Pages 설정 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

Pages 작업은 빌드 전에 이용 조건을 확인해 등록한 대표 이미지를 다운로드합니다. 내려받기에 성공한 이미지는 배포에 포함되며, 나머지는 온라인에서 원본 주소로 불러옵니다. 실제 저장 가능 수는 `Validate and build atlas` 로그의 `오프라인` 항목에서 확인하세요. iPad에서는 홈 화면 아이콘으로 처음 열 때 인터넷에 연결해 이 사진들을 저장합니다.

## 천체나 사진 추가

작성 전에 [콘텐츠 등록 지침](CONTENT-GUIDE.md)과 [에이전트 작업 안내](AGENTS.md)를 읽습니다. 기존 ID는 즐겨찾기와 이동 주소에서 계속 사용합니다.

| 위치 | 역할 |
| --- | --- |
| `content/structure.json` | 분류와 태양계 지역의 순서, 밤하늘 현상, 개념 출처 |
| `content/solar.json`, `content/deep.json` | 천체와 수치, 출처, 양방향 관계. 같은 구조의 별도 JSON 파일도 자동 반영 |
| `content/images.json`, `dist/assets/objects/` | 대표 사진의 출처와 조건, 앱이 사용하는 이미지 파일 |
| `scripts/build.mjs` | 출처·관계·이미지·누락 검사, 카탈로그 생성, 서비스 워커 버전 기록 |
| `scripts/make-preview.mjs` | 빌드 결과로 서버 없이 열 수 있는 단일 HTML 생성 |
| `dist/data/catalog.json` | 앱이 읽는 생성 결과 |

프로젝트 루트에서 실행합니다.

```text
node scripts/build.mjs --check
node scripts/build.mjs
```

첫 명령은 원본과 필요한 앱 파일을 검사합니다. 두 번째 명령이 카탈로그와 서비스 워커 버전을 함께 갱신합니다. 빌드 로그에 오프라인 이미지, 온라인 전용 이미지, 이미지 미등록 천체 수가 각각 표시됩니다. 빌드 후 설치 주소, 태양계 지도, 천체 간 왕복, 검색, 즐겨찾기, 자세한 수치와 사진 출처를 확인합니다.

이용 조건을 확인해 `content/images.json`에 등록해 둔 온라인 전용 이미지는 기관 서버에 접속 가능한 PC에서 아래 명령으로 기기 저장용으로 바꿀 수 있습니다.

```text
node scripts/fetch-images.mjs
node scripts/build.mjs
```

다운로드는 최대 8 MiB의 JPEG, PNG, WebP, AVIF를 지원하며 파일을 변환하지 않습니다. 실패한 이미지는 온라인 전용으로 남습니다. 일부 다운로드가 성공했으면 빌드를 실행해 성공분을 적용하세요.
