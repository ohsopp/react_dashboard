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
import requests
import re
from datetime import datetime, timedelta, timezone
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
from iolink_sensor_info import extract_sensor_info_from_mqtt, get_sensor_info, sensor_device_info, get_iolink_master_info
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
VIBRATION_MQTT_TOPIC = 'VVB001'  # 진동 센서 토픽

# IO-Link IP 설정
IOLINK_IP = '192.168.1.4'

# InfluxDB 설정
INFLUXDB_URL = 'http://localhost:8090'
INFLUXDB_TOKEN = 'my-super-secret-auth-token'
INFLUXDB_ORG = 'my-org'
INFLUXDB_BUCKET = 'temperature_data'
VIBRATION_INFLUXDB_BUCKET = 'vibration_data'
VIBRATION_SAMPLING_INTERVAL = 1  # 샘플링 간격 (초)

# MQTT 메시지를 저장할 큐
mqtt_queue = queue.Queue()
vibration_queue = queue.Queue()

# 최신 진동 데이터 저장
latest_vibration_data = {
    'v_rms': None,
    'a_peak': None,
    'a_rms': None,
    'temperature': None,
    'crest': None,
    'device_status': None,
    'out1': False,
    'out2': False,
    'timestamp': None
}

# 센서 디바이스 정보는 iolink_sensor_info 모듈에서 관리

# 마지막 저장 시간 추적 (샘플링 레이트 제어)
last_vibration_save_time = 0

# 마지막 MQTT 메시지 수신 시간 추적 (지연시간 계산용)
last_mqtt_message_time = None

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

# VVB001 진동센서 디코딩 관련 상수
PDIN_PATHS = [
    '/iolinkmaster/port[4]/iolinkdevice/pdin',
    '/iolinkmaster/port[3]/iolinkdevice/pdin',
    '/iolinkmaster/port[2]/iolinkdevice/pdin',
    '/iolinkmaster/port[1]/iolinkdevice/pdin'
]

DEVICE_STATUS_MAP = {
    0: "Device is OK",
    1: "Maintenance required",
    2: "Out of specification",
    3: "Function check",
    4: "Offline",
    5: "Device not available",
    6: "No data available",
    7: "Cyclic data not available"
}

SPECIAL_VALUES = {
    32760: "OL",  # Overflow
    -32760: "UL",  # Underflow
    32764: "NoData",
    -32768: "Invalid"
}

def hex_to_bytes(hex_string):
    """16진수 문자열을 바이트 배열로 변환"""
    try:
        return bytes.fromhex(hex_string)
    except Exception as e:
        print(f"❌ Error converting hex to bytes: {e}")
        return None

def check_special(value):
    """특수 값 체크"""
    if value in SPECIAL_VALUES:
        return SPECIAL_VALUES[value]
    return None

def to_float(value, default=None):
    """안전한 float 변환"""
    try:
        return float(value)
    except (ValueError, TypeError):
        return default

def decode_vvb001(hex_data):
    """VVB001 진동센서 데이터 디코딩 (빅 엔디안, 20바이트)"""
    try:
        if len(hex_data) != 40:  # 20바이트 = 40자
            print(f"⚠️ Invalid hex data length: {len(hex_data)}, expected 40")
            return None
        
        bytes_data = hex_to_bytes(hex_data)
        if bytes_data is None or len(bytes_data) != 20:
            return None
        
        # 빅 엔디안 형식으로 파싱
        # bytes[0:2]: v-RMS (signed int16)
        v_rms_raw = int.from_bytes(bytes_data[0:2], byteorder='big', signed=True)
        v_rms = v_rms_raw * 0.0001  # 스케일: 0.0001
        
        # bytes[4:6]: a-Peak (signed int16)
        a_peak_raw = int.from_bytes(bytes_data[4:6], byteorder='big', signed=True)
        a_peak = a_peak_raw * 0.1  # 스케일: 0.1
        
        # bytes[8:10]: a-RMS (signed int16)
        a_rms_raw = int.from_bytes(bytes_data[8:10], byteorder='big', signed=True)
        a_rms = a_rms_raw * 0.1  # 스케일: 0.1
        
        # bytes[10]: device status
        status_byte = bytes_data[10]
        device_status_code = (status_byte >> 4) & 0x07
        device_status = DEVICE_STATUS_MAP.get(device_status_code, f"Unknown({device_status_code})")
        out1 = bool(status_byte & 0x01)
        out2 = bool(status_byte & 0x02)
        
        # bytes[12:14]: temperature (signed int16)
        temp_raw = int.from_bytes(bytes_data[12:14], byteorder='big', signed=True)
        temperature = temp_raw * 0.1  # 스케일: 0.1
        
        # bytes[16:18]: crest (signed int16)
        crest_raw = int.from_bytes(bytes_data[16:18], byteorder='big', signed=True)
        crest = crest_raw * 0.1  # 스케일: 0.1
        
        # 특수 값 체크
        v_rms_special = check_special(v_rms_raw)
        a_peak_special = check_special(a_peak_raw)
        a_rms_special = check_special(a_rms_raw)
        temp_special = check_special(temp_raw)
        crest_special = check_special(crest_raw)
        
        return {
            'v_rms': v_rms if not v_rms_special else None,
            'a_peak': a_peak if not a_peak_special else None,
            'a_rms': a_rms if not a_rms_special else None,
            'temperature': temperature if not temp_special else None,
            'crest': crest if not crest_special else None,
            'device_status': device_status,
            'out1': out1,
            'out2': out2,
            'raw_values': {
                'v_rms': v_rms_raw,
                'a_peak': a_peak_raw,
                'a_rms': a_rms_raw,
                'temperature': temp_raw,
                'crest': crest_raw,
                'status_byte': status_byte
            },
            'special_values': {
                'v_rms': v_rms_special,
                'a_peak': a_peak_special,
                'a_rms': a_rms_special,
                'temperature': temp_special,
                'crest': crest_special
            }
        }
    except Exception as e:
        print(f"❌ Error decoding VVB001 data: {e}")
        import traceback
        traceback.print_exc()
        return None

# MQTT 클라이언트 설정
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"✅ MQTT Connected to {MQTT_BROKER}:{MQTT_PORT}")
        client.subscribe(MQTT_TOPIC)
        client.subscribe(VIBRATION_MQTT_TOPIC)
        print(f"✅ Subscribed to topic: {MQTT_TOPIC}")
        print(f"✅ Subscribed to topic: {VIBRATION_MQTT_TOPIC}")
    else:
        print(f"❌ MQTT Connection failed with code {rc}")

def on_message(client, userdata, msg):
    global last_mqtt_message_time
    try:
        last_mqtt_message_time = time.time()  # 메시지 수신 시간 기록
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
            # VVB001 진동센서 토픽 처리
            elif msg.topic == VIBRATION_MQTT_TOPIC:
                payload = data.get('data', {}).get('payload', {})
                hex_data = None
                
                # MQTT 메시지에서 센서 디바이스 정보 추출 시도 (별도 모듈 사용)
                try:
                    # 진동센서는 port 1에 연결되어 있음 (로그에서 확인)
                    extract_sensor_info_from_mqtt(data, payload, port='1')
                except Exception as e:
                    print(f"❌ 센서 정보 추출 중 오류: {e}")
                    import traceback
                    traceback.print_exc()
                
                # 여러 경로에서 pdin 데이터 찾기
                for path in PDIN_PATHS:
                    hex_data = payload.get(path, {}).get('data')
                    if hex_data:
                        break
                
                if hex_data:
                    # VVB001 디코딩
                    decoded_data = decode_vvb001(hex_data)
                    if decoded_data:
                        print(f"📳 Vibration data decoded: v_rms={decoded_data.get('v_rms')}, a_peak={decoded_data.get('a_peak')}, a_rms={decoded_data.get('a_rms')}")
                        
                        # 최신 데이터 업데이트
                        global latest_vibration_data
                        latest_vibration_data = {
                            **decoded_data,
                            'timestamp': time.time()
                        }
                        
                        # SSE로 전송할 데이터 큐에 추가
                        vibration_queue.put({
                            'v_rms': decoded_data.get('v_rms'),
                            'a_peak': decoded_data.get('a_peak'),
                            'a_rms': decoded_data.get('a_rms'),
                            'temperature': decoded_data.get('temperature'),
                            'crest': decoded_data.get('crest'),
                            'timestamp': time.time()
                        })
                        
                        # InfluxDB에 저장 (샘플링 레이트 적용)
                        save_vibration_to_influxdb(decoded_data)
                    else:
                        print("⚠️ Failed to decode VVB001 data")
                else:
                    print("⚠️ Hex data not found in VVB001 message structure")
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

