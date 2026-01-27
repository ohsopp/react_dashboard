"""
AI 모델 학습 스크립트 (PyTorch)
- 온도와 진동 센서의 상관관계 학습
- LSTM 기반 시계열 예측 모델
"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from influxdb_client import InfluxDBClient
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import os
import pickle
import json
import time
try:
    import psutil
except ImportError:
    psutil = None

# InfluxDB 설정
INFLUXDB_URL = 'http://localhost:8090'
INFLUXDB_TOKEN = 'my-super-secret-auth-token'
INFLUXDB_ORG = 'my-org'
INFLUXDB_BUCKET_TEMP = 'temperature_augmented'
INFLUXDB_BUCKET_VIB = 'vibration_augmented'

# 모델 설정
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
SEQUENCE_LENGTH = 30  # 30개 시점으로 다음 값 예측 (60 -> 30으로 줄여 학습 시간 단축)
BATCH_SIZE = 256  # 배치 크기 증가로 학습 속도 향상 (128 -> 256)
EPOCHS = 30  # 에포크 수 감소 (50 -> 30)
LEARNING_RATE = 0.002  # 학습률 증가로 빠른 수렴 (0.001 -> 0.002)

# 진행률 파일 경로
PROGRESS_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'train_progress.json')

def save_progress(stage, progress, message="", estimated_time=None):
    """진행률 저장"""
    os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
    progress_data = {
            'stage': stage,
            'progress': progress,
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }
    if estimated_time is not None:
        progress_data['estimated_time_seconds'] = estimated_time
        progress_data['estimated_time_minutes'] = estimated_time / 60
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress_data, f)

def get_influx_client():
    """InfluxDB 클라이언트 생성"""
    return InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)

def load_data_from_influxdb(client, days=7):
    """InfluxDB에서 증강 데이터 로드"""
    print("📊 InfluxDB에서 데이터 로드 중...")
    print(f"📦 버킷: {INFLUXDB_BUCKET_TEMP}, {INFLUXDB_BUCKET_VIB}")
    
    query_api = client.query_api()
    
    # 온도 데이터 조회
    start_time = (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%SZ')
    print(f"⏰ 조회 기간: {start_time} ~ 현재")
    
    temp_query = f'''
    from(bucket: "{INFLUXDB_BUCKET_TEMP}")
      |> range(start: {start_time})
      |> filter(fn: (r) => r["_measurement"] == "temperature")
      |> filter(fn: (r) => r["_field"] == "value")
      |> sort(columns: ["_time"])
    '''
    
    vib_query = f'''
    from(bucket: "{INFLUXDB_BUCKET_VIB}")
      |> range(start: {start_time})
      |> filter(fn: (r) => r["_measurement"] == "vibration")
      |> filter(fn: (r) => r["_field"] == "crest" or r["_field"] == "temperature")
      |> sort(columns: ["_time"])
    '''
    
    # 온도 데이터 수집
    print(f"🔍 온도 데이터 쿼리 실행 중... (버킷: {INFLUXDB_BUCKET_TEMP})")
    try:
        temp_result = query_api.query(org=INFLUXDB_ORG, query=temp_query)
        temp_data = []
        table_count = 0
        record_count = 0
        
        for table in temp_result:
            table_count += 1
            for record in table.records:
                record_count += 1
                timestamp = record.get_time()
                value = record.get_value()
                if value is not None:
                    temp_data.append({
                        'time': timestamp,
                        'temperature': float(value)
                    })
        
        print(f"📊 온도 쿼리 결과: 테이블 {table_count}개, 레코드 {record_count}개, 유효 데이터 {len(temp_data)}개")
    except Exception as e:
        print(f"❌ 온도 데이터 쿼리 오류: {e}")
        temp_data = []
    
    # 진동 데이터 수집
    print(f"🔍 진동 데이터 쿼리 실행 중... (버킷: {INFLUXDB_BUCKET_VIB})")
    try:
        vib_result = query_api.query(org=INFLUXDB_ORG, query=vib_query)
        vib_data = {}
        table_count = 0
        record_count = 0
        
        for table in vib_result:
            table_count += 1
            for record in table.records:
                record_count += 1
                timestamp = record.get_time()
                field = record.get_field()
                value = record.get_value()
                
                if value is not None:
                    if timestamp not in vib_data:
                        vib_data[timestamp] = {}
                    vib_data[timestamp][field] = float(value)
        
        print(f"📊 진동 쿼리 결과: 테이블 {table_count}개, 레코드 {record_count}개, 타임스탬프 {len(vib_data)}개")
    except Exception as e:
        print(f"❌ 진동 데이터 쿼리 오류: {e}")
        vib_data = {}
    
    print(f"✅ 온도 데이터: {len(temp_data)}개, 진동 데이터: {len(vib_data)}개")
    
    # 데이터 병합 (타임스탬프 기준 - pandas merge_asof 사용)
    if not temp_data:
        error_msg = f"온도 데이터가 없습니다. '{INFLUXDB_BUCKET_TEMP}' 버킷에 증강 데이터가 있는지 확인하세요. 데이터 증강을 먼저 실행해주세요."
        print(f"⚠️ {error_msg}")
        raise ValueError(error_msg)
    
    # 진동 데이터에서 crest 필드가 있는 데이터만 추출
    vib_data_list = []
    for ts, fields in vib_data.items():
        if 'crest' in fields and fields['crest'] is not None:
            vib_data_list.append({
                'time': ts,
                'vibration_crest': fields['crest'],
                'vibration_temp': fields.get('temperature')
            })
    
    print(f"📊 온도 데이터: {len(temp_data)}개, 진동 데이터(crest 포함): {len(vib_data_list)}개")
    
    if not vib_data_list:
        error_msg = f"진동 데이터에 'crest' 필드가 없습니다. '{INFLUXDB_BUCKET_VIB}' 버킷의 데이터 구조를 확인하세요."
        print(f"⚠️ {error_msg}")
        raise ValueError(error_msg)
    
    # DataFrame 생성
    temp_df = pd.DataFrame(temp_data)
    vib_df = pd.DataFrame(vib_data_list)
    
    # time 컬럼을 datetime으로 변환 (이미 datetime이면 그대로 사용)
    if not pd.api.types.is_datetime64_any_dtype(temp_df['time']):
        temp_df['time'] = pd.to_datetime(temp_df['time'])
    if not pd.api.types.is_datetime64_any_dtype(vib_df['time']):
        vib_df['time'] = pd.to_datetime(vib_df['time'])
    
    # time을 인덱스로 설정
    temp_df = temp_df.set_index('time').sort_index()
    vib_df = vib_df.set_index('time').sort_index()
    
    # merge_asof를 사용하여 가장 가까운 타임스탬프로 매칭 (최대 1분 차이 허용)
    MAX_TIME_DIFF = pd.Timedelta(minutes=1)
    
    merged_df = pd.merge_asof(
        temp_df,
        vib_df,
        left_index=True,
        right_index=True,
        direction='nearest',
        tolerance=MAX_TIME_DIFF
    )
    
    # crest가 있는 데이터만 필터링
    merged_df = merged_df.dropna(subset=['temperature', 'vibration_crest'])
    
    # 인덱스를 컬럼으로 변환
    merged_df = merged_df.reset_index()
    
    merged_data = merged_df.to_dict('records')
    
    print(f"✅ 매칭된 데이터: {len(merged_data)}개 (온도 {len(temp_data)}개, 진동 {len(vib_data_list)}개 중)")
    
    if not merged_data:
        error_msg = f"병합할 데이터가 없습니다. 타임스탬프 매칭 실패 (최대 {MAX_TIME_DIFF.total_seconds()}초 차이 허용). 온도: {len(temp_data)}개, 진동(crest): {len(vib_data_list)}개"
        print(f"⚠️ {error_msg}")
        raise ValueError(error_msg)
    
    df = pd.DataFrame(merged_data)
    
    # 'time' 컬럼이 있는지 확인 후 정렬
    if 'time' in df.columns and len(df) > 0:
        df = df.sort_values('time')
        df = df.reset_index(drop=True)
    else:
        print("⚠️ 'time' 컬럼이 없거나 데이터가 비어있습니다.")
        return pd.DataFrame(columns=['time', 'temperature', 'vibration_crest', 'vibration_temp'])
    
    print(f"✅ 병합된 데이터: {len(df)}개")
    return df

def create_sequences(data, seq_length):
    """시계열 시퀀스 생성"""
    X, y_temp, y_vib = [], [], []
    
    for i in range(len(data) - seq_length):
        seq = data[i:i+seq_length]
        X.append(seq)
        
        # 다음 시점의 온도와 진동 예측
        y_temp.append(data[i+seq_length, 0])  # temperature
        y_vib.append(data[i+seq_length, 1])   # vibration_crest
    
    return np.array(X), np.array(y_temp), np.array(y_vib)

class LSTMModel(nn.Module):
    """LSTM 모델 (PyTorch)"""
    def __init__(self, input_size, hidden_size=48, num_layers=2, dropout=0.2):
        super(LSTMModel, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, 
                           batch_first=True, dropout=dropout if num_layers > 1 else 0)
        self.dropout = nn.Dropout(dropout)
        self.fc1 = nn.Linear(hidden_size, 24)  # 32 -> 24로 감소하여 학습 시간 단축
        self.fc2 = nn.Linear(24, 2)  # 온도와 진동 두 개 출력
        self.relu = nn.ReLU()
        
    def forward(self, x):
        # LSTM forward
        lstm_out, _ = self.lstm(x)
        # 마지막 시퀀스 출력만 사용
        last_output = lstm_out[:, -1, :]
        # Dropout
        out = self.dropout(last_output)
        # Fully connected layers
        out = self.relu(self.fc1(out))
        out = self.fc2(out)
        return out

def setup_device():
    """GPU/CPU 디바이스 설정"""
    print("=" * 60)
    print("🔍 디바이스 설정 확인 중...")
    print("=" * 60)
    print(f"PyTorch 버전: {torch.__version__}")
    
    # GPU 사용 비활성화 (크래시 방지)
    # GPU가 감지되더라도 CPU만 사용하도록 설정
    print("⚠️ GPU 사용이 비활성화되어 있습니다. CPU를 사용합니다.")
    
    # GPU 감지 시도 (정보만 확인, 사용하지 않음)
    cuda_available = False
    try:
        cuda_available = torch.cuda.is_available()
        if cuda_available:
            print(f"💡 GPU가 감지되었지만 사용하지 않습니다 (CPU 모드)")
    except Exception as e:
        print(f"💡 GPU 감지 중 오류 발생 (무시): {e}")
        cuda_available = False
    
    # GPU 사용 시도하지 않음 (CPU만 사용)
    if False:  # GPU 사용 비활성화
        try:
            device = torch.device('cuda')
            device_count = torch.cuda.device_count()
            print(f"✅ GPU 사용 가능: {device_count}개")
            
            # 각 GPU 정보 출력
            for i in range(device_count):
                print(f"   GPU {i}: {torch.cuda.get_device_name(i)}")
            
            # ROCm 정보
            if hasattr(torch.version, 'hip') and torch.version.hip:
                print(f"   ROCm 버전: {torch.version.hip}")
            else:
                print(f"   CUDA 버전: {torch.version.cuda if hasattr(torch.version, 'cuda') else 'N/A'}")
            
            # GPU 메모리 정보
            if device_count > 0:
                for i in range(device_count):
                    memory_total = torch.cuda.get_device_properties(i).total_memory / (1024**3)
                    print(f"   GPU {i} 메모리: {memory_total:.2f} GB")
            
            print("=" * 60)
            print("🚀 GPU 모드로 학습합니다!")
            print("=" * 60)
            return device, True
        except Exception as e:
            print(f"⚠️ GPU 초기화 중 오류 발생: {e}")
            print("💡 CPU 모드로 전환합니다.")
            cuda_available = False
    
    # CPU 모드로 전환
    device = torch.device('cpu')
    print("⚠️ GPU를 사용할 수 없습니다. CPU를 사용합니다.")
    print("💡 GPU를 사용하려면:")
    print("   - AMD GPU: ROCm 드라이버 설치 필요")
    print("   - NVIDIA GPU: CUDA/cuDNN 설치 필요")
    
    # CPU 최적화 설정
    num_threads = os.cpu_count() or 16
    torch.set_num_threads(num_threads)
    # OpenMP 스레드도 설정 (NumPy 등에서 사용)
    os.environ['OMP_NUM_THREADS'] = str(num_threads)
    os.environ['MKL_NUM_THREADS'] = str(num_threads)
    print(f"⚙️ CPU 최적화: {num_threads}개 스레드 사용")
    print(f"   OMP_NUM_THREADS={num_threads}, MKL_NUM_THREADS={num_threads}")
    print("=" * 60)
    print("🐌 CPU 모드로 학습합니다")
    print("=" * 60)
    return device, False

def train():
    """모델 학습"""
    print("🚀 모델 학습 시작 (PyTorch)")
    
    # 디바이스 설정
    device, use_gpu = setup_device()
    if use_gpu:
        print("🚀 GPU 모드로 학습을 시작합니다.")
    else:
        print("🐌 CPU 모드로 학습을 시작합니다.")
    
    save_progress('start', 0, '모델 학습 시작')
    
    # 모델 디렉토리 생성
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    client = get_influx_client()
    
    try:
        # 데이터 로드 (5일로 감소하여 학습 시간 단축)
        save_progress('loading', 5, '데이터 로드 중...')
        df = load_data_from_influxdb(client, days=5)  # 7일 -> 5일로 감소
        
        if df.empty:
            error_msg = "데이터가 비어있습니다. 데이터 증강을 먼저 실행해주세요."
            print(f"❌ {error_msg}")
            save_progress('error', 0, error_msg)
            return
        
        if len(df) < SEQUENCE_LENGTH + 1:
            error_msg = f"데이터가 부족합니다. 최소 {SEQUENCE_LENGTH + 1}개 필요, 현재 {len(df)}개. 더 많은 데이터를 생성하려면 데이터 증강을 다시 실행하거나 조회 기간을 늘려주세요."
            print(f"❌ {error_msg}")
            save_progress('error', 0, error_msg)
            return
        
        # 필요한 컬럼 확인
        required_columns = ['temperature', 'vibration_crest']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            error_msg = f"필수 컬럼이 없습니다: {missing_columns}"
            print(f"❌ {error_msg}")
            save_progress('error', 0, error_msg)
            return
        
        # 데이터 정규화
        scaler = MinMaxScaler()
        data_scaled = scaler.fit_transform(df[['temperature', 'vibration_crest']].values)
        
        # 시퀀스 생성
        X, y_temp, y_vib = create_sequences(data_scaled, SEQUENCE_LENGTH)
        y = np.column_stack([y_temp, y_vib])
        
        # 학습/검증 분할
        split_idx = int(len(X) * 0.8)
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]
        
        print(f"📊 학습 데이터: {len(X_train)}개, 검증 데이터: {len(X_val)}개")
        
        # 데이터가 너무 많으면 샘플링 (텐서 생성 전에 수행)
        # 배치 수를 500개 이하로 만들기 위해 최대 샘플 수 계산
        # 배치 크기 최소 1024 가정: 500 * 1024 = 512,000
        max_samples = 400000  # 최대 40만 개 샘플 (더 보수적으로 설정)
        
        if len(X_train) > max_samples:
            print(f"⚠️ 데이터가 너무 많습니다 ({len(X_train):,}개).")
            print(f"💡 데이터 샘플링을 적용하여 학습 시간을 단축합니다...")
            print(f"📉 데이터 샘플링: {len(X_train):,}개 → {max_samples:,}개로 감소")
            
            # 균등하게 샘플링
            step = max(1, len(X_train) // max_samples)
            indices = np.arange(0, len(X_train), step)[:max_samples]
            X_train = X_train[indices]
            y_train = y_train[indices]
            
            # 검증 데이터도 비율에 맞게 조정 (최대 10만 개)
            max_val_samples = min(100000, len(X_val))
            if len(X_val) > max_val_samples:
                step_val = max(1, len(X_val) // max_val_samples)
                indices_val = np.arange(0, len(X_val), step_val)[:max_val_samples]
                X_val = X_val[indices_val]
                y_val = y_val[indices_val]
            
            print(f"✅ 샘플링 완료: 학습 {len(X_train):,}개, 검증 {len(X_val):,}개")
        else:
            print(f"✅ 데이터 양 적절: 학습 {len(X_train):,}개, 검증 {len(X_val):,}개")
        
        # 진행률 업데이트
        save_progress('preparing', 8, '텐서 변환 중...')
        
        # PyTorch 텐서로 변환
        print("🔄 텐서 변환 중...")
        print(f"  📊 학습 데이터 크기: {X_train.shape}")
        print(f"  📊 검증 데이터 크기: {X_val.shape}")
        print(f"  💾 디바이스: {device}")
        
        print("  🔄 학습 데이터 텐서 변환 중...")
        X_train_tensor = torch.FloatTensor(X_train).to(device)
        print("  ✅ X_train 텐서 변환 완료")
        y_train_tensor = torch.FloatTensor(y_train).to(device)
        print("  ✅ y_train 텐서 변환 완료")
        
        print("  🔄 검증 데이터 텐서 변환 중...")
        X_val_tensor = torch.FloatTensor(X_val).to(device)
        print("  ✅ X_val 텐서 변환 완료")
        y_val_tensor = torch.FloatTensor(y_val).to(device)
        print("  ✅ y_val 텐서 변환 완료")
        
        print("✅ 텐서 변환 완료")
        
        # 진행률 업데이트
        save_progress('preparing', 9, 'DataLoader 생성 중...')
        
        # DataLoader 생성
        print("🔄 DataLoader 생성 중...")
        train_dataset = TensorDataset(X_train_tensor, y_train_tensor)
        val_dataset = TensorDataset(X_val_tensor, y_val_tensor)
        print("✅ DataLoader 생성 완료")
        
        # 데이터 크기 확인
        total_samples = len(X_train)
        print(f"📊 총 학습 샘플 수: {total_samples:,}개")
        
        # 배치 크기 조정 (무조건 최소 1024 이상으로 설정하여 배치 수 감소)
        num_workers = 0  # CPU 모드에서는 멀티프로세싱 비활성화 (안정성)
        
        # 배치 수를 500개 이하로 유지하기 위해 배치 크기 동적 조정
        target_max_batches = 500  # 목표 최대 배치 수
        optimal_batch_size = max(1024, (total_samples + target_max_batches - 1) // target_max_batches)
        
        # 기본 배치 크기 설정 (최소 1024)
        if use_gpu:
            actual_batch_size = max(optimal_batch_size, 2048)  # GPU는 더 큰 배치 크기 사용
            num_workers = 4  # GPU 모드에서는 멀티프로세싱 사용
            print(f"🚀 GPU 사용 중: 배치 크기 {actual_batch_size}, workers: {num_workers}")
        else:
            # CPU 모드: 메모리에 관계없이 최소 1024 이상으로 설정
            if psutil:
                available_memory_gb = psutil.virtual_memory().available / (1024**3)
                if available_memory_gb > 32:
                    actual_batch_size = max(optimal_batch_size, 2048)  # 최소 2048
                    print(f"⚡ CPU 최적화: 배치 크기 {actual_batch_size} (메모리 충분, 배치 수 최소화)")
                elif available_memory_gb > 16:
                    actual_batch_size = max(optimal_batch_size, 1024)  # 최소 1024
                    print(f"⚡ CPU 최적화: 배치 크기 {actual_batch_size} (메모리 보통, 배치 수 최소화)")
                else:
                    actual_batch_size = max(optimal_batch_size, 1024)  # 최소 1024 (메모리 부족해도)
                    print(f"⚡ CPU 최적화: 배치 크기 {actual_batch_size} (메모리 부족, 하지만 배치 수 최소화 우선)")
            else:
                # psutil이 없어도 최소 1024로 설정
                actual_batch_size = max(optimal_batch_size, 1024)
                print(f"⚡ CPU 사용 중: 배치 크기 {actual_batch_size} (psutil 없음, 배치 수 최소화)")
        
        # 예상 배치 수 계산 및 출력
        estimated_batches = (total_samples + actual_batch_size - 1) // actual_batch_size
        print(f"📦 예상 배치 수: {estimated_batches:,}개 (배치 크기: {actual_batch_size})")
        
        # 배치 수가 여전히 많으면 강제로 배치 크기 증가
        if estimated_batches > 500:
            print(f"⚠️ 경고: 배치 수가 여전히 많습니다 ({estimated_batches:,}개).")
            print(f"💡 배치 크기를 강제로 증가시킵니다...")
            # 배치 수가 500개가 되도록 배치 크기 재계산
            actual_batch_size = (total_samples + 499) // 500  # 올림 처리
            actual_batch_size = max(actual_batch_size, 1024)  # 최소 1024 유지
            estimated_batches = (total_samples + actual_batch_size - 1) // actual_batch_size
            print(f"✅ 조정된 배치 크기: {actual_batch_size}, 예상 배치 수: {estimated_batches:,}개")
        
        # DataLoader 생성 (num_workers=0으로 설정하여 안정성 확보)
        print(f"📦 DataLoader 설정: batch_size={actual_batch_size}, num_workers={num_workers}")
        train_loader = DataLoader(train_dataset, batch_size=actual_batch_size, shuffle=False, num_workers=num_workers, pin_memory=False)
        val_loader = DataLoader(val_dataset, batch_size=actual_batch_size, shuffle=False, num_workers=num_workers, pin_memory=False)
        
        # 모델 구축 (모델 크기 감소로 학습 시간 단축)
        print("🏗️ 모델 구축 중...")
        model = LSTMModel(input_size=2, hidden_size=48, num_layers=2, dropout=0.2).to(device)  # hidden_size 64 -> 48로 감소
        
        # 모델 파라미터 수 출력
        total_params = sum(p.numel() for p in model.parameters())
        print(f"📊 모델 파라미터 수: {total_params:,}개")
        
        # 손실 함수 및 옵티마이저
        criterion = nn.MSELoss()
        optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)
        
        # 학습 시작
        print("🚀 학습 루프 시작...")
        save_progress('training', 10, f'모델 학습 시작... (에포크 {EPOCHS}개, 배치 크기 {actual_batch_size})')
        best_val_loss = float('inf')
        patience = 5  # Early stopping patience 감소 (10 -> 5)로 빠른 종료
        patience_counter = 0
        
        # 전체 학습 시작 시간 추적
        training_start_time = time.time()
        
        # 학습 데이터로더 정보 출력
        print(f"📊 학습 데이터로더: {len(train_loader)}개 배치")
        print(f"📊 검증 데이터로더: {len(val_loader)}개 배치")
        
        # 전체 배치 수 계산 (진행률 계산용)
        total_epochs = EPOCHS
        batches_per_epoch = len(train_loader)
        total_all_batches = total_epochs * batches_per_epoch
        
        for epoch in range(EPOCHS):
            # 학습 모드
            model.train()
            train_loss = 0.0
            
            print(f"🔄 에포크 {epoch + 1}/{EPOCHS} 시작")
            print(f"  📦 배치 처리 시작... (총 {batches_per_epoch}개 배치)")
            batch_count = 0
            total_batches = batches_per_epoch
            epoch_start_time = time.time()
            
            for batch_X, batch_y in train_loader:
                batch_start_time = time.time()
                
                optimizer.zero_grad()
                outputs = model(batch_X)
                loss = criterion(outputs, batch_y)
                loss.backward()
                optimizer.step()
                train_loss += loss.item()
                batch_count += 1
                
                batch_time = time.time() - batch_start_time
                
                # 전체 진행률 계산: (완료된 배치 수 / 전체 배치 수) * 90 + 10
                completed_batches = (epoch * batches_per_epoch) + batch_count
                total_progress_percent = int((completed_batches / total_all_batches) * 90) + 10
                # 100%를 넘지 않도록 제한
                total_progress_percent = min(total_progress_percent, 100)
                
                # 첫 번째 배치 후 진행률 업데이트
                if batch_count == 1:
                    estimated_epoch_time = batch_time * total_batches  # 현재 에포크 예상 시간
                    estimated_total_time = estimated_epoch_time * EPOCHS  # 전체 에포크 예상 시간
                    print(f"  ✅ 첫 번째 배치 완료 (Loss: {loss.item():.4f}, 소요 시간: {batch_time:.2f}초)")
                    print(f"  ⏱️ 현재 에포크 예상 시간: {estimated_epoch_time/60:.1f}분 ({estimated_epoch_time:.0f}초)")
                    print(f"  ⏱️ 전체 학습 예상 시간: {estimated_total_time/60:.1f}분 ({estimated_total_time:.0f}초)")
                    save_progress('training', total_progress_percent, 
                                f'에포크 {epoch + 1}/{EPOCHS} 학습 중... (배치 {batch_count}/{total_batches})', 
                                estimated_time=estimated_total_time)
                
                # 배치 수에 따라 업데이트 빈도 조정
                # 배치가 많으면 더 자주 업데이트 (매 배치마다 또는 매 2-3개마다)
                update_interval = 1 if total_batches > 1000 else (3 if total_batches > 500 else 5)
                
                # 진행률 업데이트 (더 자주)
                if batch_count % update_interval == 0:
                    # 전체 학습 진행률 기반으로 남은 시간 계산
                    total_elapsed_time = time.time() - training_start_time
                    # 전체 진행률 계산: (완료된 배치 수 / 전체 배치 수)
                    total_progress = completed_batches / total_all_batches
                    
                    # 진행률이 0보다 크면 남은 시간 계산
                    if total_progress > 0:
                        estimated_total_time = total_elapsed_time / total_progress
                        estimated_remaining = estimated_total_time - total_elapsed_time
                    else:
                        estimated_remaining = 0
                    
                    message = f'에포크 {epoch + 1}/{EPOCHS} 학습 중... (배치 {batch_count}/{total_batches})'
                    if estimated_remaining > 0:
                        message += f' [남은 시간: 약 {estimated_remaining/60:.1f}분]'
                    
                    save_progress('training', total_progress_percent, message)
                    
                    # 로그 출력 (10개 배치마다 또는 배치가 많으면 50개마다)
                    log_interval = 50 if total_batches > 1000 else 10
                    if batch_count % log_interval == 0:
                        # 평균 배치 시간 계산
                        elapsed_time = time.time() - epoch_start_time
                        avg_batch_time = elapsed_time / batch_count if batch_count > 0 else 0
                        print(f"  📊 {batch_count}/{total_batches} 배치 완료 (전체 진행률: {total_progress_percent}%, Loss: {loss.item():.4f}, 평균 배치 시간: {avg_batch_time:.2f}초)")
            
            print(f"  ✅ 에포크 {epoch + 1} 학습 완료 (총 {batch_count}개 배치 처리)")
            
            # 검증 모드
            print(f"  🔍 검증 시작... (총 {len(val_loader)}개 배치)")
            model.eval()
            val_loss = 0.0
            val_batch_count = 0
            with torch.no_grad():
                for batch_X, batch_y in val_loader:
                    outputs = model(batch_X)
                    loss = criterion(outputs, batch_y)
                    val_loss += loss.item()
                    val_batch_count += 1
                    # 첫 번째 검증 배치 완료 시 로그
                    if val_batch_count == 1:
                        print(f"  ✅ 첫 번째 검증 배치 완료")
            
            train_loss /= len(train_loader)
            val_loss /= len(val_loader)
            
            # 진행률 업데이트 (에포크 완료 시)
            completed_batches = (epoch + 1) * batches_per_epoch
            progress = int((completed_batches / total_all_batches) * 90) + 10
            progress = min(progress, 100)
            save_progress('training', progress, f'에포크 {epoch + 1}/{EPOCHS} 완료 (Train Loss: {train_loss:.4f}, Val Loss: {val_loss:.4f})')
            
            print(f"✅ Epoch {epoch + 1}/{EPOCHS} - Train Loss: {train_loss:.4f}, Val Loss: {val_loss:.4f}")
            
            # Early stopping
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                patience_counter = 0
                # 최고 모델 저장
                best_model_path = os.path.join(MODEL_DIR, 'best_model.pth')
                torch.save(model.state_dict(), best_model_path)
            else:
                patience_counter += 1
                if patience_counter >= patience:
                    print(f"⏹️ Early stopping at epoch {epoch + 1}")
                    # 최고 모델 로드
                    model.load_state_dict(torch.load(os.path.join(MODEL_DIR, 'best_model.pth')))
                    break
        
        # 최종 모델 저장
        save_progress('saving', 95, '모델 저장 중...')
        final_model_path = os.path.join(MODEL_DIR, 'model.pth')
        # 실제 모델의 구조를 저장 (hidden_size=48)
        torch.save({
            'model_state_dict': model.state_dict(),
            'model_config': {
                'input_size': 2,
                'hidden_size': 48,  # 실제 모델 구조와 일치하도록 수정
                'num_layers': 2,
                'dropout': 0.2
            }
        }, final_model_path)
        
        # 스케일러 저장
        scaler_path = os.path.join(MODEL_DIR, 'scaler.pkl')
        with open(scaler_path, 'wb') as f:
            pickle.dump(scaler, f)
        
        save_progress('complete', 100, '모델 학습 완료!')
        print(f"✅ 모델 저장 완료: {final_model_path}")
        print(f"✅ 스케일러 저장 완료: {scaler_path}")
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        save_progress('error', 0, f'오류 발생: {str(e)}')
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == '__main__':
    train()
