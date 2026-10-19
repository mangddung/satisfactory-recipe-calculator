#!/usr/bin/env python3
"""
Flask 서버

관리자 API (환경변수 ENABLE_ADMIN=1 일 때만, 아니면 404):
  GET  /api/admin/items?filter=unclassified
  GET  /api/admin/recipes
  GET  /api/admin/buildings
  GET  /api/admin/validate
  POST /api/admin/classify
  POST /api/admin/pipeline/run

계산기 API:
  GET  /api/languages
  GET  /api/items/craftable
  POST /api/calculate
  GET  /api/plans
  POST /api/plans
  DELETE /api/plans/<plan_id>

초기 설정 API:
  GET  /api/setup/status
  POST /api/setup/run
  GET  /api/setup/cleanup
  POST /api/setup/cleanup

모든 API는 ?lang=<언어코드> 로 이름(displayName/description) 언어 선택.
"""

import functools
import json
import logging
import os
import subprocess
import sys
import threading
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ── 경로 설정 ──────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent
ROOT = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"
DATA_CLEAN = DATA_DIR / "clean"
DATA_INTERMEDIATE = DATA_DIR / "intermediate"
DATA_PIPELINE = ROOT / "data-pipeline"
CLASSIFICATION_OVERRIDES = DATA_PIPELINE / "classification_overrides.json"
PLANS_DIR = DATA_DIR / "plans"

# 아이콘 디렉토리: 환경변수 SATISFACTORY_ICONS_DIR 또는 파이프라인 결과물 backend/data/clean/icons/
ICONS_DIR = Path(os.environ.get("SATISFACTORY_ICONS_DIR", DATA_CLEAN / "icons")).resolve()
I18N_DIR = DATA_CLEAN / "i18n"
SETUP_FILE = DATA_CLEAN / "setup.json"  # 초기 설정 완료 표시 (파이프라인이 생성)
GAME_DATA = ROOT / "game-data"          # 사용자가 넣는 원본 게임 데이터

_icon_file_set: set[str] | None = None


def _build_icon_set() -> set[str]:
    """ICONS_DIR 전체를 한번 스캔해서 상대경로(소문자, /) 집합 반환."""
    result: set[str] = set()
    if ICONS_DIR.exists():
        for f in ICONS_DIR.rglob("*.png"):
            result.add(f.relative_to(ICONS_DIR).as_posix().lower())
    logger.info(f"아이콘 스캔 완료: {len(result)}개")
    return result


_icon_set_stamp: float | None = None


def _get_icon_set() -> set[str]:
    """스캔 캐시. 파이프라인은 실행마다 마지막에 setup.json 을 새로 쓰므로,
    그 수정 시각이 바뀌면(호스트에서 직접 돌린 경우 포함) 다시 스캔."""
    global _icon_file_set, _icon_set_stamp
    stamp = SETUP_FILE.stat().st_mtime if SETUP_FILE.exists() else None
    if _icon_file_set is None or stamp != _icon_set_stamp:
        _icon_file_set = _build_icon_set()
        _icon_set_stamp = stamp
    return _icon_file_set


def _icon_exists(icon_path: str) -> bool:
    """iconPath가 ICONS_DIR 안에 실제로 존재하는지 확인 (스캔 캐시 사용).
    파이프라인이 아이콘을 ICONS_DIR/<iconPath> 에 그대로 복사하므로 정확한 경로만 본다."""
    return icon_path.lower() in _get_icon_set()


VALID_ACQUISITIONS = [
    "miner",
    "oil_extractor",
    "water_extractor",
    "resource_well",
    "natural",
    "byproduct",
    "manufactured",
    "other",
    "unclassified",
]

app = Flask(__name__)

# 관리자 API 는 dev 전용 (docker-compose.yml 에서 켬). 기본은 꺼짐 → prod 에선 404
ADMIN_ENABLED = os.environ.get("ENABLE_ADMIN") == "1"


@app.before_request
def _admin_guard():
    if not ADMIN_ENABLED and request.path.startswith("/api/admin/"):
        abort(404)


# ── 데이터 로딩 헬퍼 ──────────────────────────────────────────────────

