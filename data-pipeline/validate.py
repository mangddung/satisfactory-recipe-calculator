#!/usr/bin/env python3
"""
스키마 검증 — 최종 JSON이 사양을 만족하는지 확인

검증 규칙:
1. 필수 필드 존재 여부 확인
2. 참조 무결성 (아이템/레시피/건물 간 참조가 유효한지)
3. 숫자 범위 검증 (속도 ≥ 0, 파워 ≥ 0 등)
4. 중복 항목/레시피 확인
5. 누락된 참조 경고 (레시피에서 참조하는 아이템이 items에 없는 경우)
"""

import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ── 필수 필드 정의 ───────────────────────────────────────────────────
ITEM_REQUIRED_FIELDS = {
    "className": str,
    "slug": str,
    "displayName": str,
    "acquisition": str,
}

RECIPE_REQUIRED_FIELDS = {
    "className": str,
    "slug": str,
    "displayName": str,
    "manufactoringDuration": (int, float),
    "ingredients": list,
    "products": list,
}

BUILDING_REQUIRED_FIELDS = {
    "className": str,
    "slug": str,
    "displayName": str,
    "powerConsumption": (int, float),
    "buildingCategory": str,
}

INGREDIENT_REQUIRED_FIELDS = {
    "item": str,
    "amount": (int, float),
}

PRODUCT_REQUIRED_FIELDS = {
    "item": str,
    "amount": (int, float),
}


class ValidationResult:
    """검증 결과를 수집하는 클래스"""

    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def add_error(self, msg: str):
        self.errors.append(msg)
        logger.error(msg)

    def add_warning(self, msg: str):
        self.warnings.append(msg)
        logger.warning(msg)

    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0

    def __repr__(self):
        return f"ValidationResult(errors={len(self.errors)}, warnings={len(self.warnings)})"


def validate_fields(data: dict, required_fields: dict, context: str, result: ValidationResult):
    """
    필수 필드 존재 및 타입 검증

    Args:
        data: 검증할 딕셔너리
        required_fields: 필수 필드명과 예상 타입 매핑
        context: 검증 컨텍스트 (예: "item Desc_IronIngot_C")
        result: 검증 결과 객체
    """
    for field, expected_type in required_fields.items():
        if field not in data:
            result.add_error(f"[{context}] 필수 필드 누락: '{field}'")
        elif not isinstance(data[field], expected_type):
            # tuple 타입 허용 (예: (int, float))
            if isinstance(expected_type, tuple):
                if not any(isinstance(data[field], t) for t in expected_type):
                    result.add_error(
                        f"[{context}] 필드 '{field}' 타입 오류: "
                        f"expected {expected_type}, got {type(data[field])}"
                    )
            else:
                result.add_error(
                    f"[{context}] 필드 '{field}' 타입 오류: "
                    f"expected {expected_type.__name__}, got {type(data[field]).__name__}"
                )


def validate_items(items: dict, result: ValidationResult):
    """아이템 데이터 검증"""
    logger.info(f"아이템 검증: {len(items)}개")

    seen_slugs = {}
    for item_id, item_data in items.items():
        # 필수 필드 검증
        validate_fields(item_data, ITEM_REQUIRED_FIELDS, f"item {item_id}", result)

        # slug 중복 확인
        slug = item_data.get("slug")
        if slug:
            if slug in seen_slugs:
                result.add_warning(
                    f"아이템 slug 중복: '{slug}' (이미 {seen_slugs[slug]}에 사용됨, {item_id})"
                )
            else:
                seen_slugs[slug] = item_id

        # stackSize 범위 검증 (유체는 0이 정상)
        stack_size = item_data.get("stackSize")
        is_fluid = item_data.get("isFluid", False)
        if stack_size is not None and isinstance(stack_size, (int, float)) and not is_fluid:
            if stack_size < 0:
                result.add_error(f"[item {item_id}] stackSize가 음수: {stack_size}")

        # acquisition 값 검증
        acquisition = item_data.get("acquisition")
        valid_acquisitions = {
            "miner", "oil_extractor", "water_extractor", "resource_well",
            "natural", "byproduct", "manufactured", "other", "unclassified",
        }
        if acquisition and acquisition not in valid_acquisitions:
            result.add_error(
                f"[item {item_id}] 유효하지 않은 acquisition: '{acquisition}' "
                f"(유효: {valid_acquisitions})"
            )


