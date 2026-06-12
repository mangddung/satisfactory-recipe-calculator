#!/usr/bin/env python3
"""
게임에서 추출된 아이콘 파일을 프로젝트 icons/ 폴더로 복사.

사용법:
  python data-pipeline/copy_icons.py --src "D:/FModel/Output/Exports"
  python data-pipeline/copy_icons.py --src "C:/게임추출폴더" --dry-run
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
ITEMS_JSON = ROOT / "backend" / "data" / "clean" / "items.json"
ICONS_OUT = ROOT / "backend" / "data" / "original" / "icons"


def load_icon_paths() -> list[str]:
    if not ITEMS_JSON.exists():
        print(f"[오류] items.json 없음: {ITEMS_JSON}")
        print("  파이프라인을 먼저 실행하세요: python data-pipeline/run_pipeline.py")
        sys.exit(1)
    with open(ITEMS_JSON, encoding="utf-8") as f:
        items = json.load(f)
    paths = [v["iconPath"] for v in items.values() if v.get("iconPath")]
    return paths


def find_file(src_root: Path, icon_path: str) -> Path | None:
    """
    iconPath(예: FactoryGame/Resource/Parts/.../Icon.png)를
    추출 폴더에서 탐색. FModel 출력 구조 차이를 흡수하기 위해
    여러 prefix 후보를 시도한다.
    """
    candidates = [
        src_root / icon_path,
        src_root / "FactoryGame" / "Content" / icon_path,
        src_root / "Content" / icon_path,
        # FactoryGame/Resource/... → FactoryGame/Content/FactoryGame/Resource/...
        src_root / icon_path.replace(
            "FactoryGame/", "FactoryGame/Content/FactoryGame/", 1
        ),
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def copy_icons(src_root: Path, dry_run: bool = False):
    icon_paths = load_icon_paths()
    print(f"필요한 아이콘: {len(icon_paths)}개")
    print(f"소스 경로: {src_root}")
    print(f"출력 경로: {ICONS_OUT}")
    if dry_run:
        print("[dry-run 모드 — 실제 복사 안 함]\n")

    ok = 0
    missing = []

    for icon_path in icon_paths:
        src_file = find_file(src_root, icon_path)
        if not src_file:
            missing.append(icon_path)
            continue

        dest = ICONS_OUT / icon_path
        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_file, dest)
        else:
            print(f"  [copy] {src_file.name} → {dest.relative_to(ROOT)}")
        ok += 1

    print(f"\n완료: {ok}개 복사, {len(missing)}개 없음")
    if missing:
        print("\n못 찾은 파일:")
        for p in missing[:20]:
            print(f"  {p}")
        if len(missing) > 20:
            print(f"  ... 외 {len(missing) - 20}개")


def main():
    parser = argparse.ArgumentParser(description="Satisfactory 아이콘 일괄 복사")
    parser.add_argument(
        "--src", required=True,
        help="FModel 추출 루트 폴더 (예: D:/FModel/Output/Exports)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="복사 없이 대상 파일만 출력",
    )
    args = parser.parse_args()

    src_root = Path(args.src).resolve()
    if not src_root.exists():
        print(f"[오류] 소스 폴더 없음: {src_root}")
        sys.exit(1)

    copy_icons(src_root, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