def _load_json(path: Path) -> dict:
    """JSON 파일 로드. 없으면 빈 dict."""
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _languages() -> list[str]:
    """파이프라인이 만든 언어 목록 (clean/i18n/<언어>.json)."""
    return sorted(p.stem for p in I18N_DIR.glob("*.json")) if I18N_DIR.exists() else []


def _default_language(languages: list[str]) -> str | None:
    """초기 설정에서 고른 기본 언어 → 없으면 ko → 첫 언어."""
    chosen = _load_json(SETUP_FILE).get("defaultLanguage")
    if chosen in languages:
        return chosen
    return "ko" if "ko" in languages else (languages[0] if languages else None)


def _localize(data: dict) -> dict:
    """요청의 ?lang= 언어로 displayName/description 교체. 없거나 미지원 언어면 기본 언어."""
    languages = _languages()
    lang = request.args.get("lang")
    if lang not in languages:  # 목록에 있는 값만 허용 → 경로 조작 불가
        lang = _default_language(languages)
    if not lang:
        return data
    names = _load_json(I18N_DIR / f"{lang}.json")
    return {k: {**v, **names[k]} if k in names else v for k, v in data.items()}


def _load_clean_data():
    """clean 또는 intermediate 디렉토리에서 최신 데이터 로드 (요청 언어로 이름 교체)."""
    for data_dir in (DATA_CLEAN, DATA_INTERMEDIATE):
        items_path = data_dir / "items.json"
        if items_path.exists():
            return (
                _localize(_load_json(data_dir / "items.json")),
                _localize(_load_json(data_dir / "recipes.json")),
                _localize(_load_json(data_dir / "buildings.json")),
            )
    # 파이프라인 미실행 → raw 데이터 fallback
    raw_dir = DATA_DIR / "raw"
    return (
        _load_json(raw_dir / "items.json"),
        _load_json(raw_dir / "recipes.json"),
        _load_json(raw_dir / "buildings.json"),
    )


def _load_extractors() -> dict:
    """extractors.json 로드. clean → intermediate → raw 순으로 탐색."""
    for data_dir in (DATA_CLEAN, DATA_INTERMEDIATE, DATA_DIR / "raw"):
        path = data_dir / "extractors.json"
        if path.exists():
            return _localize(_load_json(path))
    return {}


def _load_conveyors() -> dict:
    """conveyors.json 로드. clean → intermediate → raw 순으로 탐색."""
    for data_dir in (DATA_CLEAN, DATA_INTERMEDIATE, DATA_DIR / "raw"):
        path = data_dir / "conveyors.json"
        if path.exists():
            return _localize(_load_json(path))
    return {}


def _load_game_constants() -> dict:
    """game_constants.json 로드. clean → intermediate → raw 순으로 탐색."""
    for data_dir in (DATA_CLEAN, DATA_INTERMEDIATE, DATA_DIR / "raw"):
        path = data_dir / "game_constants.json"
        if path.exists():
            return _load_json(path)
    return {}


def _load_classification_overrides() -> dict:
    return _load_json(CLASSIFICATION_OVERRIDES)


def _save_classification_overrides(overrides: dict):
    CLASSIFICATION_OVERRIDES.parent.mkdir(parents=True, exist_ok=True)
    with open(CLASSIFICATION_OVERRIDES, "w", encoding="utf-8") as f:
        json.dump(overrides, f, ensure_ascii=False, indent=2)


# ── API 엔드포인트 ─────────────────────────────────────────────────────

@app.get("/api/admin/items")
def api_items():
    """
    아이템 목록 반환.
    ?filter=unclassified  → acquisition이 null 또는 "unclassified"인 것만
    """
    items, _, _ = _load_clean_data()
    filter_mode = request.args.get("filter", "")
    # 저장된 수동 분류는 파이프라인 재실행 전에도 관리자 화면에 보이게 함
    overrides = _load_classification_overrides()

    result = []
    for item_id, data in items.items():
        acquisition = overrides.get(item_id, data.get("acquisition"))
        if filter_mode == "unclassified" and acquisition not in (None, "unclassified"):
            continue
        icon = data.get("iconPath")
        result.append({
            "id": item_id,
            "displayName": data.get("displayName", item_id),
            "isFluid": data.get("isFluid", False),
            "acquisition": acquisition,
            "producedBy": data.get("producedBy"),
            "iconPath": icon if icon and _icon_exists(icon) else None,
        })

    result.sort(key=lambda x: (x["acquisition"] not in (None, "unclassified"), x["displayName"]))
    return jsonify({"items": result, "total": len(result)})


