"""자동화 가능 티어 계산 확인. 게임 데이터 없이 실행: python data-pipeline/test_merge.py"""

from merge import _automatable_tiers


def _recipe(products, ingredients=(), recipe_type='production', produced_in=(), byproducts=()):
    return {'recipeType': recipe_type, 'isAlternate': False, 'producedIn': list(produced_in),
            'ingredients': [{'item': i, 'amount': 1} for i in ingredients],
            'products': [{'item': p, 'amount': 1} for p in products],
            'byproducts': [{'item': b, 'amount': 1} for b in byproducts]}


def test_automatable_tiers():
    items = {i: {'acquisition': 'miner' if i == 'Ore' else 'manufactured'}
             for i in ('Ore', 'Ingot', 'Pipe', 'Resin', 'Sam', 'Fluct')}
    constructor, manufacturer = ['Build_ConstructorMk1_C'], ['Build_ManufacturerMk1_C']
    recipes = {
        'R_Constructor': _recipe(['Desc_ConstructorMk1_C'], recipe_type='construction'),
        'R_Manufacturer': _recipe(['Desc_ManufacturerMk1_C'], recipe_type='construction'),
        'R_Mam': _recipe(['Desc_Mam_C'], recipe_type='construction'),
        'R_Ingot': _recipe(['Ingot'], ['Ore'], produced_in=constructor),
        'R_Pipe': _recipe(['Pipe'], ['Ingot'], produced_in=constructor, byproducts=['Resin']),
        'R_Sam': _recipe(['Sam'], ['Ore'], produced_in=constructor),
        'R_Fluct': _recipe(['Fluct'], ['Pipe'], produced_in=manufacturer),
    }
    sources = {  # (tier, MAM 연구 여부)
        'R_Constructor': [(0, False)], 'R_Manufacturer': [(5, False)], 'R_Mam': [(1, False)],
        'R_Ingot': [(0, False)], 'R_Pipe': [(3, False)],
        'R_Sam': [(0, True)],    # MAM 연구 tier 0 → MAM 해금(1)이 하한
        'R_Fluct': [(0, True)],  # 재료 Pipe(3)·제조기(5) 중 늦은 쪽
    }
    assert _automatable_tiers(items, recipes, sources) == {'Ingot': 0, 'Pipe': 3, 'Resin': 3, 'Sam': 1, 'Fluct': 5}


if __name__ == '__main__':
    test_automatable_tiers()
    print('ok')
