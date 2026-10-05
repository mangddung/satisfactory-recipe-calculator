# 게임 데이터 준비 방법

원본 게임 파일(언어별 Docs json, FModel 아이콘)을 어디서 꺼내 어디에 넣는지는
[game-data/README.md](../game-data/README.md) 를 참고하세요.

```powershell
python data-pipeline/run_pipeline.py
```

## 미분류 아이템 처리

파이프라인 실행 후 자동 분류가 안 된 아이템은 `unclassified` 상태로 남습니다.
관리자 페이지(`/admin`)에서 직접 지정하면 `data-pipeline/classification_overrides.json`에 저장되며,
게임 업데이트로 파이프라인을 재실행해도 유지됩니다.