@app.get("/api/admin/items/<item_id>")
def api_item_detail(item_id: str):
    """아이템 상세 정보 (파싱된 전체 필드 포함)."""
    items, recipes, _ = _load_clean_data()
    if item_id not in items:
        abort(404)
    data = items[item_id]
    icon = data.get("iconPath")

    used_in = []
    produced_by = []
    for rid, r in recipes.items():
        if any(ing.get("item") == item_id for ing in r.get("ingredients", [])):
            used_in.append({"id": rid, "displayName": r.get("displayName", rid)})
        if any(p.get("item") == item_id for p in r.get("products", []) + r.get("byproducts", [])):
            produced_by.append({"id": rid, "displayName": r.get("displayName", rid)})

    return jsonify({
        "id": item_id,
        "className": data.get("className"),
        "slug": data.get("slug"),
        "displayName": data.get("displayName", item_id),
        "description": data.get("description"),
        "stackSize": data.get("stackSize"),
        "isFluid": data.get("isFluid", False),
        "iconPath": icon if icon and _icon_exists(icon) else None,
        "acquisition": _load_classification_overrides().get(item_id, data.get("acquisition")),
        "producedBy": data.get("producedBy"),
        "rawHints": data.get("_rawHints", {}),
        "usedInRecipes": used_in,
        "producedByRecipes": produced_by,
    })


@app.get("/api/icons/<path:icon_path>")
def api_icon(icon_path: str):
    """파이프라인이 추출한 아이콘 PNG 서빙 (ICONS_DIR/<iconPath>)."""
    candidate = (ICONS_DIR / icon_path).resolve()
    if candidate.is_relative_to(ICONS_DIR) and candidate.is_file():
        return send_file(candidate, mimetype="image/png")
    abort(404)


@app.get("/api/admin/recipes")
def api_recipes():
    _, recipes, _ = _load_clean_data()
    result = [
        {
            "id": rid,
            "displayName": d.get("displayName", rid),
            "recipeType": d.get("recipeType"),
            "producedIn": d.get("producedIn"),
            "buildingCategory": d.get("buildingCategory"),
            "manufactoringDuration": d.get("manufactoringDuration"),
            "ingredients": d.get("ingredients", []),
            "products": d.get("products", []),
            "byproducts": d.get("byproducts", []),
        }
        for rid, d in recipes.items()
    ]
    return jsonify({"recipes": result, "total": len(result)})


@app.get("/api/admin/buildings")
def api_buildings():
    _, _, buildings = _load_clean_data()
    result = [
        {
            "id": bid,
            "displayName": d.get("displayName", bid),
            "buildingCategory": d.get("buildingCategory"),
            "powerConsumption": d.get("powerConsumption"),
            "somersloopSlots": d.get("somersloopSlots"),
            "iconPath": d.get("iconPath") if _icon_exists(d.get("iconPath") or "") else None,
        }
        for bid, d in buildings.items()
    ]
    return jsonify({"buildings": result, "total": len(result)})


@app.get("/api/admin/buildings/<building_id>")
def api_building_detail(building_id: str):
    """건물 상세 정보."""
    _, recipes, buildings = _load_clean_data()
    if building_id not in buildings:
        abort(404)
    data = buildings[building_id]

    used_in = [
        {"id": rid, "displayName": r.get("displayName", rid)}
        for rid, r in recipes.items()
        if building_id in (r.get("producedIn") or [])
    ]

    return jsonify({
        "id": building_id,
        "className": data.get("className"),
        "slug": data.get("slug"),
        "displayName": data.get("displayName", building_id),
        "description": data.get("description"),
        "buildingCategory": data.get("buildingCategory"),
        "powerConsumption": data.get("powerConsumption"),
        "somersloopSlots": data.get("somersloopSlots"),
        "iconPath": data.get("iconPath") if _icon_exists(data.get("iconPath") or "") else None,
        "usedInRecipes": used_in,
    })


