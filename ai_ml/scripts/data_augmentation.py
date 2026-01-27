"""
데이터 증강 스크립트
- InfluxDB 버킷 복사
- 특정 시간/간격으로 노이즈 추가 및 상관관계 패턴 생성
"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
import time
import json
import os

# InfluxDB 설정
INFLUXDB_URL = 'http://localhost:8090'
INFLUXDB_TOKEN = 'my-super-secret-auth-token'
INFLUXDB_ORG = 'my-org'
INFLUXDB_BUCKET_ORIGINAL_TEMP = 'temperature_data'
INFLUXDB_BUCKET_ORIGINAL_VIB = 'temperature_data'  # 진동 데이터도 temperature_data 버킷에 있음
INFLUXDB_BUCKET_AUGMENTED_TEMP = 'temperature_augmented'
INFLUXDB_BUCKET_AUGMENTED_VIB = 'vibration_augmented'

# 증강 설정
SMALL_NOISE_TEMP = 0.3  # 작은 노이즈 범위 (°C)
SMALL_NOISE_VIB = 0.05  # 작은 노이즈 범위 (진동)
WAVE_INTERVAL_HOURS_MIN = 0.5  # 큰 파동 생성 최소 간격 (시간)
WAVE_INTERVAL_HOURS_MAX = 3.0  # 큰 파동 생성 최대 간격 (시간) - 랜덤 간격
WAVE_DURATION_MINUTES_MIN = 15  # 파동 최소 지속 시간 (분)
WAVE_DURATION_MINUTES_MAX = 40  # 파동 최대 지속 시간 (분) - 랜덤 지속 시간
WAVE_TEMP_AMPLITUDE = (3.0, 8.0)  # 파동 온도 진폭 범위 (°C) - 다양한 크기
WAVE_VIB_AMPLITUDE = (0.3, 1.2)  # 파동 진동 진폭 범위 - 다양한 크기
WAVE_PROBABILITY = 0.3  # 각 시간대에 파동이 발생할 확률 (30%)

# 진행률 파일 경로
PROGRESS_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'augment_progress.json')

def save_progress(stage, progress, message=""):
    """진행률 저장"""
    try:
        os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
        with open(PROGRESS_FILE, 'w') as f:
            json.dump({
                'stage': stage,
                'progress': progress,
                'message': message,
                'timestamp': datetime.utcnow().isoformat()
            }, f)
        print(f"📊 진행률 저장: {progress}% - {message}")
    except Exception as e:
        print(f"⚠️ 진행률 저장 실패: {e}")

def get_influx_client():
    """InfluxDB 클라이언트 생성"""
    return InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)

def create_bucket_if_not_exists(client, bucket_name):
    """버킷이 없으면 생성"""
    try:
        from influxdb_client import Bucket
        
        buckets_api = client.buckets_api()
        
        # 버킷 존재 확인
        bucket_exists = False
        try:
            buckets = buckets_api.find_buckets()
            # buckets는 Buckets 객체이므로 .buckets 속성 사용
            if hasattr(buckets, 'buckets'):
                bucket_exists = any(b.name == bucket_name for b in buckets.buckets)
            elif hasattr(buckets, '__iter__'):
                bucket_exists = any(b.name == bucket_name for b in buckets)
        except Exception as e:
            print(f"⚠️ 버킷 목록 조회 실패: {e}")
            bucket_exists = False
        
        if not bucket_exists:
            print(f"📦 버킷 '{bucket_name}' 생성 중...")
            try:
                # Organization ID 찾기
                orgs_api = client.organizations_api()
                orgs = orgs_api.find_organizations()
                org_id = None
                for org in orgs:
                    if org.name == INFLUXDB_ORG:
                        org_id = org.id
                        break
                
                if not org_id:
                    raise Exception(f"Organization '{INFLUXDB_ORG}'를 찾을 수 없습니다")
                
                # 빈 retention_rules 리스트 사용 (무제한 보관)
                bucket = Bucket(
                    name=bucket_name,
                    retention_rules=[],
                    org_id=org_id
                )
                buckets_api.create_bucket(bucket=bucket)
                print(f"✅ 버킷 '{bucket_name}' 생성 완료")
            except Exception as e:
                # 이미 존재하거나 다른 오류
                error_msg = str(e)
                if 'already exists' in error_msg.lower() or 'conflict' in error_msg.lower() or 'duplicate' in error_msg.lower():
                    print(f"✅ 버킷 '{bucket_name}' 이미 존재")
                else:
                    print(f"⚠️ 버킷 생성 실패: {e}")
                    # 버킷 생성 실패해도 계속 진행 (버킷이 이미 있을 수 있음)
        else:
            print(f"✅ 버킷 '{bucket_name}' 이미 존재")
    except Exception as e:
        print(f"⚠️ 버킷 확인 중 오류 (계속 진행): {e}")
        # 버킷 생성 실패해도 계속 진행 시도

def copy_bucket_data(source_bucket, target_bucket, measurement, field_name, client):
    """버킷 데이터 복사"""
    print(f"📋 {source_bucket} → {target_bucket} 복사 중...")
    
    query_api = client.query_api()
    write_api = client.write_api(write_options=SYNCHRONOUS)
    
    # 버킷 존재 확인
    try:
        buckets_api = client.buckets_api()
        buckets = buckets_api.find_buckets()
        source_exists = False
        
        if hasattr(buckets, 'buckets'):
            source_exists = any(b.name == source_bucket for b in buckets.buckets)
        elif hasattr(buckets, '__iter__'):
            source_exists = any(b.name == source_bucket for b in buckets)
        
        if not source_exists:
            print(f"⚠️ 소스 버킷 '{source_bucket}'이 없습니다. 데이터가 없을 수 있습니다.")
            print(f"   빈 버킷 '{target_bucket}'을 생성하고 건너뜁니다.")
            return 0
    except Exception as e:
        print(f"⚠️ 버킷 확인 중 오류: {e}")
        # 확인 실패해도 계속 진행 시도
    
    # 원본 데이터 조회 (최근 7일)
    start_time = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
    
    query = f'''
    from(bucket: "{source_bucket}")
      |> range(start: {start_time})
      |> filter(fn: (r) => r["_measurement"] == "{measurement}")
      |> filter(fn: (r) => r["_field"] == "{field_name}")
      |> sort(columns: ["_time"])
    '''
    
    result = query_api.query(org=INFLUXDB_ORG, query=query)
    
    points = []
    count = 0
    
    for table in result:
        for record in table.records:
            timestamp = record.get_time()
            value = record.get_value()
            
            if value is not None:
                point = Point(measurement) \
                    .field(field_name, float(value)) \
                    .time(timestamp)
                points.append(point)
                count += 1
                
                # 배치로 저장 (1000개씩)
                if len(points) >= 1000:
                    write_api.write(bucket=target_bucket, record=points)
                    points = []
    
    # 남은 데이터 저장
    if points:
        write_api.write(bucket=target_bucket, record=points)
    
    print(f"✅ {count}개 데이터 복사 완료")
    return count

def augment_temperature_data(bucket, client):
    """온도 데이터 증강"""
    print(f"🔧 {bucket} 온도 데이터 증강 중...")
    
    query_api = client.query_api()
    write_api = client.write_api(write_options=SYNCHRONOUS)
    
    # 데이터 조회
    start_time = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
    
    query = f'''
    from(bucket: "{bucket}")
      |> range(start: {start_time})
      |> filter(fn: (r) => r["_measurement"] == "temperature")
      |> filter(fn: (r) => r["_field"] == "value")
      |> sort(columns: ["_time"])
    '''
    
    result = query_api.query(org=INFLUXDB_ORG, query=query)
    
    # 데이터를 리스트로 수집
    data_points = []
    for table in result:
        for record in table.records:
            timestamp = record.get_time()
            value = record.get_value()
            if value is not None:
                data_points.append({
                    'time': timestamp,
                    'value': float(value)
                })
    
    print(f"📊 {len(data_points)}개 데이터 포인트 처리 중...")
    
    # 증강 적용
    points_to_write = []
    last_wave_start = None
    current_wave_amplitude = None
    current_wave_direction = None
    current_wave_duration = None
    next_wave_interval = None
    
    for i, dp in enumerate(data_points):
        timestamp = dp['time']
        original_value = dp['value']
        
        # 타임스탬프를 datetime으로 변환
        if hasattr(timestamp, 'timestamp'):
            dt = datetime.fromtimestamp(timestamp.timestamp())
        else:
            dt = timestamp
        
        # 시간대 확인
        hour = dt.hour
        minute = dt.minute
        
        # 큰 파동 시작 시간 확인 (랜덤 간격)
        start_new_wave = False
        if last_wave_start is None:
            # 첫 파동: 랜덤 확률로 시작
            if np.random.random() < WAVE_PROBABILITY:
                start_new_wave = True
                last_wave_start = dt
                current_wave_amplitude = np.random.uniform(*WAVE_TEMP_AMPLITUDE)
                current_wave_direction = 1 if np.random.random() < 0.5 else -1
                current_wave_duration = timedelta(minutes=np.random.uniform(WAVE_DURATION_MINUTES_MIN, WAVE_DURATION_MINUTES_MAX))
                # 다음 파동까지의 간격도 랜덤하게 설정
                next_wave_interval = timedelta(hours=np.random.uniform(WAVE_INTERVAL_HOURS_MIN, WAVE_INTERVAL_HOURS_MAX))
        else:
            time_since_last_wave = dt - last_wave_start
            # 다음 파동 간격이 지났고, 랜덤 확률로 새 파동 시작
            if time_since_last_wave >= next_wave_interval:
                if np.random.random() < WAVE_PROBABILITY:
                    start_new_wave = True
                    last_wave_start = dt
                    current_wave_amplitude = np.random.uniform(*WAVE_TEMP_AMPLITUDE)
                    current_wave_direction = 1 if np.random.random() < 0.5 else -1
                    current_wave_duration = timedelta(minutes=np.random.uniform(WAVE_DURATION_MINUTES_MIN, WAVE_DURATION_MINUTES_MAX))
                    next_wave_interval = timedelta(hours=np.random.uniform(WAVE_INTERVAL_HOURS_MIN, WAVE_INTERVAL_HOURS_MAX))
        
        # 파동 효과 계산
        wave_effect = 0.0
        if last_wave_start is not None:
            time_in_wave = dt - last_wave_start
            
            if time_in_wave < current_wave_duration:
                # 파동 진행도 (0 ~ 1)
                progress = time_in_wave.total_seconds() / current_wave_duration.total_seconds()
                # 사인파 패턴으로 부드러운 파동 생성 (0에서 시작해서 최대값까지, 다시 0으로)
                # 약간의 랜덤성을 추가하여 완전히 규칙적이지 않게
                noise_factor = np.random.uniform(0.9, 1.1)  # 파동 크기에 약간의 변동
                wave_effect = current_wave_amplitude * current_wave_direction * np.sin(np.pi * progress) * noise_factor
            else:
                # 파동이 끝났으면 효과 없음
                wave_effect = 0.0
        
        # 작은 노이즈 추가
        noise = np.random.normal(0, SMALL_NOISE_TEMP)
        
        # 최종 증강 값
        augmented_value = original_value + wave_effect + noise
        
        # 포인트 생성
        point = Point("temperature") \
            .field("value", float(augmented_value)) \
            .time(timestamp)
        
        points_to_write.append(point)
        
        # 배치로 저장
        if len(points_to_write) >= 1000:
            write_api.write(bucket=bucket, record=points_to_write)
            points_to_write = []
    
    # 남은 데이터 저장
    if points_to_write:
        write_api.write(bucket=bucket, record=points_to_write)
    
    print(f"✅ 온도 데이터 증강 완료")

def augment_vibration_data(bucket, client, temperature_bucket):
    """진동 데이터 증강 (온도와 상관관계 유지)"""
    print(f"🔧 {bucket} 진동 데이터 증강 중...")
    
    query_api = client.query_api()
    write_api = client.write_api(write_options=SYNCHRONOUS)
    
    # 온도 증강 데이터 조회 (상관관계 유지용)
    temp_start_time = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
    temp_query = f'''
    from(bucket: "{temperature_bucket}")
      |> range(start: {temp_start_time})
      |> filter(fn: (r) => r["_measurement"] == "temperature")
      |> filter(fn: (r) => r["_field"] == "value")
      |> sort(columns: ["_time"])
    '''
    
    temp_result = query_api.query(org=INFLUXDB_ORG, query=temp_query)
    
    # 온도 데이터를 딕셔너리로 저장 (타임스탬프 기준)
    temp_data = {}
    for table in temp_result:
        for record in table.records:
            timestamp = record.get_time()
            value = record.get_value()
            if value is not None:
                temp_data[timestamp] = float(value)
    
    # 진동 데이터 조회
    vib_start_time = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
    
    # 각 진동 필드별로 처리
    vibration_fields = ['v_rms', 'a_peak', 'a_rms', 'crest', 'temperature']
    
    for field in vibration_fields:
        print(f"  📊 {field} 필드 처리 중...")
        
        query = f'''
        from(bucket: "{bucket}")
          |> range(start: {vib_start_time})
          |> filter(fn: (r) => r["_measurement"] == "vibration")
          |> filter(fn: (r) => r["_field"] == "{field}")
          |> sort(columns: ["_time"])
        '''
        
        result = query_api.query(org=INFLUXDB_ORG, query=query)
        
        points_to_write = []
        last_wave_start = None
        current_wave_amplitude = None
        current_wave_direction = None
        current_wave_duration = None
        next_wave_interval = None
        
        for table in result:
            for record in table.records:
                timestamp = record.get_time()
                value = record.get_value()
                
                if value is None:
                    continue
                
                # 타임스탬프를 datetime으로 변환
                if hasattr(timestamp, 'timestamp'):
                    dt = datetime.fromtimestamp(timestamp.timestamp())
                else:
                    dt = timestamp
                
                # 큰 파동 시작 시간 확인 (랜덤 간격, 온도와 동기화)
                start_new_wave = False
                if last_wave_start is None:
                    # 첫 파동: 랜덤 확률로 시작
                    if np.random.random() < WAVE_PROBABILITY:
                        start_new_wave = True
                        last_wave_start = dt
                        current_wave_amplitude = np.random.uniform(*WAVE_VIB_AMPLITUDE)
                        current_wave_direction = 1 if np.random.random() < 0.5 else -1
                        current_wave_duration = timedelta(minutes=np.random.uniform(WAVE_DURATION_MINUTES_MIN, WAVE_DURATION_MINUTES_MAX))
                        next_wave_interval = timedelta(hours=np.random.uniform(WAVE_INTERVAL_HOURS_MIN, WAVE_INTERVAL_HOURS_MAX))
                else:
                    time_since_last_wave = dt - last_wave_start
                    # 다음 파동 간격이 지났고, 랜덤 확률로 새 파동 시작
                    if time_since_last_wave >= next_wave_interval:
                        if np.random.random() < WAVE_PROBABILITY:
                            start_new_wave = True
                            last_wave_start = dt
                            current_wave_amplitude = np.random.uniform(*WAVE_VIB_AMPLITUDE)
                            current_wave_direction = 1 if np.random.random() < 0.5 else -1
                            current_wave_duration = timedelta(minutes=np.random.uniform(WAVE_DURATION_MINUTES_MIN, WAVE_DURATION_MINUTES_MAX))
                            next_wave_interval = timedelta(hours=np.random.uniform(WAVE_INTERVAL_HOURS_MIN, WAVE_INTERVAL_HOURS_MAX))
                
                # 파동 효과 계산
                wave_effect = 0.0
                if last_wave_start is not None:
                    time_in_wave = dt - last_wave_start
                    
                    if time_in_wave < current_wave_duration:
                        # 파동 진행도 (0 ~ 1)
                        progress = time_in_wave.total_seconds() / current_wave_duration.total_seconds()
                        # 사인파 패턴으로 부드러운 파동 생성
                        # 약간의 랜덤성을 추가하여 완전히 규칙적이지 않게
                        noise_factor = np.random.uniform(0.9, 1.1)  # 파동 크기에 약간의 변동
                        wave_effect = current_wave_amplitude * current_wave_direction * np.sin(np.pi * progress) * noise_factor
                    else:
                        wave_effect = 0.0
                
                # 증강 적용
                if field in ['v_rms', 'a_peak', 'a_rms', 'crest']:
                    # 작은 노이즈 추가
                    noise = np.random.normal(0, SMALL_NOISE_VIB)
                    # 최종 증강 값 (파동 + 노이즈)
                    augmented_value = float(value) + wave_effect + noise
                else:
                    # temperature 필드는 온도 버킷에서 가져온 값 사용
                    if timestamp in temp_data:
                        augmented_value = temp_data[timestamp]
                    else:
                        augmented_value = float(value)
                
                # 포인트 생성
                point = Point("vibration") \
                    .tag("sensor_type", "VVB001") \
                    .field(field, float(augmented_value)) \
                    .time(timestamp)
                
                points_to_write.append(point)
                
                # 배치로 저장
                if len(points_to_write) >= 1000:
                    write_api.write(bucket=bucket, record=points_to_write)
                    points_to_write = []
        
        # 남은 데이터 저장
        if points_to_write:
            write_api.write(bucket=bucket, record=points_to_write)
        
        print(f"  ✅ {field} 필드 증강 완료")
    
    print(f"✅ 진동 데이터 증강 완료")

def main():
    """메인 함수"""
    print("🚀 데이터 증강 프로세스 시작")
    save_progress('start', 0, '데이터 증강 시작')
    
    client = get_influx_client()
    
    try:
        # 버킷 생성 (없으면)
        save_progress('create_buckets', 2, '버킷 확인 및 생성 중...')
        print("🔍 버킷 확인 중...")
        create_bucket_if_not_exists(client, INFLUXDB_BUCKET_AUGMENTED_TEMP)
        create_bucket_if_not_exists(client, INFLUXDB_BUCKET_AUGMENTED_VIB)
        save_progress('buckets_ready', 5, '버킷 준비 완료')
        # 1. 버킷 복사
        print("\n📋 1단계: 버킷 복사")
        save_progress('copy_temp', 10, '온도 데이터 복사 중...')
        temp_count = copy_bucket_data(
            INFLUXDB_BUCKET_ORIGINAL_TEMP,
            INFLUXDB_BUCKET_AUGMENTED_TEMP,
            "temperature",
            "value",
            client
        )
        
        save_progress('copy_vib', 30, '진동 데이터 복사 중...')
        
        # 진동 데이터 복사 (temperature_data 버킷에서 vibration measurement 읽기)
        query_api = client.query_api()
        write_api = client.write_api(write_options=SYNCHRONOUS)
        
        vibration_fields = ['v_rms', 'a_peak', 'a_rms', 'crest', 'temperature']
        vib_count = 0
        
        start_time = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
        
        for field in vibration_fields:
            print(f"  📊 {field} 필드 복사 중...")
            query = f'''
            from(bucket: "{INFLUXDB_BUCKET_ORIGINAL_VIB}")
              |> range(start: {start_time})
              |> filter(fn: (r) => r["_measurement"] == "vibration")
              |> filter(fn: (r) => r["_field"] == "{field}")
              |> sort(columns: ["_time"])
            '''
            
            try:
                result = query_api.query(org=INFLUXDB_ORG, query=query)
                points = []
                field_count = 0
                
                for table in result:
                    for record in table.records:
                        timestamp = record.get_time()
                        value = record.get_value()
                        if value is not None:
                            point = Point("vibration") \
                                .tag("sensor_type", "VVB001") \
                                .field(field, float(value)) \
                                .time(timestamp)
                            points.append(point)
                            field_count += 1
                            
                            if len(points) >= 1000:
                                write_api.write(bucket=INFLUXDB_BUCKET_AUGMENTED_VIB, record=points)
                                points = []
                
                if points:
                    write_api.write(bucket=INFLUXDB_BUCKET_AUGMENTED_VIB, record=points)
                
                vib_count += field_count
                print(f"  ✅ {field} 필드 {field_count}개 복사 완료")
            except Exception as e:
                error_msg = str(e)
                print(f"⚠️ 진동 필드 '{field}' 복사 실패: {error_msg}")
                # 계속 진행
        
        # 진동 데이터 복사 완료
        save_progress('copy_vib_complete', 50, '진동 데이터 복사 완료')
        
        # 2. 증강 적용
        print("\n🔧 2단계: 데이터 증강")
        if temp_count > 0:
            save_progress('augment_temp', 60, '온도 데이터 증강 중...')
            augment_temperature_data(INFLUXDB_BUCKET_AUGMENTED_TEMP, client)
            save_progress('augment_temp_complete', 70, '온도 데이터 증강 완료')
        else:
            print("⚠️ 온도 데이터가 없어 증강을 건너뜁니다.")
            save_progress('augment_temp_skip', 70, '온도 데이터 없음 - 건너뜀')
        
        if vib_count > 0:
            save_progress('augment_vib', 75, '진동 데이터 증강 중...')
            augment_vibration_data(INFLUXDB_BUCKET_AUGMENTED_VIB, client, INFLUXDB_BUCKET_AUGMENTED_TEMP)
            save_progress('augment_vib_complete', 95, '진동 데이터 증강 완료')
        else:
            print("⚠️ 진동 데이터가 없어 증강을 건너뜁니다.")
            save_progress('augment_vib_skip', 95, '진동 데이터 없음 - 건너뜀')
        
        save_progress('complete', 100, '데이터 증강 완료!')
        print("\n✅ 데이터 증강 프로세스 완료!")
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        save_progress('error', 0, f'오류 발생: {str(e)}')
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == '__main__':
    main()
