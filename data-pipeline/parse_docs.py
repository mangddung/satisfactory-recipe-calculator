#!/usr/bin/env python3
"""
Docs.json 파서 — Satisfactory 게임 데이터를 정규화된 JSON 3종으로 변환

산출물:
- items.json: 아이템 데이터 (_rawHints 포함, 분류 힌트용)
- recipes.json: 레시피 데이터
- buildings.json: 건물 데이터 (NativeClass에서 동적 감지)

처리 규칙:
1. 건물: NativeClass 패턴으로 카테고리 동적 감지 (하드코딩 없음)
2. 전력/슬롯: Docs.json 필드에서 직접 추출 (mPowerConsumption 등)
3. 아이템: _rawHints에 NativeClass·mForm 보존 → classify.py가 활용
4. 유체: mForm 필드로 판별 (RFC_Liquid/RFC_Gas)
5. 문자열 직렬화: mIngredients/mProduct의 ((ItemClass=...,Amount=N)) 파싱
"""

import json
import re
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ── NativeClass → 건물 카테고리 매핑 ──────────────────────────────────
# 하드코딩된 건물 인스턴스 목록 대신, NativeClass 패턴으로 동적 감지
EXTRACTOR_NATIVECLASS_PATTERNS = [
    "FGBuildableResourceExtractor",
    "FGBuildableWaterPump",
    "FGBuildableFrackingExtractor",
    "FGBuildableFrackingActivator",  # 자원정 가압기 (직접 채굴 안 함, 추출기에 전력 공급)
]

CONVEYOR_NATIVECLASS_PATTERNS = [
    "FGBuildableConveyorBelt",
    "FGBuildableConveyorLift",
]

NATIVECLASS_CATEGORY_MAP = {
    "FGBuildableManufacturer": "manufacturer",
    "FGBuildableSmelter": "smelter",
    "FGBuildableFoundry": "foundry",
    "FGBuildableAssembler": "assembler",
    "FGBuildableConstructor": "constructor",
    "FGBuildableOilRefinery": "refinery",
    "FGBuildableBlender": "blender",
    "FGBuildableConverter": "converter",
    "FGBuildableHadronCollider": "particle_accelerator",
    "FGBuildablePackager": "packager",
    "FGBuildableGeneratorBiomass": "generator",
    "FGBuildableGeneratorCoal": "generator",
    "FGBuildableGeneratorFuel": "generator",
    "FGBuildableGeneratorNuclear": "generator",
    "FGBuildableGeneratorGeoThermal": "generator",
}

STACK_SIZE_MAP = {
    "SS_ONE": 1,
    "SS_SMALL": 50,
    "SS_MEDIUM": 200,
    "SS_LARGE": 500,
    "SS_HUGE": 1000,
    "SS_FLUID": 0,
}

# ── 아이템 NativeClass 패턴 ──────────────────────────────────────────
# 분류 힌트에 사용: FGResourceDescriptor이면 채굴/추출 가능 자원
ITEM_NATIVECLASS_PATTERNS = [
    "FGItemDescriptor",
    "FGResourceDescriptor",
    "FGItemDescriptorBiomass",
    "FGItemDescriptorNuclearFuel",
    "FGEquipmentDescriptor",
    "FGAmmoTypeInstantHit",
    "FGConsumableDescriptor",
    "FGPowerShardDescriptor",
]


def _slug(class_id: str) -> str:
    """Desc_OreIron_C → ore-iron, Recipe_IngotIron_C → ingot-iron"""
    name = re.sub(r'^(Desc_|Recipe_|Build_)', '', class_id)
    name = re.sub(r'_C$', '', name)
    name = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', '-', name)
    return name.lower()


def _stack_size(data: dict) -> int:
    raw = data.get("mStackSize", "SS_MEDIUM")
    return STACK_SIZE_MAP.get(raw, 200)


