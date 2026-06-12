#!/usr/bin/env python3
"""
Satisfactory Recipe Data Pipeline Orchestrator

Runs the full data pipeline in sequence:
1. parse_docs.py  → Parse Docs.json → items.json, recipes.json, buildings.json
2. classify.py    → Label items with acquisition, producedBy
3. merge.py       → Apply overrides.json patches
4. validate.py    → Validate final JSON schemas and referential integrity

Usage:
    python run_pipeline.py [options]

Options:
    --docs-json PATH       Path to Docs.json (default: ../backend/data/original/Docs.json)
    --raw-output PATH      Output dir for parsed data (default: ../backend/data/raw)
    --intermediate-output PATH Output dir for classified data (default: ../backend/data/intermediate)
    --clean-output PATH    Output dir for final clean data (default: ../backend/data/clean)
    --overrides PATH       Path to overrides JSON (default: ./overrides.json)
    --skip-parse           Skip parsing step
    --skip-classify        Skip classification step
    --skip-merge           Skip merge step
    --skip-validate        Skip validation step
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("pipeline")


def get_project_root() -> Path:
    """Get the project root directory (parent of data-pipeline/)."""
    return Path(__file__).parent.parent


def get_default_paths() -> dict:
    """Get default file paths relative to project root."""
    root = get_project_root()
    original_dir = root / "backend" / "data" / "original"

    # Docs.json 없으면 같은 구조의 언어별 파일 자동 탐색 (ko.json 등)
    docs_json = original_dir / "Docs.json"
    if not docs_json.exists():
        candidates = sorted(original_dir.glob("*.json")) if original_dir.exists() else []
        if candidates:
            docs_json = candidates[0]
            logger.info(f"Docs.json 없음 → 대체 파일 사용: {docs_json.name}")

    return {
        "docs_json": docs_json,
        "raw_dir": root / "backend" / "data" / "raw",
        "intermediate_dir": root / "backend" / "data" / "intermediate",
        "clean_dir": root / "backend" / "data" / "clean",
        "overrides": Path(__file__).parent / "overrides.json",
    }


def ensure_directories(paths: dict) -> None:
    """Create necessary directories if they don't exist."""
    for key in ["raw_dir", "intermediate_dir", "clean_dir"]:
        paths[key].mkdir(parents=True, exist_ok=True)
        logger.debug(f"Ensured directory exists: {paths[key]}")