@app.get("/api/admin/validate")
def api_validate():
    """validate.py 실행 후 결과 반환."""
    try:
        validate_module = _import_pipeline_module("validate")
        items, recipes, buildings = _load_clean_data()
        result = validate_module.ValidationResult()

        if items:
            validate_module.validate_items(items, result)
        if recipes:
            validate_module.validate_recipes(recipes, items, buildings, result)
        if buildings:
            validate_module.validate_buildings(buildings, result)
        if items and recipes and buildings:
            validate_module.validate_referential_integrity(items, recipes, buildings, result)

        return jsonify({
            "valid": result.is_valid,
            "errors": result.errors,
            "warnings": result.warnings,
        })
    except Exception:
        logger.exception("검증 실패")  # 상세는 서버 로그에만
        return jsonify({"valid": False, "errors": ["validation failed"], "warnings": []}), 500


@app.post("/api/admin/classify")
def api_classify():
    """
    아이템 분류 수동 지정.
    Body: {"item_id": "Desc_OreIron_C", "acquisition": "miner"}
    classification_overrides.json에 저장.
    """
    body = request.get_json(force=True, silent=True) or {}
    item_id = body.get("item_id", "").strip()
    acquisition = body.get("acquisition", "").strip()

    if not item_id:
        return jsonify({"error": "item_id 필수"}), 400
    if acquisition not in VALID_ACQUISITIONS:
        return jsonify({"error": f"유효하지 않은 acquisition: {acquisition}", "valid": VALID_ACQUISITIONS}), 400

    overrides = _load_classification_overrides()
    overrides[item_id] = acquisition
    _save_classification_overrides(overrides)

    logger.info(f"분류 저장: {item_id} → {acquisition}")
    return jsonify({"ok": True, "item_id": item_id, "acquisition": acquisition})


# ponytail: 프로세스 안 잠금. 워커 여러 개(gunicorn 등)로 돌리면 파일 잠금으로 바꿔야 함
_busy = threading.Lock()


def _exclusive(view):
    """파이프라인 실행·game-data 정리는 한 번에 하나만 (같은 폴더에 쓰고 지움). 실행 중이면 409."""
    @functools.wraps(view)
    def wrapper(*args, **kwargs):
        if not _busy.acquire(blocking=False):
            return jsonify({"ok": False, "error": "파이프라인 또는 정리가 이미 실행 중"}), 409
        try:
            return view(*args, **kwargs)
        finally:
            _busy.release()
    return wrapper


def _run_pipeline(args: list[str]) -> subprocess.CompletedProcess:
    """run_pipeline.py 실행 (인자는 리스트로만 전달 — 셸 미사용). 끝나면 아이콘 캐시 초기화."""
    global _icon_file_set
    result = subprocess.run(
        [sys.executable, str(DATA_PIPELINE / "run_pipeline.py"), *args],
        capture_output=True, text=True, timeout=600,
    )
    _icon_file_set = None
    return result


def _setup_args() -> list[str]:
    """초기 설정에서 고른 언어·티어 보정을 유지하는 파이프라인 인자."""
    setup = _load_json(SETUP_FILE)
    if not setup.get("languages"):
        return []
    args = ["--languages", ",".join(setup["languages"]), "--default-language", setup["defaultLanguage"]]
    return args + ["--fix-tiers"] if setup.get("tiers", {}).get("fixed") else args


@app.post("/api/admin/pipeline/run")
@_exclusive
def api_pipeline_run():
    """파이프라인 재실행 (초기 설정의 언어 선택 유지)."""
    try:
        result = _run_pipeline(_setup_args())
        return jsonify({
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout[-3000:],  # 마지막 3000자
            "stderr": result.stderr[-1000:],
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "파이프라인 타임아웃 (600초 초과)"}), 500
    except Exception:
        logger.exception("파이프라인 실행 실패")  # 상세는 서버 로그에만
        return jsonify({"error": "pipeline failed"}), 500


# ── 초기 설정 (game-data → 언어 선택 → 아이콘 확인 → 정리) ────────────────

def _language_files() -> dict[str, Path]:
    if not GAME_DATA.exists():
        return {}
    return _import_pipeline_module("run_pipeline").find_language_files(GAME_DATA)


