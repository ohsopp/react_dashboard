#!/bin/bash
# AI/ML 환경 설정 스크립트

echo "🚀 AI/ML 환경 설정 시작..."

cd /home/uit/SIMPAC/ai_ml

# venv 생성 (없으면)
if [ ! -d "venv" ]; then
    echo "📦 가상환경 생성 중..."
    python3 -m venv venv
fi

# venv 활성화
source venv/bin/activate

# pip 업그레이드
echo "⬆️ pip 업그레이드 중..."
pip install --quiet --upgrade pip

# 필수 패키지 설치
echo "📚 필수 패키지 설치 중..."
pip install --quiet numpy pandas scikit-learn tensorflow influxdb-client python-dateutil

echo "✅ 설정 완료!"
echo ""
echo "다음 명령어로 가상환경 활성화:"
echo "  cd /home/uit/SIMPAC/ai_ml"
echo "  source venv/bin/activate"
