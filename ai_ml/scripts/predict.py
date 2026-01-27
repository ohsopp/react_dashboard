"""
AI 예측 스크립트 (PyTorch)
- 실시간 데이터로 온도/진동 예측
- 상관관계 기반 이상 탐지
"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from influxdb_client import InfluxDBClient
import torch
import torch.nn as nn
import pickle
import os

# InfluxDB 설정
INFLUXDB_URL = 'http://localhost:8090'
INFLUXDB_TOKEN = 'my-super-secret-auth-token'
INFLUXDB_ORG = 'my-org'
# 증강 데이터 사용 (없으면 원본 데이터로 fallback)
INFLUXDB_BUCKET_TEMP = 'temperature_augmented'  # 증강 데이터 우선 사용
INFLUXDB_BUCKET_TEMP_FALLBACK = 'temperature_data'  # fallback
INFLUXDB_BUCKET_VIB = 'vibration_augmented'  # 증강 데이터 우선 사용
INFLUXDB_BUCKET_VIB_FALLBACK = 'vibration_data'  # fallback

# 모델 설정
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
SEQUENCE_LENGTH = 30  # train_model.py와 동일하게 설정

class LSTMModel(nn.Module):
    """LSTM 모델 (PyTorch) - train_model.py와 동일한 구조"""
    def __init__(self, input_size, hidden_size=48, num_layers=2, dropout=0.2):
        super(LSTMModel, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, 
                           batch_first=True, dropout=dropout if num_layers > 1 else 0)
        self.dropout = nn.Dropout(dropout)
        self.fc1 = nn.Linear(hidden_size, 24)
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
    # CPU만 사용 (GPU 사용 비활성화)
    device = torch.device('cpu')
    return device

def get_influx_client():
    """InfluxDB 클라이언트 생성"""
    return InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)

def load_model():
    """학습된 모델과 스케일러 로드 (PyTorch)"""
    model_path = os.path.join(MODEL_DIR, 'model.pth')
    scaler_path = os.path.join(MODEL_DIR, 'scaler.pkl')
    
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"모델 파일을 찾을 수 없습니다: {model_path}")
    if not os.path.exists(scaler_path):
        raise FileNotFoundError(f"스케일러 파일을 찾을 수 없습니다: {scaler_path}")
    
    # 디바이스 설정
    device = setup_device()
    
    # 모델 로드
    checkpoint = torch.load(model_path, map_location=device)
    
    # 모델 구조 확인 및 생성
    if 'model_config' in checkpoint:
        # 새로운 형식 (model_config 포함)
        model_config = checkpoint['model_config']
        model = LSTMModel(
            input_size=model_config.get('input_size', 2),
            hidden_size=model_config.get('hidden_size', 48),
            num_layers=model_config.get('num_layers', 2),
            dropout=model_config.get('dropout', 0.2)
        )
        model.load_state_dict(checkpoint['model_state_dict'])
    else:
        # 이전 형식 (state_dict만)
        model = LSTMModel(input_size=2, hidden_size=48, num_layers=2, dropout=0.2)
        model.load_state_dict(checkpoint)
    
    model.to(device)
    model.eval()  # 평가 모드로 설정
    
    # 스케일러 로드
    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)
    
    return model, scaler, device

def get_recent_data(client, minutes=60):
    """최근 데이터 가져오기"""
    query_api = client.query_api()
    
    start_time = (datetime.utcnow() - timedelta(minutes=minutes)).strftime('%Y-%m-%dT%H:%M:%SZ')
    
    # 온도 데이터
    temp_query = f'''
    from(bucket: "{INFLUXDB_BUCKET_TEMP}")
      |> range(start: {start_time})
      |> filter(fn: (r) => r["_measurement"] == "temperature")
      |> filter(fn: (r) => r["_field"] == "value")
      |> sort(columns: ["_time"])
    '''
    
    # 진동 데이터
    vib_query = f'''
    from(bucket: "{INFLUXDB_BUCKET_VIB}")
      |> range(start: {start_time})
      |> filter(fn: (r) => r["_measurement"] == "vibration")
      |> filter(fn: (r) => r["_field"] == "crest")
      |> sort(columns: ["_time"])
    '''
    
    # 온도 데이터 쿼리 (증강 데이터 우선)
    import sys
    temp_result = None
    try:
        temp_result = query_api.query(org=INFLUXDB_ORG, query=temp_query)
    except Exception as e:
        # 증강 데이터가 없으면 원본 데이터로 fallback
        print(f"⚠️ {INFLUXDB_BUCKET_TEMP} 버킷 쿼리 실패, 원본 데이터로 시도: {e}", file=sys.stderr)
        temp_query_fallback = f'''
        from(bucket: "{INFLUXDB_BUCKET_TEMP_FALLBACK}")
          |> range(start: {start_time})
          |> filter(fn: (r) => r["_measurement"] == "temperature")
          |> filter(fn: (r) => r["_field"] == "value")
          |> sort(columns: ["_time"])
        '''
        try:
            temp_result = query_api.query(org=INFLUXDB_ORG, query=temp_query_fallback)
        except Exception as e2:
            print(f"⚠️ 원본 데이터 쿼리도 실패: {e2}", file=sys.stderr)
            temp_result = None
    
    # 진동 데이터 쿼리 (증강 데이터 우선)
    vib_result = None
    try:
        vib_result = query_api.query(org=INFLUXDB_ORG, query=vib_query)
    except Exception as e:
        # 증강 데이터가 없으면 원본 데이터로 fallback
        print(f"⚠️ {INFLUXDB_BUCKET_VIB} 버킷 쿼리 실패, 원본 데이터로 시도: {e}", file=sys.stderr)
        vib_query_fallback1 = f'''
        from(bucket: "{INFLUXDB_BUCKET_VIB_FALLBACK}")
          |> range(start: {start_time})
          |> filter(fn: (r) => r["_measurement"] == "vibration")
          |> filter(fn: (r) => r["_field"] == "crest")
          |> sort(columns: ["_time"])
        '''
        try:
            vib_result = query_api.query(org=INFLUXDB_ORG, query=vib_query_fallback1)
        except Exception as e2:
            # 마지막 fallback: temperature_data 버킷에서 진동 데이터 찾기
            print(f"⚠️ {INFLUXDB_BUCKET_VIB_FALLBACK} 버킷도 실패, temperature_data에서 시도: {e2}", file=sys.stderr)
            vib_query_fallback2 = f'''
            from(bucket: "{INFLUXDB_BUCKET_TEMP_FALLBACK}")
              |> range(start: {start_time})
              |> filter(fn: (r) => r["_measurement"] == "vibration")
              |> filter(fn: (r) => r["_field"] == "crest")
              |> sort(columns: ["_time"])
            '''
            try:
                vib_result = query_api.query(org=INFLUXDB_ORG, query=vib_query_fallback2)
            except Exception as e3:
                print(f"⚠️ 모든 진동 데이터 쿼리 실패: {e3}", file=sys.stderr)
                vib_result = None
    
    temp_data = []
    if temp_result:
        for table in temp_result:
            for record in table.records:
                timestamp = record.get_time()
                value = record.get_value()
                if value is not None:
                    temp_data.append({'time': timestamp, 'temperature': float(value)})
    
    vib_data = []
    if vib_result:
        for table in vib_result:
            for record in table.records:
                timestamp = record.get_time()
                value = record.get_value()
                if value is not None:
                    vib_data.append({'time': timestamp, 'vibration_crest': float(value)})
    
    # 데이터 병합 (타임스탬프가 정확히 일치하지 않을 수 있으므로 가장 가까운 값으로 매칭)
    if not temp_data or not vib_data:
        return pd.DataFrame(columns=['time', 'temperature', 'vibration_crest'])
    
    # DataFrame으로 변환하여 merge_asof 사용
    temp_df = pd.DataFrame(temp_data)
    vib_df = pd.DataFrame(vib_data)
    
    # time 컬럼을 datetime으로 변환
    if not pd.api.types.is_datetime64_any_dtype(temp_df['time']):
        temp_df['time'] = pd.to_datetime(temp_df['time'])
    if not pd.api.types.is_datetime64_any_dtype(vib_df['time']):
        vib_df['time'] = pd.to_datetime(vib_df['time'])
    
    # time을 인덱스로 설정
    temp_df = temp_df.set_index('time').sort_index()
    vib_df = vib_df.set_index('time').sort_index()
    
    # merge_asof를 사용하여 가장 가까운 타임스탬프로 매칭 (최대 1초 차이 허용)
    MAX_TIME_DIFF = pd.Timedelta(seconds=1)
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
    
    if not merged_data:
        # 데이터가 없으면 빈 DataFrame 반환
        return pd.DataFrame(columns=['time', 'temperature', 'vibration_crest'])
    
    df = pd.DataFrame(merged_data)
    if 'time' in df.columns and len(df) > 0:
        df = df.sort_values('time').reset_index(drop=True)
    else:
        return pd.DataFrame(columns=['time', 'temperature', 'vibration_crest'])
    
    return df

def predict(model, scaler, device, data):
    """예측 수행 (PyTorch)"""
    if len(data) < SEQUENCE_LENGTH:
        return None, "데이터가 부족합니다"
    
    # 최근 SEQUENCE_LENGTH개 데이터 사용
    recent_data = data[['temperature', 'vibration_crest']].tail(SEQUENCE_LENGTH).values
    
    # 정규화
    data_scaled = scaler.transform(recent_data)
    
    # 시퀀스 생성 (PyTorch 형식: [batch_size, sequence_length, features])
    X = data_scaled.reshape(1, SEQUENCE_LENGTH, 2)
    
    # PyTorch 텐서로 변환
    X_tensor = torch.FloatTensor(X).to(device)
    
    # 예측 (평가 모드)
    model.eval()
    with torch.no_grad():
        prediction_scaled = model(X_tensor)
        # CPU로 이동 후 numpy로 변환
        prediction_scaled = prediction_scaled.cpu().numpy()
    
    # 역정규화
    prediction = scaler.inverse_transform(prediction_scaled)
    
    return {
        'predicted_temperature': float(prediction[0][0]),
        'predicted_vibration': float(prediction[0][1])
    }, None

def detect_anomaly(prediction, actual_temp, actual_vib, threshold=0.2, abs_threshold_temp=5.0, abs_threshold_vib=2.0):
    """이상 탐지: 상관관계가 깨졌는지 확인
    - threshold: 상대 오차 임계값 (기본 20%)
    - abs_threshold_temp: 온도 절대 오차 임계값 (°C)
    - abs_threshold_vib: 진동 절대 오차 임계값
    """
    # 상대 오차 계산
    temp_rel_diff = abs(prediction['predicted_temperature'] - actual_temp) / actual_temp if actual_temp != 0 else 0
    vib_rel_diff = abs(prediction['predicted_vibration'] - actual_vib) / actual_vib if actual_vib != 0 else 0
    
    # 절대 오차 계산
    temp_abs_diff = abs(prediction['predicted_temperature'] - actual_temp)
    vib_abs_diff = abs(prediction['predicted_vibration'] - actual_vib)
    
    # 상대 오차와 절대 오차 둘 다 임계값을 넘어야 이상으로 판단
    temp_anomaly = temp_rel_diff >= threshold and temp_abs_diff >= abs_threshold_temp
    vib_anomaly = vib_rel_diff >= threshold and vib_abs_diff >= abs_threshold_vib
    
    # 둘 다 예측과 비슷하면 정상
    if not temp_anomaly and not vib_anomaly:
        return {
            'is_anomaly': False,
            'reason': '정상: 두 센서 모두 예상 범위 내'
        }
    
    # 온도만 크게 다르면
    if temp_anomaly and not vib_anomaly:
        return {
            'is_anomaly': True,
            'reason': f'이상: 온도만 예상과 다름 (예측: {prediction["predicted_temperature"]:.2f}°C, 실제: {actual_temp:.2f}°C, 차이: {temp_abs_diff:.2f}°C). 외부 열원 영향 가능성',
            'anomaly_type': 'temperature_only'
        }
    
    # 진동만 크게 다르면
    if not temp_anomaly and vib_anomaly:
        return {
            'is_anomaly': True,
            'reason': f'이상: 진동만 예상과 다름 (예측: {prediction["predicted_vibration"]:.2f}, 실제: {actual_vib:.2f}, 차이: {vib_abs_diff:.2f}). 기계 고장 가능성',
            'anomaly_type': 'vibration_only'
        }
    
    # 둘 다 다르면
    return {
        'is_anomaly': True,
        'reason': f'이상: 두 센서 모두 예상과 다름 (온도 차이: {temp_abs_diff:.2f}°C, 진동 차이: {vib_abs_diff:.2f}). 전체 시스템 문제 가능성',
        'anomaly_type': 'both'
    }

def predict_and_analyze():
    """예측 및 분석 수행"""
    try:
        model, scaler, device = load_model()
        client = get_influx_client()
        
        # 최근 데이터 가져오기
        data = get_recent_data(client, minutes=60)
        
        if len(data) < SEQUENCE_LENGTH:
            return {
                'error': f'데이터 부족: {len(data)}개 (최소 {SEQUENCE_LENGTH}개 필요)'
            }
        
        # 예측
        prediction, error = predict(model, scaler, device, data)
        
        if error:
            return {'error': error}
        
        # 최신 실제 값
        latest = data.iloc[-1]
        actual_temp = latest['temperature']
        actual_vib = latest['vibration_crest']
        
        # 이상 탐지
        anomaly = detect_anomaly(prediction, actual_temp, actual_vib)
        
        result = {
            'prediction': prediction,
            'actual': {
                'temperature': actual_temp,
                'vibration': actual_vib
            },
            'anomaly': anomaly,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        client.close()
        return result
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {'error': str(e)}

if __name__ == '__main__':
    import json
    import sys
    # DeprecationWarning 등 경고 메시지를 stderr로 리다이렉트
    import warnings
    warnings.filterwarnings('ignore', category=DeprecationWarning)
    
    result = predict_and_analyze()
    # JSON으로 출력 (백엔드에서 파싱하기 위해)
    # stdout에만 JSON 출력, 다른 메시지는 stderr로
    json_output = json.dumps(result, ensure_ascii=False)
    print(json_output, file=sys.stdout)