# 진동센서 데이터를 InfluxDB에 저장
def save_vibration_to_influxdb(decoded_data):
    """진동센서 데이터를 InfluxDB에 저장 (샘플링 레이트 적용)"""
    global last_vibration_save_time
    
    if not write_api:
        print("⚠️ write_api is None, cannot save vibration data to InfluxDB")
        return
    
    current_time = time.time()
    # 샘플링 레이트 체크
    if current_time - last_vibration_save_time < VIBRATION_SAMPLING_INTERVAL:
        return
    
    try:
        last_vibration_save_time = current_time
        
        point = Point("vibration") \
            .tag("sensor_type", "VVB001") \
            .field("v_rms", float(decoded_data.get('v_rms', 0)) if decoded_data.get('v_rms') is not None else 0) \
            .field("a_peak", float(decoded_data.get('a_peak', 0)) if decoded_data.get('a_peak') is not None else 0) \
            .field("a_rms", float(decoded_data.get('a_rms', 0)) if decoded_data.get('a_rms') is not None else 0) \
            .field("temperature", float(decoded_data.get('temperature', 0)) if decoded_data.get('temperature') is not None else 0) \
            .field("crest", float(decoded_data.get('crest', 0)) if decoded_data.get('crest') is not None else 0) \
            .time(time.time_ns())
        
        # 먼저 vibration_data 버킷에 저장 시도
        try:
            write_api.write(bucket=VIBRATION_INFLUXDB_BUCKET, record=point)
            print(f"💾 Saved vibration data to InfluxDB (bucket: {VIBRATION_INFLUXDB_BUCKET}): v_rms={decoded_data.get('v_rms')}, a_peak={decoded_data.get('a_peak')}, a_rms={decoded_data.get('a_rms')}")
        except Exception as bucket_error:
            # 버킷이 없을 경우 temperature_data 버킷에 저장 (fallback)
            print(f"⚠️ Failed to write to {VIBRATION_INFLUXDB_BUCKET} bucket: {bucket_error}")
            print(f"⚠️ Trying to save to {INFLUXDB_BUCKET} bucket as fallback...")
            try:
                write_api.write(bucket=INFLUXDB_BUCKET, record=point)
                print(f"💾 Saved vibration data to {INFLUXDB_BUCKET} bucket as fallback")
            except Exception as e2:
                print(f"❌ Fallback write also failed: {e2}")
                raise e2
    except Exception as e:
        print(f"❌ InfluxDB vibration write error: {e}")
        import traceback
        traceback.print_exc()

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

@app.route('/api/iolink/device/info', methods=['GET'])
def get_iolink_device_info():
    """IO-Link Master에서 센서 디바이스 정보 가져오기 (MQTT에서 추출한 정보 우선 사용)"""
    try:
        port = request.args.get('port', '2', type=str)  # 기본값: port 2 (진동센서)
        
        # 먼저 MQTT에서 추출한 센서 정보 확인
        global sensor_device_info
        if sensor_device_info.get('connected') and sensor_device_info.get('last_updated'):
            # 최근 5분 이내에 업데이트된 정보가 있으면 사용
            if time.time() - sensor_device_info['last_updated'] < 300:
                return jsonify({
                    'port': sensor_device_info.get('port', port),
                    'connected': True,
                    'device_id': sensor_device_info.get('device_id'),
                    'vendor_id': sensor_device_info.get('vendor_id'),
                    'product_name': sensor_device_info.get('product_name'),
                    'serial_number': sensor_device_info.get('serial_number'),
                    'firmware_version': sensor_device_info.get('firmware_version'),
                    'device_name': sensor_device_info.get('device_name'),
                    'source': 'mqtt'
                })
        
        # MQTT에서 정보를 못 가져온 경우 REST API 시도
        base_url = f'http://{IOLINK_IP}'
        
        device_info = {
            'port': port,
            'connected': False,
            'device_id': None,
            'vendor_id': None,
            'product_name': None,
            'serial_number': None,
            'firmware_version': None,
            'device_name': None,
            'error': None,
            'source': 'rest_api'
        }
        
        try:
            # 웹 인터페이스 HTML에서 센서 정보 파싱
            response = requests.get(base_url, timeout=3)
            
            if response.status_code == 200:
                html_content = response.text
                port_num = int(port)
                
                # HTML 테이블에서 포트별 센서 정보 파싱
                # 테이블 구조: Port | Mode | Comm. Mode | MasterCycleTime | Vendor ID | Device ID | Name | Serial
                pattern = rf'<tr><td>{port_num}</td>.*?<td[^>]*>([^<]*)</td>.*?<td[^>]*>([^<]*)</td>.*?<td[^>]*>([^<]*)</td>.*?<td[^>]*>(.*?)</td>.*?<td[^>]*>(.*?)</td>.*?<td[^>]*>(.*?)</td>.*?<td[^>]*>([^<]*)</td>'
                match = re.search(pattern, html_content, re.DOTALL)
                
                if match:
                    device_info['connected'] = True
                    # 매칭된 그룹: Mode(1), Comm. Mode(2), MasterCycleTime(3), Vendor ID(4), Device ID(5), Name(6), Serial(7)
                    vendor_id = re.sub(r'<[^>]+>', '', match.group(4)).strip()
                    device_id = re.sub(r'<[^>]+>', '', match.group(5)).strip()
                    device_name = re.sub(r'<[^>]+>', '', match.group(6)).strip()
                    serial_number = re.sub(r'<[^>]+>', '', match.group(7)).strip()
                    
                    if vendor_id:
                        device_info['vendor_id'] = vendor_id
                    if device_id:
                        device_info['device_id'] = device_id
                    if device_name:
                        device_info['device_name'] = device_name
                        device_info['product_name'] = device_name
                    if serial_number:
                        device_info['serial_number'] = serial_number
                
                # 센서 디바이스의 펌웨어 버전은 HTML 테이블에 없으므로 제거
                # (IO-Link Master의 펌웨어 버전과 혼동 방지)
            
            # 개별 필드 조회 시도 (위에서 정보를 못 가져온 경우)
            if not device_info['connected']:
                field_paths = {
                    'device_id': [f'/api/v1/devices/{port}/deviceid', f'/api/devices/{port}/deviceid', f'/iolinkmaster/port[{port}]/iolinkdevice/deviceid'],
                    'vendor_id': [f'/api/v1/devices/{port}/vendorid', f'/api/devices/{port}/vendorid', f'/iolinkmaster/port[{port}]/iolinkdevice/vendorid'],
                    'product_name': [f'/api/v1/devices/{port}/productname', f'/api/devices/{port}/productname', f'/iolinkmaster/port[{port}]/iolinkdevice/productname'],
                    'serial_number': [f'/api/v1/devices/{port}/serialnumber', f'/api/devices/{port}/serialnumber', f'/iolinkmaster/port[{port}]/iolinkdevice/serialnumber'],
                    'firmware_version': [f'/api/v1/devices/{port}/firmwareversion', f'/api/devices/{port}/firmwareversion', f'/iolinkmaster/port[{port}]/iolinkdevice/firmwareversion']
                }
                
                for field, paths in field_paths.items():
                    for path in paths:
                        try:
                            response = requests.get(f'{base_url}{path}', timeout=2)
                            if response.status_code == 200:
                                device_info['connected'] = True
                                value = response.json()
                                # JSON 응답이 객체인 경우 value 필드 확인
                                if isinstance(value, dict):
                                    device_info[field] = value.get('value') or value.get('data') or str(value)
                                else:
                                    device_info[field] = str(value)
                                break
                        except:
                            continue
                            
        except requests.exceptions.RequestException as e:
            device_info['error'] = f'IO-Link Master 연결 실패: {str(e)}'
        except Exception as e:
            device_info['error'] = f'정보 조회 실패: {str(e)}'
        
        return jsonify(device_info)
    except Exception as e:
        print(f"❌ IO-Link 디바이스 정보 가져오기 실패: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'port': request.args.get('port', '2'),
            'connected': False,
            'error': str(e)
        }), 500

@app.route('/api/iolink/master/info', methods=['GET'])
def get_iolink_master_info_api():
    """IO-Link Master 자체의 정보 가져오기"""
    try:
        master_info = get_iolink_master_info(IOLINK_IP)
        return jsonify(master_info)
    except Exception as e:
        print(f"❌ IO-Link Master 정보 가져오기 실패: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'connected': False,
            'error': str(e)
        }), 500

@app.route('/api/network/status', methods=['GET'])
def network_status():
    """네트워크 연결 상태 확인 (MQTT, InfluxDB) 및 지연시간 측정"""
    import time
    
    status = {
        'mqtt': {
            'connected': False,
            'latency': None  # ms
        },
        'influxdb': {
            'connected': False,
            'latency': None  # ms
        }
    }
    
    # MQTT 연결 상태 확인 및 지연시간 측정
    if mqtt_client is not None:
        try:
            # MQTT 클라이언트의 연결 상태 확인
            # _state 속성 사용 (0=연결 안 됨, 1=연결 중, 2=연결됨)
            mqtt_connected = False
            if hasattr(mqtt_client, '_state'):
                mqtt_state = mqtt_client._state
                mqtt_connected = mqtt_state == mqtt.mqtt_cs_connected
            elif hasattr(mqtt_client, 'is_connected'):
                mqtt_connected = mqtt_client.is_connected()
            else:
                # fallback: MQTT 클라이언트가 초기화되어 있고 loop가 실행 중이면 연결된 것으로 간주
                try:
                    # _thread와 _state를 확인
                    if hasattr(mqtt_client, '_thread') and mqtt_client._thread and mqtt_client._thread.is_alive():
                        mqtt_connected = True
                except:
                    mqtt_connected = False
            
            status['mqtt']['connected'] = mqtt_connected
            
            # MQTT 지연시간 측정 (연결된 경우에만)
            if mqtt_connected:
                try:
                    # 마지막 메시지 수신 시간과 현재 시간의 차이로 지연시간 추정
                    if last_mqtt_message_time is not None:
                        # 마지막 메시지 수신 후 경과 시간 (초)
                        time_since_last_message = time.time() - last_mqtt_message_time
                        # 메시지가 최근에 수신되었다면 지연시간이 낮은 것으로 간주
                        # 5초 이내에 메시지가 수신되었다면 <5ms로 표시
                        if time_since_last_message < 5:
                            status['mqtt']['latency'] = round(time_since_last_message * 1000, 1)
                        else:
                            # 오래 전 메시지면 지연시간 측정 불가
                            status['mqtt']['latency'] = None
                    elif hasattr(mqtt_client, '_sock') and mqtt_client._sock:
                        # 소켓이 열려있지만 메시지가 없으면 연결만 된 상태
                        status['mqtt']['latency'] = None
                    else:
                        status['mqtt']['latency'] = None
                except:
                    status['mqtt']['latency'] = None
        except Exception as e:
            print(f"⚠️ MQTT status check error: {e}")
            status['mqtt']['connected'] = False
            status['mqtt']['latency'] = None
    else:
        status['mqtt']['connected'] = False
        status['mqtt']['latency'] = None
    
    # InfluxDB 연결 상태 확인 및 지연시간 측정
    if influx_client is not None:
        try:
            start_time = time.time()
            is_connected = influx_client.ping()
            latency = round((time.time() - start_time) * 1000, 1)  # ms로 변환
            
            status['influxdb']['connected'] = is_connected
            status['influxdb']['latency'] = latency if is_connected else None
        except Exception as e:
            print(f"⚠️ InfluxDB status check error: {e}")
            status['influxdb']['connected'] = False
            status['influxdb']['latency'] = None
    else:
        status['influxdb']['connected'] = False
        status['influxdb']['latency'] = None
    
    return jsonify(status)

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

