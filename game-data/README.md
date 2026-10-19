# game-data — original game files

[English](#english) · [한국어](#한국어)

---

## English

Put the **original files** taken from the game into this folder **as they are**, then open the app and it shows the initial setup screen.
When you choose languages there, only the data you need (recipes, items, buildings, names, icons) is generated into `backend/data/clean/`.

- Data generation only **reads** this folder. After setup you can delete the originals you put here (`Docs/`, `FactoryGame/`) — to run setup again (other languages, after a game update), copy them back first.
- The game files are Coffee Stain Studios assets and are never committed (ignored in `.gitignore`, except this README).

```
game-data/
├── README.md
├── Docs/                 ← 1. Required: game data (one file per language)
│   ├── ko.json
│   ├── en-US.json
│   └── ...
└── FactoryGame/          ← 2. Optional: icons (png) exported with FModel
    └── Content/FactoryGame/...
```

### 1. Game data — required

All recipe, item, and building values and the **names (translations)** are in these files. No FModel needed.

1. Steam Library → right-click Satisfactory → **Manage → Browse local files**
2. Copy the whole `CommunityResources\Docs` folder to `game-data\Docs`

```
<Satisfactory install path>\CommunityResources\Docs\*.json  →  game-data\Docs\
```

- **Every** language file you add shows up in the app's language choice. You can add only the languages you need.
- A single `Docs.json` from versions before 1.0 is treated as English.

### 2. Icons — optional (FModel)

Without them, icons show as `?` and everything else works.

#### FModel settings

1. Download FModel: https://fmodel.app (official GitHub: https://github.com/4sval/FModel)
2. Select the Satisfactory install folder, UE version `GAME_UE5_6` (Satisfactory 1.2) → OK
3. In the **Archives** tab, double-click `FactoryGame-Windows.utoc`

#### Folders to export

In the FModel tree, right-click each folder below → **Export Folder → Textures**. This only adds it to the queue —
click **Queued Items** at the bottom right and run **Export** to actually extract the files.

| FModel tree path | Contents |
|---|---|
| `FactoryGame/Content/FactoryGame/Resource` | Parts, ores, fluids, biomass icons |
| `FactoryGame/Content/FactoryGame/Buildable/Factory` | Building icons (admin pages) |
| `FactoryGame/Content/FactoryGame/Events/Christmas` | FICSMAS items |
| `FactoryGame/Content/FactoryGame/Equipment` | Ammo and more |
| `FactoryGame/Content/FactoryGame/Prototype/WAT` | Somersloop, Mercer Sphere |

You can also export all of `FactoryGame/Content/FactoryGame`. The pipeline picks only what it needs.

#### Where to put them

Copy the `FactoryGame` folder inside the FModel output folder (default `<FModel>\Output\Exports`) into `game-data\` as it is.

```
<FModel>\Output\Exports\FactoryGame  →  game-data\FactoryGame
```

Icons are matched by the end of the file path (`.../Resource/Parts/IronPlate/UI/IconDesc_IronPlates_256.png`),
so they are found anywhere inside `game-data\`.

### 3. Initial setup

After adding the files, open the app (`http://localhost:38173`) and it moves to initial setup.

1. Source data — language files and icon source found
2. Languages — languages to use and the default language
3. Tier fix — choose whether to fix items whose tier in the game data is earlier than the tier where they can actually be automated
4. Icons — whether every needed icon is there, and a list of missing files
5. Done — after this you can delete the originals you added (`Docs/`, `FactoryGame/`)

To run it again later, open `/setup` in the browser, or press the "Initial setup" button on the admin page (dev).

You can also run it from the command line (counts as setup done):

```powershell
python data-pipeline/run_pipeline.py --languages ko,en-US --default-language ko
```

Output:

```
backend/data/clean/
├── items.json, recipes.json, buildings.json, ...
├── i18n/<language>.json   ← names for each chosen language
├── icons/                 ← only the icons that are referenced
└── setup.json             ← setup result (chosen languages, tier fix, icon check)
```

- Without `--languages`, every language in this folder is used. To use another folder: `--game-data <path>`
- In the Docker dev environment this folder is mounted, so the admin page's "Run pipeline" button also works (keeps the languages chosen in setup).
- After a game update, copy the original files again and redo the initial setup.

---

## 한국어

이 폴더에 게임에서 꺼낸 **원본 파일을 그대로** 넣고 앱을 열면 초기 설정 화면이 나옵니다.
거기서 사용할 언어를 고르면 필요한 데이터(레시피·아이템·건물·이름·아이콘)만 골라 `backend/data/clean/` 에 만들어집니다.

- 데이터 생성은 이 폴더를 **읽기만** 합니다. 초기 설정이 끝나면 넣은 원본(`Docs/`, `FactoryGame/`)은 지워도 됩니다 — 다시 설정하려면(언어 변경, 게임 업데이트) 원본을 다시 넣어야 합니다.
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

### 1. 게임 데이터 — 필수

레시피·아이템·건물 수치와 **이름(번역)** 이 전부 여기 들어 있습니다. FModel 필요 없음.

1. Steam 라이브러리 → Satisfactory 우클릭 → **관리 → 로컬 파일 보기**
2. `CommunityResources\Docs` 폴더를 통째로 `game-data\Docs` 로 복사

```
<Satisfactory 설치 경로>\CommunityResources\Docs\*.json  →  game-data\Docs\
```

- 넣은 언어 파일이 **전부** 앱의 언어 선택에 나옵니다. 필요한 언어만 넣어도 됩니다.
- 1.0 이전 버전의 단일 `Docs.json` 은 영어로 취급합니다.

### 2. 아이콘 — 선택 (FModel)

없으면 아이콘 자리에 `?` 가 표시되고, 나머지 기능은 그대로 동작합니다.

#### FModel 설정

1. FModel 다운로드: https://fmodel.app (공식 GitHub: https://github.com/4sval/FModel)
2. Satisfactory 설치 경로 선택, UE 버전 `GAME_UE5_6` (Satisfactory 1.2 기준) → OK
3. **Archives** 탭에서 `FactoryGame-Windows.utoc` 더블 클릭

#### 추출할 폴더

FModel 트리에서 아래 폴더를 우클릭 → **Export Folder → Textures**. 이것만으로는 큐에 등록만 되므로,
우측 하단 **Queued Items** 를 눌러 **Export** 를 실행해야 실제로 추출됩니다.

| FModel 트리 경로 | 내용 |
|---|---|
| `FactoryGame/Content/FactoryGame/Resource` | 부품·광석·유체·바이오매스 아이콘 |
| `FactoryGame/Content/FactoryGame/Buildable/Factory` | 건물 아이콘 (관리자 페이지) |
| `FactoryGame/Content/FactoryGame/Events/Christmas` | FICSMAS 아이템 |
| `FactoryGame/Content/FactoryGame/Equipment` | 탄약 등 |
| `FactoryGame/Content/FactoryGame/Prototype/WAT` | 소머슬룹·머서 구체 |

`FactoryGame/Content/FactoryGame` 전체를 추출해도 됩니다. 파이프라인이 필요한 것만 골라 씁니다.

#### 넣는 위치

FModel 출력 폴더(기본 `<FModel>\Output\Exports`) 안의 `FactoryGame` 폴더를 `game-data\` 에 그대로 복사합니다.

```
<FModel>\Output\Exports\FactoryGame  →  game-data\FactoryGame
```

파일 경로 끝부분(`.../Resource/Parts/IronPlate/UI/IconDesc_IronPlates_256.png`)으로 찾으므로,
`game-data\` 안이라면 다른 위치에 둬도 인식됩니다.

### 3. 초기 설정

파일을 넣고 앱(`http://localhost:38173`)을 열면 초기 설정 화면으로 이동합니다.

1. 원본 데이터 확인 — 인식된 언어 파일·아이콘 원본
2. 언어 선택 — 사용할 언어와 기본 언어
3. 티어 보정 — 게임 데이터의 티어가 실제로 자동화할 수 있는 티어보다 이른 아이템을 보정할지 선택
4. 아이콘 확인 — 필요한 아이콘이 다 있는지, 없는 파일 목록
5. 완료 — 이후 넣은 원본(`Docs/`, `FactoryGame/`)은 지워도 됨

나중에 다시 하려면 브라우저에서 `/setup` 을 열거나, 관리자 페이지(dev)의 "초기 설정" 버튼을 누릅니다.

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
└── setup.json         ← 초기 설정 결과 (선택 언어, 티어 보정, 아이콘 확인 결과)
```

- `--languages` 를 생략하면 이 폴더의 언어 전부를 씁니다. 다른 폴더를 쓰려면 `--game-data <경로>`
- Docker dev 환경에서는 이 폴더가 마운트되어 관리자 페이지의 "파이프라인 실행" 버튼으로도 돌릴 수 있습니다 (초기 설정의 언어 선택 유지).
- 게임 업데이트 후에는 원본 파일을 새로 복사하고 초기 설정을 다시 하세요.