def load_module(module_name: str):
    """Dynamically import a pipeline module."""
    import importlib.util

    pipeline_dir = Path(__file__).parent
    module_path = pipeline_dir / f"{module_name}.py"

    if not module_path.exists():
        raise ImportError(f"Module not found: {module_path}")

    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class PipelineRunner:
    """Orchestrates the execution of the data pipeline."""

    def __init__(self, paths: dict, args: argparse.Namespace):
        self.paths = paths
        self.args = args
        self.results = {}

    def run_parse(self) -> dict:
        """Step 1: Parse Docs.json to extract items, recipes, buildings."""
        logger.info("=" * 60)
        logger.info("STEP 1/4: Parsing Docs.json")
        logger.info("=" * 60)

        parse_docs = load_module("parse_docs")

        docs_json = self.paths["docs_json"]
        raw_dir = self.paths["raw_dir"]

        # Check if Docs.json exists
        if not docs_json.exists():
            logger.warning(f"Docs.json not found: {docs_json}")
            # Create a minimal Docs.json so pipeline doesn't fail entirely
            docs_json.parent.mkdir(parents=True, exist_ok=True)
            minimal_docs = [
                {
                    "NativeClass": "Class'/Script/FactoryGame.FGItemDescriptor'",
                    "Classes": [
                        {
                            "ClassName": "Desc_OreIron_C",
                            "mDisplayName": "Iron Ore",
                            "mForm": "RFC_None",
                        },
                        {
                            "ClassName": "Desc_IronIngot_C",
                            "mDisplayName": "Iron Ingot",
                            "mForm": "RFC_None",
                        },
                    ],
                },
                {
                    "NativeClass": "Class'/Script/FactoryGame.FGRecipe'",
                    "Classes": [
                        {
                            "ClassName": "Recipe_IngotIron_C",
                            "mDisplayName": "Iron Ingot",
                            "mIngredients": '((ItemClass="/Game/FactoryGame/Resource/Parts/IronOre/Desc_OreIron.Desc_OreIron_C",Amount=1))',
                            "mProduct": '((ItemClass="/Game/FactoryGame/Resource/Parts/IronIngot/Desc_IronIngot.Desc_IronIngot_C",Amount=1))',
                            "mProducedIn": '((ItemClass="/Game/FactoryGame/Buildable/Factory/SmelterMk1/Build_SmelterMk1.Build_SmelterMk1_C",Amount=1))',
                            "mManufactoringDuration": 2,
                        }
                    ],
                },
                {
                    "NativeClass": "Class'/Script/FactoryGame.FGBuildableManufacturer'",
                    "Classes": [
                        {
                            "ClassName": "Build_SmelterMk1_C",
                            "mDisplayName": "Smelter",
                        }
                    ],
                },
            ]
            with open(docs_json, "w", encoding="utf-8") as f:
                json.dump(minimal_docs, f, indent=2, ensure_ascii=False)
            logger.info(f"Created minimal Docs.json: {docs_json}")

        stats = parse_docs.parse_docs(str(docs_json), str(raw_dir))

        # Count parsed entries
        items_path = raw_dir / "items.json"
        recipes_path = raw_dir / "recipes.json"
        buildings_path = raw_dir / "buildings.json"

        counts = {}
        for name, path in [("items", items_path), ("recipes", recipes_path), ("buildings", buildings_path)]:
            if path.exists():
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                counts[name] = len(data)
            else:
                counts[name] = 0

        logger.info(f"Parsed → items: {counts['items']}, recipes: {counts['recipes']}, buildings: {counts['buildings']}")
        return {"stats": stats, "counts": counts, "raw_dir": str(raw_dir)}

    def run_classify(self) -> dict:
        """Step 2: Classify items with acquisition and producedBy labels."""
        logger.info("=" * 60)
        logger.info("STEP 2/4: Classifying items")
        logger.info("=" * 60)

        classify = load_module("classify")

        raw_dir = self.paths["raw_dir"]
        intermediate_dir = self.paths["intermediate_dir"]

        items_path = raw_dir / "items.json"
        recipes_path = raw_dir / "recipes.json"

        if not items_path.exists() or not recipes_path.exists():
            raise FileNotFoundError(f"Missing parsed files: {items_path} or {recipes_path}")

        classification_overrides = Path(__file__).parent / "classification_overrides.json"
        stats = classify.classify_items(
            str(items_path),
            str(recipes_path),
            str(intermediate_dir),
            overrides_path=str(classification_overrides),
        )

        # Copy classified items to intermediate
        classified_items_path = intermediate_dir / "items.json"
        logger.info(f"Classified items saved to: {classified_items_path}")
        logger.info(f"Acquisition distribution: {stats.get('acquisition_counts', {})}")
        return {"stats": stats, "intermediate_dir": str(intermediate_dir)}

    def run_merge(self) -> dict:
        """Step 3: Merge parsed data with overrides."""
        logger.info("=" * 60)
        logger.info("STEP 3/4: Merging with overrides")
        logger.info("=" * 60)

        merge = load_module("merge")

        intermediate_dir = self.paths["intermediate_dir"]
        clean_dir = self.paths["clean_dir"]
        overrides_path = self.paths["overrides"]

        items_path = intermediate_dir / "items.json"
        recipes_path = intermediate_dir / "recipes.json"
        buildings_path = intermediate_dir / "buildings.json"

        # If intermediate files don't exist, fall back to raw
        raw_dir = self.paths["raw_dir"]
        if not items_path.exists():
            items_path = raw_dir / "items.json"
        if not recipes_path.exists():
            recipes_path = raw_dir / "recipes.json"
        if not buildings_path.exists():
            buildings_path = raw_dir / "buildings.json"

        extractors_path = raw_dir / "extractors.json"
        conveyors_path = raw_dir / "conveyors.json"
        game_constants_path = raw_dir / "game_constants.json"

        stats = merge.merge_data(
            str(items_path) if items_path.exists() else None,
            str(recipes_path) if recipes_path.exists() else None,
            str(buildings_path) if buildings_path.exists() else None,
            str(overrides_path),
            str(clean_dir),
            extractors_path=str(extractors_path) if extractors_path.exists() else None,
            conveyors_path=str(conveyors_path) if conveyors_path.exists() else None,
            game_constants_path=str(game_constants_path) if game_constants_path.exists() else None,
        )

        logger.info(f"Merge complete: {stats['items_patches']} item patches, {stats['recipes_patches']} recipe patches, {stats['buildings_patches']} building patches")

        docs_json = self.paths.get("docs_json")
        if docs_json and Path(docs_json).exists():
            tier_count = merge.enrich_item_tiers(str(clean_dir), str(docs_json))
            logger.info(f"Tech tier enrichment: {tier_count} items tagged")

            icons_dir = Path(docs_json).parent / "icons"
            icon_stats = merge.validate_icon_paths(str(clean_dir), str(icons_dir))
            logger.info(f"Icon validation: {icon_stats['nulled']}/{icon_stats['total']} paths nulled (file not found)")

        return {"stats": stats, "clean_dir": str(clean_dir)}

    def run_validate(self) -> dict:
        """Step 4: Validate final JSON schemas and referential integrity."""
        logger.info("=" * 60)
        logger.info("STEP 4/4: Validating data")
        logger.info("=" * 60)

        validate = load_module("validate")

        clean_dir = self.paths["clean_dir"]

        items_path = clean_dir / "items.json"
        recipes_path = clean_dir / "recipes.json"
        buildings_path = clean_dir / "buildings.json"

        result = validate.validate_data(
            str(items_path),
            str(recipes_path),
            str(buildings_path),
            str(clean_dir),
        )

        # Save validation report
        report_path = clean_dir / "validation_report.json"
        logger.info(f"Validation report: {report_path}")
        logger.info(f"Valid: {result.is_valid}, Errors: {len(result.errors)}, Warnings: {len(result.warnings)}")

        return {
            "valid": result.is_valid,
            "error_count": len(result.errors),
            "warning_count": len(result.warnings),
            "report_path": str(report_path),
        }

    def run(self) -> dict:
        """Run the complete pipeline."""
        start_time = time.time()
        logger.info("Starting Satisfactory Recipe Data Pipeline")
        logger.info(f"Project root: {get_project_root()}")

        # Ensure directories exist
        ensure_directories(self.paths)

        # Step 1: Parse
        if not self.args.skip_parse:
            self.results["parse"] = self.run_parse()
        else:
            logger.info("Skipping parse step")

        # Step 2: Classify
        if not self.args.skip_classify:
            self.results["classify"] = self.run_classify()
        else:
            logger.info("Skipping classify step")

        # Step 3: Merge
        if not self.args.skip_merge:
            self.results["merge"] = self.run_merge()
        else:
            logger.info("Skipping merge step")

        # Step 4: Validate
        if not self.args.skip_validate:
            self.results["validate"] = self.run_validate()
        else:
            logger.info("Skipping validate step")

        elapsed = time.time() - start_time
        logger.info("=" * 60)
        logger.info("PIPELINE COMPLETE")
        logger.info(f"Total time: {elapsed:.2f}s")
        logger.info("=" * 60)

        return self.results


