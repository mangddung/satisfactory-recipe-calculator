"""기본 레시피 선택·추출기 매칭 규칙 확인. 게임 데이터 없이 실행: python backend/test_calculator.py"""

from calculator import _can_extract, _find_primary_recipe


def _recipe(cid, item, alternate=False):
    return {'className': cid, 'recipeType': 'production', 'slug': cid.lower(), 'isAlternate': alternate,
            'products': [{'item': item, 'amount': 1}]}


def test_primary_recipe():
    recipes = {r['className']: r for r in (
        _recipe('Recipe_Alternate_RecycledRubber_C', 'Desc_Rubber_C', alternate=True),
        _recipe('Recipe_ResidualRubber_C', 'Desc_Rubber_C'),
        _recipe('Recipe_Rubber_C', 'Desc_Rubber_C'),
        _recipe('Recipe_Alternate_PolymerResin_C', 'Desc_PolymerResin_C', alternate=True),
    )}
    assert _find_primary_recipe('Desc_Rubber_C', recipes)['className'] == 'Recipe_Rubber_C'
    # 대체 레시피뿐이면 그걸 기본으로
    assert _find_primary_recipe('Desc_PolymerResin_C', recipes)['className'] == 'Recipe_Alternate_PolymerResin_C'
    assert _find_primary_recipe('Desc_Nothing_C', recipes) is None


def test_can_extract():
    well = {'acquisitionType': 'resource_well', 'allowedResources': ['Desc_Water_C', 'Desc_NitrogenGas_C']}
    miner = {'acquisitionType': 'miner', 'allowedResources': []}
    assert _can_extract(well, 'Desc_Water_C', 'water_extractor')
    assert not _can_extract(well, 'Desc_OreIron_C', 'miner')
    assert _can_extract(miner, 'Desc_OreIron_C', 'miner')
    assert not _can_extract(miner, 'Desc_Water_C', 'water_extractor')


if __name__ == '__main__':
    test_primary_recipe()
    test_can_extract()
    print('ok')