def _get_building_category(native_class: str) -> str | None:
    """NativeClass 문자열에서 건물 카테고리를 추출."""
    for pattern, category in NATIVECLASS_CATEGORY_MAP.items():
        if pattern in native_class:
            return category
    return None


def _is_item_nativeclass(native_class: str) -> bool:
    """NativeClass가 아이템 디스크립터인지 확인."""
    return any(p in native_class for p in ITEM_NATIVECLASS_PATTERNS)


def _is_recipe_nativeclass(native_class: str) -> bool:
    return "FGRecipe" in native_class


def _is_extractor_nativeclass(native_class: str) -> bool:
    return any(p in native_class for p in EXTRACTOR_NATIVECLASS_PATTERNS)


def _is_conveyor_nativeclass(native_class: str) -> bool:
    return any(p in native_class for p in CONVEYOR_NATIVECLASS_PATTERNS)


def _extractor_acquisition_type(data: dict, native_class: str) -> str:
    """NativeClass + mExtractorTypeName + mAllowedResourceForms 으로 acquisition 타입 유도."""
    if "FGBuildableFracking" in native_class:  # 추출기 + 가압기
        return "resource_well"
    if "FGBuildableWaterPump" in native_class:
        return "water_extractor"
    # FGBuildableResourceExtractor: Miner vs Oil pump
    if data.get("mExtractorTypeName", "") == "Miner":
        return "miner"
    forms = str(data.get("mAllowedResourceForms", ""))
    if "RF_LIQUID" in forms or "RF_GAS" in forms:
        return "oil_extractor"
    return "miner"


def _icon_path(data: dict) -> str | None:
    """mSmallIcon UE 경로 → 상대 파일 경로
    'Texture2D /Game/FactoryGame/.../IconDesc_X.IconDesc_X'
    → 'FactoryGame/Resource/.../IconDesc_X.png'
    """
    raw = data.get("mSmallIcon", "") or data.get("mPersistentBigIcon", "")
    if not raw or "/Game/" not in raw:
        return None
    path = raw.split("/Game/", 1)[1]   # FactoryGame/.../IconDesc_X.IconDesc_X
    path = path.rsplit(".", 1)[0]       # 마지막 .ClassName 제거
    return path + ".png"


def strip_class_path(class_path: str) -> str:
    """/Game/.../Desc_OreIron.Desc_OreIron_C → Desc_OreIron_C
    UE5에서 클래스 경로 끝에 ' 가 붙는 경우 처리.
    """
    if not class_path:
        return ""
    class_path = class_path.rstrip("' ")
    match = re.search(r'(\w+_C)\.?$', class_path)
    if match:
        return match.group(1)
    parts = class_path.rsplit(".", 1)
    return parts[-1] if len(parts) > 1 else class_path


def parse_ingredient_string(s: str) -> list[dict]:
    """
    ((ItemClass="/Game/.../Desc_OreIron.Desc_OreIron_C",Amount=3))
    → [{"item": "Desc_OreIron_C", "amount": 3}]
    """
    if not s or s.strip() in ("()", ""):
        return []
    results = []
    for class_path, amount_str in re.findall(r'\(ItemClass="([^"]+)",Amount=([\d.]+)\)', s):
        item_class = strip_class_path(class_path)
        try:
            amount = float(amount_str)
            if amount == int(amount):
                amount = int(amount)
        except ValueError:
            amount = 0
            logger.warning(f"Amount 파싱 실패: {amount_str}")
        results.append({"item": item_class, "amount": amount})
    return results


def _display_name(class_id: str, data: dict) -> str:
    for field in ("mDisplayName", "mName"):
        name = data.get(field, "").strip()
        if name:
            return name
    return class_id


