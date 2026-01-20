from flask import Flask, jsonify, Response, stream_with_context, request, make_response
from flask_cors import CORS
import paho.mqtt.client as mqtt
import json
import threading
import queue
import time
import csv
import io
import socket
from datetime import datetime, timedelta, timezone
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
try:
    from dateutil import parser
except ImportError:
    parser = None

app = Flask(__name__)
CORS(app)

# MQTT 설정
MQTT_BROKER = '192.168.1.3'
MQTT_PORT = 1883
MQTT_TOPIC = 'TP3237'  # 온도 센서 토픽

# IO-Link IP 설정
IOLINK_IP = '192.168.1.4'

# InfluxDB 설정
INFLUXDB_URL = 'http://localhost:8090'
INFLUXDB_TOKEN = 'my-super-secret-auth-token'
INFLUXDB_ORG = 'my-org'
INFLUXDB_BUCKET = 'temperature_data'

# MQTT 메시지를 저장할 큐
mqtt_queue = queue.Queue()

# InfluxDB 클라이언트 초기화
try:
    influx_client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
    write_api = influx_client.write_api(write_options=SYNCHRONOUS)
    query_api = influx_client.query_api()
    print(f"✅ InfluxDB connected: {INFLUXDB_URL}")
except Exception as e:
    print(f"❌ InfluxDB connection error: {e}")
    influx_client = None
    write_api = None
    query_api = None

def parse_hex_to_temperature(hex_data):
    """16진수 데이터를 온도로 변환 (예: '0110' -> 27.2°C)"""
    try:
        # 16진수를 정수로 변환
        hex_int = int(hex_data, 16)
        # 온도 변환 (예: 272 -> 27.2)
        temperature = hex_int / 10.0
        return temperature
    except Exception as e:
        print(f"❌ Error parsing hex to temperature: {e}")
        return None

# MQTT 클라이언트 설정
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"✅ MQTT Connected to {MQTT_BROKER}:{MQTT_PORT}")
        client.subscribe(MQTT_TOPIC)
        print(f"✅ Subscribed to topic: {MQTT_TOPIC}")
    else:
        print(f"❌ MQTT Connection failed with code {rc}")

def on_message(client, userdata, msg):
    try:
        message_str = msg.payload.decode('utf-8')
        print(f"📨 MQTT Message received on topic {msg.topic}: {message_str}")
        
        # JSON 파싱
        try:
            data = json.loads(message_str)
            
            # TP3237 토픽인 경우 특별 처리 (iolink 구조)
            if msg.topic == 'TP3237':
                # JSON에서 16진수 데이터 추출 (port[2] 사용)
                payload = data.get('data', {}).get('payload', {})
                hex_data = payload.get('/iolinkmaster/port[2]/iolinkdevice/pdin', {}).get('data')
                # port[1]도 확인 (호환성을 위해)
                if not hex_data:
                    hex_data = payload.get('/iolinkmaster/port[1]/iolinkdevice/pdin', {}).get('data')
                
                if hex_data:
                    # 16진수를 온도로 변환
                    temperature = parse_hex_to_temperature(hex_data)
                    if temperature is not None:
                        print(f"🌡️ Temperature extracted: {temperature}°C")
                        
                        # SSE로 전송할 데이터 큐에 추가
                        mqtt_queue.put({'temperature': temperature, 'timestamp': time.time()})
                        
                        # InfluxDB에 저장
                        if write_api:
                            try:
                                point = Point("temperature") \
                                    .field("value", float(temperature)) \
                                    .time(time.time_ns())
                                write_api.write(bucket=INFLUXDB_BUCKET, record=point)
                                print(f"💾 Saved to InfluxDB: {temperature}°C")
                            except Exception as e:
                                print(f"❌ InfluxDB write error: {e}")
                                import traceback
                                traceback.print_exc()
                    else:
                        print("⚠️ Failed to parse hex data to temperature")
                else:
                    print("⚠️ Hex data not found in message structure")
                    print(f"📋 Message structure: {json.dumps(data, indent=2)}")
            else:
                # 다른 토픽의 경우 일반 로직 사용 (temperature, temp, value 필드 확인)
                temp_value = data.get('temperature') or data.get('temp') or data.get('value')
                if temp_value is not None:
                    temperature = float(temp_value)
                    print(f"🌡️ Temperature extracted: {temperature}°C")
                    
                    # SSE로 전송할 데이터 큐에 추가
                    mqtt_queue.put({'temperature': temperature, 'timestamp': time.time()})
                    
                    # InfluxDB에 저장
                    if write_api:
                        try:
                            point = Point("temperature") \
                                .field("value", float(temperature)) \
                                .time(time.time_ns())
                            write_api.write(bucket=INFLUXDB_BUCKET, record=point)
                            print(f"💾 Saved to InfluxDB: {temperature}°C")
                        except Exception as e:
                            print(f"❌ InfluxDB write error: {e}")
                            import traceback
                            traceback.print_exc()
        except json.JSONDecodeError as e:
            print(f"❌ JSON decode error: {e}")
            print(f"📋 Raw message: {message_str}")
        except Exception as e:
            print(f"❌ Error processing message: {e}")
            import traceback
            traceback.print_exc()
    except Exception as e:
        print(f"❌ Error in on_message: {e}")
        import traceback
        traceback.print_exc()