def validate_recipes(recipes: dict, items: dict, buildings: dict, result: ValidationResult):
    """레시피 데이터 검증"""
    logger.info(f"레시피 검증: {len(recipes)}개")

    seen_slugs = {}
    for recipe_id, recipe_data in recipes.items():
        # 필수 필드 검증
        validate_fields(recipe_data, RECIPE_REQUIRED_FIELDS, f"recipe {recipe_id}", result)

        # slug 중복 확인
        slug = recipe_data.get("slug")
        if slug:
            if slug in seen_slugs:
                result.add_warning(
                    f"레시피 slug 중복: '{slug}' (이미 {seen_slugs[slug]}에 사용됨, {recipe_id})"
                )
            else:
                seen_slugs[slug] = recipe_id

        # 제조 시간 검증
        duration = recipe_data.get("manufactoringDuration")
        if duration is not None and isinstance(duration, (int, float)):
            if duration < 0:
                result.add_error(f"[recipe {recipe_id}] manufactoringDuration가 음수: {duration}")

        # 재료(ingredients) 검증
        ingredients = recipe_data.get("ingredients", [])
        for i, ing in enumerate(ingredients):
            validate_fields(ing, INGREDIENT_REQUIRED_FIELDS, f"recipe {recipe_id} ingredient[{i}]", result)
            # 참조 무결성: ingredient의 item이 items에 존재하는지
            item_ref = ing.get("item")
            if item_ref and items and item_ref not in items:
                result.add_warning(
                    f"[recipe {recipe_id}] ingredient[{i}]가 존재하지 않는 아이템 참조: '{item_ref}'"
                )
            # 수량 검증
            amount = ing.get("amount")
            if amount is not None and isinstance(amount, (int, float)):
                if amount <= 0:
                    result.add_error(
                        f"[recipe {recipe_id}] ingredient[{i}] amount이 0 이하: {amount}"
                    )

        # 산물(products) 검증
        products = recipe_data.get("products", [])
        for i, prod in enumerate(products):
            validate_fields(prod, PRODUCT_REQUIRED_FIELDS, f"recipe {recipe_id} product[{i}]", result)
            # 참조 무결성
            item_ref = prod.get("item")
            if item_ref and items and item_ref not in items:
                result.add_warning(
                    f"[recipe {recipe_id}] product[{i}]가 존재하지 않는 아이템 참조: '{item_ref}'"
                )
            # 수량 검증
            amount = prod.get("amount")
            if amount is not None and isinstance(amount, (int, float)):
                if amount <= 0:
                    result.add_error(
                        f"[recipe {recipe_id}] product[{i}] amount이 0 이하: {amount}"
                    )

        # 부산물(byproducts) 검증
        byproducts = recipe_data.get("byproducts", [])
        for i, bp in enumerate(byproducts):
            validate_fields(bp, PRODUCT_REQUIRED_FIELDS, f"recipe {recipe_id} byproduct[{i}]", result)
            item_ref = bp.get("item")
            if item_ref and items and item_ref not in items:
                result.add_warning(
                    f"[recipe {recipe_id}] byproduct[{i}]가 존재하지 않는 아이템 참조: '{item_ref}'"
                )

        # producedIn 참조 무결성
        produced_in = recipe_data.get("producedIn") or []
        if not isinstance(produced_in, list):
            result.add_error(f"[recipe {recipe_id}] 필드 'producedIn' 타입 오류: expected list, got {type(produced_in).__name__}")
        else:
            for i, building_ref in enumerate(produced_in):
                if buildings and building_ref not in buildings:
                    result.add_warning(
                        f"[recipe {recipe_id}] producedIn[{i}]가 존재하지 않는 건물 참조: '{building_ref}'"
                    )


def validate_buildings(buildings: dict, result: ValidationResult):
    """건물 데이터 검증"""
    logger.info(f"건물 검증: {len(buildings)}개")

    seen_slugs = {}
    for building_id, building_data in buildings.items():
        # 필수 필드 검증
        validate_fields(building_data, BUILDING_REQUIRED_FIELDS, f"building {building_id}", result)

        # slug 중복 확인
        slug = building_data.get("slug")
        if slug:
            if slug in seen_slugs:
                result.add_warning(
                    f"건물 slug 중복: '{slug}' (이미 {seen_slugs[slug]}에 사용됨, {building_id})"
                )
            else:
                seen_slugs[slug] = building_id

        # 전력 소비 검증
        power = building_data.get("powerConsumption")
        if power is not None and isinstance(power, (int, float)):
            if power < 0:
                result.add_error(f"[building {building_id}] powerConsumption가 음수: {power}")