def _public_setup() -> dict | None:
    setup = _load_json(SETUP_FILE)
    if not setup:
        return None
    return {k: v for k, v in setup.items() if k != "usedSources"}


def _walk_files(directory: Path):
    """하위 파일 DirEntry 순회. 심볼릭 링크는 따라가지도 반환하지도 않음 → game-data 밖으로 못 나감.
    (Docker Desktop 바인드 마운트에서 pathlib.rglob + resolve 보다 수 배 빠름)"""
    with os.scandir(directory) as it:
        for entry in it:
            if entry.is_dir(follow_symlinks=False):
                yield from _walk_files(Path(entry.path))
            elif entry.is_file(follow_symlinks=False):
                yield entry


def _unused_game_files() -> list[tuple[Path, int]]:
    """game-data 안에서 마지막 파이프라인이 쓰지 않은 파일과 크기 (README 제외).
    서버가 직접 계산 — 클라이언트 입력 없음."""
    used = set(_load_json(SETUP_FILE).get("usedSources", []))
    files = []
    for entry in _walk_files(GAME_DATA):
        path = Path(entry.path)
        rel = path.relative_to(GAME_DATA).as_posix()
        if rel != "README.md" and rel not in used:
            files.append((path, entry.stat(follow_symlinks=False).st_size))
    return files


@app.get("/api/setup/status")
def api_setup_status():
    icon_source_found = GAME_DATA.exists() and any(
        e.name.lower().endswith(".png") for e in _walk_files(GAME_DATA)  # 첫 png에서 멈춤
    )
    return jsonify({
        "configured": SETUP_FILE.exists(),
        "gameData": {
            "languageFiles": [
                {"code": code, "path": p.relative_to(GAME_DATA).as_posix(), "bytes": p.stat().st_size}
                for code, p in sorted(_language_files().items())
            ],
            "iconSourceFound": icon_source_found,
        },
        "setup": _public_setup(),
    })


@app.post("/api/setup/run")
@_exclusive
def api_setup_run():
    """Body: {"languages": ["ko", "en-US"], "defaultLanguage": "ko", "fixTiers": true}
    → 선택 언어로 파이프라인 실행. fixTiers(생략 시 false)면 어긋난 티어 보정."""
    body = request.get_json(force=True, silent=True) or {}
    languages = body.get("languages")
    default_language = body.get("defaultLanguage")
    fix_tiers = body.get("fixTiers", False)
    available = _language_files()
    if not isinstance(languages, list) or not languages or any(code not in available for code in languages):
        return jsonify({"error": "languages는 game-data에 있는 언어 코드 목록이어야 함"}), 400
    if default_language not in languages:
        return jsonify({"error": "defaultLanguage는 languages 중 하나여야 함"}), 400
    if not isinstance(fix_tiers, bool):
        return jsonify({"error": "fixTiers는 true/false"}), 400
    args = ["--languages", ",".join(languages), "--default-language", default_language]
    try:
        result = _run_pipeline(args + ["--fix-tiers"] if fix_tiers else args)
    except subprocess.TimeoutExpired:
        return jsonify({"ok": False, "error": "파이프라인 타임아웃 (600초 초과)"}), 500
    if result.returncode != 0:
        logger.error(f"초기 설정 파이프라인 실패:\n{result.stderr[-3000:]}")
        return jsonify({"ok": False, "error": "파이프라인 실패", "log": result.stderr[-1000:]}), 500
    return jsonify({"ok": True, "setup": _public_setup()})


@app.get("/api/setup/cleanup")
def api_setup_cleanup_preview():
    """정리하면 삭제될 game-data 파일 요약."""
    if not SETUP_FILE.exists():
        return jsonify({"error": "초기 설정(파이프라인) 먼저 실행 필요"}), 409
    unused = dict(_unused_game_files())
    lang_files = [
        {"code": code, "path": p.relative_to(GAME_DATA).as_posix(), "bytes": unused[p]}
        for code, p in sorted(_language_files().items()) if p in unused
    ]
    lang_paths = {GAME_DATA / f["path"] for f in lang_files}
    pngs = [p for p in unused if p.suffix.lower() == ".png"]
    other = sorted(p for p in unused if p.suffix.lower() != ".png" and p not in lang_paths)
    return jsonify({
        "languages": {"files": lang_files, "bytes": sum(f["bytes"] for f in lang_files)},
        "pngs": {"count": len(pngs), "bytes": sum(unused[p] for p in pngs)},
        "other": {
            "count": len(other),
            "bytes": sum(unused[p] for p in other),
            "samples": [p.relative_to(GAME_DATA).as_posix() for p in other[:20]],
        },
        "totalCount": len(unused),
        "totalBytes": sum(unused.values()),
    })


