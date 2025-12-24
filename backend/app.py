from flask import Flask, jsonify, Response, stream_with_context
from flask_cors import CORS
import paho.mqtt.client as mqtt
import json
import threading
import queue
import time
from datetime import datetime, timedelta
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

app = Flask(__name__)
CORS(app)

# MQTT 설정
MQTT_BROKER = '192.168.1.86'
MQTT_PORT = 1883
MQTT_TOPIC = 'temp001'

# InfluxDB 설정
INFLUXDB_URL = 'http://localhost:8089'
INFLUXDB_TOKEN = 'my-super-secret-auth-token'
INFLUXDB_ORG = 'my-org'
INFLUXDB_BUCKET = 'temperature_data'

# MQTT 메시지를 저장할 큐
mqtt_queue = queue.Queue()

# InfluxDB 클라이언트 초기화
try:
    influx_client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
    write_api = influx_client.write_api(write_options=SYNCHRONOUS)
    print(f"✅ InfluxDB connected: {INFLUXDB_URL}")
except Exception as e:
    print(f"❌ InfluxDB connection error: {e}")
    influx_client = None
    write_api = None

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
            
            # temp001 토픽인 경우 특별 처리
            if msg.topic == 'temp001':
                # JSON에서 16진수 데이터 추출
                hex_data = data.get('data', {}).get('payload', {}).get('/iolinkmaster/port[1]/iolinkdevice/pdin', {}).get('data')
                
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
                # 다른 토픽의 경우 기존 로직 사용
                temp_value = data.get('temperature') or data.get('temp') or data.get('value')
                if temp_value is not None:
                    mqtt_queue.put({'temperature': float(temp_value), 'timestamp': time.time()})
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
        import traceback
        traceback.print_exc()

# 백그라운드에서 MQTT 연결
mqtt_thread = threading.Thread(target=connect_mqtt, daemon=True)
mqtt_thread.start()

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
    """InfluxDB에서 1시간 온도 데이터 조회"""
    try:
        if influx_client is None:
            return jsonify({'error': 'InfluxDB not connected'}), 500
        
        # 쿼리 API 생성
        query_api = influx_client.query_api()
        
        # 1시간 전부터 현재까지의 데이터 조회
        start_time = datetime.utcnow() - timedelta(hours=1)
        start_time_str = start_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        # Flux 쿼리 작성
        query = f'''
        from(bucket: "{INFLUXDB_BUCKET}")
          |> range(start: {start_time_str})
          |> filter(fn: (r) => r["_measurement"] == "temperature")
          |> filter(fn: (r) => r["_field"] == "value")
          |> aggregateWindow(every: 10s, fn: mean, createEmpty: false)
          |> yield(name: "mean")
        '''
        
        # 쿼리 실행
        result = query_api.query(org=INFLUXDB_ORG, query=query)
        
        # 데이터 파싱
        timestamps = []
        values = []
        
        for table in result:
            for record in table.records:
                timestamps.append(record.get_time().timestamp() * 1000)  # JavaScript timestamp (ms)
                values.append(record.get_value())
        
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

if __name__ == '__main__':
    app.run(debug=True, port=5005)
