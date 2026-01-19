#!/bin/bash
# React Dashboard 설치 스크립트

echo "📦 React Dashboard 환경 설정을 시작합니다..."

# Node.js 및 npm 설치 확인 및 설치
if ! command -v node &> /dev/null; then
    echo "📥 Node.js 설치 중..."
    sudo apt update
    sudo apt install -y nodejs npm
else
    echo "✅ Node.js가 이미 설치되어 있습니다: $(node --version)"
fi

# Python3 및 pip 설치 확인 및 설치
if ! command -v python3 &> /dev/null; then
    echo "📥 Python3 설치 중..."
    sudo apt install -y python3 python3-pip
else
    echo "✅ Python3가 이미 설치되어 있습니다: $(python3 --version)"
fi

# 프론트엔드 패키지 설치
echo "📦 프론트엔드 npm 패키지 설치 중..."
cd "$(dirname "$0")"
npm install

# 백엔드 패키지 설치
echo "📦 백엔드 Python 패키지 설치 중..."
cd backend
pip3 install -r requirements.txt

echo "✅ 설치가 완료되었습니다!"
echo ""
echo "📋 설정 정보:"
echo "  - 서버 IP: 192.168.1.3"
echo "  - MQTT Broker: 192.168.1.3:1883"
echo "  - Flask Backend: 포트 5005"
echo "  - Vite Frontend: 포트 5173"