def _is_fluid(class_id: str, data: dict) -> bool:
    form = data.get("mForm", "")
    if form:
        # mForm이 있으면 그 값만 신뢰 (RF_SOLID 등 비유체도 올바르게 처리)
        return form in ("RF_LIQUID", "RF_GAS", "RFC_Liquid", "RFC_Gas")
    # mForm 없는 구버전 fallback: 이름 기반
    lower = class_id.lower()
    return any(k in lower for k in ("liquid", "gas", "water", "oil", "fuel", "acid", "steam"))


def _normalize_amount(amount: float, fluid: bool) -> float:
    """유체 mm³ → m³/min (÷1000)"""
    if fluid:
        return round(amount / 1000, 4)
    return amount


def _parse_power(data: dict) -> float:
    """mPowerConsumption 또는 관련 필드에서 MW 추출.
    변동 전력 건물(예: 양자 인코더)은 mPowerConsumption=0이므로 0은 건너뛴다."""
    for field in ("mPowerConsumption", "mEstimatedMaximumPowerConsumption", "mPowerProduction"):
        raw = data.get(field, "0")
        try:
            val = float(raw)
            if val > 0:
                return val
        except (ValueError, TypeError):
            continue
    return 0.0


def _parse_slots(data: dict) -> int:
    """소머슬롭 슬롯 수 추출 (게임 Docs 필드: mProductionShardSlotSize, 1.0 기준)."""
    try:
        return int(float(data.get("mProductionShardSlotSize", 0)))
    except (ValueError, TypeError):
        return 0


def load_docs(docs_path: str | Path) -> list:
    """Docs.json / 언어별 파일(ko.json 등) 로드 → NativeClass 그룹 리스트. UTF-8/UTF-16 자동 처리."""
    for encoding in ("utf-8-sig", "utf-16", "utf-8"):
        try:
            with open(docs_path, "r", encoding=encoding) as f:
                docs_data = json.load(f)
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    else:
        raise RuntimeError(f"파일 인코딩 감지 실패: {docs_path}")

    if isinstance(docs_data, list):
        return docs_data
    if isinstance(docs_data, dict):
        return (
            docs_data.get("NativeClasses")
            or docs_data.get("Data")
            or next((v for v in docs_data.values() if isinstance(v, list)), [])
        )
    return []


def extract_names(docs_path: str | Path, ids: set[str]) -> dict[str, dict]:
    """언어 파일에서 ids에 해당하는 클래스의 표시 이름·설명만 추출."""
    names: dict[str, dict] = {}
    for group in load_docs(docs_path):
        if not isinstance(group, dict):
            continue
        for cls in group.get("Classes", []):
            class_id = cls.get("ClassName", "") if isinstance(cls, dict) else ""
            if class_id in ids:
                names[class_id] = {
                    "displayName": _display_name(class_id, cls),
                    "description": cls.get("mDescription", "").strip(),
                }
    return names


