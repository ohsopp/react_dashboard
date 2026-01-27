# AI/ML 센서 데이터 분석 시스템

온도와 진동 센서 데이터의 상관관계를 학습하고 이상을 탐지하는 AI 시스템입니다.

## 구조

```
ai_ml/
├── scripts/
│   ├── data_augmentation.py  # 데이터 증강 스크립트
│   ├── train_model.py         # 모델 학습 스크립트
│   └── predict.py              # 예측 스크립트
├── models/                    # 학습된 모델 저장 디렉토리
├── data/                      # 데이터 저장 디렉토리
├── requirements.txt           # Python 패키지 의존성
└── README.md                  # 이 파일
```

## 설치

```bash
cd /home/uit/SIMPAC/ai_ml
pip install -r requirements.txt
```

## 사용 방법

### 1. 데이터 증강

원본 InfluxDB 버킷을 복사하고 특정 시간/간격으로 노이즈를 추가합니다.

```bash
python scripts/data_augmentation.py
```

이 스크립트는:
- `temperature_data` → `temperature_augmented` 복사
- `vibration_data` → `vibration_augmented` 복사
- 특정 간격(기본 1시간)마다 두 센서를 함께 변화시켜 상관관계 패턴 생성
- 나머지 시간에는 작은 노이즈만 추가

### 2. 모델 학습

증강된 데이터로 LSTM 모델을 학습합니다.

```bash
python scripts/train_model.py
```

학습된 모델은 `models/` 디렉토리에 저장됩니다:
- `model.keras`: 학습된 모델
- `scaler.pkl`: 데이터 정규화 스케일러

### 3. 예측 및 분석

실시간 데이터로 예측하고 이상을 탐지합니다.

```bash
python scripts/predict.py
```

또는 백엔드 API를 통해:
```bash
curl http://localhost:5005/api/ai/predict
```

## API 엔드포인트

### 증강 데이터 조회
- `GET /api/ai/augmented/temperature?range=1h`
- `GET /api/ai/augmented/vibration?range=1h`

### AI 예측
- `GET /api/ai/predict`

## 프론트엔드

대시보드의 "AI Prediction" 탭에서:
- 증강된 데이터 그래프 확인
- 실시간 예측 결과 확인
- 이상 탐지 결과 확인

## 설정

`data_augmentation.py`에서 증강 설정 변경 가능:
- `CORRELATION_INTERVAL_HOURS`: 상관관계 패턴 생성 간격
- `CORRELATION_TEMP_RANGE`: 온도 변화 범위
- `CORRELATION_VIB_RANGE`: 진동 변화 범위
- `SMALL_NOISE_TEMP`: 작은 노이즈 범위 (온도)
- `SMALL_NOISE_VIB`: 작은 노이즈 범위 (진동)

## GPU 지원

이 프로젝트는 **PyTorch**를 사용하며, AMD GPU (ROCm)와 NVIDIA GPU (CUDA)를 모두 지원합니다.

### NVIDIA GPU
- PyTorch는 NVIDIA GPU(CUDA)를 공식 지원합니다
- CUDA가 설치되어 있으면 자동으로 감지됩니다
- GPU가 감지되면 자동으로 사용됩니다

### AMD GPU (ROCm)
- PyTorch는 AMD GPU를 ROCm을 통해 지원합니다
- 현재 시스템에 ROCm 런타임이 설치되어 있지 않으면 GPU가 감지되지 않을 수 있습니다

#### GPU 감지 문제 해결 방법

1. **GPU 감지 확인**:
```bash
cd /home/uit/SIMPAC/ai_ml
source venv/bin/activate
python scripts/check_gpu.py
```

2. **ROCm 설치 (필요한 경우)**:

**주의**: ROCm 설치가 복잡할 수 있으며, 모든 AMD GPU를 지원하지 않을 수 있습니다.

```bash
# Ubuntu 24.04에서 ROCm 저장소 추가
wget -qO - https://repo.radeon.com/rocm/rocm.gpg.key | sudo apt-key add -
echo 'deb [arch=amd64] https://repo.radeon.com/rocm/apt/6.1/ jammy main' | sudo tee /etc/apt/sources.list.d/rocm.list

# 또는 Ubuntu 24.04 (Noble)의 경우:
echo 'deb [arch=amd64] https://repo.radeon.com/rocm/apt/6.1/ noble main' | sudo tee /etc/apt/sources.list.d/rocm.list

sudo apt update

# ROCm 설치 (GPU 모델에 따라 버전이 다를 수 있음)
sudo apt install rocm-dkms rocm-libs rocm-dev

# 사용자를 render, video 그룹에 추가
sudo usermod -a -G render,video $USER

# 재부팅 필요
sudo reboot

# 재부팅 후 설치 확인
rocm-smi
```

**참고**: 
- ROCm 6.1은 최신 GPU를 지원합니다. 구형 GPU는 이전 버전이 필요할 수 있습니다.
- GPU 모델에 따라 지원 여부가 다릅니다. [ROCm 호환성 목록](https://rocm.docs.amd.com/en/latest/deploy/linux/os_support/system_requirements.html) 확인 권장.
- 설치가 어렵거나 GPU가 지원되지 않는 경우, CPU 모드로도 충분히 학습 가능합니다.

3. **환경 변수 설정**:
```bash
export HIP_VISIBLE_DEVICES=0
export ROCM_PATH=/opt/rocm  # ROCm 설치 경로에 따라 조정
```

4. **학습 스크립트 실행**:
- 학습 스크립트는 자동으로 GPU 환경 변수를 설정합니다
- GPU가 감지되지 않으면 CPU로 자동 전환됩니다

### CPU 최적화
- GPU가 감지되지 않으면 자동으로 CPU 모드로 전환됩니다
- 16개 CPU 코어 모두 활용
- 배치 크기 자동 조정 (메모리에 따라 128-256)
- PyTorch 스레드 최적화
- 학습 속도 향상을 위한 모델 구조 최적화