def on_disconnect(client, userdata, rc):
    print("🔌 MQTT Disconnected")

# MQTT 클라이언트 초기화 및 연결
try:
    mqtt_client = mqtt.Client()
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    mqtt_client.on_disconnect = on_disconnect
    # 자동 재연결 설정
    mqtt_client.reconnect_delay_set(min_delay=1, max_delay=120)
except Exception as e:
    print(f"❌ Error initializing MQTT client: {e}")
    mqtt_client = None

def connect_mqtt():
    if mqtt_client is None:
        print("❌ MQTT client not initialized")
        return
    try:
        print(f"🔄 Attempting to connect to MQTT broker: {MQTT_BROKER}:{MQTT_PORT}")
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_start()
        print("🔄 MQTT loop started")
    except Exception as e:
        print(f"❌ MQTT Connection error: {e}")
        print(f"💡 네트워크 연결을 확인하고 잠시 후 자동으로 재연결을 시도합니다.")
        import traceback
        traceback.print_exc()
        # 재연결 시도 (5초 후)
        import threading
        def retry_connect():
            import time
            time.sleep(5)
            if mqtt_client is not None:
                try:
                    mqtt_client.reconnect()
                except:
                    pass
        threading.Thread(target=retry_connect, daemon=True).start()

# 백그라운드에서 MQTT 연결
mqtt_thread = threading.Thread(target=connect_mqtt, daemon=True)
mqtt_thread.start()

def get_server_ip():
    """서버의 외부 IP 주소 감지"""
    try:
        # 소켓을 통해 외부 서버에 연결하여 로컬 IP 확인
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # 외부 서버에 연결 시도 (실제로 연결하지 않고 로컬 IP만 확인)
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
        except Exception:
            # 연결 실패 시 localhost 사용
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip
    except Exception as e:
        print(f"⚠️ IP 감지 실패: {e}")
        return '127.0.0.1'

@app.route('/api/system/ip', methods=['GET'])
def get_ip_info():
    """시스템 IP 정보 반환"""
    try:
        server_ip = get_server_ip()
        
        return jsonify({
            'current_ip': server_ip,
            'iolink_ip': IOLINK_IP
        })
    except Exception as e:
        print(f"❌ IP 정보 가져오기 실패: {e}")
        return jsonify({
            'current_ip': '--',
            'iolink_ip': IOLINK_IP
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'Flask backend is running'})

@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({'message': 'Test endpoint working'})

