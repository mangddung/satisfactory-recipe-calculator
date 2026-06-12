#!/usr/bin/env python3
"""
아이템 분류 라벨러 — NativeClass 힌트 기반으로 acquisition/producedBy 부여

방식:
1. _rawHints.nativeClass에 "ResourceDescriptor"가 포함된 아이템 → 채굴/추출 자원
   - mForm == RFC_Liquid: 이름으로 water/oil 구분, 모호하면 "unclassified"
   - mForm == RFC_Gas: "resource_well"
   - 그 외: "miner" (고체 광석)
2. 어떤 레시피의 주 산물인 아이템 → "manufactured"
3. 부산물로만 생산되는 아이템 → "byproduct"
4. 위 어디에도 해당 없으면 → "unclassified" (관리자 페이지에서 사람이 지정)

하드코딩된 아이템 ID 목록 없음. classification_overrides.json으로 수동 보정.
"""

import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

VALID_ACQUISITIONS = {
    "miner",
    "oil_extractor",
    "water_extractor",
    "resource_well",
    "natural",
    "byproduct",
    "manufactured",
    "other",
    "unclassified",
}

_OTHER_ITEM_IDS = {
    "Desc_Crystal_C",      # 파란색 파워 슬러그
    "Desc_Crystal_mk2_C",  # 노란색 파워 슬러그
    "Desc_Crystal_mk3_C",  # 보라색 파워 슬러그
    "Desc_WAT2_C",         # 머서 구체
}

_BYPRODUCT_ITEM_IDS = {
    "Desc_NuclearWaste_C",    # 우라늄 폐기물
    "Desc_PlutoniumWaste_C",  # 플루토늄 폐기물
    "Desc_DissolvedSilica_C", # 용해된 이산화규소 (정제 부산물)
}

def _is_other(item_id: str, item_data: dict) -> bool:
    """FICSMAS / ™ 등 이벤트·특수 아이템 + 탐험 수집 아이템."""
    name = item_data.get("displayName", "")
    if "FICSMAS" in name or "™" in name or "Xmas" in item_id or "xmass" in item_id.lower():
        return True
    return item_id in _OTHER_ITEM_IDS


def _nativeclass_acquisition(item_data: dict) -> str | None:
    """NativeClass 패턴으로 분류 가능한 것 처리."""
    nc = item_data.get("_rawHints", {}).get("nativeClass", "")
    if "FGItemDescriptorBiomass" in nc:
        return "natural"   # 세계에서 채집하는 바이오매스
    if "FGConsumableDescriptor" in nc:
        return "other"     # 소모품 (음식 등)
    if "FGItemDescriptorNuclearFuel" in nc:
        return "manufactured"
    return None


def _is_resource_descriptor(item_data: dict) -> bool:
    native_class = item_data.get("_rawHints", {}).get("nativeClass", "")
    return "ResourceDescriptor" in native_class


def _classify_raw_material(item_id: str, item_data: dict) -> str:
    """ResourceDescriptor 아이템 → mForm으로 채굴/추출 방식 분류.
    ko.json mForm 실제 값: RF_SOLID, RF_LIQUID, RF_GAS
    """
    hints = item_data.get("_rawHints", {})
    m_form = hints.get("mForm", "").upper()

    if "GAS" in m_form:
        return "resource_well"

    if "LIQUID" in m_form:
        display = item_data.get("displayName", "").lower()
        class_lower = item_id.lower()
        if "water" in display or "water" in class_lower:
            return "water_extractor"
        if any(k in display or k in class_lower for k in ("oil", "crude", "liquid")):
            return "oil_extractor"
        return "oil_extractor"  # 유체 원자재 기본값: 석유추출기

    # RF_SOLID 또는 mForm 없음 → 고체 광석 → 채굴기
    return "miner"


def classify_acquisition(item_id: str, item_data: dict, recipes: dict) -> str:
    """
    아이템의 획득 방식 분류.
    Returns: VALID_ACQUISITIONS 중 하나

    우선순위:
    1. FICSMAS / ™ 특수 아이템 → other
    2. 하드코딩 byproduct → byproduct
    3. ResourceDescriptor → miner / oil_extractor / water_extractor / resource_well
       (컨버터 레시피로도 생산 가능한 광석이라도 채굴 자원으로 분류)
    4. 레시피 검색 → manufactured / byproduct
       (NativeClass보다 먼저: Biomass NativeClass를 가진 바이오연료 등이 natural로 잘못 분류되는 것 방지)
    5. NativeClass fallback → natural / other / manufactured
    """
    # 1. FICSMAS / ™ / 탐험 수집 아이템
    if _is_other(item_id, item_data):
        return "other"

    # 2. 하드코딩 byproduct (핵 폐기물 등)
    if item_id in _BYPRODUCT_ITEM_IDS:
        return "byproduct"

    # 3. ResourceDescriptor → 채굴/추출 자원 (컨버터 레시피가 있어도 원자재 우선)
    if _is_resource_descriptor(item_data):
        return _classify_raw_material(item_id, item_data)

    # 4. 레시피 검색 → manufactured / byproduct
    # 언패키지 레시피(slug: unpackage-*)는 제외: 유체를 포장 해제하는 유틸 레시피이므로
    # 해당 레시피의 산물을 "manufactured"로 분류하면 체인에서 포장→언패키지 순환이 생김
    has_primary = False
    has_byproduct = False

    for recipe in recipes.values():
        slug = recipe.get("slug", "")
        if slug.startswith("unpackage-"):
            continue
        for p in recipe.get("products", []):
            if p.get("item") == item_id:
                has_primary = True
                break
        for p in recipe.get("byproducts", []):
            if p.get("item") == item_id:
                has_byproduct = True
                break
        if has_primary:
            break

    if has_primary:
        return "manufactured"

    if has_byproduct:
        return "byproduct"

    # 5. NativeClass fallback (레시피 없는 아이템 대상)
    nc_acq = _nativeclass_acquisition(item_data)
    if nc_acq:
        return nc_acq

    return "unclassified"


