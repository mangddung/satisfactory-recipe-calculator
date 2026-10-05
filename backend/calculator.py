"""
생산량 계산 엔진

calculate(item_id, target_rate, recipe_selections, items, recipes) → ChainNode dict
get_craftable_items(items, recipes) → list[CraftableItem]
"""

import math

RAW_ACQUISITIONS = {'miner', 'oil_extractor', 'water_extractor', 'resource_well'}
EXCLUDE_ACQUISITIONS = {'unclassified', 'other'}


def _is_unpackage(recipe: dict) -> bool:
    return recipe.get('slug', '').startswith('unpackage-')


def _find_primary_recipe(item_id: str, recipes: dict) -> dict | None:
    """기본 레시피: 대체 레시피(isAlternate)가 아닌 것 우선, 그중 클래스명이 아이템과 같은 것
    (Desc_Rubber_C → Recipe_Rubber_C, Recipe_ResidualRubber_C 보다 우선). 이름 비교는 언어마다 달라서 클래스명 사용.
    대체 레시피로만 만들 수 있는 아이템은 대체 레시피를 기본으로."""
    candidates = [
        r for r in recipes.values()
        if r.get('recipeType') == 'production'
        and not _is_unpackage(r)
        and any(p['item'] == item_id for p in r.get('products', []))
    ]
    same_name = 'Recipe_' + item_id.removeprefix('Desc_')
    return min(
        candidates,
        key=lambda r: (r.get('isAlternate', False), r.get('className') != same_name),
        default=None,
    )


def _find_chain_recipe(item_id: str, recipe_selections: dict, recipes: dict) -> dict | None:
    sel_id = recipe_selections.get(item_id)
    if sel_id and sel_id in recipes:
        return recipes[sel_id]
    return _find_primary_recipe(item_id, recipes)


def _collect_chain_ingredients(
    recipe_id: str,
    recipes: dict,
    recipe_selections: dict,
    visited: set | None = None,
) -> set:
    if visited is None:
        visited = set()
    r = recipes.get(recipe_id)
    if not r or recipe_id in visited:
        return set()
    visited.add(recipe_id)
    items: set = set()
    for ing in r.get('ingredients', []):
        items.add(ing['item'])
        sub = _find_chain_recipe(ing['item'], recipe_selections, recipes)
        if sub:
            items |= _collect_chain_ingredients(sub['id'], recipes, recipe_selections, visited)
    return items


def _calc_rate(amount: float, duration: float) -> float | None:
    if not duration or duration <= 0:
        return None
    return (amount / duration) * 60


def _can_extract(ext: dict, item_id: str, acquisition: str) -> bool:
    """추출기가 이 자원을 뽑을 수 있는지: 게임 데이터의 허용 자원 목록, 목록이 없으면(채굴기) acquisitionType."""
    allowed = ext.get('allowedResources')
    return item_id in allowed if allowed else ext.get('acquisitionType') == acquisition


def _extractor_suggestion(item_id: str, acquisition: str, target_rate: float, extractors: dict, purity_multipliers: dict) -> dict | None:
    """원자재 노드에 대해 순도별 필요 채굴기 수를 계산.
    이 자원을 뽑을 수 있는 추출기 중 baseRatePerMin이 높은 순으로 우선 (가압기처럼 직접 뽑지 않는 건 제외).
    """
    if not extractors or not acquisition:
        return None

    candidates = [
        ext for ext in extractors.values()
        if _can_extract(ext, item_id, acquisition) and ext.get('baseRatePerMin', 0) > 0
    ]
    if not candidates:
        return None

    # baseRatePerMin 내림차순 (고급 채굴기 우선)
    candidates.sort(key=lambda x: x.get('baseRatePerMin', 0), reverse=True)
    ext = candidates[0]

    base_rate = ext['baseRatePerMin']
    suggestions = {}
    for purity, mult in purity_multipliers.items():
        rate_per_node = base_rate * mult
        count = math.ceil(target_rate / rate_per_node)
        suggestions[purity] = {
            'count': count,
            'ratePerNode': round(rate_per_node, 4),
        }

    return {
        'extractorId': ext['id'],
        'displayName': ext.get('displayName', ext['id']),
        'baseRatePerMin': base_rate,
        'powerConsumptionMW': ext.get('powerConsumption', 0),
        'byPurity': suggestions,
    }