@app.route('/api/mqtt/temperature', methods=['GET'])
def stream_temperature():
    """Server-Sent Events를 통해 실시간 온도 데이터 스트리밍"""
    def generate():
        try:
            while True:
                try:
                    # 큐에서 메시지 가져오기 (타임아웃 1초)
                    try:
                        data = mqtt_queue.get(timeout=1)
                        yield f"data: {json.dumps(data)}\n\n"
                    except queue.Empty:
                        # 하트비트 전송 (연결 유지)
                        yield f"data: {json.dumps({'heartbeat': True})}\n\n"
                except GeneratorExit:
                    print("SSE connection closed by client")
                    break
                except Exception as e:
                    print(f"Error in stream: {e}")
                    import traceback
                    traceback.print_exc()
                    break
        except Exception as e:
            print(f"Fatal error in generate: {e}")
            import traceback
            traceback.print_exc()
    
    response = Response(stream_with_context(generate()), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response

@app.route('/api/influxdb/temperature', methods=['GET'])
def get_temperature_history():
    """InfluxDB에서 온도 데이터 조회 (range 파라미터로 시간 범위 지정)"""
    try:
        if influx_client is None:
            return jsonify({'error': 'InfluxDB not connected'}), 500
        
        # range 파라미터 가져오기 (기본값: 1h)
        range_param = request.args.get('range', '1h')
        
        # 쿼리 API 생성
        query_api = influx_client.query_api()
        
        # range에 따라 시작 시간과 윈도우 간격 계산
        now = datetime.utcnow()
        if range_param == '1h':
            start_time = now - timedelta(hours=1)
            window_interval = '10s'
        elif range_param == '6h':
            start_time = now - timedelta(hours=6)
            window_interval = '1m'
        elif range_param == '24h':
            start_time = now - timedelta(hours=24)
            window_interval = '5m'
        elif range_param == '7d':
            start_time = now - timedelta(days=7)
            window_interval = '30m'
        else:
            # 기본값: 1시간
            start_time = now - timedelta(hours=1)
            window_interval = '10s'
        
        start_time_str = start_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        # Flux 쿼리 작성 (createEmpty: true로 설정하여 빈 시간대도 포함)
        query = f'''
        from(bucket: "{INFLUXDB_BUCKET}")
          |> range(start: {start_time_str})
          |> filter(fn: (r) => r["_measurement"] == "temperature")
          |> filter(fn: (r) => r["_field"] == "value")
          |> aggregateWindow(every: {window_interval}, fn: mean, createEmpty: true)
          |> yield(name: "mean")
        '''
        
        # 쿼리 실행
        result = query_api.query(org=INFLUXDB_ORG, query=query)
        
        # 데이터 파싱
        timestamps = []
        values = []
        
        for table in result:
            for record in table.records:
                timestamp = record.get_time().timestamp() * 1000  # JavaScript timestamp (ms)
                value = record.get_value()
                timestamps.append(timestamp)
                # 데이터가 없으면 null로 설정 (빈 시간대)
                values.append(value if value is not None else None)
        
        # 시간순 정렬
        if timestamps and values:
            sorted_data = sorted(zip(timestamps, values))
            timestamps, values = zip(*sorted_data)
            timestamps = list(timestamps)
            values = list(values)
        
        return jsonify({
            'timestamps': timestamps,
            'values': values,
            'count': len(values)
        })
        
    except Exception as e:
        print(f"❌ Error querying InfluxDB: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/export/temperature/csv', methods=['GET'])
def export_temperature_csv():
    """온도 데이터를 CSV 파일로 내보내기 (KST 시간 범위 지정)"""
    if not query_api:
        return jsonify({'error': 'InfluxDB 쿼리 API가 초기화되지 않았습니다.'}), 500
    
    try:
        # 1. KST 시간 파라미터 받기
        start_time_kst_str = request.args.get('start_time_kst')  # "YYYY-MM-DD HH:MM:SS"
        end_time_kst_str = request.args.get('end_time_kst')
        
        if not start_time_kst_str or not end_time_kst_str:
            return jsonify({'error': '시작 시간과 종료 시간이 필요합니다.'}), 400
        
        print(f"📥 CSV 다운로드 요청: start_time_kst={start_time_kst_str}, end_time_kst={end_time_kst_str}")
        
        # 2. KST 문자열 파싱
        try:
            start_kst = datetime.strptime(start_time_kst_str, '%Y-%m-%d %H:%M:%S')
            end_kst = datetime.strptime(end_time_kst_str, '%Y-%m-%d %H:%M:%S')
        except ValueError as e:
            return jsonify({'error': f'시간 형식이 올바르지 않습니다. 형식: YYYY-MM-DD HH:MM:SS. 오류: {e}'}), 400
        
        # 3. KST → UTC 변환 (KST = UTC + 9시간)
        start_utc = start_kst - timedelta(hours=9)
        end_utc = end_kst - timedelta(hours=9)
        
        print(f"📅 변환된 UTC 시간: start={start_utc}, end={end_utc}")
        
        # 4. RFC3339 형식으로 변환 (InfluxDB 쿼리용)
        start_rfc = start_utc.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        end_rfc = end_utc.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        
        print(f"🔍 InfluxDB 쿼리 범위: start={start_rfc}, end={end_rfc}")
        
        # 5. InfluxDB Flux 쿼리 실행
        query = f'''
        from(bucket: "{INFLUXDB_BUCKET}")
          |> range(start: {start_rfc}, stop: {end_rfc})
          |> filter(fn: (r) => r["_measurement"] == "temperature")
          |> filter(fn: (r) => r["_field"] == "value")
          |> sort(columns: ["_time"])
        '''
        
        print(f"📊 Flux 쿼리:\n{query}")
        
        result = query_api.query(org=INFLUXDB_ORG, query=query)
        
        # 6. CSV 생성
        output = io.StringIO()
        writer = csv.writer(output)
        
        # UTF-8 BOM 추가 (Excel 호환성)
        output.write('\ufeff')
        
        # 헤더 작성
        writer.writerow(['Time (UTC)', 'Time (KST)', 'Temperature (°C)'])
        
        # 데이터 행 추가
        row_count = 0
        for table in result:
            for record in table.records:
                time_utc = record.get_time()
                
                # timezone-aware인 경우 naive로 변환
                if time_utc.tzinfo is not None:
                    time_utc_naive = time_utc.replace(tzinfo=None)
                else:
                    time_utc_naive = time_utc
                
                # Python 레벨에서 정확한 범위 체크
                if time_utc_naive < start_utc or time_utc_naive >= end_utc:
                    continue
                
                # UTC → KST 변환 (UTC+9)
                time_kst = time_utc_naive + timedelta(hours=9)
                value = record.get_value()
                
                # 데이터가 없으면 "--"로 표시
                if value is None:
                    writer.writerow([
                        time_utc_naive.strftime('%Y-%m-%d %H:%M:%S'),
                        time_kst.strftime('%Y-%m-%d %H:%M:%S'),
                        '--'
                    ])
                else:
                    writer.writerow([
                        time_utc_naive.strftime('%Y-%m-%d %H:%M:%S'),
                        time_kst.strftime('%Y-%m-%d %H:%M:%S'),
                        f'{value:.2f}'
                    ])
                row_count += 1
        
        print(f"📈 조회된 레코드 수: {row_count}")
        
        # 데이터가 없는 경우
        if row_count == 0:
            return jsonify({'error': '선택한 시간 범위에 데이터가 없습니다.'}), 404
        
        # 파일명 생성
        filename_start = start_time_kst_str.replace('-', '').replace(':', '').replace(' ', '_')
        filename_end = end_time_kst_str.replace('-', '').replace(':', '').replace(' ', '_')
        filename = f'temperature_{filename_start}_{filename_end}.csv'
        
        # UTF-8 BOM 포함하여 인코딩
        csv_content = output.getvalue()
        # 이미 output.write('\ufeff')로 BOM을 추가했으므로 utf-8로 인코딩
        csv_bytes = csv_content.encode('utf-8')
        
        # HTTP 응답 생성
        response = make_response(csv_bytes)
        response.headers['Content-Type'] = 'text/csv; charset=utf-8'
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.headers['Content-Length'] = len(csv_bytes)
        
        print(f"✅ CSV 생성 완료: {row_count}개 행, 파일명: {filename}")
        
        return response
        
    except ValueError as e:
        return jsonify({'error': f'시간 형식이 올바르지 않습니다. 형식: YYYY-MM-DD HH:MM:SS. 오류: {e}'}), 400
    except Exception as e:
        print(f"❌ CSV 내보내기 실패: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5005)
