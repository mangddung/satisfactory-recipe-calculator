#!/usr/bin/env python3
"""
Flask 서버

관리자 API:
  GET  /api/admin/items?filter=unclassified
  GET  /api/admin/recipes
  GET  /api/admin/buildings
  GET  /api/admin/validate
  POST /api/admin/classify
  POST /api/admin/pipeline/run

계산기 API:
  GET  /api/items/craftable
  POST /api/calculate
  GET  /api/plans
  POST /api/plans
  DELETE /api/plans/<plan_id>
"""

import json
import logging
import os
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, abort, jsonify, render_template, request, send_file

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

# 아이콘 디렉토리: 환경변수 SATISFACTORY_ICONS_DIR 또는 backend/data/original/icons/
ICONS_DIR = Path(os.environ.get("SATISFACTORY_ICONS_DIR", DATA_DIR / "original" / "icons")).resolve()

_icon_file_set: set[str] | None = None


def _build_icon_set() -> set[str]:
    """ICONS_DIR 전체를 한번 스캔해서 소문자 절대경로 집합 반환."""
    result: set[str] = set()
    if ICONS_DIR.exists():
        for f in ICONS_DIR.rglob("*.png"):
            result.add(str(f.resolve()).lower())
    logger.info(f"아이콘 스캔 완료: {len(result)}개")
    return result


def _get_icon_set() -> set[str]:
    global _icon_file_set
    if _icon_file_set is None:
        _icon_file_set = _build_icon_set()
    return _icon_file_set


def _building_icon_path(building_id: str) -> str | None:
    """건물 ID → Buildable/Factory/{name}/UI/*.png 경로 도출.
    선호도: *_256.png > 나머지 PNG
    Build_GeneratorBiomass_Automated_C 처럼 _Automated 같은 suffix 있으면 제거도 시도.
    """
    factory_dir = ICONS_DIR / "Buildable" / "Factory"
    base = building_id.removeprefix("Build_").removesuffix("_C")
    # 후보 폴더명: 원본, 그리고 마지막 _Xxx 부분을 순서대로 제거
    name_parts = base.split("_")
    candidates = []
    for i in range(len(name_parts), 0, -1):
        candidates.append("_".join(name_parts[:i]))
    for name in candidates:
        folder = factory_dir / name / "UI"
        if not folder.exists():
            continue
        pngs = list(folder.glob("*.png"))
        if not pngs:
            continue
        prefer = [p for p in pngs if "256" in p.name] or pngs
        chosen = prefer[0]
        return str(chosen.relative_to(ICONS_DIR)).replace("\\", "/")
    return None


def _icon_exists(icon_path: str) -> bool:
    """iconPath가 ICONS_DIR 안에 실제로 존재하는지 확인 (스캔 캐시 사용)."""
    available = _get_icon_set()
    parts = Path(icon_path).parts
    for i in range(len(parts)):
        candidate = (ICONS_DIR / Path(*parts[i:])).resolve()
        if str(candidate).lower() in available:
            return True
    return False


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


# ── 데이터 로딩 헬퍼 ──────────────────────────────────────────────────

def _load_json(path: Path) -> dict:
    """JSON 파일 로드. 없으면 빈 dict."""
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_clean_data():
    """clean 또는 intermediate 디렉토리에서 최신 데이터 로드."""
    for data_dir in (DATA_CLEAN, DATA_INTERMEDIATE):
        items_path = data_dir / "items.json"
        if items_path.exists():
            return (
                _load_json(data_dir / "items.json"),
                _load_json(data_dir / "recipes.json"),
                _load_json(data_dir / "buildings.json"),
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
            return _load_json(path)
    return {}


def _load_conveyors() -> dict:
    """conveyors.json 로드. clean → intermediate → raw 순으로 탐색."""
    for data_dir in (DATA_CLEAN, DATA_INTERMEDIATE, DATA_DIR / "raw"):
        path = data_dir / "conveyors.json"
        if path.exists():
            return _load_json(path)
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

    result = []
    for item_id, data in items.items():
        acquisition = data.get("acquisition")
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
        "acquisition": data.get("acquisition"),
        "producedBy": data.get("producedBy"),
        "rawHints": data.get("_rawHints", {}),
        "usedInRecipes": used_in,
        "producedByRecipes": produced_by,
    })


@app.get("/api/admin/icons/<path:icon_path>")
def api_icon(icon_path: str):
    """게임에서 추출한 아이콘 PNG 서빙.
    iconPath가 FactoryGame/Resource/Parts/Item/UI/icon.png 형태여도
    실제 파일이 icons/Item/UI/icon.png에 있으면 찾아낸다.
    """
    parts = Path(icon_path).parts
    for i in range(len(parts)):
        candidate = (ICONS_DIR / Path(*parts[i:])).resolve()
        if not str(candidate).startswith(str(ICONS_DIR)):
            continue
        if candidate.exists():
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
            "iconPath": _building_icon_path(bid),
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
        "iconPath": _building_icon_path(building_id),
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
    except Exception as e:
        logger.exception("검증 실패")
        return jsonify({"valid": False, "errors": [str(e)], "warnings": []}), 500


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


@app.delete("/api/admin/classify/<item_id>")
def api_classify_delete(item_id: str):
    """분류 오버라이드 제거 (자동 분류로 복원)."""
    overrides = _load_classification_overrides()
    if item_id in overrides:
        del overrides[item_id]
        _save_classification_overrides(overrides)
    return jsonify({"ok": True, "item_id": item_id})


@app.post("/api/admin/pipeline/run")
def api_pipeline_run():
    """파이프라인 재실행 (백그라운드)."""
    pipeline_script = DATA_PIPELINE / "run_pipeline.py"
    if not pipeline_script.exists():
        return jsonify({"error": "run_pipeline.py 없음"}), 404
    try:
        result = subprocess.run(
            [sys.executable, str(pipeline_script)],
            capture_output=True, text=True, timeout=120,
        )
        global _icon_file_set
        _icon_file_set = None
        return jsonify({
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout[-3000:],  # 마지막 3000자
            "stderr": result.stderr[-1000:],
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "파이프라인 타임아웃 (120초 초과)"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
            "iconPath": None,
        }
        for bid, d in buildings.items()
    ]
    return jsonify({"buildings": result, "total": len(result)})


# ── 계산기 API ────────────────────────────────────────────────────────

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
    Body: {"name": "...", "itemId": "...", "targetRate": 100, "recipeSelections": {...}}
    """
    body = request.get_json(force=True, silent=True) or {}
    name = body.get("name", "").strip()
    item_id = body.get("itemId", "").strip()
    target_rate = body.get("targetRate")
    recipe_selections = body.get("recipeSelections", {})

    if not name or not item_id or target_rate is None:
        return jsonify({"error": "name, itemId, targetRate 필수"}), 400

    plan = {
        "id": str(uuid.uuid4()),
        "name": name,
        "itemId": item_id,
        "targetRate": float(target_rate),
        "recipeSelections": recipe_selections,
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


# ── 관리자 페이지 ──────────────────────────────────────────────────────

@app.get("/admin")
@app.get("/")
def admin_page():
    return render_template("admin.html")


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