def validate_referential_integrity(
    items: dict, recipes: dict, buildings: dict, result: ValidationResult
):
    """
    전역 참조 무결성 검증

    1. items에 없지만 recipes에서 참조하는 아이템
    2. recipes에 없지만 items의 producedBy에서 참조하는 건물
    3. buildings에 없지만 recipes에서 참조하는 건물
    """
    logger.info("전역 참조 무결성 검증")

    # 모든 레시피에서 참조하는 아이템 수집
    referenced_items = set()
    for recipe_id, recipe_data in recipes.items():
        for ing in recipe_data.get("ingredients", []):
            if "item" in ing:
                referenced_items.add(ing["item"])
        for prod in recipe_data.get("products", []):
            if "item" in prod:
                referenced_items.add(prod["item"])
        for bp in recipe_data.get("byproducts", []):
            if "item" in bp:
                referenced_items.add(bp["item"])

    # items에 없는 참조 아이템
    missing_items = referenced_items - set(items.keys())
    for missing in sorted(missing_items):
        result.add_warning(f"레시피에서 참조하지만 items에 없는 아이템: '{missing}'")

    # 아이템에 producedBy가 있지만 buildings에 없는 경우
    for item_id, item_data in items.items():
        produced_by = item_data.get("producedBy")
        if produced_by and buildings:
            # producedBy는 쉼표로 구분된 건물 카테고리일 수 있음
            categories = [c.strip() for c in produced_by.split(",")]
            for cat in categories:
                # 건물 카테고리가 buildings에 존재하는지 확인
                found = any(
                    b.get("buildingCategory") == cat
                    for b in buildings.values()
                )
                if not found:
                    result.add_warning(
                        f"아이템 '{item_id}'의 producedBy 카테고리 '{cat}'가 buildings에 없음"
                    )


def validate_data(
    items_path: str,
    recipes_path: str,
    buildings_path: str,
    output_dir: str,
) -> ValidationResult:
    """
    전체 데이터 검증 실행

    Args:
        items_path: items.json 경로
        recipes_path: recipes.json 경로
        buildings_path: buildings.json 경로
        output_dir: 검증 결과 출력 디렉토리

    Returns:
        ValidationResult 객체
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    result = ValidationResult()

    # 데이터 로딩
    items_path = Path(items_path)
    recipes_path = Path(recipes_path)
    buildings_path = Path(buildings_path)

    items = {}
    recipes = {}
    buildings = {}

    if items_path.exists():
        logger.info(f"아이템 로딩: {items_path}")
        with open(items_path, "r", encoding="utf-8") as f:
            items = json.load(f)
    else:
        result.add_error(f"아이템 파일이 없음: {items_path}")

    if recipes_path.exists():
        logger.info(f"레시피 로딩: {recipes_path}")
        with open(recipes_path, "r", encoding="utf-8") as f:
            recipes = json.load(f)
    else:
        result.add_error(f"레시피 파일이 없음: {recipes_path}")

    if buildings_path.exists():
        logger.info(f"건물 로딩: {buildings_path}")
        with open(buildings_path, "r", encoding="utf-8") as f:
            buildings = json.load(f)
    else:
        result.add_error(f"건물 파일이 없음: {buildings_path}")

    # 검증 실행
    if items:
        validate_items(items, result)
    if recipes:
        validate_recipes(recipes, items, buildings, result)
    if buildings:
        validate_buildings(buildings, result)
    if items and recipes and buildings:
        validate_referential_integrity(items, recipes, buildings, result)

    # 결과 저장
    validation_report = {
        "valid": result.is_valid,
        "error_count": len(result.errors),
        "warning_count": len(result.warnings),
        "errors": result.errors,
        "warnings": result.warnings,
    }

    with open(output_dir / "validation_report.json", "w", encoding="utf-8") as f:
        json.dump(validation_report, f, ensure_ascii=False, indent=2)
    logger.info(f"검증 결과 저장: {output_dir / 'validation_report.json'}")

    return result