@app.route('/api/latest/vibration', methods=['GET'])
def get_latest_vibration():
    """최신 진동 데이터 반환"""
    try:
        return jsonify(latest_vibration_data)
    except Exception as e:
        print(f"❌ Error getting latest vibration: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/influxdb/vibration', methods=['GET'])
def get_vibration_history():
    """InfluxDB에서 진동 데이터 조회 (range 파라미터로 시간 범위 지정)"""
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
        from(bucket: "{VIBRATION_INFLUXDB_BUCKET}")
          |> range(start: {start_time_str})
          |> filter(fn: (r) => r["_measurement"] == "vibration")
          |> filter(fn: (r) => r["_field"] == "v_rms" or r["_field"] == "a_peak" or r["_field"] == "a_rms" or r["_field"] == "crest" or r["_field"] == "temperature")
          |> aggregateWindow(every: {window_interval}, fn: mean, createEmpty: true)
          |> yield(name: "mean")
        '''
        
        try:
            result = query_api.query(org=INFLUXDB_ORG, query=query)
        except Exception as bucket_error:
            # vibration_data 버킷이 없으면 temperature_data 버킷에서 조회
            print(f"⚠️ Failed to query {VIBRATION_INFLUXDB_BUCKET} bucket: {bucket_error}")
            print(f"⚠️ Trying to query {INFLUXDB_BUCKET} bucket as fallback...")
            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
              |> range(start: {start_time_str})
              |> filter(fn: (r) => r["_measurement"] == "vibration")
              |> filter(fn: (r) => r["_field"] == "v_rms" or r["_field"] == "a_peak" or r["_field"] == "a_rms" or r["_field"] == "crest" or r["_field"] == "temperature")
              |> aggregateWindow(every: {window_interval}, fn: mean, createEmpty: true)
              |> yield(name: "mean")
            '''
            result = query_api.query(org=INFLUXDB_ORG, query=query)
        
        # 데이터 구조화
        timestamps = []
        v_rms_values = []
        a_peak_values = []
        a_rms_values = []
        crest_values = []
        temperature_values = []
        
        # 각 필드별로 데이터 수집
        for table in result:
            for record in table.records:
                timestamp_ms = int(record.get_time().timestamp() * 1000)
                field = record.get_field()
                value = record.get_value()
                
                if timestamp_ms not in timestamps:
                    timestamps.append(timestamp_ms)
                    v_rms_values.append(None)
                    a_peak_values.append(None)
                    a_rms_values.append(None)
                    crest_values.append(None)
                    temperature_values.append(None)
                
                idx = timestamps.index(timestamp_ms)
                
                if field == 'v_rms':
                    v_rms_values[idx] = value
                elif field == 'a_peak':
                    a_peak_values[idx] = value
                elif field == 'a_rms':
                    a_rms_values[idx] = value
                elif field == 'crest':
                    crest_values[idx] = value
                elif field == 'temperature':
                    temperature_values[idx] = value
        
        # 타임스탬프와 값들을 정렬
        sorted_data = sorted(zip(timestamps, v_rms_values, a_peak_values, a_rms_values, crest_values, temperature_values))
        if sorted_data:
            timestamps, v_rms_values, a_peak_values, a_rms_values, crest_values, temperature_values = zip(*sorted_data)
        else:
            timestamps, v_rms_values, a_peak_values, a_rms_values, crest_values, temperature_values = [], [], [], [], [], []
        
        return jsonify({
            'timestamps': list(timestamps),
            'v_rms': list(v_rms_values),
            'a_peak': list(a_peak_values),
            'a_rms': list(a_rms_values),
            'crest': list(crest_values),
            'temperature': list(temperature_values)
        })
    except Exception as e:
        print(f"❌ Error getting vibration history: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/mqtt/vibration', methods=['GET'])
def stream_vibration():
    """Server-Sent Events를 통해 실시간 진동 데이터 스트리밍"""
    def generate():
        try:
            while True:
                try:
                    # 큐에서 메시지 가져오기 (타임아웃 1초)
                    try:
                        data = vibration_queue.get(timeout=1)
                        yield f"data: {json.dumps(data)}\n\n"
                    except queue.Empty:
                        # 하트비트 전송 (연결 유지)
                        yield f"data: {json.dumps({'heartbeat': True})}\n\n"
                except GeneratorExit:
                    print("SSE vibration connection closed by client")
                    break
                except Exception as e:
                    print(f"Error in vibration stream: {e}")
                    import traceback
                    traceback.print_exc()
                    break
        except Exception as e:
            print(f"Fatal error in vibration generate: {e}")
            import traceback
            traceback.print_exc()
    
    response = Response(stream_with_context(generate()), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response

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

@app.route('/api/export/vibration/csv', methods=['GET'])
def export_vibration_csv():
    """진동센서 데이터를 CSV 파일로 내보내기 (KST 시간 범위 지정)"""
    if not query_api:
        return jsonify({'error': 'InfluxDB 쿼리 API가 초기화되지 않았습니다.'}), 500
    
    try:
        # 1. KST 시간 파라미터 받기
        start_time_kst_str = request.args.get('start_time_kst')  # "YYYY-MM-DD HH:MM:SS"
        end_time_kst_str = request.args.get('end_time_kst')
        
        if not start_time_kst_str or not end_time_kst_str:
            return jsonify({'error': '시작 시간과 종료 시간이 필요합니다.'}), 400
        
        print(f"📥 진동센서 CSV 다운로드 요청: start_time_kst={start_time_kst_str}, end_time_kst={end_time_kst_str}")
        
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
        
        # 5. InfluxDB Flux 쿼리 실행 (모든 진동 필드 조회)
        query = f'''
        from(bucket: "{VIBRATION_INFLUXDB_BUCKET}")
          |> range(start: {start_rfc}, stop: {end_rfc})
          |> filter(fn: (r) => r["_measurement"] == "vibration")
          |> filter(fn: (r) => r["_field"] == "v_rms" or r["_field"] == "a_peak" or r["_field"] == "a_rms" or r["_field"] == "crest")
          |> sort(columns: ["_time"])
        '''
        
        print(f"📊 Flux 쿼리:\n{query}")
        
        try:
            result = query_api.query(org=INFLUXDB_ORG, query=query)
        except Exception as bucket_error:
            # vibration_data 버킷이 없으면 temperature_data 버킷에서 조회
            print(f"⚠️ Failed to query {VIBRATION_INFLUXDB_BUCKET} bucket: {bucket_error}")
            print(f"⚠️ Trying to query {INFLUXDB_BUCKET} bucket as fallback...")
            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
              |> range(start: {start_rfc}, stop: {end_rfc})
              |> filter(fn: (r) => r["_measurement"] == "vibration")
              |> filter(fn: (r) => r["_field"] == "v_rms" or r["_field"] == "a_peak" or r["_field"] == "a_rms" or r["_field"] == "crest")
              |> sort(columns: ["_time"])
            '''
            result = query_api.query(org=INFLUXDB_ORG, query=query)
        
        # 6. 데이터를 시간별로 그룹화하여 CSV 생성
        # 시간별로 모든 필드를 하나의 행에 모음
        data_by_time = {}
        
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
                
                # 시간을 키로 사용
                time_key = time_utc_naive.strftime('%Y-%m-%d %H:%M:%S')
                
                if time_key not in data_by_time:
                    # UTC → KST 변환 (UTC+9)
                    time_kst = time_utc_naive + timedelta(hours=9)
                    data_by_time[time_key] = {
                        'time_utc': time_utc_naive,
                        'time_kst': time_kst,
                        'v_rms': None,
                        'a_peak': None,
                        'a_rms': None,
                        'crest': None
                    }
                
                # 필드 값 저장
                field = record.get_field()
                value = record.get_value()
                if field in data_by_time[time_key]:
                    data_by_time[time_key][field] = value
        
        # 7. CSV 생성
        output = io.StringIO()
        writer = csv.writer(output)
        
        # UTF-8 BOM 추가 (Excel 호환성)
        output.write('\ufeff')
        
        # 헤더 작성
        writer.writerow(['Time (UTC)', 'Time (KST)', 'v-RMS (mm/s)', 'a-Peak (m/s²)', 'a-RMS (m/s²)', 'Crest'])
        
        # 데이터 행 추가 (시간순 정렬)
        row_count = 0
        for time_key in sorted(data_by_time.keys()):
            row_data = data_by_time[time_key]
            time_utc_str = row_data['time_utc'].strftime('%Y-%m-%d %H:%M:%S')
            time_kst_str = row_data['time_kst'].strftime('%Y-%m-%d %H:%M:%S')
            
            # 값 포맷팅 (None이면 "--"로 표시)
            v_rms = '--' if row_data['v_rms'] is None else f"{row_data['v_rms']:.4f}"
            a_peak = '--' if row_data['a_peak'] is None else f"{row_data['a_peak']:.2f}"
            a_rms = '--' if row_data['a_rms'] is None else f"{row_data['a_rms']:.2f}"
            crest = '--' if row_data['crest'] is None else f"{row_data['crest']:.2f}"
            
            writer.writerow([time_utc_str, time_kst_str, v_rms, a_peak, a_rms, crest])
            row_count += 1
        
        print(f"📈 조회된 레코드 수: {row_count}")
        
        # 데이터가 없는 경우
        if row_count == 0:
            return jsonify({'error': '선택한 시간 범위에 데이터가 없습니다.'}), 404
        
        # 파일명 생성
        filename_start = start_time_kst_str.replace('-', '').replace(':', '').replace(' ', '_')
        filename_end = end_time_kst_str.replace('-', '').replace(':', '').replace(' ', '_')
        filename = f'vibration_{filename_start}_{filename_end}.csv'
        
        # UTF-8 BOM 포함하여 인코딩
        csv_content = output.getvalue()
        csv_bytes = csv_content.encode('utf-8')
        
        # HTTP 응답 생성
        response = make_response(csv_bytes)
        response.headers['Content-Type'] = 'text/csv; charset=utf-8'
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.headers['Content-Length'] = len(csv_bytes)
        
        print(f"✅ 진동센서 CSV 생성 완료: {row_count}개 행, 파일명: {filename}")
        
        return response
        
    except ValueError as e:
        return jsonify({'error': f'시간 형식이 올바르지 않습니다. 형식: YYYY-MM-DD HH:MM:SS. 오류: {e}'}), 400
    except Exception as e:
        print(f"❌ 진동센서 CSV 내보내기 실패: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# AI 관련 API 엔드포인트
@app.route('/api/ai/augmented/temperature', methods=['GET'])
def get_augmented_temperature():
    """증강된 온도 데이터 조회"""
    try:
        if influx_client is None:
            return jsonify({'error': 'InfluxDB not connected'}), 500
        
        range_param = request.args.get('range', '1h')
        query_api = influx_client.query_api()
        
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
            start_time = now - timedelta(hours=1)
            window_interval = '10s'
        
        start_time_str = start_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        query = f'''
        from(bucket: "temperature_augmented")
          |> range(start: {start_time_str})
          |> filter(fn: (r) => r["_measurement"] == "temperature")
          |> filter(fn: (r) => r["_field"] == "value")
          |> aggregateWindow(every: {window_interval}, fn: mean, createEmpty: true)
          |> yield(name: "mean")
        '''
        
        result = query_api.query(org=INFLUXDB_ORG, query=query)
        
        timestamps = []
        values = []
        
        for table in result:
            for record in table.records:
                timestamp = record.get_time().timestamp() * 1000
                value = record.get_value()
                timestamps.append(timestamp)
                values.append(value if value is not None else None)
        
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
        print(f"❌ Error querying augmented temperature: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/augmented/vibration', methods=['GET'])
def get_augmented_vibration():
    """증강된 진동 데이터 조회"""
    try:
        if influx_client is None:
            return jsonify({'error': 'InfluxDB not connected'}), 500
        
        range_param = request.args.get('range', '1h')
        query_api = influx_client.query_api()
        
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
            start_time = now - timedelta(hours=1)
            window_interval = '10s'
        
        start_time_str = start_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        query = f'''
        from(bucket: "vibration_augmented")
          |> range(start: {start_time_str})
          |> filter(fn: (r) => r["_measurement"] == "vibration")
          |> filter(fn: (r) => r["_field"] == "v_rms" or r["_field"] == "a_peak" or r["_field"] == "a_rms" or r["_field"] == "crest" or r["_field"] == "temperature")
          |> aggregateWindow(every: {window_interval}, fn: mean, createEmpty: true)
          |> yield(name: "mean")
        '''
        
        result = query_api.query(org=INFLUXDB_ORG, query=query)
        
        timestamps = []
        v_rms_values = []
        a_peak_values = []
        a_rms_values = []
        crest_values = []
        temperature_values = []
        
        for table in result:
            for record in table.records:
                timestamp_ms = int(record.get_time().timestamp() * 1000)
                field = record.get_field()
                value = record.get_value()
                
                if timestamp_ms not in timestamps:
                    timestamps.append(timestamp_ms)
                    v_rms_values.append(None)
                    a_peak_values.append(None)
                    a_rms_values.append(None)
                    crest_values.append(None)
                    temperature_values.append(None)
                
                idx = timestamps.index(timestamp_ms)
                
                if field == 'v_rms':
                    v_rms_values[idx] = value
                elif field == 'a_peak':
                    a_peak_values[idx] = value
                elif field == 'a_rms':
                    a_rms_values[idx] = value
                elif field == 'crest':
                    crest_values[idx] = value
                elif field == 'temperature':
                    temperature_values[idx] = value
        
        sorted_data = sorted(zip(timestamps, v_rms_values, a_peak_values, a_rms_values, crest_values, temperature_values))
        if sorted_data:
            timestamps, v_rms_values, a_peak_values, a_rms_values, crest_values, temperature_values = zip(*sorted_data)
        else:
            timestamps, v_rms_values, a_peak_values, a_rms_values, crest_values, temperature_values = [], [], [], [], [], []
        
        return jsonify({
            'timestamps': list(timestamps),
            'v_rms': list(v_rms_values),
            'a_peak': list(a_peak_values),
            'a_rms': list(a_rms_values),
            'crest': list(crest_values),
            'temperature': list(temperature_values)
        })
    except Exception as e:
        print(f"❌ Error querying augmented vibration: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/original/temperature', methods=['GET'])
def get_original_temperature():
    """원본 온도 데이터 조회"""
    try:
        if influx_client is None:
            return jsonify({'error': 'InfluxDB not connected'}), 500
        
        range_param = request.args.get('range', '1h')
        query_api = influx_client.query_api()
        
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
            start_time = now - timedelta(hours=1)
            window_interval = '10s'
        
        start_time_str = start_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        query = f'''
        from(bucket: "{INFLUXDB_BUCKET}")
          |> range(start: {start_time_str})
          |> filter(fn: (r) => r["_measurement"] == "temperature")
          |> filter(fn: (r) => r["_field"] == "value")
          |> aggregateWindow(every: {window_interval}, fn: mean, createEmpty: true)
          |> yield(name: "mean")
        '''
        
        result = query_api.query(org=INFLUXDB_ORG, query=query)
        
        timestamps = []
        values = []
        
        for table in result:
            for record in table.records:
                timestamp = record.get_time().timestamp() * 1000
                value = record.get_value()
                timestamps.append(timestamp)
                values.append(value if value is not None else None)
        
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
        print(f"❌ Error querying original temperature: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/original/vibration', methods=['GET'])
def get_original_vibration():
    """원본 진동 데이터 조회"""
    try:
        if influx_client is None:
            return jsonify({'error': 'InfluxDB not connected'}), 500
        
        range_param = request.args.get('range', '1h')
        query_api = influx_client.query_api()
        
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
            start_time = now - timedelta(hours=1)
            window_interval = '10s'
        
        start_time_str = start_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        query = f'''
        from(bucket: "{VIBRATION_INFLUXDB_BUCKET}")
          |> range(start: {start_time_str})
          |> filter(fn: (r) => r["_measurement"] == "vibration")
          |> filter(fn: (r) => r["_field"] == "v_rms" or r["_field"] == "a_peak" or r["_field"] == "a_rms" or r["_field"] == "crest" or r["_field"] == "temperature")
          |> aggregateWindow(every: {window_interval}, fn: mean, createEmpty: true)
          |> yield(name: "mean")
        '''
        
        try:
            result = query_api.query(org=INFLUXDB_ORG, query=query)
        except Exception as bucket_error:
            # vibration_data 버킷이 없으면 temperature_data 버킷에서 조회
            print(f"⚠️ Failed to query {VIBRATION_INFLUXDB_BUCKET} bucket: {bucket_error}")
            print(f"⚠️ Trying to query {INFLUXDB_BUCKET} bucket as fallback...")
            try:
                query = f'''
                from(bucket: "{INFLUXDB_BUCKET}")
                  |> range(start: {start_time_str})
                  |> filter(fn: (r) => r["_measurement"] == "vibration")
                  |> filter(fn: (r) => r["_field"] == "v_rms" or r["_field"] == "a_peak" or r["_field"] == "a_rms" or r["_field"] == "crest" or r["_field"] == "temperature")
                  |> aggregateWindow(every: {window_interval}, fn: mean, createEmpty: true)
                  |> yield(name: "mean")
                '''
                result = query_api.query(org=INFLUXDB_ORG, query=query)
            except Exception as fallback_error:
                print(f"❌ Failed to query fallback bucket: {fallback_error}")
                # 빈 데이터 반환
                return jsonify({
                    'timestamps': [],
                    'v_rms': [],
                    'a_peak': [],
                    'a_rms': [],
                    'crest': [],
                    'temperature': []
                })
        
        timestamps = []
        v_rms_values = []
        a_peak_values = []
        a_rms_values = []
        crest_values = []
        temperature_values = []
        
        for table in result:
            for record in table.records:
                timestamp_ms = int(record.get_time().timestamp() * 1000)
                field = record.get_field()
                value = record.get_value()
                
                if timestamp_ms not in timestamps:
                    timestamps.append(timestamp_ms)
                    v_rms_values.append(None)
                    a_peak_values.append(None)
                    a_rms_values.append(None)
                    crest_values.append(None)
                    temperature_values.append(None)
                
                idx = timestamps.index(timestamp_ms)
                
                if field == 'v_rms':
                    v_rms_values[idx] = value
                elif field == 'a_peak':
                    a_peak_values[idx] = value
                elif field == 'a_rms':
                    a_rms_values[idx] = value
                elif field == 'crest':
                    crest_values[idx] = value
                elif field == 'temperature':
                    temperature_values[idx] = value
        
        sorted_data = sorted(zip(timestamps, v_rms_values, a_peak_values, a_rms_values, crest_values, temperature_values))
        if sorted_data:
            timestamps, v_rms_values, a_peak_values, a_rms_values, crest_values, temperature_values = zip(*sorted_data)
        else:
            timestamps, v_rms_values, a_peak_values, a_rms_values, crest_values, temperature_values = [], [], [], [], [], []
        
        return jsonify({
            'timestamps': list(timestamps),
            'v_rms': list(v_rms_values),
            'a_peak': list(a_peak_values),
            'a_rms': list(a_rms_values),
            'crest': list(crest_values),
            'temperature': list(temperature_values)
        })
    except Exception as e:
        print(f"❌ Error querying original vibration: {e}")
        import traceback
        traceback.print_exc()
        # 에러가 발생해도 빈 데이터 반환 (500 에러 대신)
        return jsonify({
            'timestamps': [],
            'v_rms': [],
            'a_peak': [],
            'a_rms': [],
            'crest': [],
            'temperature': [],
            'error': str(e)
        })

@app.route('/api/ai/augment/temperature', methods=['POST'])
def run_temperature_augmentation():
    """온도 데이터 증강 실행"""
    return run_data_augmentation('temperature')

@app.route('/api/ai/augment/vibration', methods=['POST'])
def run_vibration_augmentation():
    """진동 데이터 증강 실행"""
    return run_data_augmentation('vibration')

@app.route('/api/ai/augment/stop', methods=['POST'])
def stop_augmentation():
    """증강 프로세스 종료"""
    try:
        import os
        import subprocess
        import time
        import json
        
        killed_count = 0
        killed_pids = []
        
        # psutil 사용 시도, 없으면 시스템 명령어 사용
        try:
            import psutil
            use_psutil = True
        except ImportError:
            use_psutil = False
            print("⚠️ psutil이 없어 시스템 명령어를 사용합니다.")
        
        if use_psutil:
            # psutil 사용
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    cmdline = proc.info.get('cmdline', [])
                    if cmdline and 'data_augmentation.py' in ' '.join(cmdline):
                        pid = proc.info['pid']
                        print(f"🛑 증강 프로세스 종료: PID {pid}")
                        proc.terminate()
                        killed_count += 1
                        killed_pids.append(pid)
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
        else:
            # 시스템 명령어 사용 (Linux)
            try:
                # pgrep으로 data_augmentation.py를 실행하는 프로세스 찾기
                result = subprocess.run(
                    ['pgrep', '-f', 'data_augmentation.py'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if result.returncode == 0:
                    pids = result.stdout.strip().split('\n')
                    for pid_str in pids:
                        if pid_str.strip():
                            try:
                                pid = int(pid_str.strip())
                                print(f"🛑 증강 프로세스 발견: PID {pid}")
                                killed_pids.append(pid)
                                killed_count += 1
                            except ValueError:
                                pass
            except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError) as e:
                print(f"⚠️ 프로세스 검색 실패: {e}")
                # ps 명령어로 시도
                try:
                    result = subprocess.run(
                        ['ps', 'aux'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if result.returncode == 0:
                        for line in result.stdout.split('\n'):
                            if 'data_augmentation.py' in line:
                                parts = line.split()
                                if len(parts) > 1:
                                    try:
                                        pid = int(parts[1])
                                        print(f"🛑 증강 프로세스 발견: PID {pid}")
                                        killed_pids.append(pid)
                                        killed_count += 1
                                    except (ValueError, IndexError):
                                        pass
                except Exception as e2:
                    print(f"⚠️ ps 명령어도 실패: {e2}")
        
        if killed_count > 0:
            # 프로세스 종료
            for pid in killed_pids:
                try:
                    if use_psutil:
                        proc = psutil.Process(pid)
                        proc.terminate()
                    else:
                        # SIGTERM 신호 전송
                        subprocess.run(['kill', '-TERM', str(pid)], timeout=2)
                except Exception as e:
                    print(f"⚠️ 프로세스 {pid} 종료 실패: {e}")
            
            # 프로세스 종료 대기
            time.sleep(1)
            
            # 강제 종료가 필요한 프로세스 확인
            for pid in killed_pids:
                try:
                    if use_psutil:
                        proc = psutil.Process(pid)
                        if proc.is_running():
                            print(f"⚠️ 프로세스 {pid}가 종료되지 않아 강제 종료합니다.")
                            proc.kill()
                    else:
                        # 프로세스가 여전히 실행 중인지 확인하고 강제 종료
                        try:
                            subprocess.run(['kill', '-0', str(pid)], timeout=1, check=True)
                            # 프로세스가 살아있으면 강제 종료
                            print(f"⚠️ 프로세스 {pid}가 종료되지 않아 강제 종료합니다.")
                            subprocess.run(['kill', '-KILL', str(pid)], timeout=2)
                        except subprocess.CalledProcessError:
                            # 프로세스가 이미 종료됨
                            pass
                except Exception as e:
                    print(f"⚠️ 프로세스 {pid} 강제 종료 실패: {e}")
            
            # 진행률 파일 초기화
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            simpac_dir = os.path.join(backend_dir, '..', '..')
            ai_ml_path = os.path.join(simpac_dir, 'ai_ml')
            progress_file = os.path.join(ai_ml_path, 'data', 'augment_progress.json')
            progress_file = os.path.abspath(progress_file)
            try:
                os.makedirs(os.path.dirname(progress_file), exist_ok=True)
                with open(progress_file, 'w', encoding='utf-8') as f:
                    json.dump({
                        'stage': 'stopped',
                        'progress': 0,
                        'message': '증강이 중지되었습니다.'
                    }, f)
            except Exception as e:
                print(f"⚠️ 진행률 파일 초기화 실패 (무시): {e}")
            
            print(f"✅ {killed_count}개의 증강 프로세스 종료됨")
            return jsonify({
                'status': 'stopped',
                'message': f'{killed_count}개의 증강 프로세스가 종료되었습니다.',
                'killed_count': killed_count
            })
        else:
            return jsonify({
                'status': 'not_found',
                'message': '실행 중인 증강 프로세스가 없습니다.'
            })
            
    except Exception as e:
        print(f"❌ 증강 프로세스 종료 오류: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def run_data_augmentation(data_type='both'):
    """데이터 증강 실행 (온도/진동 각각 또는 둘 다)"""
    try:
        import sys
        import os
        import subprocess
        
        # ai_ml 스크립트 경로 (SIMPAC 폴더 기준)
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        simpac_dir = os.path.join(backend_dir, '..', '..')
        ai_ml_path = os.path.join(simpac_dir, 'ai_ml')
        script_path = os.path.join(ai_ml_path, 'scripts', 'data_augmentation.py')
        
        # 절대 경로로 변환
        script_path = os.path.abspath(script_path)
        ai_ml_path = os.path.abspath(ai_ml_path)
        
        if not os.path.exists(script_path):
            print(f"❌ 스크립트 파일 없음: {script_path}")
            print(f"   ai_ml_path: {ai_ml_path}")
            print(f"   존재 여부: {os.path.exists(ai_ml_path)}")
            return jsonify({'error': f'데이터 증강 스크립트를 찾을 수 없습니다: {script_path}'}), 404
        
        print(f"✅ 스크립트 파일 확인: {script_path}")
        
        # 백그라운드에서 실행
        def run_augmentation():
            try:
                print(f"🚀 데이터 증강 스크립트 실행 시작: {script_path}")
                print(f"📁 작업 디렉토리: {ai_ml_path}")
                
                # Python 경로 찾기 (ai_ml venv 우선, 없으면 백엔드 venv, 마지막으로 시스템 python3)
                python_path = 'python3'
                ai_ml_venv = os.path.join(ai_ml_path, 'venv', 'bin', 'python3')
                backend_venv = os.path.join(os.path.dirname(__file__), 'venv', 'bin', 'python3')
                
                # 절대 경로로 변환
                ai_ml_venv = os.path.abspath(ai_ml_venv)
                backend_venv = os.path.abspath(backend_venv)
                
                if os.path.exists(ai_ml_venv):
                    python_path = ai_ml_venv
                    print(f"✅ ai_ml venv Python 사용: {python_path}")
                    # venv 존재 확인
                    if not os.path.exists(python_path):
                        print(f"❌ Python 경로가 존재하지 않습니다: {python_path}")
                        raise FileNotFoundError(f"Python 경로를 찾을 수 없습니다: {python_path}")
                elif os.path.exists(backend_venv):
                    python_path = backend_venv
                    print(f"✅ 백엔드 venv Python 사용: {python_path}")
                else:
                    print(f"⚠️ 시스템 Python 사용: {python_path}")
                    # 시스템 Python도 절대 경로로 변환 시도
                    import shutil
                    system_python = shutil.which('python3')
                    if system_python:
                        python_path = system_python
                        print(f"   시스템 Python 경로: {python_path}")
                
                # 환경 변수 설정
                env = os.environ.copy()
                # venv가 있으면 PATH에 추가하고 PYTHONPATH 설정
                if os.path.exists(ai_ml_venv):
                    venv_bin = os.path.dirname(ai_ml_venv)
                    venv_lib = os.path.join(os.path.dirname(venv_bin), 'lib')
                    # Python 버전에 맞는 site-packages 경로 찾기
                    python_version = f"python{os.sys.version_info.major}.{os.sys.version_info.minor}"
                    site_packages = os.path.join(venv_lib, python_version, 'site-packages')
                    env['PATH'] = f"{venv_bin}:{env.get('PATH', '')}"
                    if os.path.exists(site_packages):
                        env['PYTHONPATH'] = f"{site_packages}:{env.get('PYTHONPATH', '')}"
                    print(f"✅ 환경 변수 설정: PATH={venv_bin}, PYTHONPATH={site_packages if os.path.exists(site_packages) else 'N/A'}")
                elif os.path.exists(backend_venv):
                    venv_bin = os.path.dirname(backend_venv)
                    env['PATH'] = f"{venv_bin}:{env.get('PATH', '')}"
                
                # Python 경로 확인 및 테스트
                try:
                    import subprocess as sp
                    # 실제 사용할 Python 경로로 테스트
                    test_cmd = [python_path, '-c', 'import sys; print(sys.executable); import numpy; print("numpy OK")']
                    test_result = sp.run(test_cmd, 
                                       capture_output=True, text=True, timeout=10, env=env, cwd=ai_ml_path)
                    print(f"🔍 Python 테스트 결과:")
                    print(f"   명령: {' '.join(test_cmd)}")
                    print(f"   반환 코드: {test_result.returncode}")
                    print(f"   stdout: {test_result.stdout}")
                    if test_result.returncode != 0:
                        print(f"   ⚠️ stderr: {test_result.stderr}")
                    else:
                        print(f"✅ Python 경로 테스트 성공: {python_path}")
                except Exception as e:
                    print(f"⚠️ Python 경로 테스트 중 오류: {e}")
                    import traceback
                    traceback.print_exc()
                
                # 비동기 실행 (Popen 사용)
                print(f"🚀 프로세스 시작: {python_path} {script_path}")
                print(f"📁 작업 디렉토리: {ai_ml_path}")
                print(f"🔧 환경 변수:")
                print(f"   PATH: {env.get('PATH', 'N/A')[:100]}...")
                print(f"   PYTHONPATH: {env.get('PYTHONPATH', 'N/A')}")
                
                # 절대 경로로 변환
                python_path_abs = os.path.abspath(python_path) if not os.path.isabs(python_path) else python_path
                script_path_abs = os.path.abspath(script_path)
                
                # 데이터 타입을 환경 변수로 전달
                env['AUGMENT_TYPE'] = data_type
                
                process = subprocess.Popen(
                    [python_path_abs, script_path_abs],
                    cwd=ai_ml_path,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    env=env,
                    bufsize=1  # 라인 버퍼링
                )
                
                print(f"✅ 프로세스 시작됨 (PID: {process.pid})")
                print(f"   Python: {python_path_abs}")
                print(f"   Script: {script_path_abs}")
                
                # 비동기로 출력 읽기
                def read_output():
                    try:
                        for line in process.stdout:
                            line_str = line.strip()
                            if line_str:
                                print(f"[증강] {line_str}")
                    except Exception as e:
                        print(f"⚠️ 출력 읽기 오류: {e}")
                        import traceback
                        traceback.print_exc()
                
                def read_error():
                    try:
                        error_lines = []
                        for line in process.stderr:
                            line_str = line.strip()
                            if line_str:
                                error_lines.append(line_str)
                                print(f"[증강-에러] {line_str}")
                        
                        # 프로세스 종료 후 에러가 있으면 상세 출력
                        if error_lines:
                            print(f"❌ 총 {len(error_lines)}개의 에러 라인 발견")
                    except Exception as e:
                        print(f"⚠️ 에러 읽기 오류: {e}")
                        import traceback
                        traceback.print_exc()
                
                # 출력을 별도 스레드에서 읽기
                import threading
                stdout_thread = threading.Thread(target=read_output, daemon=True)
                stderr_thread = threading.Thread(target=read_error, daemon=True)
                stdout_thread.start()
                stderr_thread.start()
                
                # 프로세스를 완전히 백그라운드로 실행 (wait() 제거)
                # 진행률은 파일로 추적하므로 프로세스를 기다리지 않음
                print(f"✅ 프로세스가 백그라운드에서 실행 중입니다 (PID: {process.pid})")
                print(f"📊 진행률은 /api/ai/progress/augment로 확인하세요")
                
                # 프로세스 완료를 별도 스레드에서 처리 (선택사항)
                def wait_for_completion():
                    return_code = process.wait()
                    if return_code != 0:
                        print(f"❌ 데이터 증강 오류 (코드: {return_code})")
                    else:
                        print(f"✅ 데이터 증강 완료")
                
                completion_thread = threading.Thread(target=wait_for_completion, daemon=True)
                completion_thread.start()
                    
            except FileNotFoundError as e:
                print(f"❌ 파일을 찾을 수 없음: {e}")
                print(f"   스크립트 경로: {script_path}")
                print(f"   존재 여부: {os.path.exists(script_path)}")
            except Exception as e:
                print(f"❌ 데이터 증강 실행 오류: {e}")
                import traceback
                traceback.print_exc()
        
        # 별도 스레드에서 실행
        import threading
        thread = threading.Thread(target=run_augmentation, daemon=True)
        thread.start()
        
        data_type_name = {'temperature': '온도', 'vibration': '진동', 'both': '온도 및 진동'}.get(data_type, '데이터')
        return jsonify({
            'status': 'started',
            'message': f'{data_type_name} 데이터 증강이 시작되었습니다. 완료까지 몇 분이 소요될 수 있습니다.',
            'data_type': data_type,
            'progress_file': os.path.join(ai_ml_path, 'data', 'augment_progress.json')
        })
        
    except Exception as e:
        print(f"❌ 데이터 증강 API 오류: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/train', methods=['POST'])
def train_model():
    """모델 학습 실행"""
    try:
        import sys
        import os
        import subprocess
        
        # 요청에서 모델 타입 및 데이터 소스 가져오기 (기본값: lstm, 증강 데이터)
        model_type = 'lstm'
        use_original_temp = False
        use_original_vib = False
        
        if request.is_json:
            data = request.get_json()
            model_type = data.get('model_type', 'lstm')
            use_original_temp = data.get('use_original_temp', False)
            use_original_vib = data.get('use_original_vib', False)
        
        # 유효한 모델 타입 확인
        valid_models = ['lstm', 'gru', 'transformer']
        if model_type not in valid_models:
            return jsonify({'error': f'유효하지 않은 모델 타입입니다. 가능한 값: {", ".join(valid_models)}'}), 400
        
        # ai_ml 스크립트 경로 (SIMPAC 폴더 기준)
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        simpac_dir = os.path.join(backend_dir, '..', '..')
        ai_ml_path = os.path.join(simpac_dir, 'ai_ml')
        script_path = os.path.join(ai_ml_path, 'scripts', 'train_model.py')
        
        # 절대 경로로 변환
        script_path = os.path.abspath(script_path)
        ai_ml_path = os.path.abspath(ai_ml_path)
        
        if not os.path.exists(script_path):
            return jsonify({'error': f'모델 학습 스크립트를 찾을 수 없습니다: {script_path}'}), 404
        
        # 기존 학습 프로세스 종료
        try:
            import psutil
            killed_count = 0
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    cmdline = proc.info.get('cmdline', [])
                    if cmdline and 'train_model.py' in ' '.join(cmdline):
                        print(f"🛑 기존 학습 프로세스 종료: PID {proc.info['pid']}")
                        proc.terminate()
                        killed_count += 1
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            
            if killed_count > 0:
                print(f"✅ {killed_count}개의 기존 학습 프로세스 종료됨")
                import time
                time.sleep(2)  # 프로세스 종료 대기
        except ImportError:
            print("⚠️ psutil이 없어 기존 프로세스를 확인할 수 없습니다.")
        except Exception as e:
            print(f"⚠️ 기존 프로세스 종료 중 오류 (무시): {e}")
        
        # 이전 진행률 파일 초기화 (에러 상태 제거)
        progress_file = os.path.join(ai_ml_path, 'data', 'train_progress.json')
        progress_file = os.path.abspath(progress_file)
        try:
            import json
            os.makedirs(os.path.dirname(progress_file), exist_ok=True)
            with open(progress_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'stage': 'not_started',
                    'progress': 0,
                    'message': '학습 시작 중...'
                }, f)
        except Exception as e:
            print(f"⚠️ 진행률 파일 초기화 실패 (무시): {e}")
        
        # 백그라운드에서 실행
        def run_training():
            try:
                print(f"🚀 모델 학습 스크립트 실행 시작: {script_path}")
                print(f"📁 작업 디렉토리: {ai_ml_path}")
                
                # Python 경로 찾기 (ai_ml venv 우선, 없으면 백엔드 venv, 마지막으로 시스템 python3)
                python_path = 'python3'
                ai_ml_venv = os.path.join(ai_ml_path, 'venv', 'bin', 'python3')
                backend_venv = os.path.join(os.path.dirname(__file__), 'venv', 'bin', 'python3')
                
                if os.path.exists(ai_ml_venv):
                    python_path = ai_ml_venv
                    print(f"✅ ai_ml venv Python 사용: {python_path}")
                elif os.path.exists(backend_venv):
                    python_path = backend_venv
                    print(f"✅ 백엔드 venv Python 사용: {python_path}")
                else:
                    print(f"⚠️ 시스템 Python 사용: {python_path}")
                
                # 환경 변수 설정
                env = os.environ.copy()
                # 모델 타입 및 데이터 소스를 환경 변수로 전달
                env['MODEL_TYPE'] = model_type
                env['USE_ORIGINAL_TEMP'] = '1' if use_original_temp else '0'
                env['USE_ORIGINAL_VIB'] = '1' if use_original_vib else '0'
                print(f"📌 모델 타입: {model_type}")
                print(f"📌 데이터 소스 - 온도: {'원본' if use_original_temp else '증강'}, 진동: {'원본' if use_original_vib else '증강'}")
                # venv가 있으면 PATH에 추가하고 PYTHONPATH 설정
                if os.path.exists(ai_ml_venv):
                    venv_bin = os.path.dirname(ai_ml_venv)
                    venv_lib = os.path.join(os.path.dirname(venv_bin), 'lib')
                    # Python 버전에 맞는 site-packages 경로 찾기
                    python_version = f"python{os.sys.version_info.major}.{os.sys.version_info.minor}"
                    site_packages = os.path.join(venv_lib, python_version, 'site-packages')
                    env['PATH'] = f"{venv_bin}:{env.get('PATH', '')}"
                    if os.path.exists(site_packages):
                        env['PYTHONPATH'] = f"{site_packages}:{env.get('PYTHONPATH', '')}"
                    print(f"✅ 환경 변수 설정: PATH={venv_bin}, PYTHONPATH={site_packages if os.path.exists(site_packages) else 'N/A'}")
                elif os.path.exists(backend_venv):
                    venv_bin = os.path.dirname(backend_venv)
                    env['PATH'] = f"{venv_bin}:{env.get('PATH', '')}"
                
                # Python 경로 확인 및 테스트
                try:
                    import subprocess as sp
                    # 실제 사용할 Python 경로로 테스트
                    test_cmd = [python_path, '-c', 'import sys; print(sys.executable); import numpy; import torch; print("numpy, torch OK")']
                    test_result = sp.run(test_cmd, 
                                       capture_output=True, text=True, timeout=10, env=env, cwd=ai_ml_path)
                    print(f"🔍 Python 테스트 결과:")
                    print(f"   명령: {' '.join(test_cmd)}")
                    print(f"   반환 코드: {test_result.returncode}")
                    print(f"   stdout: {test_result.stdout}")
                    if test_result.returncode != 0:
                        print(f"   ⚠️ stderr: {test_result.stderr}")
                    else:
                        print(f"✅ Python 경로 테스트 성공: {python_path}")
                except Exception as e:
                    print(f"⚠️ Python 경로 테스트 중 오류: {e}")
                    import traceback
                    traceback.print_exc()
                
                # 비동기 실행 (Popen 사용)
                print(f"🚀 프로세스 시작: {python_path} {script_path} (모델 타입: {model_type})")
                process = subprocess.Popen(
                    [python_path, script_path],
                    cwd=ai_ml_path,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    env=env,
                    bufsize=1
                )
                
                print(f"✅ 프로세스 시작됨 (PID: {process.pid})")
                
                # 비동기로 출력 읽기
                def read_output():
                    try:
                        for line in process.stdout:
                            print(f"[학습] {line.strip()}")
                    except Exception as e:
                        print(f"⚠️ 출력 읽기 오류: {e}")
                
                def read_error():
                    try:
                        for line in process.stderr:
                            print(f"[학습-에러] {line.strip()}")
                    except Exception as e:
                        print(f"⚠️ 에러 읽기 오류: {e}")
                
                # 출력을 별도 스레드에서 읽기
                import threading
                stdout_thread = threading.Thread(target=read_output, daemon=True)
                stderr_thread = threading.Thread(target=read_error, daemon=True)
                stdout_thread.start()
                stderr_thread.start()
                
                # 프로세스를 완전히 백그라운드로 실행 (wait() 제거)
                print(f"✅ 프로세스가 백그라운드에서 실행 중입니다 (PID: {process.pid})")
                print(f"📊 진행률은 /api/ai/progress/train으로 확인하세요")
                
                # 프로세스 완료를 별도 스레드에서 처리 (선택사항)
                def wait_for_completion():
                    return_code = process.wait()
                    if return_code != 0:
                        print(f"❌ 모델 학습 오류 (코드: {return_code})")
                    else:
                        print(f"✅ 모델 학습 완료")
                
                completion_thread = threading.Thread(target=wait_for_completion, daemon=True)
                completion_thread.start()
                    
            except Exception as e:
                print(f"❌ 모델 학습 실행 오류: {e}")
                import traceback
                traceback.print_exc()
        
        # 별도 스레드에서 실행
        import threading
        thread = threading.Thread(target=run_training, daemon=True)
        thread.start()
        
        data_source_info = []
        if use_original_temp:
            data_source_info.append('원본 온도')
        else:
            data_source_info.append('증강 온도')
        if use_original_vib:
            data_source_info.append('원본 진동')
        else:
            data_source_info.append('증강 진동')
        
        return jsonify({
            'status': 'started',
            'message': f'모델 학습이 시작되었습니다 ({model_type.upper()} 모델, {", ".join(data_source_info)}). 완료까지 몇 분이 소요될 수 있습니다.',
            'model_type': model_type,
            'use_original_temp': use_original_temp,
            'use_original_vib': use_original_vib,
            'progress_file': os.path.join(ai_ml_path, 'data', 'train_progress.json')
        })
        
    except Exception as e:
        print(f"❌ 모델 학습 API 오류: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/train/stop', methods=['POST'])
def stop_training():
    """학습 프로세스 종료"""
    try:
        import os
        import subprocess
        import time
        import json
        
        killed_count = 0
        killed_pids = []
        
        # psutil 사용 시도, 없으면 시스템 명령어 사용
        try:
            import psutil
            use_psutil = True
        except ImportError:
            use_psutil = False
            print("⚠️ psutil이 없어 시스템 명령어를 사용합니다.")
        
        if use_psutil:
            # psutil 사용
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    cmdline = proc.info.get('cmdline', [])
                    if cmdline and 'train_model.py' in ' '.join(cmdline):
                        pid = proc.info['pid']
                        print(f"🛑 학습 프로세스 종료: PID {pid}")
                        proc.terminate()
                        killed_count += 1
                        killed_pids.append(pid)
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
        else:
            # 시스템 명령어 사용 (Linux)
            try:
                # pgrep으로 train_model.py를 실행하는 프로세스 찾기
                result = subprocess.run(
                    ['pgrep', '-f', 'train_model.py'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if result.returncode == 0:
                    pids = result.stdout.strip().split('\n')
                    for pid_str in pids:
                        if pid_str.strip():
                            try:
                                pid = int(pid_str.strip())
                                print(f"🛑 학습 프로세스 발견: PID {pid}")
                                killed_pids.append(pid)
                                killed_count += 1
                            except ValueError:
                                pass
            except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError) as e:
                print(f"⚠️ 프로세스 검색 실패: {e}")
                # ps 명령어로 시도
                try:
                    result = subprocess.run(
                        ['ps', 'aux'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if result.returncode == 0:
                        for line in result.stdout.split('\n'):
                            if 'train_model.py' in line:
                                parts = line.split()
                                if len(parts) > 1:
                                    try:
                                        pid = int(parts[1])
                                        print(f"🛑 학습 프로세스 발견: PID {pid}")
                                        killed_pids.append(pid)
                                        killed_count += 1
                                    except (ValueError, IndexError):
                                        pass
                except Exception as e2:
                    print(f"⚠️ ps 명령어도 실패: {e2}")
        
        if killed_count > 0:
            # 프로세스 종료
            for pid in killed_pids:
                try:
                    if use_psutil:
                        proc = psutil.Process(pid)
                        proc.terminate()
                    else:
                        # SIGTERM 신호 전송
                        subprocess.run(['kill', '-TERM', str(pid)], timeout=2)
                except Exception as e:
                    print(f"⚠️ 프로세스 {pid} 종료 실패: {e}")
            
            # 프로세스 종료 대기
            time.sleep(1)
            
            # 강제 종료가 필요한 프로세스 확인
            for pid in killed_pids:
                try:
                    if use_psutil:
                        proc = psutil.Process(pid)
                        if proc.is_running():
                            print(f"⚠️ 프로세스 {pid}가 종료되지 않아 강제 종료합니다.")
                            proc.kill()
                    else:
                        # 프로세스가 여전히 실행 중인지 확인하고 강제 종료
                        try:
                            subprocess.run(['kill', '-0', str(pid)], timeout=1, check=True)
                            # 프로세스가 살아있으면 강제 종료
                            print(f"⚠️ 프로세스 {pid}가 종료되지 않아 강제 종료합니다.")
                            subprocess.run(['kill', '-KILL', str(pid)], timeout=2)
                        except subprocess.CalledProcessError:
                            # 프로세스가 이미 종료됨
                            pass
                except Exception as e:
                    print(f"⚠️ 프로세스 {pid} 강제 종료 실패: {e}")
            
            # 진행률 파일 초기화
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            simpac_dir = os.path.join(backend_dir, '..', '..')
            ai_ml_path = os.path.join(simpac_dir, 'ai_ml')
            progress_file = os.path.join(ai_ml_path, 'data', 'train_progress.json')
            progress_file = os.path.abspath(progress_file)
            try:
                os.makedirs(os.path.dirname(progress_file), exist_ok=True)
                with open(progress_file, 'w', encoding='utf-8') as f:
                    json.dump({
                        'stage': 'stopped',
                        'progress': 0,
                        'message': '학습이 중지되었습니다.'
                    }, f)
            except Exception as e:
                print(f"⚠️ 진행률 파일 초기화 실패 (무시): {e}")
            
            print(f"✅ {killed_count}개의 학습 프로세스 종료됨")
            return jsonify({
                'status': 'stopped',
                'message': f'{killed_count}개의 학습 프로세스가 종료되었습니다.',
                'killed_count': killed_count
            })
        else:
            return jsonify({
                'status': 'not_found',
                'message': '실행 중인 학습 프로세스가 없습니다.'
            })
            
    except Exception as e:
        print(f"❌ 학습 프로세스 종료 오류: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/predict', methods=['GET'])
def ai_predict():
    """AI 예측 수행"""
    try:
        import sys
        import os
        import json
        
        # 학습 중인지 확인
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        simpac_dir = os.path.join(backend_dir, '..', '..')
        ai_ml_path = os.path.join(simpac_dir, 'ai_ml')
        progress_file = os.path.join(ai_ml_path, 'data', 'train_progress.json')
        
        if os.path.exists(progress_file):
            try:
                with open(progress_file, 'r', encoding='utf-8') as f:
                    progress_data = json.load(f)
                    stage = progress_data.get('stage', '')
                    # 학습 중이면 예측 불가
                    if stage in ['training', 'loading', 'preparing', 'saving']:
                        return jsonify({
                            'error': '모델 학습이 진행 중입니다. 학습이 완료된 후 다시 시도해주세요.',
                            'stage': stage,
                            'progress': progress_data.get('progress', 0),
                            'message': progress_data.get('message', '')
                        }), 503  # Service Unavailable
            except Exception as e:
                print(f"⚠️ 진행률 파일 읽기 오류 (무시): {e}")
        
        # 모델 파일 존재 확인 (PyTorch만 사용)
        model_dir = os.path.join(ai_ml_path, 'models')
        model_path = os.path.join(model_dir, 'model.pth')  # PyTorch 모델
        
        if not os.path.exists(model_path):
            return jsonify({
                'error': '학습된 모델이 없습니다. 먼저 모델 학습을 완료해주세요.'
            }), 404
        
        # predict 스크립트를 subprocess로 실행 (ai_ml venv 사용)
        predict_script_path = os.path.join(ai_ml_path, 'scripts', 'predict.py')
        predict_script_path = os.path.abspath(predict_script_path)
        
        if not os.path.exists(predict_script_path):
            return jsonify({'error': f'예측 스크립트를 찾을 수 없습니다: {predict_script_path}'}), 404
        
        # Python 경로 찾기 (ai_ml venv 우선)
        python_path = 'python3'
        ai_ml_venv = os.path.join(ai_ml_path, 'venv', 'bin', 'python3')
        ai_ml_venv = os.path.abspath(ai_ml_venv)
        
        if os.path.exists(ai_ml_venv):
            python_path = ai_ml_venv
            print(f"✅ 예측 스크립트 실행: {python_path} {predict_script_path}")
        else:
            print(f"⚠️ ai_ml venv를 찾을 수 없습니다. 시스템 Python 사용: {python_path}")
        
        # subprocess로 실행
        import subprocess
        try:
            result = subprocess.run(
                [python_path, predict_script_path],
                cwd=ai_ml_path,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            # stderr에 경고 메시지가 있을 수 있음 (무시)
            if result.stderr:
                print(f"📋 예측 스크립트 stderr: {result.stderr[:500]}")
            
            if result.returncode != 0:
                error_msg = result.stderr or result.stdout
                print(f"❌ 예측 스크립트 실행 오류 (코드: {result.returncode}): {error_msg}")
                return jsonify({'error': f'예측 실행 실패: {error_msg[:200]}'}), 500
            
            # JSON 결과 파싱 (stdout의 마지막 라인만 확인 - JSON만 출력되도록)
            import json
            stdout_lines = result.stdout.strip().split('\n')
            # 마지막 라인이 JSON인지 확인
            json_line = stdout_lines[-1] if stdout_lines else ''
            
            try:
                result_data = json.loads(json_line)
                if 'error' in result_data:
                    return jsonify(result_data), 500
                return jsonify(result_data)
            except json.JSONDecodeError:
                # JSON 파싱 실패 시 전체 stdout 확인
                print(f"⚠️ JSON 파싱 실패. stdout 전체:")
                print(f"   {result.stdout[:500]}")
                # stdout에서 JSON 부분 찾기
                for line in reversed(stdout_lines):
                    line = line.strip()
                    if line.startswith('{') and line.endswith('}'):
                        try:
                            result_data = json.loads(line)
                            if 'error' in result_data:
                                return jsonify(result_data), 500
                            return jsonify(result_data)
                        except json.JSONDecodeError:
                            continue
                
                return jsonify({'error': f'예측 결과 파싱 실패. stdout: {result.stdout[:200]}'}), 500
                
        except subprocess.TimeoutExpired:
            return jsonify({'error': '예측 실행 시간 초과'}), 500
        except Exception as e:
            print(f"❌ 예측 실행 중 오류: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
        
    except ImportError as e:
        print(f"❌ 모듈 import 오류: {e}")
        return jsonify({'error': f'AI 모듈을 찾을 수 없습니다. ai_ml 폴더를 확인하세요: {str(e)}'}), 500
    except Exception as e:
        print(f"❌ AI 예측 오류: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai/progress/<progress_type>', methods=['GET'])
def get_progress(progress_type):
    """진행률 조회 (augment 또는 train)"""
    try:
        import os
        import json
        
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        simpac_dir = os.path.join(backend_dir, '..', '..')
        ai_ml_path = os.path.join(simpac_dir, 'ai_ml')
        
        if progress_type == 'augment':
            progress_file = os.path.join(ai_ml_path, 'data', 'augment_progress.json')
        elif progress_type == 'train':
            progress_file = os.path.join(ai_ml_path, 'data', 'train_progress.json')
        else:
            return jsonify({'error': 'Invalid progress type'}), 400
        
        progress_file = os.path.abspath(progress_file)
        
        if not os.path.exists(progress_file):
            return jsonify({
                'progress': 0,
                'stage': 'not_started',
                'message': '아직 시작되지 않았습니다.'
            })
        
        try:
            with open(progress_file, 'r', encoding='utf-8') as f:
                progress_data = json.load(f)
            
            # progress_data에서 필요한 필드만 안전하게 추출
            result = {
                'progress': progress_data.get('progress', 0),
                'stage': progress_data.get('stage', 'unknown'),
                'message': progress_data.get('message', '진행 중...')
            }
            
            # 예상 시간이 있으면 포함
            if 'estimated_time_seconds' in progress_data:
                result['estimated_time_seconds'] = progress_data['estimated_time_seconds']
                result['estimated_time_minutes'] = progress_data.get('estimated_time_minutes', 
                                                                     progress_data['estimated_time_seconds'] / 60)
            
            # 에러가 있으면 포함
            if 'error' in progress_data:
                result['error'] = progress_data['error']
            
            return jsonify(result)
        except json.JSONDecodeError as e:
            print(f"❌ JSON 파싱 오류: {e}")
            return jsonify({
                'error': f'진행률 파일 파싱 오류: {str(e)}',
                'progress': 0,
                'stage': 'error',
                'message': '진행률 파일을 읽을 수 없습니다.'
            }), 500
        except Exception as e:
            print(f"❌ 진행률 파일 읽기 오류: {e}")
            return jsonify({
                'error': str(e),
                'progress': 0,
                'stage': 'error',
                'message': f'오류 발생: {str(e)}'
            }), 500
        
    except Exception as e:
        print(f"❌ 진행률 조회 오류: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5005)
