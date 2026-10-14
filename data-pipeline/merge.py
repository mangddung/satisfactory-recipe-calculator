#!/usr/bin/env python3
"""
오버라이드 병합 — 파싱된 JSON + 수동 오버라이드 → 최종 검증용 JSON

처리 규칙:
1. overrides.json의 patch阵列을 순서대로 적용 (배열 순서 = 우선순위)
2. 각 패치: {"op": "replace"|"add"|"remove", ...}
   - replace: 기존 키 값을 덮어씀
   - add: 새 항목 추가
   - remove: 기존 항목 삭제
3. 병합 후 스키마 검증 (validate.py로 위임)
4. 병합 충돌 로그 출력
"""

import json
import copy
import logging
import re
import shutil
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def apply_patch(data: dict, patch: dict) -> tuple[dict, list[str]]:
    """
    단일 패치를 데이터에 적용

    Args:
        data: 대상 딕셔너리
        patch: 패치 정보 {"op": "...", "target": "...", ...}

    Returns:
        (수정된 데이터, 경고 목록)
    """
    warnings = []
    op = patch.get("op")
    target = patch.get("target")  # 대상 항목 ID (예: "Desc_IronIngot_C")
    field = patch.get("field")    # 수정할 필드 (예: "displayName")
    value = patch.get("value")    # 새 값

    if not op:
        warnings.append(f"패치에 'op' 필드가 없음: {patch}")
        return data, warnings

    if op == "add":
        # 새 항목 추가
        if not target:
            warnings.append(f"add 패치에 'target' 필드가 없음: {patch}")
            return data, warnings

        if target in data:
            # 기존 항목이 있으면 필드 업데이트
            if field and value is not None:
                data[target][field] = value
                logger.info(f"필드 업데이트: {target}.{field} = {value}")
            elif isinstance(value, dict):
                data[target].update(value)
                logger.info(f"항목 업데이트: {target}")
            else:
                warnings.append(f"add 패치에 'field' 또는 'value'가 누락됨: {patch}")
        else:
            # 완전 새 항목
            if isinstance(value, dict):
                data[target] = copy.deepcopy(value)
                logger.info(f"새 항목 추가: {target}")
            else:
                warnings.append(f"add 패치의 value가 dict가 아님: {patch}")

    elif op == "replace":
        # 기존 값 교체
        if not target:
            warnings.append(f"replace 패치에 'target' 필드가 없음: {patch}")
            return data, warnings

        if target not in data:
            warnings.append(f"replace 대상 '{target}'이(가) 존재하지 않음")
            return data, warnings

        if field:
            # 특정 필드만 교체
            old_value = data[target].get(field)
            data[target][field] = value
            logger.info(f"값 교체: {target}.{field}: {old_value} → {value}")
        elif isinstance(value, dict):
            # 전체 항목 교체
            data[target] = copy.deepcopy(value)
            logger.info(f"항목 교체: {target}")
        else:
            warnings.append(f"replace 패치에 'field' 또는 'value(dict)'가 필요함: {patch}")

    elif op == "remove":
        # 항목 또는 필드 제거
        if not target:
            warnings.append(f"remove 패치에 'target' 필드가 없음: {patch}")
            return data, warnings

        if target not in data:
            warnings.append(f"remove 대상 '{target}'이(가) 존재하지 않음")
            return data, warnings

        if field:
            # 특정 필드만 제거
            if field in data[target]:
                del data[target][field]
                logger.info(f"필드 제거: {target}.{field}")
            else:
                warnings.append(f"remove 대상 필드 '{target}.{field}'이(가) 존재하지 않음")
        else:
            # 전체 항목 제거
            del data[target]
            logger.info(f"항목 제거: {target}")

    else:
        warnings.append(f"알 수 없는 op: '{op}' in patch: {patch}")

    return data, warnings


def apply_patches(data: dict, patches: list[dict]) -> tuple[dict, list[str]]:
    """
    패치 배열을 순서대로 적용

    Args:
        data: 원본 데이터
        patches: 패치 배열

    Returns:
        (수정된 데이터, 모든 경고 목록)
    """
    all_warnings = []
    data = copy.deepcopy(data)

    for i, patch in enumerate(patches):
        logger.info(f"패치 {i + 1}/{len(patches)} 적용: op={patch.get('op')}, target={patch.get('target')}")
        data, warnings = apply_patch(data, patch)
        all_warnings.extend(warnings)

    return data, all_warnings


