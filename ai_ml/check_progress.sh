#!/bin/bash
# 진행률 확인 스크립트

echo "=== 데이터 증강 진행률 ==="
if [ -f "/home/uit/SIMPAC/ai_ml/data/augment_progress.json" ]; then
    cat /home/uit/SIMPAC/ai_ml/data/augment_progress.json | python3 -m json.tool
else
    echo "진행률 파일이 없습니다. 아직 시작되지 않았거나 오류가 발생했습니다."
fi

echo ""
echo "=== 모델 학습 진행률 ==="
if [ -f "/home/uit/SIMPAC/ai_ml/data/train_progress.json" ]; then
    cat /home/uit/SIMPAC/ai_ml/data/train_progress.json | python3 -m json.tool
else
    echo "진행률 파일이 없습니다. 아직 시작되지 않았거나 오류가 발생했습니다."
fi

echo ""
echo "=== 실행 중인 Python 프로세스 ==="
ps aux | grep -E "data_augmentation|train_model" | grep -v grep || echo "실행 중인 프로세스 없음"

echo ""
echo "=== 최근 로그 (백엔드) ==="
tail -20 /home/uit/SIMPAC/react_dashboard/backend/app.log 2>/dev/null || echo "로그 파일 없음"