@app.post("/api/setup/cleanup")
@_exclusive
def api_setup_cleanup():
    """Body: {"confirm": true} → 사용하지 않는 game-data 파일 삭제 후 빈 폴더 정리. 되돌릴 수 없음."""
    body = request.get_json(force=True, silent=True) or {}
    if body.get("confirm") is not True:
        return jsonify({"error": "confirm: true 필요"}), 400
    if not SETUP_FILE.exists():
        return jsonify({"error": "초기 설정(파이프라인) 먼저 실행 필요"}), 409
    files = _unused_game_files()
    for path, _ in files:
        path.unlink()
    for dirpath, _, _ in sorted(os.walk(GAME_DATA), key=lambda w: len(Path(w[0]).parts), reverse=True):
        if Path(dirpath) != GAME_DATA and not os.listdir(dirpath):
            os.rmdir(dirpath)
    deleted_bytes = sum(size for _, size in files)
    logger.info(f"game-data 정리: {len(files)}개 파일 삭제 ({deleted_bytes} bytes)")
    return jsonify({"deletedCount": len(files), "deletedBytes": deleted_bytes})


# ── 공개 게임 데이터 API (계산기 클라이언트용) ─────────────────────────

@app.get("/api/items")
def api_public_items():
    items, _, _ = _load_clean_data()
    result = [
        {
            "id": item_id,
            "displayName": data.get("displayName", item_id),
            "iconPath": data.get("iconPath") if _icon_exists(data.get("iconPath") or "") else None,
            "acquisition": data.get("acquisition"),
            "isFluid": data.get("isFluid", False),
            "producedBy": data.get("producedBy"),
        }
        for item_id, data in items.items()
    ]
    return jsonify({"items": result, "total": len(result)})


@app.get("/api/recipes")
def api_public_recipes():
    _, recipes, _ = _load_clean_data()
    result = [
        {
            "id": rid,
            "displayName": d.get("displayName", rid),
            "recipeType": d.get("recipeType"),
            "producedIn": d.get("producedIn", []),
            "manufactoringDuration": d.get("manufactoringDuration"),
            "ingredients": d.get("ingredients", []),
            "products": d.get("products", []),
            "byproducts": d.get("byproducts", []),
        }
        for rid, d in recipes.items()
    ]
    return jsonify({"recipes": result, "total": len(result)})


@app.get("/api/buildings")
def api_public_buildings():
    _, _, buildings = _load_clean_data()
    result = [
        {
            "id": bid,
            "displayName": d.get("displayName", bid),
            "buildingCategory": d.get("buildingCategory"),
            "powerConsumption": d.get("powerConsumption"),
            "somersloopSlots": d.get("somersloopSlots"),
            "iconPath": d.get("iconPath") if _icon_exists(d.get("iconPath") or "") else None,
        }
        for bid, d in buildings.items()
    ]
    return jsonify({"buildings": result, "total": len(result)})


# ── 계산기 API ────────────────────────────────────────────────────────

@app.get("/api/languages")
def api_languages():
    """게임 데이터 언어 목록 (파이프라인이 game-data의 언어 파일에서 추출한 것)."""
    languages = _languages()
    return jsonify({"languages": languages, "default": _default_language(languages)})


@app.get("/api/extractors")
def api_extractors():
    """채굴기/추출기 목록 반환."""
    extractors = _load_extractors()
    return jsonify({"extractors": extractors, "total": len(extractors)})


@app.get("/api/conveyors")
def api_conveyors():
    """컨베이어 벨트/리프트 목록 반환."""
    conveyors = _load_conveyors()
    return jsonify({"conveyors": list(conveyors.values()), "total": len(conveyors)})