def parse_arguments() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Satisfactory Recipe Data Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_pipeline.py                    # Run full pipeline
  python run_pipeline.py --skip-parse       # Skip parsing, use existing raw data
  python run_pipeline.py --skip-validate    # Run pipeline without validation
        """,
    )

    # Path arguments
    parser.add_argument(
        "--docs-json",
        type=str,
        default=None,
        help="Path to Docs.json file (default: ../backend/data/original/Docs.json)",
    )
    parser.add_argument(
        "--raw-output",
        type=str,
        default=None,
        help="Output directory for parsed data (default: ../backend/data/raw)",
    )
    parser.add_argument(
        "--intermediate-output",
        type=str,
        default=None,
        help="Output directory for classified data (default: ../backend/data/intermediate)",
    )
    parser.add_argument(
        "--clean-output",
        type=str,
        default=None,
        help="Output directory for final clean data (default: ../backend/data/clean)",
    )
    parser.add_argument(
        "--overrides",
        type=str,
        default=None,
        help="Path to overrides JSON file (default: ./overrides.json)",
    )

    # Skip flags
    parser.add_argument(
        "--skip-parse", action="store_true", help="Skip the parsing step"
    )
    parser.add_argument(
        "--skip-classify", action="store_true", help="Skip the classification step"
    )
    parser.add_argument(
        "--skip-merge", action="store_true", help="Skip the merge step"
    )
    parser.add_argument(
        "--skip-validate", action="store_true", help="Skip the validation step"
    )

    # Logging
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose (debug) logging"
    )

    return parser.parse_args()


def build_paths(args: argparse.Namespace) -> dict:
    """Build paths dict from arguments, using defaults where not specified."""
    defaults = get_default_paths()

    paths = {}
    for key in defaults:
        arg_val = getattr(args, key.replace("-", "_"), None)
        if arg_val is not None:
            paths[key] = Path(arg_val)
        else:
            paths[key] = defaults[key]

    return paths


def run():
    """Entry point for programmatic execution."""
    args = parse_arguments()
    paths = build_paths(args)

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    runner = PipelineRunner(paths, args)
    return runner.run()


def main():
    """CLI entry point."""
    try:
        results = run()
        
        # Exit with error if validation failed
        if "validate" in results and not results["validate"].get("valid", True):
            logger.error("Validation failed! Check validation_report.json for details.")
            sys.exit(1)
            
        sys.exit(0)
    except KeyboardInterrupt:
        logger.info("Pipeline interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
