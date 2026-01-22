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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5005)