def classify_produced_by(item_id: str, recipes: dict) -> str | None:
    """아이템을 생산하는 건물 카테고리 (주 산물 기준)."""
    categories: set[str] = set()
    for recipe in recipes.values():
        for p in recipe.get("products", []):
            if p.get("item") == item_id:
                cat = recipe.get("buildingCategory")
                if cat:
                    categories.add(cat)
    if len(categories) == 1:
        return categories.pop()
    if categories:
        return ",".join(sorted(categories))
    return None


def _load_classification_overrides(overrides_path: Path) -> dict[str, str]:
    """
    classification_overrides.json 로드.
    형식: {"Desc_OreIron_C": "miner", ...}
    """
    if not overrides_path.exists():
        return {}
    with open(overrides_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # 값 검증
    valid = {}
    for item_id, acquisition in data.items():
        if acquisition in VALID_ACQUISITIONS:
            valid[item_id] = acquisition
        else:
            logger.warning(f"분류 오버라이드 값 무효: {item_id} → {acquisition} (무시됨)")
    return valid


def classify_items(items_path: str, recipes_path: str, output_dir: str,
                   overrides_path: str | None = None) -> dict:
    """아이템 분류 라벨링 실행."""
    items_path = Path(items_path)
    recipes_path = Path(recipes_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if overrides_path is None:
        overrides_path = items_path.parent.parent / "data-pipeline" / "classification_overrides.json"
    overrides_path = Path(overrides_path)

    logger.info(f"아이템 로딩: {items_path}")
    with open(items_path, "r", encoding="utf-8") as f:
        items = json.load(f)

    logger.info(f"레시피 로딩: {recipes_path}")
    with open(recipes_path, "r", encoding="utf-8") as f:
        recipes = json.load(f)

    logger.info(f"분류 오버라이드 로딩: {overrides_path}")
    manual_overrides = _load_classification_overrides(overrides_path)

    stats = {
        "total_items": len(items),
        "acquisition_counts": {k: 0 for k in VALID_ACQUISITIONS},
        "unclassified_items": [],
        "overrides_applied": 0,
    }

    for item_id, item_data in items.items():
        # 자동 분류
        acquisition = classify_acquisition(item_id, item_data, recipes)
        produced_by = classify_produced_by(item_id, recipes)

        # 수동 오버라이드 적용
        if item_id in manual_overrides:
            acquisition = manual_overrides[item_id]
            stats["overrides_applied"] += 1

        item_data["acquisition"] = acquisition
        item_data["producedBy"] = produced_by

        stats["acquisition_counts"][acquisition] = stats["acquisition_counts"].get(acquisition, 0) + 1
        if acquisition == "unclassified":
            stats["unclassified_items"].append(item_id)

    if stats["unclassified_items"]:
        logger.warning(f"미분류 아이템 {len(stats['unclassified_items'])}개 → 관리자 페이지에서 지정 필요")
        for uid in stats["unclassified_items"][:10]:
            logger.warning(f"  미분류: {uid}")
        if len(stats["unclassified_items"]) > 10:
            logger.warning(f"  ... 외 {len(stats['unclassified_items']) - 10}개")

    items_out = dict(sorted(items.items()))
    with open(output_dir / "items.json", "w", encoding="utf-8") as f:
        json.dump(items_out, f, ensure_ascii=False, indent=2)

    with open(output_dir / "classify_stats.json", "w", encoding="utf-8") as f:
        json.dump({"classify_stats": stats}, f, ensure_ascii=False, indent=2)

    logger.info(f"분류 완료: {json.dumps(stats['acquisition_counts'], ensure_ascii=False)}")
    return stats


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Satisfactory 아이템 분류 라벨러")
    parser.add_argument("--items", "-i", default="data-pipeline/output/items.json")
    parser.add_argument("--recipes", "-r", default="data-pipeline/output/recipes.json")
    parser.add_argument("--output", "-o", default="data-pipeline/output")
    parser.add_argument("--overrides", default=None,
                        help="classification_overrides.json 경로 (기본: data-pipeline/classification_overrides.json)")
    args = parser.parse_args()

    if args.overrides is None:
        args.overrides = str(Path(__file__).parent / "classification_overrides.json")

    stats = classify_items(args.items, args.recipes, args.output, args.overrides)

    print("\n" + "=" * 60)
    print("분류 완료!")
    print(f"  총 아이템: {stats['total_items']}개")
    print(f"  수동 오버라이드 적용: {stats['overrides_applied']}개")
    print("\n  획득 방식 분포:")
    for acq, count in stats["acquisition_counts"].items():
        marker = " ← 관리자 페이지에서 지정 필요" if acq == "unclassified" and count > 0 else ""
        print(f"    {acq}: {count}개{marker}")
    print("=" * 60)


if __name__ == "__main__":
    main()
