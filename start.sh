#!/bin/bash
# React Dashboard 실행 스크립트

cd "$(dirname "$0")"

# 백엔드 실행 함수
start_backend() {
    echo "🚀 백엔드 서버 시작 중..."
    cd backend
    if [ ! -d "venv" ]; then
        echo "📦 백엔드 가상 환경 생성 중..."
        python3 -m venv venv
        source venv/bin/activate
        pip install -r requirements.txt
    else
        source venv/bin/activate
    fi
    python3 app.py > ../backend.log 2>&1 &
    BACKEND_PID=$!
    echo "✅ 백엔드 서버가 시작되었습니다. (PID: $BACKEND_PID)"
    echo "   로그 확인: tail -f backend.log"
    cd ..
}

# 프론트엔드 실행 함수
start_frontend() {
    echo "🚀 프론트엔드 서버 시작 중..."
    if [ ! -d "node_modules" ]; then
        echo "📦 프론트엔드 패키지 설치 중..."
        npm install
    fi
    npm run dev > frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo "✅ 프론트엔드 서버가 시작되었습니다. (PID: $FRONTEND_PID)"
    echo "   로그 확인: tail -f frontend.log"
}

# Node.js 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되어 있지 않습니다."
    echo ""
    echo "Node.js를 설치하려면 다음 명령어를 실행하세요:"
    echo "  sudo apt update"
    echo "  sudo apt install -y nodejs npm"
    echo ""
    echo "또는 최신 버전 설치:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt install -y nodejs"
    echo ""
    echo "백엔드만 실행합니다..."
    start_backend
    echo ""
    echo "백엔드 서버: http://192.168.1.3:5005"
    echo "프론트엔드를 실행하려면 Node.js를 설치한 후 다시 실행하세요."
else
    echo "✅ Node.js 버전: $(node --version)"
    echo "✅ npm 버전: $(npm --version)"
    echo ""
    start_backend
    sleep 2
    start_frontend
    echo ""
    echo "✅ 웹 대시보드가 실행되었습니다!"
    echo ""
    echo "📋 접속 정보:"
    echo "   프론트엔드: http://192.168.1.3:5173"
    echo "   백엔드 API: http://192.168.1.3:5005"
    echo ""
    echo "서버를 중지하려면 Ctrl+C를 누르거나 다음 명령어를 실행하세요:"
    echo "   pkill -f 'python3 app.py'"
    echo "   pkill -f 'vite'"
fi