def merge_data(
    items_path: str | None,
    recipes_path: str | None,
    buildings_path: str | None,
    overrides_path: str,
    output_dir: str,
    extractors_path: str | None = None,
    conveyors_path: str | None = None,
    game_constants_path: str | None = None,
) -> dict:
    """
    오버라이드 병합 실행

    Args:
        items_path: 파싱된 items.json 경로
        recipes_path: 파싱된 recipes.json 경로
        buildings_path: 파싱된 buildings.json 경로
        overrides_path: overrides.json 경로
        output_dir: 출력 디렉토리

    Returns:
        병합 통계 딕셔너리
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 오버라이드 로딩
    overrides_path = Path(overrides_path)
    if not overrides_path.exists():
        logger.warning(f"오버라이드 파일이 없음: {overrides_path} (빈 오버라이드 생성)")
        overrides = {"items": [], "recipes": [], "buildings": []}
    else:
        logger.info(f"오버라이드 로딩: {overrides_path}")
        with open(overrides_path, "r", encoding="utf-8") as f:
            overrides = json.load(f)

    stats = {
        "items_patches": 0,
        "recipes_patches": 0,
        "buildings_patches": 0,
        "total_extractors": 0,
        "total_conveyors": 0,
        "warnings": [],
    }

    # ── 아이템 병합 ──
    if items_path:
        items_path = Path(items_path)
        if items_path.exists():
            logger.info(f"아이템 로딩: {items_path}")
            with open(items_path, "r", encoding="utf-8") as f:
                items = json.load(f)

            item_patches = overrides.get("items", [])
            stats["items_patches"] = len(item_patches)

            if item_patches:
                logger.info(f"아이템 오버라이드 적용: {len(item_patches)}개 패치")
                items, warnings = apply_patches(items, item_patches)
                stats["warnings"].extend(warnings)

            with open(output_dir / "items.json", "w", encoding="utf-8") as f:
                json.dump(items, f, ensure_ascii=False, indent=2)
            logger.info(f"병합된 items.json 작성 완료: {len(items)}개 항목")
        else:
            logger.warning(f"아이템 파일이 없음: {items_path}")

    # ── 레시피 병합 ──
    if recipes_path:
        recipes_path = Path(recipes_path)
        if recipes_path.exists():
            logger.info(f"레시피 로딩: {recipes_path}")
            with open(recipes_path, "r", encoding="utf-8") as f:
                recipes = json.load(f)

            recipe_patches = overrides.get("recipes", [])
            stats["recipes_patches"] = len(recipe_patches)

            if recipe_patches:
                logger.info(f"레시피 오버라이드 적용: {len(recipe_patches)}개 패치")
                recipes, warnings = apply_patches(recipes, recipe_patches)
                stats["warnings"].extend(warnings)

            with open(output_dir / "recipes.json", "w", encoding="utf-8") as f:
                json.dump(recipes, f, ensure_ascii=False, indent=2)
            logger.info(f"병합된 recipes.json 작성 완료: {len(recipes)}개 항목")
        else:
            logger.warning(f"레시피 파일이 없음: {recipes_path}")

    # ── 건물 병합 ──
    if buildings_path:
        buildings_path = Path(buildings_path)
        if buildings_path.exists():
            logger.info(f"건물 로딩: {buildings_path}")
            with open(buildings_path, "r", encoding="utf-8") as f:
                buildings = json.load(f)

            building_patches = overrides.get("buildings", [])
            stats["buildings_patches"] = len(building_patches)

            if building_patches:
                logger.info(f"건물 오버라이드 적용: {len(building_patches)}개 패치")
                buildings, warnings = apply_patches(buildings, building_patches)
                stats["warnings"].extend(warnings)

            with open(output_dir / "buildings.json", "w", encoding="utf-8") as f:
                json.dump(buildings, f, ensure_ascii=False, indent=2)
            logger.info(f"병합된 buildings.json 작성 완료: {len(buildings)}개 항목")
        else:
            logger.warning(f"건물 파일이 없음: {buildings_path}")

    # ── 채굴기 패스스루 ──
    if extractors_path:
        extractors_path = Path(extractors_path)
        if extractors_path.exists():
            with open(extractors_path, "r", encoding="utf-8") as f:
                extractors = json.load(f)
            with open(output_dir / "extractors.json", "w", encoding="utf-8") as f:
                json.dump(extractors, f, ensure_ascii=False, indent=2)
            stats["total_extractors"] = len(extractors)
            logger.info(f"채굴기 데이터 복사 완료: {len(extractors)}개")

    # ── 컨베이어 패스스루 ──
    if conveyors_path:
        conveyors_path = Path(conveyors_path)
        if conveyors_path.exists():
            with open(conveyors_path, "r", encoding="utf-8") as f:
                conveyors = json.load(f)
            with open(output_dir / "conveyors.json", "w", encoding="utf-8") as f:
                json.dump(conveyors, f, ensure_ascii=False, indent=2)
            stats["total_conveyors"] = len(conveyors)
            logger.info(f"컨베이어 데이터 복사 완료: {len(conveyors)}개")

    # ── 게임 상수 패스스루 ──
    if game_constants_path:
        game_constants_path = Path(game_constants_path)
        if game_constants_path.exists():
            with open(game_constants_path, "r", encoding="utf-8") as f:
                game_constants = json.load(f)
            with open(output_dir / "game_constants.json", "w", encoding="utf-8") as f:
                json.dump(game_constants, f, ensure_ascii=False, indent=2)
            logger.info("게임 상수 복사 완료")

    # 통계 저장
    with open(output_dir / "merge_stats.json", "w", encoding="utf-8") as f:
        json.dump({"merge_stats": stats}, f, ensure_ascii=False, indent=2)

    logger.info(f"병합 통계: {json.dumps(stats, ensure_ascii=False, indent=2)}")

    return stats


_SKIP_SCHEMATIC_PREFIXES = (
    'ResourceSink_',        # AWESOME 상점 잠금 해제 (공장 생산 티어 무관)
    'CBG_',                 # 건물 커스터마이저 (건축 외형)
    'CustomizerUnlock_',
    'Schematic_Trinket_',
    'Schematic_Helmet_',
    'Schematic_Skin_',
    'Schematic_Ficsday',
)

_SKIP_SCHEMATIC_KEYWORDS = (
    'savecompatibility',    # 저장 호환성 마이그레이션 — 다수 레시피를 Tier 0으로 끌어내림
    'xmas',                 # FICSMAS 이벤트
    'ficsmas',
    'xmass',                # XMassTree 계열
)


def _is_progression_schematic(class_name: str, tier: int) -> bool:
    """생산 티어 기준으로 삼을 '진행' 스키마틱인지 판별."""
    for prefix in _SKIP_SCHEMATIC_PREFIXES:
        if class_name.startswith(prefix):
            return False
    cn_lower = class_name.lower()
    for kw in _SKIP_SCHEMATIC_KEYWORDS:
        if kw in cn_lower:
            return False
    # 하드드라이브 대체 레시피는 tier=0으로 등록되어 있지만 실제 허브 진행 티어가 없음
    if class_name.startswith('Schematic_Alternate_') and tier == 0:
        return False
    return True


def _extract_tier_from_docs(docs_json_path: Path, recipes: dict) -> dict:
    """ko.json/Docs.json의 FGSchematic에서 아이템별 최초 해금 Tier를 추출."""
    raw = None
    for enc in ('utf-16', 'utf-8', 'utf-8-sig'):
        try:
            with open(docs_json_path, 'r', encoding=enc) as f:
                raw = json.load(f)
            break
        except (UnicodeDecodeError, ValueError):
            continue
    if raw is None:
        logger.warning(f"Tier enrichment: {docs_json_path.name} 인코딩 파싱 실패")
        return {}

    schematics_entry = next(
        (e for e in raw if 'FGSchematic' in e.get('NativeClass', '')), None
    )
    if not schematics_entry:
        logger.warning("Tier enrichment: FGSchematic 데이터 없음")
        return {}

    recipe_tier: dict[str, int] = {}
    skipped = 0
    for s in schematics_entry['Classes']:
        cn = s.get('ClassName', '')
        tier = int(s.get('mTechTier', 99))
        if not _is_progression_schematic(cn, tier):
            skipped += 1
            continue
        for unlock in s.get('mUnlocks', []):
            for m in re.finditer(r'(\w+_C)\'', unlock.get('mRecipes', '')):
                rid = m.group(1)
                if rid not in recipe_tier or tier < recipe_tier[rid]:
                    recipe_tier[rid] = tier

    logger.info(f"Tier enrichment: 스키마틱 {len(schematics_entry['Classes'])}개 중 {skipped}개 필터링 (AWESOME 상점·FICSMAS·SaveCompatibility·Tier0 대체)")

    # 대체 레시피는 표준 레시피가 없는 아이템에만 적용 (하드드라이브 해금이라 진행 티어를 앞당기면 안 됨)
    item_tier: dict[str, int] = {}
    for alternate in (False, True):
        found: dict[str, int] = {}
        for rid, r in recipes.items():
            t = recipe_tier.get(rid)
            if t is None or r.get('isAlternate', False) != alternate:
                continue
            for prod in r.get('products', []):
                iid = prod.get('item', '')
                if iid and iid not in item_tier and (iid not in found or t < found[iid]):
                    found[iid] = t
        item_tier.update(found)

    return item_tier


def extract_icons(clean_dir: str | Path, source_dir: str | Path) -> dict:
    """source_dir(game-data) 안의 png 중 items/buildings가 참조하는 아이콘만 clean/icons로 복사.
    원본은 읽기만 한다. FModel 출력 폴더 구조와 무관하게 경로 끝부분으로 매칭
    (FModel은 /Game/ 을 FactoryGame/Content/ 로 내보내므로 iconPath 앞의 FactoryGame/ 은 비교에서 뺌).
    """
    clean_dir = Path(clean_dir)
    out_dir = clean_dir / 'icons'
    if out_dir.exists():
        shutil.rmtree(out_dir)

    by_name: dict[str, list[Path]] = {}
    for p in Path(source_dir).rglob('*.png'):
        by_name.setdefault(p.name.lower(), []).append(p)

    needed: set[str] = set()
    for filename in ('items.json', 'buildings.json'):
        filepath = clean_dir / filename
        if filepath.exists():
            with open(filepath, 'r', encoding='utf-8') as f:
                needed |= {v['iconPath'] for v in json.load(f).values() if v.get('iconPath')}

    copied = 0
    missing = []
    sources = []
    for icon_path in sorted(needed):
        tail = '/' + icon_path.split('/', 1)[-1].lower()
        src = next(
            (p for p in by_name.get(Path(icon_path).name.lower(), []) if p.as_posix().lower().endswith(tail)),
            None,
        )
        if src is None:
            missing.append(icon_path)
            continue
        dest = out_dir / icon_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        copied += 1
        sources.append(src)

    logger.info(f"아이콘 추출: 필요 {len(needed)}개 중 {copied}개 복사, {len(missing)}개 없음")
    return {'needed': len(needed), 'copied': copied, 'missing': missing, 'sources': sources}


def enrich_item_tiers(clean_dir: str | Path, docs_json_path: str | Path | None) -> int:
    """
    clean/items.json에 techTier 필드 추가.
    docs_json_path 없거나 FGSchematic 없으면 no-op.
    Returns: 티어가 설정된 아이템 수
    """
    if not docs_json_path:
        return 0
    docs_json_path = Path(docs_json_path)
    if not docs_json_path.exists():
        return 0

    clean_dir = Path(clean_dir)
    items_path = clean_dir / "items.json"
    recipes_path = clean_dir / "recipes.json"
    if not items_path.exists() or not recipes_path.exists():
        return 0

    with open(items_path, 'r', encoding='utf-8') as f:
        items = json.load(f)
    with open(recipes_path, 'r', encoding='utf-8') as f:
        recipes = json.load(f)

    tier_map = _extract_tier_from_docs(docs_json_path, recipes)

    count = 0
    for iid, item in items.items():
        t = tier_map.get(iid)
        if t is not None:
            item['techTier'] = t
            count += 1
        else:
            item.pop('techTier', None)

    with open(items_path, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    logger.info(f"Tier enrichment 완료: {count}/{len(items)}개 아이템에 techTier 설정")
    return count
