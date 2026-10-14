# game-data — 원본 게임 데이터 넣는 곳

이 폴더에 게임에서 꺼낸 **원본 파일을 그대로** 넣고 앱을 열면 초기 설정 화면이 나옵니다.
거기서 사용할 언어를 고르면 필요한 데이터(레시피·아이템·건물·이름·아이콘)만 골라 `backend/data/clean/` 에 만들어집니다.

- 데이터 생성은 이 폴더를 **읽기만** 합니다. 원하면 초기 설정 마지막 단계에서 안 쓰는 파일(선택 안 한 언어, 안 쓰는 아이콘 등)을 확인 후 삭제할 수 있습니다 — 되돌릴 수 없으니 백업은 따로 두세요.
- 게임 파일은 Coffee Stain Studios 자산이라 저장소에 올라가지 않습니다 (`.gitignore` 처리, 이 README만 예외).

```
game-data/
├── README.md
├── Docs/                 ← 1. 필수: 게임 데이터(언어별)
│   ├── ko.json
│   ├── en-US.json
│   └── ...
└── FactoryGame/          ← 2. 선택: FModel로 추출한 아이콘(png)
    └── Content/FactoryGame/...
```

---

## 1. 게임 데이터 — 필수

레시피·아이템·건물 수치와 **이름(번역)** 이 전부 여기 들어 있습니다. FModel 필요 없음.

1. Steam 라이브러리 → Satisfactory 우클릭 → **관리 → 로컬 파일 보기**
2. `CommunityResources\Docs` 폴더를 통째로 `game-data\Docs` 로 복사

```
<Satisfactory 설치 경로>\CommunityResources\Docs\*.json  →  game-data\Docs\
```

- 넣은 언어 파일이 **전부** 앱의 언어 선택에 나옵니다. 필요한 언어만 넣어도 됩니다.
- 1.0 이전 버전의 단일 `Docs.json` 은 영어로 취급합니다.

## 2. 아이콘 — 선택 (FModel)

없으면 아이콘 자리에 `?` 가 표시되고, 나머지 기능은 그대로 동작합니다.

### FModel 설정

1. FModel 다운로드: https://fmodel.app (공식 GitHub: https://github.com/4sval/FModel)
2. 게임 디렉터리 추가: `<Satisfactory 설치 경로>\FactoryGame\Content\Paks`
3. UE 버전: Satisfactory 1.0 기준 `GAME_UE5_3` (게임 업데이트로 엔진이 바뀌면 맞춰 변경)
4. 설정 → 매핑 파일(Local Mapping File) 사용:
   `<Satisfactory 설치 경로>\CommunityResources\FactoryGame.usmap` (게임에 포함돼 있음)

### 추출할 폴더

FModel 트리에서 아래 폴더를 우클릭 → **Save Folder's Packages Textures (.png)**

| FModel 트리 경로 | 내용 |
|---|---|
| `FactoryGame/Content/FactoryGame/Resource` | 부품·광석·유체·바이오매스 아이콘 |
| `FactoryGame/Content/FactoryGame/Buildable/Factory` | 건물 아이콘 (관리자 페이지) |
| `FactoryGame/Content/FactoryGame/Events/Christmas` | FICSMAS 아이템 |
| `FactoryGame/Content/FactoryGame/Equipment` | 탄약 등 |
| `FactoryGame/Content/FactoryGame/Prototype/WAT` | 소머슬룹·머서 구체 |

`FactoryGame/Content/FactoryGame` 전체를 추출해도 됩니다. 파이프라인이 필요한 것만 골라 씁니다.

### 넣는 위치

FModel 출력 폴더(기본 `<FModel>\Output\Exports`) 안의 `FactoryGame` 폴더를 `game-data\` 에 그대로 복사합니다.

```
<FModel>\Output\Exports\FactoryGame  →  game-data\FactoryGame
```

파일 경로 끝부분(`.../Resource/Parts/IronPlate/UI/IconDesc_IronPlates_256.png`)으로 찾으므로,
`game-data\` 안이라면 다른 위치에 둬도 인식됩니다.

---

## 3. 초기 설정

파일을 넣고 앱(`http://localhost:38173`)을 열면 초기 설정 화면으로 이동합니다.

1. 원본 데이터 확인 — 인식된 언어 파일·아이콘 원본
2. 언어 선택 — 사용할 언어와 기본 언어
3. 아이콘 확인 — 필요한 아이콘이 다 있는지, 없는 파일 목록
4. 정리 (선택) — 안 쓰는 원본 파일 삭제
5. 완료

나중에 다시 하려면 관리자 페이지의 "초기 설정" 버튼을 누릅니다.

명령줄로 직접 실행할 수도 있습니다 (초기 설정 완료로 처리됨):

```powershell
python data-pipeline/run_pipeline.py --languages ko,en-US --default-language ko
```

결과물:

```
backend/data/clean/
├── items.json, recipes.json, buildings.json, ...
├── i18n/<언어>.json   ← 선택한 언어별 이름
├── icons/             ← 참조되는 아이콘만 복사됨
└── setup.json         ← 초기 설정 결과 (선택 언어, 아이콘 확인 결과)
```

- `--languages` 를 생략하면 이 폴더의 언어 전부를 씁니다. 다른 폴더를 쓰려면 `--game-data <경로>`
- Docker dev 환경에서는 이 폴더가 마운트되어 관리자 페이지의 "파이프라인 실행" 버튼으로도 돌릴 수 있습니다 (초기 설정의 언어 선택 유지).
- 게임 업데이트 후에는 원본 파일을 새로 복사하고 초기 설정을 다시 하세요.
