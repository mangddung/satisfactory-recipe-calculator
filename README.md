# Satisfactory Production Calculator

[English](#english) · [한국어](#한국어)

> **A personal project, not built to run as a public service.**
> - Written against **Satisfactory 1.2** game data. Other game versions may change the data format, so parts of the data pipeline may not match.
> - There are no accounts: anyone who can open the app can see and delete every saved plan.
> - Icons are copied from the game as they are (256–512 px PNG, about 13 MB) without resizing or compression, so they are not optimized.

---

## English

Pick a Satisfactory item and a target rate per minute. The web app shows the full ingredient chain down to raw resources as a tree and calculates the machines, power, and raw resources needed.

### Features

- Ingredient chain tree: machine count, clock speed, power, and byproducts per step
- Recipe choice per ingredient (alternate recipes included)
- Raw resource node settings: extractor, purity, overclock → shows whether supply is enough
- Highlights belts that exceed the selected conveyor tier
- Save and load plans
- Item list grouped by tier, Korean/English UI, in-game names in the languages chosen during setup

### Layout

```
frontend/       React + TypeScript (Vite), antd, React Flow
backend/        Flask — calculation API, plan storage, data and icon serving
data-pipeline/  Original game files (Docs json, icons) → backend/data/clean/
game-data/      Where you put the original game files (not in the repository)
```

### Game data

The game files are Coffee Stain Studios assets and are not included in this repository. Copy them into `game-data/` yourself.
See [game-data/README.md](game-data/README.md) for where to find them and where to put them.

### Run (dev)

```powershell
docker compose up -d --build
```

- App: http://localhost:38173 (backend: http://localhost:38050)
- The first visit redirects to initial setup (`/setup`). After you choose languages, the pipeline reads `game-data/` and writes recipe, item, building, and icon data to `backend/data/clean/`.
- After setup you can delete the originals you put in `game-data/` (`Docs/`, `FactoryGame/`). To run setup again (other languages, after a game update), copy them back first.
- Source folders are mounted, so code changes apply right away.

### Production build

**Finish initial setup in dev first**, then build.

```powershell
docker compose -f docker-compose.prod.yml up -d --build
```

- App: http://localhost (nginx)
- The prod container has no `game-data/`, so setup cannot run there. Instead, the build copies the `backend/data/clean/` made in dev into the image, and the app opens straight to the calculator.
- If you build without `backend/data/clean/`, the app redirects to setup, which fails because the original files are missing.
- Saved plans are kept in the `plans` volume.

### Dev vs prod

| | dev | prod |
|---|---|---|
| Initial setup (`/setup`) | Available | Not available — uses the dev output |
| Admin pages (`/admin`) | Available | Left out of the build, `/api/admin/*` returns 404 |
| Data | Generated from `game-data/` into `backend/data/clean/` | `backend/data/clean/` copied at build time |
| Ports | 38173 (app), 38050 (backend) | 80 (app), 5000 (backend) |

The admin pages are for checking and correcting data: browse items, recipes, buildings, and extractors, validate data, re-run the pipeline, and classify unclassified items by hand ([docs/DATA_SOURCE.md](docs/DATA_SOURCE.md), Korean).
The backend serves the admin API only when the environment variable `ENABLE_ADMIN=1` is set, which only `docker-compose.yml` (dev) does.

### Tests

They run without game data.

```powershell
python backend/test_calculator.py
python data-pipeline/test_merge.py
```

---

## 한국어

Satisfactory 아이템과 분당 생산량을 고르면, 원자재까지의 재료 체인을 트리로 보여주고 필요한 기계 수·전력·원자재를 계산하는 웹앱입니다.

> **개인용으로 개발한 프로젝트이며, 서비스용으로 만들어지지 않았습니다.**
> - **새티스팩토리 1.2** 게임 데이터를 기준으로 작성된 코드입니다. 다른 버전은 데이터 형식이 달라 파이프라인 일부가 맞지 않을 수 있습니다.
> - 계정 기능이 없어서, 앱에 접속할 수 있는 사람은 누구나 저장된 플랜을 모두 보고 삭제할 수 있습니다.
> - 아이콘은 게임 원본(256~512px PNG, 약 13MB)을 축소·압축 없이 그대로 복사해 쓰므로 최적화되어 있지 않습니다.

### 기능

- 재료 체인 트리: 단계별 기계 수, 클럭, 전력, 부산물
- 재료별 레시피 선택 (대체 레시피 포함)
- 원자재 노드 설정: 추출기·순도·오버클럭 → 공급량이 충분한지 표시
- 컨베이어 등급 한도 초과 구간 표시
- 플랜 저장·불러오기
- 티어별 아이템 목록, 한국어·영어 UI, 게임 이름은 초기 설정에서 고른 언어로 표시

### 구성

```
frontend/       React + TypeScript (Vite), antd, React Flow
backend/        Flask — 계산 API, 플랜 저장, 데이터·아이콘 서빙
data-pipeline/  게임 원본(Docs json, 아이콘) → backend/data/clean/ 변환
game-data/      게임 원본 파일 넣는 곳 (저장소에 포함 안 됨)
```

### 게임 데이터

게임 파일은 Coffee Stain Studios 자산이라 저장소에 없습니다. 직접 꺼내서 `game-data/` 에 넣어야 합니다.
꺼내는 방법과 위치는 [game-data/README.md](game-data/README.md) 참고.

### 실행 (dev)

```powershell
docker compose up -d --build
```

- 앱: http://localhost:38173 (백엔드 http://localhost:38050)
- 처음 열면 초기 설정(`/setup`)으로 이동합니다. 언어를 고르면 파이프라인이 `game-data/` 를 읽어 `backend/data/clean/` 에 레시피·아이템·건물·아이콘 데이터를 만듭니다.
- 초기 설정이 끝나면 `game-data/` 에 넣은 원본(`Docs/`, `FactoryGame/`)은 지워도 됩니다. 다시 설정하려면(언어 변경, 게임 업데이트) 원본을 다시 넣어야 합니다.
- 소스가 마운트되어 있어 수정하면 바로 반영됩니다.

### prod 빌드

**dev에서 초기 설정을 먼저 끝낸 뒤** 빌드합니다.

```powershell
docker compose -f docker-compose.prod.yml up -d --build
```

- 앱: http://localhost (nginx)
- prod 컨테이너에는 `game-data/` 가 들어가지 않으므로 초기 설정을 할 수 없습니다. 대신 빌드할 때 dev에서 만든 `backend/data/clean/` 이 이미지에 그대로 복사되어, 바로 계산기로 열립니다.
- `backend/data/clean/` 이 없는 상태로 빌드하면 초기 설정 화면으로 이동하지만, 원본 파일이 없어 실패합니다.
- 저장한 플랜은 `plans` 볼륨에 보관됩니다.

### dev / prod 차이

| | dev | prod |
|---|---|---|
| 초기 설정 (`/setup`) | 가능 | 불가 — dev 결과물 사용 |
| 관리자 화면 (`/admin`) | 사용 가능 | 빌드에서 제외, `/api/admin/*` 는 404 |
| 데이터 | `game-data/` → `backend/data/clean/` 생성 | 빌드 시 `backend/data/clean/` 복사 |
| 포트 | 38173 (앱), 38050 (백엔드) | 80 (앱), 5000 (백엔드) |

관리자 화면은 데이터 확인·보정용입니다: 아이템·레시피·건물·추출기 조회, 데이터 검증, 파이프라인 재실행, 미분류 아이템 수동 분류([docs/DATA_SOURCE.md](docs/DATA_SOURCE.md)).
백엔드는 환경변수 `ENABLE_ADMIN=1` 일 때만 관리자 API를 열며, `docker-compose.yml`(dev)에만 설정되어 있습니다.

### 테스트

게임 데이터 없이 실행됩니다.

```powershell
python backend/test_calculator.py
python data-pipeline/test_merge.py
```