def calculate(
    item_id: str,
    target_rate: float,
    recipe_selections: dict,
    items: dict,
    recipes: dict,
    buildings: dict,
    visited: set | None = None,
    extractors: dict | None = None,
    game_constants: dict | None = None,
) -> dict:
    """재귀적으로 ChainNode 트리를 생성한다."""
    if visited is None:
        visited = set()
    if extractors is None:
        extractors = {}
    if game_constants is None:
        game_constants = {}

    purity_multipliers = game_constants.get('purityMultipliers', {})

    item = items.get(item_id, {})
    acquisition = item.get('acquisition')
    is_raw = acquisition in RAW_ACQUISITIONS
    already_visited = item_id in visited

    recipe = None
    default_recipe = None
    if not is_raw and not already_visited:
        recipe = _find_chain_recipe(item_id, recipe_selections, recipes)
        default_recipe = _find_primary_recipe(item_id, recipes)

    building_count = 0.0
    building_count_ceil = 0
    clock_speed = 0.0
    power_mw = 0.0
    children: list = []
    byproduct_outputs: list = []
    extractor_suggestion = None

    if recipe:
        visited = visited | {item_id}
        dur = recipe.get('manufactoringDuration', 0) or 1
        out_amount = next(
            (p['amount'] for p in recipe.get('products', []) if p['item'] == item_id),
            1,
        )
        output_per_min = _calc_rate(out_amount, dur) or 1
        building_count = target_rate / output_per_min
        building_count_ceil = math.ceil(building_count)
        clock_speed = round((building_count / building_count_ceil) * 100, 2) if building_count_ceil else 0

        building_id = (recipe.get('producedIn') or [None])[0]
        base_power = (buildings.get(building_id) or {}).get('powerConsumption', 0) or 0
        clock_ratio = (clock_speed / 100.0) if building_count_ceil else 1.0
        power_mw = base_power * (clock_ratio ** 1.321928) * building_count_ceil

        # 재료 재귀
        for ing in recipe.get('ingredients', []):
            ing_rate = (ing['amount'] / dur) * 60 * building_count
            child = calculate(ing['item'], ing_rate, recipe_selections, items, recipes, buildings, visited, extractors, game_constants)
            children.append(child)

        # 부산물 출력량
        for bp in recipe.get('byproducts', []):
            bp_rate = _calc_rate(bp['amount'], dur)
            if bp_rate is not None:
                byproduct_outputs.append({
                    'itemId': bp['item'],
                    'rate': round(bp_rate * building_count, 4),
                })
    elif is_raw:
        extractor_suggestion = _extractor_suggestion(item_id, acquisition, target_rate, extractors, purity_multipliers)

    return {
        'itemId': item_id,
        'targetRate': round(target_rate, 4),
        'recipe': {**recipe, 'id': recipe['className']} if recipe else None,  # 프론트 Recipe 타입은 id 로 구분
        'defaultRecipeId': default_recipe['className'] if default_recipe else None,
        'buildingCount': round(building_count, 4),
        'buildingCountCeil': building_count_ceil,
        'clockSpeed': clock_speed,
        'powerMW': round(power_mw, 2),
        'children': children,
        'byproductOutputs': byproduct_outputs,
        'extractorSuggestion': extractor_suggestion,
    }


def aggregate_raw_resources(node: dict) -> dict:
    """트리에서 원자재(리프 노드) 합산."""
    totals: dict = {}
    if not node.get('recipe'):
        totals[node['itemId']] = totals.get(node['itemId'], 0) + node['targetRate']
    for child in node.get('children', []):
        for k, v in aggregate_raw_resources(child).items():
            totals[k] = totals.get(k, 0) + v
    return totals


def sum_power(node: dict) -> float:
    total = node.get('powerMW', 0)
    for child in node.get('children', []):
        total += sum_power(child)
    return total


def get_craftable_items(items: dict, recipes: dict) -> list:
    """production 레시피 보유 + unclassified/other 제외 아이템 목록."""
    # item_id → production 레시피 개수 맵
    craftable: dict = {}
    for r in recipes.values():
        if r.get('recipeType') != 'production':
            continue
        if _is_unpackage(r):
            continue
        for p in r.get('products', []):
            iid = p['item']
            craftable[iid] = craftable.get(iid, 0) + 1

    result = []
    for item_id, recipe_count in craftable.items():
        item = items.get(item_id)
        if not item:
            continue
        if item.get('acquisition') in EXCLUDE_ACQUISITIONS | RAW_ACQUISITIONS:
            continue
        result.append({
            'id': item_id,
            'displayName': item.get('displayName', item_id),
            'iconPath': item.get('iconPath'),
            'recipeCount': recipe_count,
            'techTier': item.get('techTier'),
        })
    result.sort(key=lambda x: (x['techTier'] if x['techTier'] is not None else 99, x['displayName']))
    return result