def parse_docs(docs_path: str, output_dir: str) -> dict:
    """Docs.json → items.json, recipes.json, buildings.json"""
    docs_path = Path(docs_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"Docs.json 로딩: {docs_path}")
    native_classes = load_docs(docs_path)

    stats = {
        "total_items": 0,
        "total_recipes": 0,
        "total_buildings": 0,
        "skipped_recipes": 0,
        "warnings": [],
    }

    logger.info(f"NativeClass 그룹: {len(native_classes)}개")

    # ── 1차 수집 ──────────────────────────────────────────────────────
    # key: class_id, value: (raw_data, native_class_name)
    item_raw: dict[str, tuple[dict, str]] = {}
    recipe_raw: dict[str, dict] = {}
    # key: class_id, value: (raw_data, category)
    building_raw: dict[str, tuple[dict, str]] = {}
    extractor_raw: dict[str, tuple[dict, str]] = {}  # class_id → (data, native_class)
    conveyor_raw: dict[str, dict] = {}
    building_icons: dict[str, str | None] = {}  # Desc_X_C → 아이콘 (건물 아이콘은 Build_가 아닌 Desc_에 있음)
    unlock_types: dict[str, set[str]] = {}  # Recipe_X_C → 해금하는 스키마틱 종류 (EST_Milestone, EST_MAM, EST_Alternate …)

    for group in native_classes:
        if not isinstance(group, dict):
            continue
        native_class = group.get("NativeClass", "")
        classes = group.get("Classes", [])
        if not isinstance(classes, list):
            continue

        building_category = _get_building_category(native_class)
        is_item = _is_item_nativeclass(native_class)
        is_recipe = _is_recipe_nativeclass(native_class)
        is_extractor = _is_extractor_nativeclass(native_class)
        is_conveyor = _is_conveyor_nativeclass(native_class)

        for cls in classes:
            if not isinstance(cls, dict):
                continue
            class_id = cls.get("ClassName", "")
            if not class_id:
                full = cls.get("FullName", "")
                class_id = strip_class_path(full) if full else ""
            if not class_id:
                continue

            if is_conveyor and class_id.startswith("Build_"):
                conveyor_raw[class_id] = cls
            elif is_extractor and class_id.startswith("Build_"):
                extractor_raw[class_id] = (cls, native_class)
            elif building_category and class_id.startswith("Build_"):
                building_raw[class_id] = (cls, building_category)
            elif is_item and class_id.startswith("Desc_"):
                item_raw[class_id] = (cls, native_class)
            elif "FGBuildingDescriptor" in native_class and class_id.startswith("Desc_"):
                building_icons[class_id] = _icon_path(cls)
            elif is_recipe and class_id.startswith("Recipe_"):
                recipe_raw[class_id] = cls
            elif "FGSchematic" in native_class:
                for unlock in cls.get("mUnlocks", []):
                    for rid in re.findall(r"(\w+_C)'", str(unlock.get("mRecipes", ""))):
                        unlock_types.setdefault(rid, set()).add(cls.get("mType", ""))

    logger.info(f"수집 → 아이템:{len(item_raw)}, 레시피:{len(recipe_raw)}, 건물:{len(building_raw)}, 채굴기:{len(extractor_raw)}, 컨베이어:{len(conveyor_raw)}")

    # ── 채굴기/추출기 처리 ───────────────────────────────────────────
    extractors: dict[str, dict] = {}
    for class_id, (data, native_class) in extractor_raw.items():
        cycle_time = float(data.get("mExtractCycleTime", 1.0) or 1.0)
        items_per_cycle = int(data.get("mItemsPerCycle", 0) or 0)  # 가압기는 필드 없음 → 0
        allowed_forms_raw = data.get("mAllowedResourceForms", "")
        is_fluid = any(f in str(allowed_forms_raw) for f in ("LIQUID", "GAS", "RF_LIQUID", "RF_GAS"))

        # 분당 채굴량: items_per_cycle / cycle_time * 60
        base_rate = (items_per_cycle / cycle_time) * 60.0
        if is_fluid:
            base_rate = base_rate / 1000.0  # mm³/min → m³/min

        extractors[class_id] = {
            "id": class_id,
            "displayName": _display_name(class_id, data),
            "acquisitionType": _extractor_acquisition_type(data, native_class),
            "allowedForms": allowed_forms_raw,
            # 뽑을 수 있는 자원 (비어 있으면 allowedForms 의 모든 자원, 예: 채굴기)
            "allowedResources": re.findall(r"(\w+_C)'", str(data.get("mAllowedResources", ""))),
            "hasPurity": "FGBuildableWaterPump" not in native_class,  # 물 추출기는 노드 없이 물 위에 설치
            "isFluid": is_fluid,
            "extractCycleTime": cycle_time,
            "itemsPerCycle": items_per_cycle,
            "baseRatePerMin": round(base_rate, 4),
            "powerConsumption": _parse_power(data),
        }

    # ── 컨베이어 처리 ────────────────────────────────────────────────
    # mSpeed 단위: cm/s. itemsPerMin = mSpeed / 2 (아이템 간격 200cm 기준)
    conveyors: dict[str, dict] = {}
    for class_id, data in conveyor_raw.items():
        speed_raw = data.get("mSpeed", "0")
        try:
            speed_cms = float(speed_raw)
        except (ValueError, TypeError):
            speed_cms = 0.0
        items_per_min = round(speed_cms / 2.0)
        conveyor_type = "lift" if "Lift" in class_id else "belt"
        conveyors[class_id] = {
            "id": class_id,
            "displayName": _display_name(class_id, data),
            "type": conveyor_type,
            "speedCmPerSec": speed_cms,
            "itemsPerMin": items_per_min,
        }

    # ── 건물 처리 ────────────────────────────────────────────────────
    buildings: dict[str, dict] = {}
    for class_id, (data, category) in building_raw.items():
        buildings[class_id] = {
            "className": class_id,
            "slug": _slug(class_id),
            "displayName": _display_name(class_id, data),
            "description": data.get("mDescription", "").strip(),
            "powerConsumption": _parse_power(data),
            "buildingCategory": category,
            "somersloopSlots": _parse_slots(data),
            "iconPath": building_icons.get("Desc_" + class_id.removeprefix("Build_")),
        }

    # ── 아이템 처리 ──────────────────────────────────────────────────
    items: dict[str, dict] = {}
    for class_id, (data, native_class) in item_raw.items():
        fluid = _is_fluid(class_id, data)
        items[class_id] = {
            "className": class_id,
            "slug": _slug(class_id),
            "displayName": _display_name(class_id, data),
            "description": data.get("mDescription", "").strip(),
            "stackSize": _stack_size(data),
            "isFluid": fluid,
            "iconPath": _icon_path(data),
            "acquisition": None,   # classify.py가 채움
            "producedBy": None,    # classify.py가 채움
            "_rawHints": {
                "nativeClass": native_class,
                "mForm": data.get("mForm", ""),
                "mResourceNodeType": data.get("mResourceNodeType", ""),
            },
        }

    # production buildings 집합 (recipe 필터링용)
    known_production_buildings = set(buildings.keys())

    # ── 레시피 처리 ──────────────────────────────────────────────────
    recipes: dict[str, dict] = {}
    for class_id, data in recipe_raw.items():
        # mProducedIn 파싱
        produced_in_raw = data.get("mProducedIn", "")
        produced_in_buildings = re.findall(r'Build_\w+_C', str(produced_in_raw))
        # 실제 생산 건물만 (BuildGun·작업대 등 제외)
        filtered = [b for b in dict.fromkeys(produced_in_buildings) if b in known_production_buildings]

        produced_in = filtered[0] if filtered else None
        building_category = buildings[produced_in]["buildingCategory"] if produced_in else None

        # recipeType 결정
        raw_str = str(produced_in_raw)
        if produced_in:
            recipe_type = "production"
        elif "BuildGun" in raw_str:
            recipe_type = "construction"
        elif "WorkBench" in raw_str or "Workshop" in raw_str:
            recipe_type = "manual"
        else:
            recipe_type = "manual"

        if not produced_in:
            stats["skipped_recipes"] += 1

        # mManufactoringDuration
        raw_dur = data.get("mManufactoringDuration", 0)
        try:
            duration = float(raw_dur)
        except (ValueError, TypeError):
            duration = 0.0
        if duration == int(duration):
            duration = int(duration)

        # 재료 파싱
        ing_raw = data.get("mIngredients", "")
        if isinstance(ing_raw, str):
            ingredients = parse_ingredient_string(ing_raw)
        else:
            ingredients = [
                {"item": strip_class_path(x.get("ItemClass", "")), "amount": x.get("Amount", 0)}
                for x in (ing_raw or []) if isinstance(x, dict)
            ]

        # 산물 파싱
        prod_raw = data.get("mProduct", "")
        if isinstance(prod_raw, str):
            all_products = parse_ingredient_string(prod_raw)
        else:
            all_products = [
                {"item": strip_class_path(x.get("ItemClass", "")), "amount": x.get("Amount", 0)}
                for x in (prod_raw or []) if isinstance(x, dict)
            ]

        products = all_products[:1]
        byproducts = all_products[1:]

        # 유체 단위 정규화
        for entry in ingredients + products + byproducts:
            item_id = entry["item"]
            if item_id in items and items[item_id]["isFluid"]:
                entry["amount"] = _normalize_amount(float(entry["amount"]), True)

        recipes[class_id] = {
            "className": class_id,
            "slug": _slug(class_id),
            "displayName": _display_name(class_id, data),
            # 하드드라이브 대체 레시피 스키마틱으로만 해금. 클래스명은 기준 아님:
            # Recipe_Alternate_Turbofuel_C 는 MAM 해금 표준 '터보 연료', Recipe_PureAluminumIngot_C 는 대체
            "isAlternate": unlock_types.get(class_id) == {"EST_Alternate"},
            "recipeType": recipe_type,
            "producedIn": [produced_in] if produced_in else [],
            "buildingCategory": building_category,
            "manufactoringDuration": duration,
            "ingredients": ingredients,
            "products": products,
            "byproducts": byproducts,
        }

    # ── 아이템 producedBy 역매핑 ──────────────────────────────────────
    for recipe_data in recipes.values():
        cat = recipe_data.get("buildingCategory") or recipe_data.get("producedIn")
        for prod in recipe_data.get("products", []):
            item_id = prod.get("item")
            if item_id in items:
                items[item_id]["producedBy"] = cat

    # ── 게임 상수 생성 ────────────────────────────────────────────────
    # 순도 배율은 ko.json에 없는 게임 엔진 상수 (공식 위키 확인값)
    # impure=0.5, normal=1.0, pure=2.0
    game_constants = {
        "purityMultipliers": {
            "impure": 0.5,
            "normal": 1.0,
            "pure": 2.0,
        },
    }

    # ── 출력 ─────────────────────────────────────────────────────────
    items_out = dict(sorted(items.items()))
    recipes_out = dict(sorted(recipes.items()))
    buildings_out = dict(sorted(buildings.items()))
    extractors_out = dict(sorted(extractors.items()))
    conveyors_out = dict(sorted(conveyors.items()))

    with open(output_dir / "items.json", "w", encoding="utf-8") as f:
        json.dump(items_out, f, ensure_ascii=False, indent=2)
    with open(output_dir / "recipes.json", "w", encoding="utf-8") as f:
        json.dump(recipes_out, f, ensure_ascii=False, indent=2)
    with open(output_dir / "buildings.json", "w", encoding="utf-8") as f:
        json.dump(buildings_out, f, ensure_ascii=False, indent=2)
    with open(output_dir / "extractors.json", "w", encoding="utf-8") as f:
        json.dump(extractors_out, f, ensure_ascii=False, indent=2)
    with open(output_dir / "conveyors.json", "w", encoding="utf-8") as f:
        json.dump(conveyors_out, f, ensure_ascii=False, indent=2)
    with open(output_dir / "game_constants.json", "w", encoding="utf-8") as f:
        json.dump(game_constants, f, ensure_ascii=False, indent=2)

    stats.update({
        "total_items": len(items_out),
        "total_recipes": len(recipes_out),
        "total_buildings": len(buildings_out),
        "total_extractors": len(extractors_out),
        "total_conveyors": len(conveyors_out),
    })

    with open(output_dir / "parse_stats.json", "w", encoding="utf-8") as f:
        json.dump({"parser_stats": stats}, f, ensure_ascii=False, indent=2)

    logger.info(f"아이템:{len(items_out)}, 레시피:{len(recipes_out)}, 건물:{len(buildings_out)}")
    return stats