@app.get("/api/game-constants")
def api_game_constants():
    """게임 상수 반환 (순도 배율 등)."""
    return jsonify(_load_game_constants())


@app.get("/api/items/craftable")
def api_craftable_items():
    """production 레시피 보유 + unclassified/other 제외 아이템 목록."""
    from calculator import get_craftable_items
    items, recipes, _ = _load_clean_data()
    result = get_craftable_items(items, recipes)
    for item in result:
        ip = item.get("iconPath")
        if ip and not _icon_exists(ip):
            item["iconPath"] = None
    return jsonify({"items": result, "total": len(result)})


@app.post("/api/calculate")
def api_calculate():
    """
    생산 체인 계산.
    Body: {"itemId": "...", "targetRate": 100, "recipeSelections": {"itemId": "recipeId", ...}}
    """
    from calculator import calculate, aggregate_raw_resources, sum_power
    body = request.get_json(force=True, silent=True) or {}
    item_id = body.get("itemId", "").strip()
    target_rate = body.get("targetRate")
    recipe_selections = body.get("recipeSelections", {})

    if not item_id:
        return jsonify({"error": "itemId 필수"}), 400
    if target_rate is None or float(target_rate) <= 0:
        return jsonify({"error": "targetRate > 0 필수"}), 400

    items, recipes, buildings = _load_clean_data()
    extractors = _load_extractors()
    game_constants = _load_game_constants()
    root = calculate(item_id, float(target_rate), recipe_selections, items, recipes, buildings, extractors=extractors, game_constants=game_constants)
    raw = aggregate_raw_resources(root)

    return jsonify({
        "root": root,
        "rawResources": [{"itemId": k, "rate": round(v, 4)} for k, v in sorted(raw.items())],
        "totalPowerMW": round(sum_power(root), 2),
    })


# ── 플랜 CRUD ──────────────────────────────────────────────────────────

def _load_plans() -> list:
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    plans = []
    for f in sorted(PLANS_DIR.glob("*.json")):
        try:
            plans.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            pass
    return plans


@app.get("/api/plans")
def api_plans_list():
    return jsonify({"plans": _load_plans()})


@app.post("/api/plans")
def api_plans_create():
    """
    Body: {"name": "...", "itemId": "...", "targetRate": 100, "recipeSelections": {...},
           "rawNodeSettings": {...}, "collapsedPaths": [...]}
    """
    body = request.get_json(force=True, silent=True) or {}
    name = body.get("name", "").strip()
    item_id = body.get("itemId", "").strip()
    target_rate = body.get("targetRate")
    recipe_selections = body.get("recipeSelections", {})
    raw_node_settings = body.get("rawNodeSettings", {})
    collapsed_paths = body.get("collapsedPaths", [])

    if not name or not item_id or target_rate is None:
        return jsonify({"error": "name, itemId, targetRate 필수"}), 400
    if not isinstance(raw_node_settings, dict) or not isinstance(collapsed_paths, list) \
            or not all(isinstance(p, str) for p in collapsed_paths):
        return jsonify({"error": "rawNodeSettings는 객체, collapsedPaths는 문자열 배열"}), 400

    plan = {
        "id": str(uuid.uuid4()),
        "name": name,
        "itemId": item_id,
        "targetRate": float(target_rate),
        "recipeSelections": recipe_selections,
        "rawNodeSettings": raw_node_settings,
        "collapsedPaths": collapsed_paths,
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    (PLANS_DIR / f"{plan['id']}.json").write_text(
        json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return jsonify(plan), 201


@app.delete("/api/plans/<plan_id>")
def api_plans_delete(plan_id: str):
    path = PLANS_DIR / f"{plan_id}.json"
    if not path.exists():
        abort(404)
    path.unlink()
    return jsonify({"ok": True, "id": plan_id})


# ── 파이프라인 모듈 임포트 ──────────────────────────────────────────────

def _import_pipeline_module(name: str):
    import importlib.util
    path = DATA_PIPELINE / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── 개발 서버 ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    logger.info(f"데이터 경로: {DATA_CLEAN}")
    logger.info(f"분류 오버라이드: {CLASSIFICATION_OVERRIDES}")
    app.run(host="0.0.0.0", port=5000, debug=True)
